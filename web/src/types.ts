// Mirror of the server's domain contract — just the bits the UI needs.
export type RoundName = "opening" | "rebuttal" | "closing";

export interface Debater {
  id: string;
  name: string;
  side: "for" | "against";
}
export interface Turn {
  round: RoundName;
  debaterId: string;
  text: string;
}
export interface JudgeScore {
  judgeId: string;
  debaterId: string;
  score: number;
  comment: string;
  judgeWinnerId: string; // debaterId | "tie"
}
export interface MatchResult {
  matchId: string;
  topic: string;
  debaters: Debater[];
  turns: Turn[];
  scores: JudgeScore[];
  totals: Record<string, number>;
  judgeWinners: Record<string, string>;
  winnerId: string;
  margin: number;
  summary: string;
  announcement: string;
  models: { for: string; against: string; judge: string };
}

export type DebateEvent =
  | { type: "match_start"; topic: string; debaters: Debater[] }
  | { type: "round_start"; round: RoundName }
  | { type: "turn"; turn: Turn; speaker: string }
  | { type: "judging_start" }
  | { type: "score"; score: JudgeScore; judgeName: string; criterion: string }
  | { type: "verdict"; result: MatchResult }
  | { type: "error"; message: string };

export interface LeaderboardRow {
  debaterId: string;
  name: string;
  wins: number;
  matches: number;
  points: number;
}

// --- Settings / config ---
export type ProviderKind = "anthropic" | "openai" | "openrouter" | "deepseek" | "nvidia";

export interface ProviderKeys {
  anthropic?: string;
  openai?: string;
  openrouter?: string;
  deepseek?: string;
  nvidia?: string;
}
export interface ClientConfig {
  keys?: ProviderKeys;
  models?: { for?: string; against?: string; judge?: string };
  prompts?: { for?: string; against?: string };
  personas?: { for?: string; against?: string };
  names?: { for?: string; against?: string };
  judges?: import("./defaultJudges.js").JudgeConfig[];
  local?: { baseUrl?: string };
  voice?: { enabled?: boolean; for?: string; against?: string; judge?: string; rate?: number };
  sound?: { enabled?: boolean; volume?: number };
}

export interface ModelOption {
  id: string;
  label: string;
  needs?: ProviderKind;
}
export interface ModelsInfo {
  models: ModelOption[];
  serverKeys: Record<ProviderKind, boolean>;
  defaultDebaterPrompt: string;
  // Present on a public deploy; drives hiding key inputs / restricting the picker.
  mode?: { publicDemo: boolean; demoModel: string; allowBYOK: boolean };
}
