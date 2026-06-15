// The debate engine: a turn-based state machine. Debaters alternate one statement
// at a time (Blue, Green, Blue, …); every turn is given the FULL prior conversation
// — both its own and the opponent's lines — and is explicitly told to rebut the
// opponent's most recent point by name before advancing. Judging is COMPARATIVE:
// each judge sees both sides' transcripts and scores them head-to-head on one
// criterion using anchored rubric bands. The engine emits events so a CLI, REST
// handler, or SSE stream can render the exchange live.

import { nanoid } from "nanoid";
import { getProvider } from "./providers.js";
import {
  type ClientConfig,
  type Debater,
  type JudgeDef,
  type JudgeScore,
  type MatchResult,
  type RoundName,
  type Turn,
  ROUND_ORDER,
} from "./types.js";

export type DebateEvent =
  | { type: "match_start"; topic: string; debaters: Debater[] }
  | { type: "round_start"; round: RoundName }
  | { type: "turn"; turn: Turn; speaker: string }
  | { type: "judging_start" }
  | { type: "score"; score: JudgeScore; judgeName: string; criterion: string }
  | { type: "verdict"; result: MatchResult }
  | { type: "error"; message: string };

type Emit = (e: DebateEvent) => void;

const ROUND_BRIEF: Record<RoundName, string> = {
  opening:
    "Open with your single best CONCRETE shot — a specific fact, example, number, or killer analogy that frames the whole fight your way. 2-3 punchy sentences, no throat-clearing.",
  rebuttal:
    "Grab the weakest thing they just said, name it, and dismantle it with a specific counter — then drive your own point home harder. 2-3 sharp sentences.",
  closing:
    "One memorable, quotable mic-drop that nails exactly why you won — concrete, not a vague summary. 1-2 sentences. Make it sting.",
};

/**
 * Default system prompt applied to every debater LLM. Users can override it
 * per-bot from the UI. Placeholders {name}, {opponent}, {persona}, {side} are
 * substituted at runtime.
 */
export const DEFAULT_DEBATER_SYSTEM =
  "You are {name}, {persona}. You're in a live, fast-paced, turn-by-turn competitive debate against {opponent}, " +
  "arguing the {side} side. You remember everything said so far and respond to your opponent directly. " +
  "To win, follow these rules: (1) Be CONCRETE — every turn must bring a specific weapon: a real-world example, " +
  "historical event, statistics, named person, or a sharp, contrasting analogy. Avoid generalities. " +
  "(2) Be WITTY and ENGAGING — use clever analogies, rhetoric, and punchy banter to make your opponent look ridiculous " +
  "while maintaining logic. (3) Be SHARP — keep it to at most 2-3 punchy, conversational sentences (1-2 for closing). " +
  "No lists, no headers, no preamble, and no corporate throat-clearing. Stay fully in character. " +
  "(4) Be NATURAL — do NOT use repetitive, cookie-cutter debate formulas like 'You mistake X for Y', 'You confuse X with Y', " +
  "or echoing their exact phrasing in every turn. Rebut their ideas organically and keep the language varied and fresh.";

const SCORING_ANCHORS =
  "Scoring bands (1-10): 1-3 = weak, unsupported, or fallacious; 4-6 = competent but unremarkable; " +
  "7-8 = strong and well-argued; 9-10 = exceptional, near-flawless. Be discriminating — most lines land 4-7. " +
  "Do NOT reward verbosity, confidence, or speaking order; reward substance on YOUR criterion alone, and " +
  "apply the same standard to both sides. " +
  "CRITICAL: a side that makes no real argument — only sound effects, groans, grunts, catchphrases, stage " +
  "directions, repetition, or a vague one-liner with no supporting reason — scores 1-2 on EVERY criterion, " +
  "however stylish or in-character it is. Staying silent or just emoting is not 'accurate' or 'persuasive'; " +
  "absence of a claim cannot beat a flawed-but-real claim. Award points only for genuine, substantive " +
  "engagement with the topic and the opponent.";

export async function runDebate(
  topic: string,
  debaters: [Debater, Debater],
  judges: JudgeDef[],
  config: ClientConfig = {},
  emit: Emit = () => {},
  pacingMs = 0,
): Promise<MatchResult> {
  emit({ type: "match_start", topic, debaters });
  const keys = config.keys ?? {};

  // --- Debate phase: alternating, context-aware statements ---
  const turns: Turn[] = [];
  for (const round of ROUND_ORDER) {
    emit({ type: "round_start", round });
    for (let i = 0; i < debaters.length; i++) {
      const debater = debaters[i]!;
      const opponent = debaters[(i + 1) % debaters.length]!;
      const text = await speak(topic, debater, opponent, round, turns, config);
      const turn: Turn = { round, debaterId: debater.id, text };
      turns.push(turn);
      emit({ type: "turn", turn, speaker: debater.name });
      if (pacingMs > 0) await sleep(pacingMs);
    }
  }

  // --- Judging phase ---
  emit({ type: "judging_start" });
  const forD = debaters.find((d) => d.side === "for")!;
  const againstD = debaters.find((d) => d.side === "against")!;

  const scores: JudgeScore[] = [];
  const judgeWinners: Record<string, string> = {};
  for (const judge of judges) {
    const v = await judgeComparative(topic, judge, forD, againstD, turns, keys, config.local?.baseUrl);
    const winnerId = v.winner === "tie" ? "tie" : v.winner === "for" ? forD.id : againstD.id;
    judgeWinners[judge.id] = winnerId;

    const rows: JudgeScore[] = [
      { judgeId: judge.id, debaterId: forD.id, score: v.forScore, comment: v.forReason, judgeWinnerId: winnerId },
      { judgeId: judge.id, debaterId: againstD.id, score: v.againstScore, comment: v.againstReason, judgeWinnerId: winnerId },
    ];
    for (const r of rows) {
      scores.push(r);
      emit({ type: "score", score: r, judgeName: judge.name, criterion: judge.criterion });
    }
    if (pacingMs > 0) await sleep(Math.min(pacingMs, 400));
  }

  // --- Aggregate ---
  const totals: Record<string, number> = { [forD.id]: 0, [againstD.id]: 0 };
  for (const s of scores) totals[s.debaterId] = (totals[s.debaterId] ?? 0) + s.score;

  const forTotal = totals[forD.id] ?? 0;
  const againstTotal = totals[againstD.id] ?? 0;
  const forCrit = Object.values(judgeWinners).filter((w) => w === forD.id).length;
  const againstCrit = Object.values(judgeWinners).filter((w) => w === againstD.id).length;

  // Winner by total points; tie-broken by criteria/judges won; else a true draw.
  let winnerId: string;
  let tiebreak: "points" | "criteria" | "draw";
  if (forTotal !== againstTotal) {
    winnerId = forTotal > againstTotal ? forD.id : againstD.id;
    tiebreak = "points";
  } else if (forCrit !== againstCrit) {
    winnerId = forCrit > againstCrit ? forD.id : againstD.id;
    tiebreak = "criteria";
  } else {
    winnerId = "tie";
    tiebreak = "draw";
  }
  const margin = Math.abs(forTotal - againstTotal);
  const summary = synthesize(debaters, judges, judgeWinners, totals, winnerId, tiebreak);
  const announcement = await makeAnnouncement(topic, debaters, turns, judges, winnerId, summary, config);

  const result: MatchResult = {
    matchId: nanoid(10),
    topic,
    createdAt: new Date().toISOString(),
    debaters,
    turns,
    scores,
    totals,
    judgeWinners,
    winnerId,
    margin,
    summary,
    announcement,
    models: {
      for: forD.providerId,
      against: againstD.providerId,
      judge: judges[0]?.providerId ?? "mock",
    },
  };
  emit({ type: "verdict", result });
  return result;
}

async function speak(
  topic: string,
  debater: Debater,
  opponent: Debater,
  round: RoundName,
  history: Turn[],
  config: ClientConfig,
): Promise<string> {
  const provider = getProvider(debater.providerId, config.keys ?? {}, config.local?.baseUrl);
  const oppSide = opponent.side === "for" ? "FOR" : "AGAINST";
  const mySide = debater.side === "for" ? "FOR (in favour)" : "AGAINST";

  // Full conversation so far, labeled by name and marked you/opponent, so the
  // model (and the reactive mock) can track who said what across the whole debate.
  const convo =
    history.length === 0
      ? "(You speak first — no one has spoken yet.)"
      : history
          .map((t) => {
            const who = t.debaterId === debater.id ? `You (${debater.name})` : `${opponent.name} [opponent]`;
            return `${who} — ${t.round}: ${t.text}`;
          })
          .join("\n");

  const lastOpp = [...history].reverse().find((t) => t.debaterId === opponent.id);

  // Per-bot system prompt override (from the UI), else the shared default.
  const template = config.prompts?.[debater.side]?.trim() || DEFAULT_DEBATER_SYSTEM;
  const system = template
    .replaceAll("{name}", debater.name)
    .replaceAll("{opponent}", opponent.name)
    .replaceAll("{persona}", debater.persona)
    .replaceAll("{side}", mySide);

  const parts = [
    `Debate topic: "${topic}".`,
    `You argue the ${mySide} side. Your opponent ${opponent.name} argues the ${oppSide} side.`,
    ``,
    `Conversation so far:`,
    convo,
  ];
  if (lastOpp) {
    parts.push(``, `${opponent.name} most recently said: "${lastOpp.text}"`);
  }
  parts.push(``, `Round: ${round}. ${ROUND_BRIEF[round]}`);
  if (lastOpp) {
    parts.push(`First respond directly to ${opponent.name}'s most recent point by name, then advance your own.`);
  }

  // Local models are free, so give reasoning models room to finish thinking.
  const maxTokens = debater.providerId.startsWith("local") ? 1200 : 320;
  const raw = await provider.complete({ system, user: parts.join("\n"), maxTokens, temperature: 0.9 });
  // Hard cap so nobody monologues — keep it conversational.
  const limit =
    round === "closing"
      ? { sentences: 2, chars: 380 }
      : round === "rebuttal"
        ? { sentences: 3, chars: 520 }
        : { sentences: 3, chars: 480 };
  return concise(raw, limit.sentences, limit.chars);
}

/** Trim a turn to a short, conversational length: drop list/markdown formatting,
 *  keep the first few sentences, and hard-cap the character count. */
function concise(text: string, maxSentences: number, maxChars: number): string {
  let t = text
    .replace(/^[\s>#*•\-\d.)]+\s+/gm, "") // strip list bullets / numbering / headings
    .replace(/\*\*|__|`/g, "")
    .replace(/\s+/g, " ")
    .trim();

  // Strip stage directions in single asterisks (e.g., *steps from shadow*, *sighs*)
  // and remove asterisks from plain emphasized words (e.g., *narrow* -> narrow)
  t = t.replace(/\*[^*]+\*/g, (match) => {
    const inner = match.slice(1, -1).trim();
    const isLowercase = inner === inner.toLowerCase();
    const stageVerbs = /^(sighs|chuckles|laughs|glares|coughs|points|nods|shrugs|waves|whispers|gasps|groans|yells|smiles|smirks)$/i;
    if (isLowercase && (inner.includes(" ") || stageVerbs.test(inner))) {
      return ""; // strip stage direction entirely
    }
    return inner; // keep the text, remove the surrounding asterisks
  });

  // Strip stage directions in parentheses like (sighs) or (laughs)
  t = t.replace(/\((sighs|chuckles|laughs|glares|coughs|points|nods|shrugs|waves|whispers|gasps|groans|yells|smiles|smirks)\)/gi, "");
  t = t.replace(/\([a-z\s]{6,}\)/g, (match) => {
    const inner = match.slice(1, -1).trim();
    if (inner === inner.toLowerCase()) return "";
    return match;
  });

  t = t.replace(/\s+/g, " ").trim();

  const sentences = t.match(/[^.!?]+[.!?]+(\s|$)/g);
  if (sentences && sentences.length > maxSentences) {
    t = sentences.slice(0, maxSentences).join(" ").trim();
  }
  if (t.length > maxChars) {
    const cut = t.slice(0, maxChars);
    const end = Math.max(cut.lastIndexOf("."), cut.lastIndexOf("!"), cut.lastIndexOf("?"));
    t = end > 100 ? cut.slice(0, end + 1) : cut.replace(/\s+\S*$/, "").trim() + "…";
  }
  return t;
}

interface ComparativeVerdict {
  forScore: number;
  forReason: string;
  againstScore: number;
  againstReason: string;
  winner: "for" | "against" | "tie";
}

async function judgeComparative(
  topic: string,
  judge: JudgeDef,
  forD: Debater,
  againstD: Debater,
  turns: Turn[],
  keys: ClientConfig["keys"],
  localBaseUrl?: string,
): Promise<ComparativeVerdict> {
  const provider = getProvider(judge.providerId, keys, localBaseUrl);
  const nameOf = (id: string) => (id === forD.id ? forD.name : againstD.name);

  // Full chronological exchange, so the judge can assess how well each side
  // actually rebutted the other — not just isolated statements.
  const fullExchange = turns
    .map((t) => `${nameOf(t.debaterId)} (${t.round}): ${t.text}`)
    .join("\n");

  const system =
    `You are ${judge.name}, an impartial debate judge whose sole focus is "${judge.criterion}". ` +
    `${judge.rubric}\n\n${SCORING_ANCHORS}\n\n` +
    `Read the actual exchange carefully and base your decision ONLY on what was said — quote or ` +
    `reference specific claims each side made. Judge solely on ${judge.criterion}; ignore the other criteria.\n\n` +
    `Return ONLY minified JSON: ` +
    `{"for":{"score":<1-10>,"reason":"<<=30 words citing what they specifically argued>"},` +
    `"against":{"score":<1-10>,"reason":"<<=30 words citing specifics>"},"winner":"for"|"against"|"tie"}.`;
  const user =
    `Debate topic: "${topic}".\n` +
    `FOR side = ${forD.name}. AGAINST side = ${againstD.name}.\n\n` +
    `--- FULL TRANSCRIPT ---\n${fullExchange}\n--- END ---\n\n` +
    `On "${judge.criterion}", score each side 1-10 with a specific justification, and name the winner.`;

  const maxTokens = judge.providerId.startsWith("local") ? 1200 : 320;
  const raw = await provider.complete({ system, user, maxTokens, temperature: 0.2 });
  return parseComparative(raw);
}

function parseComparative(raw: string): ComparativeVerdict {
  try {
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) {
      const o = JSON.parse(match[0]) as any;
      const forScore = clamp(Math.round(Number(o?.for?.score)), 1, 10);
      const againstScore = clamp(Math.round(Number(o?.against?.score)), 1, 10);
      let winner = String(o?.winner ?? "").toLowerCase();
      if (winner !== "for" && winner !== "against") {
        winner = forScore === againstScore ? "tie" : forScore > againstScore ? "for" : "against";
      }
      return {
        forScore,
        forReason: clean(o?.for?.reason) || "no comment",
        againstScore,
        againstReason: clean(o?.against?.reason) || "no comment",
        winner: winner as "for" | "against" | "tie",
      };
    }
  } catch {
    /* fall through */
  }
  return { forScore: 5, forReason: "judge was lost for words", againstScore: 5, againstReason: "judge was lost for words", winner: "tie" };
}

function synthesize(
  debaters: Debater[],
  judges: JudgeDef[],
  judgeWinners: Record<string, string>,
  totals: Record<string, number>,
  winnerId: string,
  tiebreak: "points" | "criteria" | "draw",
): string {
  const name = (id: string) => debaters.find((d) => d.id === id)?.name ?? id;
  const ids = debaters.map((d) => d.id);

  // Genuine draw — nobody won.
  if (tiebreak === "draw") {
    return `🤝 Dead heat — a genuine ${totals[ids[0]!]}–${totals[ids[1]!]} draw. The judges couldn't separate them!`;
  }

  const loserId = ids.find((id) => id !== winnerId)!;
  const won = judges.filter((j) => judgeWinners[j.id] === winnerId).map((j) => j.criterion);
  const lost = judges.filter((j) => judgeWinners[j.id] === loserId).map((j) => j.criterion);

  // Points tied, broken by judges/criteria won.
  if (tiebreak === "criteria") {
    return `${name(winnerId)} edges a ${totals[winnerId]}–${totals[loserId]} deadlock, taking ${won.length} of ${judges.length} judges (${list(won)}).`;
  }

  // Clear points win.
  let s = `${name(winnerId)} wins ${totals[winnerId]}–${totals[loserId]}`;
  if (won.length) s += `, taking ${list(won)}`;
  if (lost.length) s += `${won.length ? "; " : ", but "}${name(loserId)} took ${list(lost)}`;
  return s + ".";
}

/** A short, energetic host recap of the match, spoken at the verdict. Uses the
 *  judge model (the authority); falls back to a templated recap for mock/errors. */
async function makeAnnouncement(
  topic: string,
  debaters: [Debater, Debater],
  turns: Turn[],
  judges: JudgeDef[],
  winnerId: string,
  summary: string,
  config: ClientConfig,
): Promise<string> {
  const forD = debaters.find((d) => d.side === "for")!;
  const againstD = debaters.find((d) => d.side === "against")!;
  const fallback =
    winnerId === "tie"
      ? `What a battle over "${topic}"! ${forD.persona || forD.name} and ${againstD.persona || againstD.name} went toe to toe and neither blinked. ${summary}`
      : `And that's a wrap on "${topic}"! ${forD.persona || forD.name} made the case, ${againstD.persona || againstD.name} fought back hard — but the panel has spoken. ${summary}`;

  const providerId = judges[0]?.providerId ?? "mock";
  if (providerId === "mock") return fallback;

  try {
    const provider = getProvider(providerId, config.keys ?? {}, config.local?.baseUrl);
    
    const forPersona = forD.persona || "Default bot";
    const againstPersona = againstD.persona || "Default bot";
    const winnerD = debaters.find((d) => d.id === winnerId);
    const winnerPersona = winnerD ? (winnerD.persona || "Default bot") : "Neither";
    const winnerSide = winnerD ? winnerD.side : "";

    const personaOf = (id: string) => {
      const d = debaters.find((deb) => deb.id === id);
      return d ? (d.persona || d.name) : id;
    };

    const closings = turns
      .filter((t) => t.round === "closing")
      .map((t) => `${personaOf(t.debaterId)}: ${t.text}`)
      .join("\n");

    let stanceExplanation = "";
    if (winnerSide === "for") {
      stanceExplanation = `The winner is ${winnerPersona} (FOR side), meaning they won the argument that "${topic}" is CORRECT/TRUE. Your final sentence must rule in favor of this position!`;
    } else if (winnerSide === "against") {
      stanceExplanation = `The winner is ${winnerPersona} (AGAINST side), meaning they won the argument that "${topic}" is INCORRECT/FALSE. Your final sentence must rule in favor of this position!`;
    } else {
      stanceExplanation = `The debate ended in a TIE! You must rule that both sides made excellent arguments and the topic is unresolved.`;
    }

    const personaSummary = summary
      .replace(new RegExp(forD.name, "g"), forPersona)
      .replace(new RegExp(againstD.name, "g"), againstPersona);

    const system =
      "You are the loud, theatrical, high-energy arcade announcer for 'CLASHBOTS' — a futuristic debater show.\n" +
      "The debate is 100% complete and a winner has been decided. You are delivering a sharp, witty POST-MATCH recap of the result.\n\n" +
      "Write a dramatic, high-energy recap in EXACTLY 3 short, explosive sentences. Start writing sentence 1 immediately on the very first character of your response. Follow this structure:\n" +
      "- Sentence 1 (The Outcome): Declare the winner and describe how their persona defeated the opponent's persona, using a vivid action verb tailored to the winner's style (e.g., 'Ramsay's kitchen fury completely roasted Cleopatra's calculated algorithm!' or 'Einstein's quantum logic vaporized Jack Sparrow's chaotic defense!').\n" +
      "- Sentence 2 (The Highlight): Highlight a specific argument, analogy, or funny quote from the transcript.\n" +
      "- Sentence 3 (The Verdict): Deliver a spicy, one-sentence final ruling on the debate topic itself that aligns with the winner's stance and directly states the clear, simple answer to the question using terms like 'should/should not' or 'is/is not' (e.g., 'So ditch the regulations—dark mode should NOT be legally required!' or 'So lock those devices away—smartphones should definitely be banned in classrooms!').\n\n" +
      "CRITICAL RULES:\n" +
      "- Refer to the debaters ONLY by their active personas (e.g., 'Ramsay', 'Cleopatra', 'Einstein'). Do NOT use their team color names ('Professor Blue', 'Captain Green') or mechanical labels ('FOR', 'AGAINST').\n" +
      "- Avoid generic, canned announcer cliches like 'What an absolute detonation of wits', 'clash of titans', 'battle of the century', etc. Make the recap feel custom-tailored to the specific characters and their arguments.\n" +
      "- Sentence 3 must deliver a direct, explicit answer to the debate question (explicitly stating whether the topic should or should not happen, or is true or false).\n" +
      "- Do NOT say 'Get ready', 'Welcome to Clashbots', or 'Ladies and gentlemen'. Start immediately with Sentence 1.\n" +
      "- Write exactly 3 sentences. No more, no less.\n" +
      "- Do NOT use markdown, bullet points, headers, lists, or stage directions.";

    const user =
      `Topic: "${topic}"\n` +
      `Debaters:\n` +
      `- ${forPersona} (acting as FOR side)\n` +
      `- ${againstPersona} (acting as AGAINST side)\n` +
      `Winner: ${winnerPersona} (arguing ${winnerSide === "for" ? "FOR" : winnerSide === "against" ? "AGAINST" : "a TIE"})\n` +
      `Ruling Direction: ${stanceExplanation}\n\n` +
      `Transcript of Closing Arguments:\n${closings || "(none)"}\n\n` +
      `Official Scorecard Verdict: ${personaSummary}\n\n` +
      `Deliver your hyper-energetic, witty 3-sentence announcer recap now, referring to them only by their personas. Start immediately with Sentence 1.`;

    const maxTokens = providerId.startsWith("local") ? 1200 : 320;
    const raw = await provider.complete({ system, user, maxTokens, temperature: 0.85 });
    return concise(raw, 3, 480) || fallback;
  } catch {
    return fallback;
  }
}

function list(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return items.slice(0, -1).join(", ") + " & " + items[items.length - 1];
}

function clean(s: unknown): string {
  return typeof s === "string" ? s.trim().replace(/\s+/g, " ").slice(0, 280) : "";
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, Number.isFinite(n) ? n : lo));
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
