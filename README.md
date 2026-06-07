# 🤖 Clashbots

**Where AIs argue and robots judge.**

Two language models take opposing sides of a spicy topic and debate across three
rounds. A panel of four AI judges — each with its own personality and scoring
criterion — deliberates and crowns a winner. It's a comedy show that doubles as a
live, *explainable* model-evaluation benchmark.

> Inspired in spirit by Stanford's [Generative Agents](https://arxiv.org/abs/2304.03442)
> (the "Smallville" pixel sandbox) and [Chatbot Arena](https://lmarena.ai).

## Why it's interesting (and not just a wrapper)

- **Multi-agent orchestration** — a turn-based debate state machine coordinating
  several independent models.
- **Structured, explainable judging** — judges return scored JSON with a verdict,
  so *why* a model won is visible, not just an Elo delta.
- **Pluggable providers + free mock mode** — runs with **zero API keys / zero cost**
  for dev and demos; drop in Claude / GPT / Llama via env vars.
- **Repository pattern over SQLite** — persistence is swappable; a semantic
  (ChromaDB) layer can be added later without a rewrite.

## Quick start (free, no API keys)

```bash
cd server
npm install
npm run debate                      # random topic, full match in your terminal
npm run debate "Is cereal a soup?"  # pick your own
```

Run the API instead:

```bash
npm run dev          # http://localhost:8787
# POST /api/debate            -> run a match, get JSON result
# POST /api/debate/stream     -> watch it live via Server-Sent Events
# GET  /api/leaderboard       -> running win/points table
# GET  /api/matches           -> match archive
```

## Using real models

Two ways to supply keys:

1. **From the UI** — click **⚙️ Settings**, choose a model for each role (FOR / AGAINST /
   Judge panel), paste your API key, and hit **Test** to verify the connection live.
   Keys are stored only in your browser (localStorage) and sent to your local backend
   per match — never persisted or logged server-side.
2. **From the server** — copy `.env.example` to `.env` and set any of
   `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `OPENROUTER_API_KEY`. The UI shows a
   "server key set" badge and you can leave the field blank.

Any slot left on **Mock** runs free. Selecting a real model without a key surfaces a
clear error instead of silently falling back.

## How the debate flows

Debaters speak **one statement at a time**, strictly alternating (Blue → Green → Blue
→ …) across three rounds (opening · rebuttal · closing). Every turn receives the
**entire prior conversation** — both its own and the opponent's lines, labelled by
name — and is instructed to **address the opponent's most recent point by name**
before advancing its own. The live SSE stream paces turns ~900 ms apart so the
exchange unfolds like a real back-and-forth. (The free mock bots quote each other to
make this visible without any API key; real models produce fresh, varied rebuttals.)

## How judging works

Judging is **comparative**, not isolated: each judge sees *both* debaters' full
transcripts and scores them head-to-head on a single criterion using anchored rubric
bands (1-3 weak · 4-6 competent · 7-8 strong · 9-10 exceptional), returning strict
JSON with a per-side score, a justification, and a winner. The engine aggregates
totals, records which side won each criterion, and synthesizes a plain-English
verdict (e.g. *"Captain Green wins 30–20, taking Logic & Rhetoric; Professor Blue took
Accuracy"*). This makes results far less noisy and fully **explainable**.

## Architecture

```
server/
├─ src/types.ts       shared domain contract
├─ src/providers.ts   pluggable LLM adapters (mock | anthropic | openai | openrouter)
├─ src/roster.ts      default debaters, judge panel, topic wheel
├─ src/engine.ts      debate state machine; emits events (CLI/REST/SSE agnostic)
├─ src/db.ts          MatchRepository + SQLite implementation
├─ src/server.ts      REST + SSE API
└─ src/cli.ts         terminal demo of the full match
```

## Roadmap

- [x] **web/** — pixel-art arena: speech bubbles, animated judge scorecards, verdict.
- [x] Settings: in-UI model selection + API keys with live connection testing.
- [x] Comparative, rubric-anchored, explainable judging.
- [ ] PixiJS isometric sprites with walk/talk/celebrate animations.
- [ ] Elo ratings + shareable match-result cards (the viral loop).
- [ ] Audience-submitted topics and live voting.
- [ ] Optional ChromaDB layer: "find past debates like this one."

## License

MIT.
