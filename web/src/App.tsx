import { useCallback, useEffect, useRef, useState } from "react";
import { checkHealth, clearLeaderboard, fetchLeaderboard, fetchModels, streamDebate } from "./api.js";
import { Settings } from "./Settings.js";
import { ScoreCard } from "./ScoreCard.js";
import { BotConfig } from "./BotConfig.js";
import { JudgesConfig } from "./JudgesConfig.js";
import { DEFAULT_JUDGES } from "./defaultJudges.js";
import { PERSONAS, personaVoice } from "./personas.js";
import { useSettings } from "./useSettings.js";
import { LogoIcon, BlueRobot, GreenRobot } from "./RobotIcons.js";
import { cancelSpeech, listVoices, onVoicesChanged, pickVoiceByGender, speak, speechSupported } from "./speech.js";
import {
  playFightStart,
  playTick,
  playLaser,
  playScore,
  playFanfare,
  playError,
  setSoundEnabled,
  setSoundVolume,
} from "./sound.js";
import type {
  ClientConfig,
  Debater,
  JudgeScore,
  LeaderboardRow,
  MatchResult,
  ModelsInfo,
  RoundName,
  Turn,
} from "./types.js";

const getFrontEmoji = (criterion: string): string => {
  const norm = criterion.toLowerCase();
  if (norm.includes("logic") || norm.includes("evidence")) return "🧠"; // Logic & Evidence
  if (norm.includes("rhetoric") || norm.includes("style")) return "🗣️"; // Rhetoric & Style
  if (norm.includes("accuracy") || norm.includes("rigor")) return "🔬"; // Accuracy & Rigor
  if (norm.includes("persuasiveness") || norm.includes("appeal")) return "🤝"; // Persuasiveness
  if (norm.includes("funny") || norm.includes("humor") || norm.includes("funny")) return "🃏"; // Humorous
  return "⚖️"; // Default / custom criteria
};

type Status = "idle" | "debating" | "judging" | "done";

const SAMPLE_TOPICS = [
  "Should AGI have voting rights?",
  "Is a hotdog a sandwich?",
  "Is cereal a soup?",
  "Tabs vs spaces — settle it.",
  "Should we colonize Mars before fixing Earth?",
  "Will artificial intelligence eventually replace all human programmers?",
  "Is pineapple on pizza a culinary crime or a masterpiece?",
  "Should dark mode be legally required as the default app setting?",
  "Can an AI create genuine art, or is it just sophisticated plagiarism?",
  "Are we living in a computer simulation?",
  "Should cats rule the world instead of humans?",
  "Is fully remote work superior to in-office work?",
  "Would you upload your consciousness to a virtual cloud to live forever?",
  "Should cryptocurrency completely replace traditional money?",
  "Is it ethical to create genetically engineered super-pets?",
  "Should competitive video gaming be included in the Olympics?",
  "Which came first: the chicken or the egg?",
  "Is it better to be a jack of all trades or a master of one?",
  "Should social media feed algorithms be legally forced to be open-source?",
  "Can money buy happiness, or just rent comfort?",
  "Should physical books be preserved, or is digital-only reading the future?",
  "Is time travel theoretically possible, and should it be regulated?",
  "Would a clone of you be the same person or a separate individual?",
  "Is it morally acceptable to edit human embryos to eliminate disease?",
  "Should all zoos be banned and replaced with virtual reality experiences?",
  "Should physical currency be completely abolished in favor of digital-only payments?",
  "If superintelligent aliens visited, should we try to contact them or hide?",
  "Should high schools completely ban smartphones during school hours?",
  "Is it ethical to use facial recognition software for public surveillance?",
  "Should we build a space elevator, or is it a waste of global resources?",
  "Is a meme a legitimate form of modern art?",
  "Should water be entirely free and managed globally as a human right?",
  "Would you choose to have your memory of your favorite movie erased to watch it for the first time again?",
  "Should autonomous vehicles be programmed to prioritize passenger safety over pedestrians?",
  "Is it possible for humans and robots to have genuine romantic relationships?",
  "Should we bring extinct species like the woolly mammoth back to life?",
  "Should artificial intelligence be granted copyright ownership over its creations?",
  "Is universal basic income (UBI) the best solution to job loss from automation?",
  "Should space exploration be funded primarily by private companies or governments?",
  "Is social media doing more to connect us or to isolate us?",
  "Should humans colonize the ocean floor before trying to colonize space?",
  "Would you want to know the exact date and cause of your death if you could?",
  "Should homework be completely banned in elementary and middle schools?",
  "Is it ethical to run clinical trials for life-saving drugs on digital organ simulations?",
  "Should the internet be managed as a public utility like electricity or water?",
  "Is history repeating itself, or is it just rhyming?",
  "Should we transition all global agriculture to vertical farming?",
  "Is it better to travel to the past or the future?",
  "Should humans stop eating meat entirely to save the environment?",
  "Should there be a global maximum wage cap to prevent extreme wealth inequality?"
];

const SIDE_COLOR: Record<string, string> = { for: "blue", against: "green" };

// Shown in the arena before a match starts, so each bot's ⚙️ is always reachable.
const DISPLAY_BOTS: Debater[] = [
  { id: "blue", name: "Professor Blue", side: "for" },
  { id: "green", name: "Captain Green", side: "against" },
];

// Reveal pacing (frontend-driven).
const MS_PER_WORD = 85; // typing speed (slower = easier to follow)
const GAP_BETWEEN_SPEAKERS = 600; // bubble cleared, brief beat, then opponent
const SCORE_REVEAL_MS = 240; // pause between each judge score row (gavel-by-gavel)
const VERDICT_SUSPENSE_MS = 2400; // hold on the completed panel before the verdict drops
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// How long the finished line lingers so it can actually be read — scales with
// length (≈ real reading speed), clamped to a comfortable min/max.
const readingHold = (wordCount: number) => Math.min(4200 + wordCount * 220, 13000);

export function App() {
  const [config, setConfig] = useSettings();
  const [info, setInfo] = useState<ModelsInfo | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [botPanel, setBotPanel] = useState<"for" | "against" | null>(null);
  const [showJudges, setShowJudges] = useState(false);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [showScorecard, setShowScorecard] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [judgePopup, setJudgePopup] = useState<null | {
    emoji: string; criterion: string;
    sb: { score: number; comment: string } | null;
    sg: { score: number; comment: string } | null;
    favored: string | undefined;
    blueName: string; greenName: string;
  }>(null);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);

  const [topic, setTopic] = useState(SAMPLE_TOPICS[0]);
  const [status, setStatus] = useState<Status>("idle");
  const [debaters, setDebaters] = useState<Debater[]>([]);
  const [round, setRound] = useState<RoundName | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [speakerId, setSpeakerId] = useState<string | null>(null);
  const [typed, setTyped] = useState(""); // progressively revealed bubble text
  const [scores, setScores] = useState<JudgeScore[]>([]);
  const [winnerId, setWinnerId] = useState<string | null>(null);
  const [totals, setTotals] = useState<Record<string, number>>({});
  const [summary, setSummary] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const [error, setError] = useState("");
  const [board, setBoard] = useState<LeaderboardRow[]>([]);
  const [runId, setRunId] = useState(0); // bumps each FIGHT → replays entrance animations
  const [online, setOnline] = useState<boolean | null>(null); // null = still checking
  const onlineRef = useRef<boolean | null>(null);
  const logRef = useRef<HTMLDivElement>(null);

  // --- reveal queue + buffers (refs so the async pump sees fresh values) ---
  const queueRef = useRef<Turn[]>([]);
  const pumpingRef = useRef(false);
  const allTurnsInRef = useRef(false);
  const debateDoneRef = useRef(false);
  const pendingScoresRef = useRef<JudgeScore[]>([]);
  const pendingVerdictRef = useRef<MatchResult | null>(null);
  const abortRef = useRef(false);

  // Pull server-backed data (models + leaderboard) — also used to recover after
  // the backend comes back online.
  const refreshServerData = useCallback(() => {
    fetchLeaderboard().then(setBoard);
    fetchModels().then(setInfo).catch(() => setInfo(null));
  }, []);

  useEffect(() => {
    refreshServerData();
  }, [refreshServerData]);

  // Poll backend health so we can show an "offline" banner instead of failing
  // silently. On recovery (offline → online) we refresh the server-backed data.
  useEffect(() => {
    let active = true;
    const ping = async () => {
      const ok = await checkHealth();
      if (!active) return;
      if (ok && onlineRef.current === false) refreshServerData();
      onlineRef.current = ok;
      setOnline(ok);
    };
    ping();
    const id = setInterval(ping, 8000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [refreshServerData]);

  useEffect(() => {
    const load = () => setVoices(listVoices());
    load();
    return onVoicesChanged(load);
  }, []);

  // Resolve a voice name for a role — user's choice, else a distinct auto-pick.
  const voiceFor = (role: "for" | "against" | "judge"): string | undefined => {
    const chosen = config.voice?.[role];
    if (chosen) return chosen;
    const en = voices.filter((v) => v.lang.toLowerCase().startsWith("en"));
    const pool = en.length ? en : voices;
    const idx = role === "for" ? 0 : role === "against" ? 1 : 2;
    return pool[idx % Math.max(1, pool.length)]?.name ?? pool[0]?.name;
  };

  // Full voice profile for a role: name (gender-matched to the persona), plus the
  // pitch/rate that give the persona its character. A manual voice pick in Settings
  // always wins. Judges & default personas keep the plain auto voice.
  const clampRate = (r: number) => Math.max(0.6, Math.min(1.5, r));
  const voiceProfileFor = (role: "for" | "against" | "judge"): { name?: string; rate: number; pitch: number } => {
    const baseRate = config.voice?.rate ?? 1;
    const manual = config.voice?.[role];
    if (role !== "judge") {
      const opt = PERSONAS.find((p) => p.persona === config.personas?.[role]) ?? PERSONAS[0]!;
      const prof = personaVoice(opt.id);
      if (prof) {
        return {
          name: manual || pickVoiceByGender(prof.gender) || voiceFor(role),
          rate: clampRate(baseRate * (prof.rate ?? 1)),
          pitch: prof.pitch ?? 1,
        };
      }
    }
    return { name: manual || voiceFor(role), rate: baseRate, pitch: 1 };
  };

  const voiceEnabled = Boolean(config.voice?.enabled) && speechSupported();
  const toggleVoice = () =>
    setConfig({ ...config, voice: { ...config.voice, enabled: !config.voice?.enabled } });

  const soundEnabled = config.sound?.enabled !== false;
  const toggleSound = () =>
    setConfig({ ...config, sound: { ...config.sound, enabled: !soundEnabled } });

  // Mirror current voice settings into a ref so the stable pump reads fresh values.
  const voiceRef = useRef<{
    enabled: boolean;
    profile: (r: "for" | "against" | "judge") => { name?: string; rate: number; pitch: number };
  }>({ enabled: false, profile: () => ({ rate: 1, pitch: 1 }) });
  voiceRef.current = { enabled: voiceEnabled, profile: voiceProfileFor };

  // Sync sound settings with global audio service.
  useEffect(() => {
    setSoundEnabled(config.sound?.enabled !== false);
    setSoundVolume(config.sound?.volume ?? 0.5);
  }, [config.sound]);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" });
  }, [turns]);

  const applyVerdict = useCallback((r: MatchResult) => {
    setWinnerId(r.winnerId);
    setTotals(r.totals);
    setSummary(r.summary);
    setAnnouncement(r.announcement);
    setStatus("done");
    fetchLeaderboard().then(setBoard);
    playFanfare();
    // Announce the result aloud here (not in the pump) so it fires no matter which
    // path delivers the verdict — including when scores finish revealing before the
    // verdict frame arrives.
    if (voiceRef.current.enabled) {
      const p = voiceRef.current.profile("judge");
      void speak(r.announcement || r.summary, p.name, p.rate, p.pitch);
    }
  }, []);

  // Animate the queued turns one at a time: type out, hold, clear, next.
  const pump = useCallback(async () => {
    if (pumpingRef.current) return;
    pumpingRef.current = true;

    while (queueRef.current.length && !abortRef.current) {
      const turn = queueRef.current.shift()!;
      setRound(turn.round);
      setSpeakerId(turn.debaterId);
      playLaser();
      setTurns((t) => [...t, turn]); // transcript fills in sync with the bubble

      // Start speaking the line (free Web Speech) while it types out.
      const role: "for" | "against" = turn.debaterId === "blue" ? "for" : "against";
      const v = voiceRef.current;
      const vp = v.profile(role);
      const speaking = v.enabled ? speak(turn.text, vp.name, vp.rate, vp.pitch) : null;

      const words = turn.text.split(/\s+/);
      for (let i = 0; i < words.length && !abortRef.current; i++) {
        setTyped(words.slice(0, i + 1).join(" "));
        if (!v.enabled) {
          playTick();
        }
        await sleep(MS_PER_WORD);
      }
      // Linger at least the read time — and, if speaking, until the voice finishes.
      const minRead = sleep(readingHold(words.length));
      if (speaking) await Promise.all([speaking, minRead]);
      else await minRead;
      setTyped(""); // bubble disappears
      setSpeakerId(null);
      await sleep(GAP_BETWEEN_SPEAKERS);
    }

    pumpingRef.current = false;

    // Debate fully revealed → move on to judging/verdict.
    if (allTurnsInRef.current && !debateDoneRef.current && !abortRef.current) {
      debateDoneRef.current = true;
      setStatus("judging");
      for (const s of pendingScoresRef.current) {
        if (abortRef.current) break;
        setScores((prev) => [...prev, s]);
        playScore();
        await sleep(SCORE_REVEAL_MS); // gavel-by-gavel reveal of the panel
      }
      pendingScoresRef.current = [];
      // Let the completed panel breathe before the verdict — without this a fast
      // model reveals every judge in a flash and jumps straight to the result.
      if (!abortRef.current) await sleep(VERDICT_SUSPENSE_MS);
      if (pendingVerdictRef.current && !abortRef.current) applyVerdict(pendingVerdictRef.current);
    }
  }, [applyVerdict]);

  const fight = useCallback(async () => {
    cancelSpeech(); // stop any leftover narration
    // reset everything
    queueRef.current = [];
    pumpingRef.current = false;
    allTurnsInRef.current = false;
    debateDoneRef.current = false;
    pendingScoresRef.current = [];
    pendingVerdictRef.current = null;
    abortRef.current = false;

    setRunId((n) => n + 1); // trigger the VS slam + fighters charging in
    setStatus("debating");
    playFightStart();
    setDebaters([]);
    setTurns([]);
    setScores([]);
    setTyped("");
    setSpeakerId(null);
    setWinnerId(null);
    setSummary("");
    setAnnouncement("");
    setError("");
    setRound(null);

    const forP = personaFor("for");
    const againstP = personaFor("against");
    const finalConfig: ClientConfig = {
      ...config,
      names: {
        for: forP.category !== "default" ? forP.label : "Professor Blue",
        against: againstP.category !== "default" ? againstP.label : "Captain Green",
      },
    };

    try {
      await streamDebate(topic, finalConfig, (e) => {
        switch (e.type) {
          case "match_start":
            setDebaters(e.debaters);
            break;
          case "turn":
            queueRef.current.push(e.turn);
            void pump();
            break;
          case "judging_start":
            allTurnsInRef.current = true;
            void pump(); // in case the queue already drained
            break;
          case "score":
            if (debateDoneRef.current) {
              setScores((s) => [...s, e.score]);
              playScore();
            } else {
              pendingScoresRef.current.push(e.score);
            }
            break;
          case "verdict":
            if (debateDoneRef.current) applyVerdict(e.result);
            else pendingVerdictRef.current = e.result;
            break;
          case "error":
            abortRef.current = true;
            setError(e.message);
            setStatus("idle");
            playError();
            break;
        }
      });
    } catch (err) {
      abortRef.current = true;
      setError(String(err));
      setStatus("idle");
      playError();
    }
  }, [topic, config, pump, applyVerdict]);

  // Reset everything back to the opening screen — stops any in-flight debate,
  // narration, and reveal pump, and closes any open panel.
  const goHome = useCallback(() => {
    abortRef.current = true;
    cancelSpeech();
    queueRef.current = [];
    pumpingRef.current = false;
    allTurnsInRef.current = false;
    debateDoneRef.current = false;
    pendingScoresRef.current = [];
    pendingVerdictRef.current = null;
    setStatus("idle");
    setDebaters([]);
    setTurns([]);
    setScores([]);
    setTyped("");
    setSpeakerId(null);
    setWinnerId(null);
    setTotals({});
    setSummary("");
    setAnnouncement("");
    setError("");
    setRound(null);
    setShowScorecard(false);
    setShowLeaderboard(false);
    setShowSettings(false);
    setShowJudges(false);
    setBotPanel(null);
  }, []);

  const running = status === "debating" || status === "judging";
  const judgeList = config.judges?.length ? config.judges : DEFAULT_JUDGES;
  const scoreOf = (judgeId: string, debaterId: string) =>
    scores.find((s) => s.judgeId === judgeId && s.debaterId === debaterId);

  // Which model(s) the judges run on — drives the scorecard footer.
  const realJudgeModels = Array.from(
    new Set(judgeList.map((j) => j.model || config.models?.judge || "mock").filter((m) => m !== "mock")),
  );
  const mockJudging = realJudgeModels.length === 0;
  const labelFor = (id: string) =>
    id.startsWith("local") ? "Local (LM Studio)" : info?.models.find((m) => m.id === id)?.label ?? id;
  const judgeLabel =
    realJudgeModels.length === 0
      ? "mock"
      : realJudgeModels.length === 1
        ? labelFor(realJudgeModels[0]!)
        : `${realJudgeModels.length} different models`;

  // --- Per-fighter stats shown on the arena cards ---
  // On a locked-down public demo the server forces disallowed picks to mock, so
  // the card should reflect what will actually run, not the stored choice.
  const mode = info?.mode;
  const restricted = !!mode?.publicDemo && !mode?.allowBYOK;
  const effectiveModel = (id?: string): string | undefined =>
    !restricted ? id : id === "mock" || id === mode!.demoModel ? id : "mock";
  // Compact, human label for whichever model powers a side.
  const modelShort = (id?: string): string => {
    if (!id || id === "mock") return "Mock";
    if (id.startsWith("local")) {
      const m = id.slice(id.indexOf(":") + 1).trim();
      return m ? `Local · ${m.split("/").pop()}` : "Local";
    }
    const full = info?.models.find((m) => m.id === id)?.label;
    // Strip the leading 🆓 badge and any " · provider" suffix for a tidy chip.
    if (full) return full.replace(/^🆓\s*/, "").replace(/\s*·.*$/, "").trim();
    return id.split(":").pop() ?? id;
  };
  const personaFor = (side: "for" | "against") =>
    PERSONAS.find((p) => p.persona === config.personas?.[side]) ?? PERSONAS[0]!;
  // Match this fighter's real record by name first (a slot can host more than one
  // name over its history), falling back to the side-slot's aggregate.
  const recordFor = (id: string, name: string) =>
    board.find((r) => r.debaterId === id && r.name === name) ?? board.find((r) => r.debaterId === id);

  return (
    <div className="app">
      <header className="masthead">
        <h1 className="logo" onClick={goHome} role="button" tabIndex={0} title="Back to start"
          onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && goHome()}>
          <LogoIcon className="logo-svg" /> CLASH<span className="logo-accent">BOTS</span> <LogoIcon className="logo-svg" />
        </h1>
        <p className="tagline">where AIs argue and robots judge</p>
        <p className="disclaimer">⚡ AI-generated for demonstration — debates are improvised and may be inaccurate.</p>
      </header>

      <section className="controls">
        <textarea
          className="topic-input"
          value={topic}
          disabled={running}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="Enter a debate topic…"
          rows={2}
        />
        <div className="controls-buttons">
          <button
            className="btn primary"
            onClick={fight}
            disabled={running || !topic.trim() || online === false}
            title={online === false ? "Server offline — start the backend first" : undefined}
          >
            {running ? "⚔️ FIGHTING…" : "⚔️ FIGHT!"}
          </button>
          <button
            className="btn ghost"
            disabled={running}
            onClick={() => setTopic(SAMPLE_TOPICS[Math.floor(Math.random() * SAMPLE_TOPICS.length)])}
          >
            🎲 Random
          </button>
        </div>
      </section>

      {online === false && (
        <div className="offline-banner">
          <span>
            ⚠️ Can’t reach the server on <code>:8787</code>. Is the backend running?{" "}
            Run <code>npm run dev</code> in <code>clashbots/server</code>.
          </span>
          <button
            className="btn ghost small"
            onClick={() => {
              refreshServerData();
              checkHealth().then((ok) => {
                onlineRef.current = ok;
                setOnline(ok);
              });
            }}
          >
            ↻ Retry
          </button>
        </div>
      )}

      {error && <div className="error-banner">⚠️ {error}</div>}

      <main className="layout">
        <div className="arena-wrap">
          <div className="round-badge">
            {status === "idle" && "Press FIGHT to begin"}
            {status === "debating" && round && `ROUND: ${round.toUpperCase()}`}
            {status === "judging" && "⚖️ THE PANEL DELIBERATES"}
            {status === "done" && "🏆 VERDICT"}
          </div>

          {status !== "idle" && (
            <div className="arena-topic">
              “{topic}”
            </div>
          )}

          <div className="arena">
            <div className="arena-glow"></div>
            <div className="corner top-left"></div>
            <div className="corner top-right"></div>
            <div className="corner bottom-left"></div>
            <div className="corner bottom-right"></div>
            {(() => {
              const stage = debaters.length === 2 ? debaters : DISPLAY_BOTS;
              const sp = speakerId ? stage.find((d) => d.id === speakerId) : undefined;
              return (
                <>
                  <div className="arena-talk">
                    {sp && typed && (
                      <div className={`speech ${SIDE_COLOR[sp.side]} ${sp.side === "against" ? "right" : "left"}`}>
                        <span className="speech-name">{personaFor(sp.side).category !== "default" ? personaFor(sp.side).label : sp.name}</span>
                        <span className="speech-text">
                          {typed}
                          <span className="caret">▋</span>
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="arena-floor">
                    {stage.map((d) => (
                      <Fighter
                        key={`${d.id}-${runId}`}
                        debater={d}
                        active={speakerId === d.id}
                        winner={status === "done" && winnerId === d.id}
                        loser={status === "done" && winnerId !== "tie" && winnerId !== d.id}
                        total={status === "done" ? totals[d.id] : undefined}
                        model={modelShort(effectiveModel(config.models?.[d.side]))}
                        persona={personaFor(d.side)}
                        record={recordFor(d.id, d.name)}
                        onConfig={running ? undefined : () => setBotPanel(d.side)}
                      />
                    ))}
                    <div className="vs slam" key={`vs-${runId}`}>VS</div>
                  </div>
                </>
              );
            })()}
          </div>

          {status === "done" && (announcement || summary) && (
            <div className="verdict-summary">
              <div className="announce">📣 {announcement || summary}</div>
              {announcement && summary && <div className="announce-sub">{summary}</div>}
              <div className="verdict-actions">
                <button className="btn ghost small" onClick={() => setShowScorecard(true)}>
                  📊 Scorecard
                </button>
                <button className="btn ghost small" onClick={goHome}>
                  🏠 New debate
                </button>
                <button className="btn primary small" onClick={fight} disabled={running || !topic.trim() || online === false}>
                  ⚔️ Rematch
                </button>
              </div>
            </div>
          )}

          <div className="hud-bar">
            <div className="hud-left">
              <button
                className="btn ghost small hud-btn"
                onClick={() => {
                  fetchLeaderboard().then(setBoard);
                  setShowLeaderboard(true);
                }}
              >
                🏆 Leaderboard
              </button>
              <button className="btn ghost small hud-btn" onClick={() => setShowSettings(true)}>
                ⚙️ Settings
              </button>
            </div>

            <div className="hud-center">
              <div
                className={`status-badge ${online ? "online" : "offline"}`}
                title={online ? "Backend Server is Connected" : "Backend Server is Offline — Click to retry connection"}
                onClick={() => {
                  refreshServerData();
                  checkHealth().then((ok) => {
                    onlineRef.current = ok;
                    setOnline(ok);
                  });
                }}
              >
                <span className="status-dot"></span>
                <span className="status-text">{online ? "ONLINE" : "OFFLINE"}</span>
              </div>
            </div>

            <div className="hud-right">
              {speechSupported() && (
                <button
                  className={`btn ghost small hud-btn ${voiceEnabled ? "active" : ""}`}
                  onClick={toggleVoice}
                  title={voiceEnabled ? "Voices on — click to mute" : "Voices off — click to enable"}
                >
                  {voiceEnabled ? "🔊 Voice" : "🔇 Voice"}
                </button>
              )}
              <button
                className={`btn ghost small hud-btn ${soundEnabled ? "active" : ""}`}
                onClick={toggleSound}
                title={soundEnabled ? "Sound effects on — click to mute" : "Sound effects off — click to enable"}
              >
                {soundEnabled ? "🔊 Sound" : "🔇 Sound"}
              </button>
            </div>
          </div>

          {status !== "done" && (
          <>
          <div className="judges-bar">
            <span className="judges-bar-title">⚖️ Judge panel · {judgeList.length}</span>
            <button className="btn ghost small" disabled={running} onClick={() => setShowJudges(true)}>
              ⚙️ Manage judges
            </button>
          </div>
          <div className="judges">
            {judgeList.map((j) => {
              const blue = debaters.find((d) => d.side === "for");
              const green = debaters.find((d) => d.side === "against");
              const sb = blue && scoreOf(j.id, blue.id);
              const sg = green && scoreOf(j.id, green.id);
              const decided = sb || sg;
              const favored = (sb ?? sg)?.judgeWinnerId;
              // Scores stream in one row at a time — pick whichever side's quip we
              // actually have, preferring the favored side, never assuming both exist.
              const shown = (favored === green?.id ? sg : sb) ?? sb ?? sg;
              return (
                <div
                  className={`judge-card-container ${decided ? "flipped" : ""} ${decided ? "clickable" : ""}`}
                  key={j.id}
                  onClick={() => {
                    if (!decided) return;
                    setJudgePopup({
                      emoji: j.emoji || getFrontEmoji(j.criterion),
                      criterion: j.criterion,
                      sb: sb ? { score: sb.score, comment: sb.comment } : null,
                      sg: sg ? { score: sg.score, comment: sg.comment } : null,
                      favored,
                      blueName: blue?.name ?? "Blue",
                      greenName: green?.name ?? "Green",
                    });
                  }}
                >
                  <div className="judge-card-inner">
                    {/* Front: deliberating state */}
                    <div className="judge-card-front">
                      <div className="judge-face mystery">{j.emoji || getFrontEmoji(j.criterion)}</div>
                      <div className="judge-name">{j.criterion}</div>
                      <div className="deliberating-indicator">
                        <span className="radar-ping"></span>
                        {status === "judging" ? "ANALYZING..." : "WAITING..."}
                      </div>
                    </div>
                    {/* Back: scored state */}
                    <div className="judge-card-back">
                      <div className="judge-face">{j.emoji || getFrontEmoji(j.criterion)}</div>
                      <div className="judge-name">{j.criterion}</div>
                      <div className="judge-scores">
                        <span className={`pip blue ${favored === blue?.id ? "win" : ""}`}>{sb ? sb.score : "–"}</span>
                        <span className={`pip green ${favored === green?.id ? "win" : ""}`}>{sg ? sg.score : "–"}</span>
                      </div>
                      {shown && (
                        <div className="judge-verdict-wrap">
                          {favored && favored !== "tie" && (
                            <div className={`judge-winner-badge ${favored === blue?.id ? "blue" : "green"}`}>
                              <span className="judge-winner-check">✓</span>
                              {debaters.find((d) => d.id === favored)?.name ?? favored}
                            </div>
                          )}
                          {favored === "tie" && (
                            <div className="judge-winner-badge tie">⚖️ Tie</div>
                          )}
                          <div className="judge-expand-hint">tap for full verdict</div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          </>
          )}
        </div>

        <aside className="sidebar">
          <div className="panel">
            <h2 className="panel-title">📜 Transcript</h2>
            <div className="log" ref={logRef}>
              {turns.length === 0 && <p className="muted">No punches thrown yet.</p>}
              {turns.map((t, i) => {
                const d = debaters.find((x) => x.id === t.debaterId);
                const name = d ? (personaFor(d.side).category !== "default" ? personaFor(d.side).label : d.name) : t.debaterId;
                return (
                  <p key={i} className={`log-line ${d ? SIDE_COLOR[d.side] : ""}`}>
                    <b>{name}</b> <span className="muted">[{t.round}]</span> {t.text}
                  </p>
                );
              })}
            </div>
          </div>
        </aside>
      </main>

      {showSettings && (
        <Settings config={config} info={info} onChange={setConfig} onClose={() => setShowSettings(false)} />
      )}

      {botPanel && (
        <BotConfig
          side={botPanel}
          name={(debaters.length === 2 ? debaters : DISPLAY_BOTS).find((d) => d.side === botPanel)!.name}
          config={config}
          info={info}
          onChange={setConfig}
          onClose={() => setBotPanel(null)}
        />
      )}

      {showJudges && (
        <JudgesConfig config={config} info={info} onChange={setConfig} onClose={() => setShowJudges(false)} />
      )}

      {showLeaderboard && (
        <div className="modal-backdrop" onClick={() => { setShowLeaderboard(false); setConfirmClear(false); }}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2>🏆 Leaderboard</h2>
              <button className="btn ghost small" onClick={() => { setShowLeaderboard(false); setConfirmClear(false); }}>✕ Close</button>
            </div>
            <div className="setting-block">
              {board.length === 0 && <p className="muted">No matches yet — run a debate!</p>}
              {board.map((r, i) => (
                <div className="board-row" key={`${r.debaterId}-${r.name}`}>
                  <span>
                    <span className="board-rank">#{i + 1}</span> {r.name}
                  </span>
                  <span className="muted">
                    {r.wins}W · {r.matches}M · {r.points}pts
                  </span>
                </div>
              ))}
            </div>
            <div className="lb-clear-zone">
              {!confirmClear ? (
                <button
                  className="btn ghost small lb-clear-btn"
                  disabled={board.length === 0}
                  onClick={() => setConfirmClear(true)}
                >
                  🗑️ Reset All Data
                </button>
              ) : (
                <div className="lb-confirm-row">
                  <span className="lb-confirm-label">⚠️ Wipe all records?</span>
                  <button
                    className="btn ghost small lb-clear-btn danger"
                    onClick={async () => {
                      await clearLeaderboard();
                      setBoard([]);
                      setConfirmClear(false);
                    }}
                  >
                    ✓ Yes, clear
                  </button>
                  <button className="btn ghost small" onClick={() => setConfirmClear(false)}>
                    ✕ Cancel
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {showScorecard && winnerId && (
        <div className="modal-backdrop" onClick={() => setShowScorecard(false)}>
          <div className="modal scorecard-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2>📊 Scorecard</h2>
              <button className="btn ghost small" onClick={() => setShowScorecard(false)}>
                ✕ Close
              </button>
            </div>
            <ScoreCard
              judges={judgeList}
              scores={scores}
              debaters={debaters}
              totals={totals}
              winnerId={winnerId}
              judgeLabel={judgeLabel}
              mockJudging={mockJudging}
            />
          </div>
        </div>
      )}

      {judgePopup && (
        <div className="modal-backdrop" onClick={() => setJudgePopup(null)}>
          <div className="modal judge-popup" onClick={(e) => e.stopPropagation()}>
            <div className="judge-popup-head">
              <div className="judge-popup-title">
                <span className="judge-popup-emoji">{judgePopup.emoji}</span>
                <div>
                  <div className="judge-popup-criterion">{judgePopup.criterion}</div>
                  <div className="judge-popup-label">Judge Verdict</div>
                </div>
              </div>
              <button className="btn ghost small" onClick={() => setJudgePopup(null)}>✕ Close</button>
            </div>

            <div className="judge-popup-scores">
              <div className={`judge-popup-score-cell blue ${debaters.find(d => d.side === "for")?.id === judgePopup.favored ? "winner" : ""}`}>
                <span className="judge-popup-score-name">{judgePopup.blueName}</span>
                <span className="judge-popup-score-num blue">{judgePopup.sb?.score ?? "–"}</span>
              </div>
              <div className="judge-popup-vs">VS</div>
              <div className={`judge-popup-score-cell green ${debaters.find(d => d.side === "against")?.id === judgePopup.favored ? "winner" : ""}`}>
                <span className="judge-popup-score-name">{judgePopup.greenName}</span>
                <span className="judge-popup-score-num green">{judgePopup.sg?.score ?? "–"}</span>
              </div>
            </div>

            {judgePopup.favored && judgePopup.favored !== "tie" && (
              <div className={`judge-winner-badge ${debaters.find(d => d.side === "for")?.id === judgePopup.favored ? "blue" : "green"} judge-popup-winner`}>
                <span className="judge-winner-check">✓</span>
                {debaters.find((d) => d.id === judgePopup.favored)?.name ?? judgePopup.favored} wins this criterion
              </div>
            )}
            {judgePopup.favored === "tie" && (
              <div className="judge-winner-badge tie judge-popup-winner">⚖️ Tie — equally matched</div>
            )}

            <div className="judge-popup-section-label">Reasoning</div>
            {judgePopup.sb?.comment && (
              <div className="judge-popup-comment blue">
                <span className="judge-popup-comment-name blue">{judgePopup.blueName}</span>
                <p>{judgePopup.sb.comment}</p>
              </div>
            )}
            {judgePopup.sg?.comment && (
              <div className="judge-popup-comment green">
                <span className="judge-popup-comment-name green">{judgePopup.greenName}</span>
                <p>{judgePopup.sg.comment}</p>
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  );
}

function Fighter(props: {
  debater: Debater;
  active: boolean;
  winner: boolean;
  loser: boolean;
  total?: number;
  model: string;
  persona: { emoji: string; label: string; category: string };
  record?: { wins: number; matches: number };
  onConfig?: () => void;
}) {
  const { debater, active, winner, loser, total, model, persona, record, onConfig } = props;
  const color = SIDE_COLOR[debater.side];
  const winRate = record && record.matches > 0 ? Math.round((record.wins / record.matches) * 100) : null;
  const isCustomPersona = persona.category !== "default";
  const displayName = isCustomPersona ? persona.label : debater.name;
  return (
    <div className={`fighter ${color} ${active ? "active" : ""} ${winner ? "winner" : ""} ${loser ? "loser" : ""}`}>
      {onConfig && (
        <button className="bot-gear" title={`Configure ${displayName}`} onClick={onConfig}>
          ⚙️
        </button>
      )}
      <div className="bot">
        <div className="bot-avatar">
          {isCustomPersona ? (
            <div className={`persona-emoji-avatar ${color}`}>{persona.emoji}</div>
          ) : debater.side === "for" ? (
            <BlueRobot className="bot-svg" />
          ) : (
            <GreenRobot className="bot-svg" />
          )}
        </div>
        {winner && <div className="crown">👑</div>}
      </div>
      <div className="nameplate">
        {displayName}
        <span className="side">{debater.side === "for" ? "▲ FOR" : "▼ AGAINST"}</span>
        {total !== undefined && <span className="total">{total} pts</span>}
      </div>
      <div className="shield-bar-wrap">
        <div className={`shield-bar ${color} ${active ? "active" : ""}`} />
      </div>
      <div className="fighter-stats">
        <span className="stat" title="Model powering this bot">
          <span className="stat-ico">🧠</span> {model}
        </span>
        <span className="stat" title="Debating persona">
          <span className="stat-ico">{persona.emoji}</span> {persona.label}
        </span>
        <span className="stat" title="Career record across all matches">
          <span className="stat-ico">🏅</span>{" "}
          {record ? `${record.wins}W · ${record.matches}M${winRate !== null ? ` · ${winRate}%` : ""}` : "No bouts yet"}
        </span>
      </div>
    </div>
  );
}
