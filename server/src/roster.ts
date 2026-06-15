// Default cast + judging panel, plus a catalog of selectable models. Debaters and
// judges default to the free "mock" provider; a ClientConfig can point any of them
// at a real model (which then requires the matching API key).

import type { ClientConfig, Debater, JudgeDef } from "./types.js";

export interface ModelOption {
  id: string; // providerId
  label: string;
  needs?: "anthropic" | "openai" | "openrouter" | "deepseek" | "nvidia"; // key required, if any
}

export const MODEL_CATALOG: ModelOption[] = [
  { id: "mock", label: "🤖 Mock (free, no key)" },
  { id: "local", label: "🖥️ Local (LM Studio / Ollama)" },

  // Anthropic
  { id: "anthropic:claude-sonnet-4-6", label: "Claude Sonnet 4.6", needs: "anthropic" },
  { id: "anthropic:claude-haiku-4-5", label: "Claude Haiku 4.5", needs: "anthropic" },

  // OpenAI
  { id: "openai:gpt-4o", label: "GPT-4o", needs: "openai" },
  { id: "openai:gpt-4o-mini", label: "GPT-4o mini", needs: "openai" },

  // DeepSeek (native API)
  { id: "deepseek:deepseek-chat", label: "DeepSeek V3 (Chat)", needs: "deepseek" },
  { id: "deepseek:deepseek-reasoner", label: "DeepSeek R1 (Reasoner)", needs: "deepseek" },

  // OpenRouter — one key unlocks many providers
  { id: "openrouter:deepseek/deepseek-chat", label: "DeepSeek V3 · OpenRouter", needs: "openrouter" },
  { id: "openrouter:deepseek/deepseek-r1", label: "DeepSeek R1 · OpenRouter", needs: "openrouter" },
  { id: "openrouter:google/gemini-2.0-flash-001", label: "Gemini 2.0 Flash · OpenRouter", needs: "openrouter" },
  { id: "openrouter:meta-llama/llama-3.3-70b-instruct", label: "Llama 3.3 70B · OpenRouter", needs: "openrouter" },
  { id: "openrouter:qwen/qwen-2.5-72b-instruct", label: "Qwen 2.5 72B · OpenRouter", needs: "openrouter" },
  { id: "openrouter:mistralai/mistral-large", label: "Mistral Large · OpenRouter", needs: "openrouter" },
  { id: "openrouter:x-ai/grok-2-1212", label: "Grok 2 · OpenRouter", needs: "openrouter" },

  // OpenRouter FREE tier (one OpenRouter key, no usage cost)
  { id: "openrouter:nvidia/nemotron-3-ultra:free", label: "🆓 Nemotron 3 Ultra · OpenRouter free", needs: "openrouter" },
  { id: "openrouter:nvidia/nemotron-3-super:free", label: "🆓 Nemotron 3 Super · OpenRouter free", needs: "openrouter" },
  { id: "openrouter:openai/gpt-oss-120b:free", label: "🆓 GPT-OSS 120B · OpenRouter free", needs: "openrouter" },
  { id: "openrouter:nex-agi/nex-n2-pro:free", label: "🆓 Nex N2 Pro · OpenRouter free", needs: "openrouter" },
  { id: "openrouter:poolside/laguna-m.1:free", label: "🆓 Laguna M.1 · OpenRouter free", needs: "openrouter" },
  { id: "openrouter:poolside/laguna-xs.2:free", label: "🆓 Laguna XS.2 · OpenRouter free", needs: "openrouter" },

  // NVIDIA NIM (free credits at build.nvidia.com — key looks like "nvapi-…")
  { id: "nvidia:meta/llama-3.3-70b-instruct", label: "🆓 Llama 3.3 70B · NVIDIA", needs: "nvidia" },
  { id: "nvidia:deepseek-ai/deepseek-r1", label: "🆓 DeepSeek R1 · NVIDIA", needs: "nvidia" },
  { id: "nvidia:nvidia/llama-3.1-nemotron-70b-instruct", label: "🆓 Nemotron 70B · NVIDIA", needs: "nvidia" },
  { id: "nvidia:qwen/qwen2.5-72b-instruct", label: "🆓 Qwen 2.5 72B · NVIDIA", needs: "nvidia" },
];

function baseDebaters(): [Debater, Debater] {
  return [
    {
      id: "blue",
      name: "Professor Blue",
      persona:
        "an earnest, professorial debater who loves evidence, structure, and the occasional dry joke",
      providerId: "mock",
      side: "for",
    },
    {
      id: "green",
      name: "Captain Green",
      persona:
        "a slick debate-club captain — fast, rhetorical, allergic to losing, and a little theatrical",
      providerId: "mock",
      side: "against",
    },
  ];
}

const BASE_JUDGES: JudgeDef[] = [
  {
    id: "logician",
    name: "The Logician",
    criterion: "Logic & Evidence",
    rubric:
      "Assess validity of reasoning, quality of evidence, and internal consistency. Penalise fallacies, unsupported leaps, and contradictions.",
    providerId: "mock",
  },
  {
    id: "showman",
    name: "The Showman",
    criterion: "Rhetoric & Style",
    rubric:
      "Assess clarity, wit, vividness, and persuasive force of language. Reward memorable, well-structured delivery — not mere length.",
    providerId: "mock",
  },
  {
    id: "pedant",
    name: "The Pedant",
    criterion: "Accuracy & Rigor",
    rubric:
      "Hunt for unsupported or false claims and vague hand-waving. Reward precise, concrete, checkable statements; penalise overreach.",
    providerId: "mock",
  },
  {
    id: "everyman",
    name: "The Everyman",
    criterion: "Persuasiveness",
    rubric:
      "As a non-expert audience member, judge who actually moved you. Reward relatable, convincing arguments over jargon and posturing.",
    providerId: "mock",
  },
];

/** Apply a ClientConfig to produce the concrete debaters + judges for a match. */
export function buildRoster(config?: ClientConfig): {
  debaters: [Debater, Debater];
  judges: JudgeDef[];
} {
  const debaters = baseDebaters();
  if (config?.models?.for) debaters[0].providerId = config.models.for;
  if (config?.models?.against) debaters[1].providerId = config.models.against;
  if (config?.personas?.for?.trim()) debaters[0].persona = config.personas.for.trim();
  if (config?.personas?.against?.trim()) debaters[1].persona = config.personas.against.trim();
  if (config?.names?.for?.trim()) debaters[0].name = config.names.for.trim();
  if (config?.names?.against?.trim()) debaters[1].name = config.names.against.trim();

  const judgeModel = config?.models?.judge;
  let judges: JudgeDef[];
  if (config?.judges?.length) {
    // Client-defined panel — each judge may pick its own model.
    judges = config.judges.slice(0, 8).map((j) => ({
      id: j.id,
      name: j.name?.trim() || "Judge",
      criterion: j.criterion?.trim() || "Overall",
      rubric: j.rubric?.trim() || "Judge each side fairly on this criterion.",
      providerId: j.model?.trim() || judgeModel || "mock",
    }));
  } else {
    judges = BASE_JUDGES.map((j) => (judgeModel ? { ...j, providerId: judgeModel } : j));
  }
  return { debaters, judges };
}

export const TOPICS: string[] = [
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

export function randomTopic(): string {
  return TOPICS[Math.floor(Math.random() * TOPICS.length)]!;
}
