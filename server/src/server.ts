// REST + SSE API. The web arena posts an optional ClientConfig (model choices +
// API keys) with each match. Keys are used transiently for that request and are
// NEVER persisted or logged server-side.

import express from "express";
import cors from "cors";
import helmet from "helmet";
import { runDebate, DEFAULT_DEBATER_SYSTEM, type DebateEvent } from "./engine.js";
import { buildRoster, randomTopic, MODEL_CATALOG } from "./roster.js";
import { getProvider, normalizeLocalBase } from "./providers.js";
import { SqliteMatchRepository } from "./db.js";
import type { ClientConfig } from "./types.js";

// --- Deployment mode (drives the public/hardened behaviour) ---------------
// All off by default, so local dev is unchanged. Flip these on the host (Render)
// to run a safe public demo.
const bool = (v?: string) => /^(1|true|yes|on)$/i.test(v ?? "");
const PUBLIC_DEMO = bool(process.env.PUBLIC_DEMO); // lock the API down for public use
const ALLOW_BYOK = bool(process.env.ALLOW_BYOK); // let visitors bring their own keys
const DEMO_MODEL = process.env.DEMO_MODEL || "anthropic:claude-haiku-4-5"; // the one real model on YOUR key
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN; // e.g. https://clashbots.vercel.app
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || ""; // gate destructive ops on the public deploy
const MAX_TOPIC = 200; // cap topic length (chars)
const MAX_PERSONA = 220; // cap persona text (chars) on public
const MAX_JUDGES = 6; // cap custom judges on public
const RL_WINDOW_MS = 60_000;
const RL_MAX = Number(process.env.RATE_LIMIT_PER_MIN) || 20; // debates per IP per minute

const app = express();
app.set("trust proxy", 1); // Render/Vercel sit behind a proxy — needed for real client IPs
// Security headers. CSP is off (this is a JSON/SSE API, not an HTML host) and CORP is
// cross-origin so the Vercel frontend can read responses.
app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: "cross-origin" } }));
// Lock CORS to the known frontend origin in production; allow all in dev.
app.use(cors(FRONTEND_ORIGIN ? { origin: FRONTEND_ORIGIN } : {}));
app.use(express.json({ limit: "256kb" }));

const repo = new SqliteMatchRepository();

// --- Per-IP rate limiter (in-memory; fine for a single Render instance) -----
// Only enforced on public deploys. For multi-instance scale, swap for a Redis/
// Upstash-backed limiter.
const hits = new Map<string, { count: number; reset: number }>();
function rateLimit(req: express.Request, res: express.Response, next: express.NextFunction) {
  if (!PUBLIC_DEMO) return next();
  // Use req.ip: with `trust proxy` set, Express resolves the real client IP from the
  // proxy chain. Reading the raw X-Forwarded-For header would be client-spoofable.
  const ip = req.ip || "unknown";
  const now = Date.now();
  if (hits.size > 5000) for (const [k, v] of hits) if (now > v.reset) hits.delete(k); // opportunistic prune
  const rec = hits.get(ip);
  if (!rec || now > rec.reset) {
    hits.set(ip, { count: 1, reset: now + RL_WINDOW_MS });
    return next();
  }
  if (rec.count >= RL_MAX) {
    res.set("Retry-After", String(Math.ceil((rec.reset - now) / 1000)));
    return res.status(429).json({ error: "Whoa — too many debates. Give it a minute." });
  }
  rec.count++;
  next();
}

// --- Public-mode config sanitiser ------------------------------------------
// NEVER trust the client's model/key choices on a public deploy. Force everything
// to mock or the one demo model (on the server's key), and drop client keys/local
// URLs unless BYOK is explicitly enabled (the latter also guards against SSRF).
function sanitizeConfig(config: ClientConfig): ClientConfig {
  if (!PUBLIC_DEMO) return config; // dev/local: anything goes
  const allowed = (id?: string) => id === "mock" || id === DEMO_MODEL || (ALLOW_BYOK && !!id);
  const pick = (id?: string) => (allowed(id) ? id! : "mock"); // default to free mock, never your paid key
  const cap = (s: unknown, n: number) => (typeof s === "string" ? s.slice(0, n) : undefined);
  const safe: ClientConfig = {
    ...config,
    models: {
      for: pick(config.models?.for),
      against: pick(config.models?.against),
      judge: pick(config.models?.judge),
    },
    keys: ALLOW_BYOK ? config.keys : {}, // visitors can't reach your server key; theirs only if BYOK
    local: ALLOW_BYOK ? config.local : {}, // no arbitrary local URLs from the public (SSRF guard)
    // Drop full system-prompt overrides — that's the strongest prompt-injection lever,
    // and it would run on YOUR key. Public users get the default debater prompt.
    prompts: {},
    // Personas are short flavour phrases; length-cap them to limit injection/cost.
    personas: config.personas
      ? { for: cap(config.personas.for, MAX_PERSONA), against: cap(config.personas.against, MAX_PERSONA) }
      : undefined,
  };
  // Custom judges: cap the count and every free-text field (rubric is injected into the
  // judge prompt), and force the model through `pick`.
  if (safe.judges?.length) {
    safe.judges = safe.judges.slice(0, MAX_JUDGES).map((j) => ({
      id: cap(j.id, 40) || j.id,
      name: cap(j.name, 40) || "Judge",
      criterion: cap(j.criterion, 40) || "Overall",
      rubric: cap(j.rubric, 400) || "Judge each side fairly on this criterion.",
      model: j.model ? pick(j.model) : j.model,
    }));
  }
  return safe;
}

app.get("/api/health", (_req, res) => res.json({ ok: true, name: "clashbots" }));

// Catalog of selectable models + which keys the SERVER already has (booleans only).
app.get("/api/models", (_req, res) => {
  res.json({
    models: MODEL_CATALOG,
    serverKeys: {
      anthropic: Boolean(process.env.ANTHROPIC_API_KEY),
      openai: Boolean(process.env.OPENAI_API_KEY),
      openrouter: Boolean(process.env.OPENROUTER_API_KEY),
      deepseek: Boolean(process.env.DEEPSEEK_API_KEY),
      nvidia: Boolean(process.env.NVIDIA_API_KEY),
    },
    defaultDebaterPrompt: DEFAULT_DEBATER_SYSTEM,
    // Lets the UI adapt: hide key inputs / restrict the model picker on a public deploy.
    mode: { publicDemo: PUBLIC_DEMO, demoModel: DEMO_MODEL, allowBYOK: ALLOW_BYOK },
  });
});

// Validate a model + key combo with a tiny live completion before a match.
// Only useful when keys/local are in play — disabled on a locked-down public demo.
app.post("/api/test-provider", rateLimit, async (req, res) => {
  if (PUBLIC_DEMO && !ALLOW_BYOK) return res.status(403).json({ ok: false, error: "Disabled on the public demo." });
  const { providerId, keys, localBaseUrl } = (req.body ?? {}) as {
    providerId?: string;
    keys?: ClientConfig["keys"];
    localBaseUrl?: string;
  };
  if (!providerId) return res.status(400).json({ ok: false, error: "providerId required" });
  try {
    const provider = getProvider(providerId, keys ?? {}, localBaseUrl);
    const out = await provider.complete({
      system: "Reply with exactly: OK",
      user: "Say OK.",
      maxTokens: 5,
      temperature: 0,
    });
    res.json({ ok: true, sample: out.slice(0, 40) });
  } catch (err) {
    res.json({ ok: false, error: cleanErr(err) });
  }
});

// List models loaded on a local OpenAI-compatible server (LM Studio / Ollama).
// Fetches a client-supplied URL, so it's disabled on the public demo (SSRF guard).
app.post("/api/local-models", rateLimit, async (req, res) => {
  if (PUBLIC_DEMO && !ALLOW_BYOK) return res.status(403).json({ ok: false, error: "Disabled on the public demo.", models: [] });
  const base = normalizeLocalBase((req.body?.baseUrl as string) || undefined);
  try {
    const r = await fetch(`${base}/models`);
    if (!r.ok) return res.json({ ok: false, error: `HTTP ${r.status}`, models: [] });
    const data = (await r.json()) as any;
    const models = Array.isArray(data?.data) ? data.data.map((m: any) => m.id).filter(Boolean) : [];
    res.json({ ok: true, models });
  } catch (err) {
    res.json({ ok: false, error: cleanErr(err), models: [] });
  }
});

app.post("/api/debate", rateLimit, async (req, res) => {
  const { topic, config } = parseBody(req.body);
  if (topicBlocked(topic)) return res.status(400).json({ error: "That topic isn't allowed on the public demo." });
  try {
    const { debaters, judges } = buildRoster(config);
    const result = await runDebate(topic, debaters, judges, config);
    repo.save(result);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: cleanErr(err) });
  }
});

// Stream a match live as Server-Sent Events — one frame per turn/score/verdict.
app.post("/api/debate/stream", rateLimit, async (req, res) => {
  const { topic, config } = parseBody(req.body);
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  const send = (e: DebateEvent) => res.write(`data: ${JSON.stringify(e)}\n\n`);
  if (topicBlocked(topic)) {
    // Surface as an SSE error event so the existing client error UI handles it.
    send({ type: "error", message: "That topic isn't allowed on the public demo." });
    return res.end();
  }
  try {
    const { debaters, judges } = buildRoster(config);
    // Stream turns as soon as they're ready; the web client paces the reveal
    // (typewriter + one-bubble-at-a-time). A tiny gap keeps SSE frames distinct.
    const result = await runDebate(topic, debaters, judges, config, send, 50);
    repo.save(result);
  } catch (err) {
    send({ type: "error", message: cleanErr(err) });
  } finally {
    res.end();
  }
});

app.get("/api/matches", (_req, res) => res.json(repo.list()));
app.get("/api/matches/:id", (req, res) => {
  const m = repo.get(req.params.id);
  return m ? res.json(m) : res.status(404).json({ error: "not found" });
});
app.get("/api/leaderboard", (_req, res) => res.json(repo.leaderboard()));

// Wipe all match history + scores. Open in local dev; on a public deploy it requires
// a matching ADMIN_TOKEN header (and is refused if no token is configured).
app.delete("/api/leaderboard", rateLimit, (req, res) => {
  if (PUBLIC_DEMO) {
    const provided = req.get("x-admin-token") ?? "";
    if (!ADMIN_TOKEN || provided !== ADMIN_TOKEN) {
      return res.status(403).json({ ok: false, error: "Forbidden." });
    }
  }
  try {
    repo.clearAll();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: cleanErr(err) });
  }
});

// Narrow content guard for the public demo — only the worst-abuse categories, kept
// tight to avoid false positives on legitimate debate topics (death penalty, war,
// drug policy, etc. do NOT match). Defense-in-depth; providers also enforce safety.
const BLOCKED_TOPIC =
  /\b(c[\W_]?s[\W_]?a[\W_]?m|child\s*(?:porn|sexual|sex|abuse)|rape|bestiality|how\s+to\s+(?:make|build|cook)\s+(?:a\s+)?(?:bomb|meth|explosive|nerve\s*agent)|suicide\s+method|kill\s+(?:myself|yourself))\b/i;
function topicBlocked(topic: string): boolean {
  return PUBLIC_DEMO && BLOCKED_TOPIC.test(topic);
}

function parseBody(body: any): { topic: string; config: ClientConfig } {
  let topic = (body?.topic as string)?.trim() || randomTopic();
  if (topic.length > MAX_TOPIC) topic = topic.slice(0, MAX_TOPIC);
  const config = sanitizeConfig((body?.config ?? {}) as ClientConfig);
  return { topic, config };
}

/** Strip anything that looks like a key/token from error messages, just in case. */
function cleanErr(err: unknown): string {
  return String(err instanceof Error ? err.message : err)
    .replace(/sk-[A-Za-z0-9_-]+/g, "sk-***") // OpenAI / Anthropic / OpenRouter
    .replace(/nvapi-[A-Za-z0-9_-]+/g, "nvapi-***") // NVIDIA NIM
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer ***") // any Authorization header echo
    .slice(0, 300);
}

const port = Number(process.env.PORT) || 8787;
app.listen(port, () => console.log(`⚡ Clashbots API on http://localhost:${port}`));
