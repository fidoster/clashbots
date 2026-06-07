import type { ClientConfig, DebateEvent, LeaderboardRow, ModelsInfo } from "./types.js";

// In production the frontend (Vercel) and backend (Render) live on different
// origins, so calls target VITE_API_BASE. In dev it's empty and Vite proxies /api.
const API_BASE = import.meta.env.VITE_API_BASE ?? "";

/**
 * Stream a debate as Server-Sent Events. POST (to carry topic + config), so we
 * read the fetch body stream and parse `data:` frames ourselves.
 */
export async function streamDebate(
  topic: string,
  config: ClientConfig,
  onEvent: (e: DebateEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(`${API_BASE}/api/debate/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ topic, config }),
    signal,
  });
  if (!res.body) throw new Error("No stream body");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const frames = buffer.split("\n\n");
    buffer = frames.pop() ?? "";
    for (const frame of frames) {
      const line = frame.split("\n").find((l) => l.startsWith("data:"));
      if (!line) continue;
      try {
        onEvent(JSON.parse(line.slice(5).trim()) as DebateEvent);
      } catch {
        /* ignore malformed frame */
      }
    }
  }
}

/** True if the backend API is reachable and healthy. Used to drive the
 *  "server offline" banner — never throws. */
export async function checkHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/api/health`);
    if (!res.ok) return false;
    const data = (await res.json()) as { ok?: boolean };
    return Boolean(data.ok);
  } catch {
    return false;
  }
}

export async function fetchLeaderboard(): Promise<LeaderboardRow[]> {
  try {
    const res = await fetch(`${API_BASE}/api/leaderboard`);
    return res.ok ? ((await res.json()) as LeaderboardRow[]) : [];
  } catch {
    return [];
  }
}

export async function clearLeaderboard(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/api/leaderboard`, { method: "DELETE" });
    return res.ok;
  } catch {
    return false;
  }
}

export async function fetchModels(): Promise<ModelsInfo> {
  const res = await fetch(`${API_BASE}/api/models`);
  return (await res.json()) as ModelsInfo;
}

export async function fetchLocalModels(baseUrl?: string): Promise<string[]> {
  try {
    const res = await fetch(`${API_BASE}/api/local-models`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ baseUrl }),
    });
    const data = (await res.json()) as { models?: string[] };
    return data.models ?? [];
  } catch {
    return [];
  }
}

export async function testProvider(
  providerId: string,
  keys: ClientConfig["keys"],
  localBaseUrl?: string,
): Promise<{ ok: boolean; error?: string; sample?: string }> {
  try {
    const res = await fetch(`${API_BASE}/api/test-provider`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ providerId, keys, localBaseUrl }),
    });
    return (await res.json()) as { ok: boolean; error?: string; sample?: string };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}
