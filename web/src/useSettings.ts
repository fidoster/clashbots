import { useEffect, useState } from "react";
import type { ClientConfig } from "./types.js";
import { DEFAULT_JUDGES } from "./defaultJudges.js";

// v2: default lineup runs on a local LM Studio server (change "local:" → "mock"
// below to make the app work with zero setup for a public/portfolio build).
const KEY = "clashbots.config.v2";

const DEFAULT: ClientConfig = {
  keys: {},
  models: { for: "local:", against: "local:", judge: "local:" },
  prompts: {},
  personas: {},
  judges: DEFAULT_JUDGES,
  local: { baseUrl: "http://localhost:1234/v1" },
  voice: { enabled: false, rate: 1 },
  sound: { enabled: true, volume: 0.5 },
};

/**
 * Persisted runtime config (model choices + API keys) in localStorage.
 * Keys live only in the browser and are sent per-request to the local backend.
 */
export function useSettings() {
  const [config, setConfig] = useState<ClientConfig>(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return DEFAULT;
      const parsed = JSON.parse(raw) as ClientConfig;
      return {
        keys: { ...parsed.keys },
        models: { ...DEFAULT.models, ...parsed.models },
        prompts: { ...parsed.prompts },
        personas: { ...parsed.personas },
        judges: parsed.judges?.length
          ? parsed.judges.map((j: any) => {
              const emojiMap: Record<string, string> = {
                "🎩": "🧠",
                "🎭": "🗣️",
                "📏": "🔬",
                "❤️": "🤝"
              };
              return {
                ...j,
                emoji: emojiMap[j.emoji] || j.emoji
              };
            })
          : DEFAULT_JUDGES,
        local: { ...DEFAULT.local, ...parsed.local },
        voice: { ...DEFAULT.voice, ...parsed.voice },
        sound: { ...DEFAULT.sound, ...parsed.sound },
      };
    } catch {
      return DEFAULT;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(config));
    } catch {
      /* storage may be unavailable; ignore */
    }
  }, [config]);

  return [config, setConfig] as const;
}
