export interface JudgeConfig {
  id: string;
  emoji: string;
  name: string;
  criterion: string;
  rubric: string; // the judge's scoring instructions (system prompt)
  model: string; // providerId this judge runs on (e.g. "mock", "openai:gpt-4o-mini")
}

/** The canonical default panel. "Reset to default" restores exactly these four. */
export const DEFAULT_JUDGES: JudgeConfig[] = [
  {
    id: "logician",
    emoji: "🧠",
    name: "The Logician",
    criterion: "Logic & Evidence",
    rubric:
      "Assess validity of reasoning, quality of evidence, and internal consistency. Penalise fallacies, unsupported leaps, and contradictions.",
  },
  {
    id: "showman",
    emoji: "🗣️",
    name: "The Showman",
    criterion: "Rhetoric & Style",
    rubric:
      "Assess clarity, wit, vividness, and persuasive force of language. Reward memorable, well-structured delivery — not mere length.",
  },
  {
    id: "pedant",
    emoji: "🔬",
    name: "The Pedant",
    criterion: "Accuracy & Rigor",
    rubric:
      "Hunt for unsupported or false claims and vague hand-waving. Reward precise, concrete, checkable statements; penalise overreach.",
  },
  {
    id: "everyman",
    emoji: "🤝",
    name: "The Everyman",
    criterion: "Persuasiveness",
    rubric:
      "As a non-expert audience member, judge who actually moved you. Reward relatable, convincing arguments over jargon and posturing.",
  },
].map((j) => ({ ...j, model: "local:" }));

export function newJudge(): JudgeConfig {
  return {
    id: `j_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    emoji: "⚖️",
    name: "New Judge",
    criterion: "New Criterion",
    rubric: "Score each side 1-10 on this criterion, rewarding the stronger arguments with specifics.",
    model: "local:",
  };
}
