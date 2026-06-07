// Pluggable LLM providers. A providerId is "mock" or "<kind>:<model>", e.g.
// "anthropic:claude-sonnet-4-6". Keys are resolved per-request: client-supplied
// keys win, then server env vars. Real providers throw a clear error when their
// key is missing (so the UI can surface it) — only "mock" runs unconditionally.

import type { Provider, ProviderKeys } from "./types.js";

type CompleteInput = Parameters<Provider["complete"]>[0];

const MOCK_QUIPS = [
  "cites specifics but leans on confidence over evidence",
  "structurally clean, a little light on hard proof",
  "vivid and persuasive, occasionally hand-wavy",
  "tight logic, forgettable delivery",
  "bold framing, thin receipts",
];

/** Free mock so the app runs end-to-end with zero keys. */
class MockProvider implements Provider {
  id = "mock";
  label: string;
  constructor(label = "MockBot") {
    this.label = label;
  }
  async complete({ system, user }: CompleteInput): Promise<string> {
    // Judge prompts ask for comparative JSON — detect and emit valid output.
    if (/"winner"|return only json/i.test(system)) {
      const f = 4 + (hash(user + "for") % 6); // 4..9
      const a = 4 + (hash(user + "against") % 6);
      const winner = f === a ? "tie" : f > a ? "for" : "against";
      return JSON.stringify({
        for: { score: f, reason: MOCK_QUIPS[hash(user + "f") % MOCK_QUIPS.length] },
        against: { score: a, reason: MOCK_QUIPS[hash(user + "a") % MOCK_QUIPS.length] },
        winner,
      });
    }
    const side = /argue the FOR \(in favour\)|FOR \(in favour\)|argue the FOR side/i.test(user) ? "for" : "against";

    // Reactive: if the opponent has already spoken, quote them and respond.
    const lastOpp = user.match(/most recently said:\s*"([^"]+)"/);
    if (lastOpp) {
      const snippet = firstWords(sanitizeSnippet(lastOpp[1]!), 9).replace(/[…,;:.\s]+$/u, "");
      const tmpls = MOCK_REBUTTALS[side];
      return tmpls[hash(user) % tmpls.length]!.replace("{q}", snippet);
    }
    // Opening line: fold the real topic in so the mock isn't topic-blind. Wrap it
    // in typographic quotes (not straight ") so it never collides with the
    // `most recently said: "…"` capture when the opponent rebuts next turn.
    const topic = user.match(/Debate topic:\s*"([^"]+)"/i)?.[1]?.trim();
    const subj = topic ? `“${topic}”` : "this";
    const lines = MOCK_OPENINGS[side](subj);
    return lines[hash(user) % lines.length]!;
  }
}

// Topic-aware openings: the mock weaves the actual debate subject into its first
// line so keyless demos engage with the question instead of sounding generic.
// `subj` is the quoted topic (e.g. `"Is a hotdog a sandwich?"`) or "this" as a
// fallback when no topic could be parsed from the prompt.
const MOCK_OPENINGS: Record<"for" | "against", (subj: string) => string[]> = {
  for: (subj) => [
    `On ${subj}, the case practically makes itself: the upside is concrete and measurable, and the cost of doing nothing is the real risk.`,
    `Look at ${subj} honestly — the evidence isn't subtle, it's a neon sign, and every credible trend bends my way.`,
  ],
  against: (subj) => [
    `Everyone's bullish on ${subj} until the hidden bill arrives — and here, the footnote is a cliff.`,
    `Slow down before you buy ${subj}: confidence isn't evidence, and the rosy version quietly skips every inconvenient detail.`,
  ],
};

// {q} is replaced with a short quote of the opponent's most recent statement.
// Uses typographic quotes ‘ ’ around {q} so quotes never collide with the parser's
// own double-quote capture across turns.
const MOCK_REBUTTALS: Record<"for" | "against", string[]> = {
  for: [
    "You say ‘{q}…’ — but that fear is exactly backwards. The evidence is a neon sign, and inaction is the real gamble here.",
    "When you claim ‘{q}…’, you prove my point: you're dramatizing a downside while ignoring a concrete, measurable upside.",
    "‘{q}…’? That footnote you keep waving is thinner than the headline. Weigh the actual numbers and my side wins.",
  ],
  against: [
    "You insist ‘{q}…’, yet confidence isn't evidence. Read the footnote before you leap — it's a cliff.",
    "That line — ‘{q}…’ — sounds bold, but bold framing with thin receipts is exactly how the bill sneaks up on us.",
    "You lean on ‘{q}…’, but every utopia has hidden costs, and you just hand-waved right past them.",
  ],
};

function firstWords(s: string, n: number): string {
  return s.split(/\s+/).slice(0, n).join(" ");
}

/**
 * Strip quote delimiters (so mock quote-of-a-quote never telescopes) and any
 * leading reactive scaffolding, leaving the opponent's actual claim. Keeps
 * straight apostrophes so contractions like "isn't" stay intact.
 */
function sanitizeSnippet(s: string): string {
  const noQuotes = s.replace(/[“”‘’"]/g, "");
  const stripped = noQuotes
    .replace(/^you (say|insist|claim|lean on|keep)\s+/i, "")
    .replace(/^that line\s*[—-]?\s*/i, "")
    .replace(/^when you claim\s+/i, "")
    .trim();
  return stripped || noQuotes.trim();
}

/** OpenAI-compatible chat endpoint — serves both OpenAI and OpenRouter. */
class OpenAICompatProvider implements Provider {
  id: string;
  label: string;
  constructor(
    private model: string,
    private baseUrl: string,
    private apiKey: string,
    label: string,
  ) {
    this.id = `${label.toLowerCase()}:${model}`;
    this.label = label;
  }
  async complete({ system, user, maxTokens = 350, temperature = 0.9 }: CompleteInput) {
    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify({
        model: this.model,
        max_tokens: maxTokens,
        temperature,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });
    if (!res.ok) throw new Error(`${this.label} API ${res.status}: ${await safeBody(res)}`);
    const data = (await res.json()) as any;
    return stripThinking(data.choices?.[0]?.message?.content?.trim() ?? "");
  }
}

/** Anthropic Messages API. */
class AnthropicProvider implements Provider {
  id: string;
  label = "Claude";
  constructor(private model: string, private apiKey: string) {
    this.id = `anthropic:${model}`;
  }
  async complete({ system, user, maxTokens = 350, temperature = 0.9 }: CompleteInput) {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: maxTokens,
        temperature,
        system,
        messages: [{ role: "user", content: user }],
      }),
    });
    if (!res.ok) throw new Error(`Anthropic API ${res.status}: ${await safeBody(res)}`);
    const data = (await res.json()) as any;
    return stripThinking(data.content?.[0]?.text?.trim() ?? "");
  }
}

/** Local OpenAI-compatible server (LM Studio, Ollama). If no model name is given,
 *  it auto-discovers the loaded model via GET {base}/models — so you just point at
 *  the URL and it uses whatever is loaded. */
class LocalProvider implements Provider {
  id = "local";
  label = "Local";
  private picked?: string;
  constructor(private base: string, private model?: string) {}

  private async resolveModel(): Promise<string> {
    if (this.model && this.model.trim()) return this.model.trim();
    if (this.picked) return this.picked;
    try {
      const res = await fetch(`${this.base}/models`);
      if (res.ok) {
        const data = (await res.json()) as any;
        const id = data?.data?.[0]?.id;
        if (id) return (this.picked = id);
      }
    } catch {
      /* fall through — many local servers use the loaded model regardless of name */
    }
    return (this.picked = "local-model");
  }

  async complete(input: CompleteInput): Promise<string> {
    const model = await this.resolveModel();
    return new OpenAICompatProvider(model, this.base, "lm-studio", "Local").complete(input);
  }
}

/** Normalise a local base URL: strip trailing slashes and ensure a /vN path
 *  (so "http://192.168.100.30:1234" becomes ".../v1"). */
export function normalizeLocalBase(url?: string): string {
  let base = (url || process.env.LMSTUDIO_BASE_URL || "http://localhost:1234/v1").trim().replace(/\/+$/, "");
  if (!/\/v\d+$/.test(base)) base += "/v1";
  return base;
}

/** Merge client-supplied keys with server env (client wins). */
function resolveKeys(keys: ProviderKeys = {}): Required<ProviderKeys> {
  return {
    anthropic: keys.anthropic || process.env.ANTHROPIC_API_KEY || "",
    openai: keys.openai || process.env.OPENAI_API_KEY || "",
    openrouter: keys.openrouter || process.env.OPENROUTER_API_KEY || "",
    deepseek: keys.deepseek || process.env.DEEPSEEK_API_KEY || "",
    nvidia: keys.nvidia || process.env.NVIDIA_API_KEY || "",
  };
}

export function getProvider(providerId: string, keys: ProviderKeys = {}, localBaseUrl?: string): Provider {
  // Split on the FIRST colon only — handles "mock", "local", "local:" (empty
  // model → auto-detect), and "openrouter:vendor/model" alike.
  const colon = providerId.indexOf(":");
  const kind = colon === -1 ? providerId : providerId.slice(0, colon);
  const model = colon === -1 ? undefined : providerId.slice(colon + 1);
  if (kind === "mock") return new MockProvider();

  // Local OpenAI-compatible server (LM Studio, Ollama, etc.) — no API key, and the
  // model name is optional (auto-discovered from the server when omitted).
  if (kind === "local") {
    return new LocalProvider(normalizeLocalBase(localBaseUrl), model);
  }

  const k = resolveKeys(keys);
  if (!model) throw new Error(`Provider "${kind}" needs a model id, e.g. "${kind}:<model>".`);

  switch (kind) {
    case "anthropic":
      if (!k.anthropic) throw new Error("Missing Anthropic API key. Add it in Settings.");
      return new AnthropicProvider(model, k.anthropic);
    case "openai":
      if (!k.openai) throw new Error("Missing OpenAI API key. Add it in Settings.");
      return new OpenAICompatProvider(model, "https://api.openai.com/v1", k.openai, "GPT");
    case "openrouter":
      if (!k.openrouter) throw new Error("Missing OpenRouter API key. Add it in Settings.");
      return new OpenAICompatProvider(model, "https://openrouter.ai/api/v1", k.openrouter, "OpenRouter");
    case "deepseek":
      if (!k.deepseek) throw new Error("Missing DeepSeek API key. Add it in Settings.");
      return new OpenAICompatProvider(model, "https://api.deepseek.com/v1", k.deepseek, "DeepSeek");
    case "nvidia":
      if (!k.nvidia) throw new Error("Missing NVIDIA API key. Add it in Settings.");
      return new OpenAICompatProvider(model, "https://integrate.api.nvidia.com/v1", k.nvidia, "NVIDIA");
    default:
      throw new Error(`Unknown provider "${kind}".`);
  }
}

/** True if the given providerId can run with the supplied/env keys. */
export function providerReady(providerId: string, keys: ProviderKeys = {}): boolean {
  try {
    getProvider(providerId, keys);
    return true;
  } catch {
    return false;
  }
}

async function safeBody(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 300);
  } catch {
    return "<no body>";
  }
}

// Matches harness control tokens in their many leaked forms:
// <|channel|>, <channel|>, <|channel>, <|message|>, <|end|>, <|start|>, <|assistant|> …
const CONTROL_TOKEN = /<\|?[a-z_]+\|?>/gi;

/** Strip chain-of-thought / harness control tokens that local "thinking" models
 *  (DeepSeek-R1, QwQ, gpt-oss harmony, Gemma-thinking, etc.) leak into their output.
 *  Keeps only the FINAL answer segment. */
export function stripThinking(s: string): string {
  if (!s) return s;
  let t = s;
  // Tagged reasoning blocks.
  t = t.replace(/<think>[\s\S]*?<\/think>/gi, "");
  t = t.replace(/<reasoning>[\s\S]*?<\/reasoning>/gi, "");

  // Channel/message tokens delimit thinking from the answer. Split on them and
  // keep the last *substantial* segment (the real answer), skipping short marker
  // words like "final"/"analysis"/"assistant".
  const parts = t.split(CONTROL_TOKEN).map((p) => p.trim()).filter(Boolean);
  if (parts.length > 1) {
    t = [...parts].reverse().find((p) => p.split(/\s+/).length > 4) ?? parts[parts.length - 1]!;
  }

  // Drop a leading bare "thought:"/"analysis"/"reasoning" lead-in if it survived.
  t = t.replace(/^(thought|analysis|reasoning|final)\b[:\s]*/i, "");
  t = t.replace(CONTROL_TOKEN, "").trim();
  return t || s.trim();
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}
