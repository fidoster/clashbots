// Core domain types for Clashbots. Kept framework-agnostic so the engine,
// the API layer, and the web UI all share one contract.

export type Side = "for" | "against";
export type RoundName = "opening" | "rebuttal" | "closing";

export const ROUND_ORDER: RoundName[] = ["opening", "rebuttal", "closing"];

/** API keys supplied per-request from the client (or read from server env). */
export interface ProviderKeys {
  anthropic?: string;
  openai?: string;
  openrouter?: string;
  deepseek?: string;
  nvidia?: string;
}

/** Runtime configuration a client may send to override defaults. */
export interface ClientConfig {
  keys?: ProviderKeys;
  models?: {
    for?: string; // providerId for the FOR debater
    against?: string; // providerId for the AGAINST debater
    judge?: string; // providerId for the whole judge panel
  };
  prompts?: {
    for?: string; // custom system prompt for the FOR debater
    against?: string; // custom system prompt for the AGAINST debater
  };
  personas?: {
    for?: string; // persona text injected into the {persona} slot for the FOR debater
    against?: string; // …and for the AGAINST debater. Omitted = use the built-in default.
  };
  names?: {
    for?: string; // custom name for the FOR debater
    against?: string; // custom name for the AGAINST debater
  };
  // Custom judge panel (add/remove/edit). If omitted, the default 4 are used.
  // Each judge may run on its own model (providerId); falls back to models.judge.
  judges?: Array<{ id: string; name: string; criterion: string; rubric: string; model?: string }>;
  // Local OpenAI-compatible server (e.g. LM Studio). Used by "local:<model>" ids.
  local?: { baseUrl?: string };
}

/** A pluggable LLM. Mock and real providers both satisfy this. */
export interface Provider {
  id: string;
  label: string;
  complete(input: {
    system: string;
    user: string;
    maxTokens?: number;
    temperature?: number;
  }): Promise<string>;
}

export interface Debater {
  id: string;
  name: string;
  persona: string;
  providerId: string;
  side: Side;
}

export interface JudgeDef {
  id: string;
  name: string;
  criterion: string; // short label, e.g. "Logic"
  rubric: string; // criterion-specific guidance injected into the prompt
  providerId: string;
}

export interface Turn {
  round: RoundName;
  debaterId: string;
  text: string;
}

/** One judge's view of one debater. Both rows of a judge share judgeWinnerId. */
export interface JudgeScore {
  judgeId: string;
  debaterId: string;
  score: number; // 1..10
  comment: string; // concise justification citing specifics
  judgeWinnerId: string; // debaterId this judge favored, or "tie"
}

export interface MatchResult {
  matchId: string;
  topic: string;
  createdAt: string;
  debaters: Debater[];
  turns: Turn[];
  scores: JudgeScore[];
  totals: Record<string, number>; // debaterId -> summed score
  judgeWinners: Record<string, string>; // judgeId -> debaterId | "tie"
  winnerId: string;
  margin: number; // winner total - loser total
  summary: string; // human-readable verdict synthesis (one line)
  announcement: string; // hype host recap, spoken at the verdict
  models: { for: string; against: string; judge: string }; // providerIds actually used
}
