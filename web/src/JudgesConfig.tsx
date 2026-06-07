import { useState } from "react";
import { testProvider } from "./api.js";
import { ModelPicker } from "./ModelPicker.js";
import { DEFAULT_JUDGES, newJudge, type JudgeConfig } from "./defaultJudges.js";
import type { ClientConfig, ModelsInfo, ProviderKind } from "./types.js";

const PROVIDER_LABEL: Record<ProviderKind, string> = {
  anthropic: "Anthropic (Claude)",
  openai: "OpenAI (GPT)",
  deepseek: "DeepSeek",
  nvidia: "NVIDIA NIM",
  openrouter: "OpenRouter",
};

/** Manage the judge panel: per-judge model + name/criterion/system-prompt,
 *  add/remove judges, restore defaults. Keys for the providers in use appear below. */
export function JudgesConfig(props: {
  config: ClientConfig;
  info: ModelsInfo | null;
  onChange: (c: ClientConfig) => void;
  onClose: () => void;
}) {
  const { config, info, onChange, onClose } = props;
  const [test, setTest] = useState<Record<string, "idle" | "testing" | "ok" | "fail">>({});
  const [testMsg, setTestMsg] = useState<Record<string, string>>({});

  const models = info?.models ?? [{ id: "mock", label: "🤖 Mock (free, no key)" }];
  const serverKeys = info?.serverKeys ?? { anthropic: false, openai: false, openrouter: false, deepseek: false, nvidia: false };
  const judges = config.judges ?? DEFAULT_JUDGES;

  const needsOf = (modelId: string) => models.find((m) => m.id === modelId)?.needs as ProviderKind | undefined;
  // Distinct providers the current judge panel requires keys for.
  const neededProviders = Array.from(
    new Set(judges.map((j) => needsOf(j.model || "mock")).filter(Boolean) as ProviderKind[]),
  );

  const setJudges = (next: JudgeConfig[]) => onChange({ ...config, judges: next });
  const edit = (i: number, patch: Partial<JudgeConfig>) =>
    setJudges(judges.map((j, idx) => (idx === i ? { ...j, ...patch } : j)));
  const remove = (i: number) => setJudges(judges.filter((_, idx) => idx !== i));
  const setKey = (kind: ProviderKind, v: string) => onChange({ ...config, keys: { ...config.keys, [kind]: v } });

  async function runTest(kind: ProviderKind) {
    const rep = judges.find((j) => needsOf(j.model || "mock") === kind)?.model;
    if (!rep) return;
    setTest((t) => ({ ...t, [kind]: "testing" }));
    const r = await testProvider(rep, config.keys, config.local?.baseUrl);
    setTest((t) => ({ ...t, [kind]: r.ok ? "ok" : "fail" }));
    setTestMsg((m) => ({ ...m, [kind]: r.ok ? "Connected ✓" : r.error ?? "Failed" }));
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>⚖️ Judge Panel ({judges.length})</h2>
          <button className="btn ghost small" onClick={onClose}>
            ✕ Close
          </button>
        </div>

        <section className="setting-block">
          <div className="judges-head">
            <h3>Judges</h3>
            <div className="judges-head-actions">
              <button className="btn ghost small" onClick={() => setJudges([...judges, newJudge()])}>
                ➕ Add judge
              </button>
              <button className="btn ghost small" onClick={() => setJudges(DEFAULT_JUDGES)}>
                ↺ Reset to default (4)
              </button>
            </div>
          </div>
          <p className="muted small">
            Each judge scores both debaters 1–10 on its criterion and can run on its own model. The
            rubric is its system prompt.
          </p>

          {judges.map((j, i) => (
            <div className="judge-edit" key={j.id}>
              <div className="judge-edit-top">
                <input
                  className="emoji-input"
                  value={j.emoji}
                  maxLength={2}
                  onChange={(e) => edit(i, { emoji: e.target.value })}
                  title="Icon"
                />
                <input
                  className="je-name"
                  value={j.name}
                  onChange={(e) => edit(i, { name: e.target.value })}
                  placeholder="Judge name"
                />
                <button
                  className="btn ghost small danger"
                  onClick={() => remove(i)}
                  disabled={judges.length <= 1}
                  title={judges.length <= 1 ? "At least one judge required" : "Remove judge"}
                >
                  🗑
                </button>
              </div>
              <div className="judge-edit-mid">
                <div className="je-model">
                  <ModelPicker
                    value={j.model || "mock"}
                    onChange={(v) => edit(i, { model: v })}
                    models={models}
                    localBaseUrl={config.local?.baseUrl}
                  />
                </div>
                <input
                  className="je-crit"
                  value={j.criterion}
                  onChange={(e) => edit(i, { criterion: e.target.value })}
                  placeholder="Criterion (shown on scorecard)"
                />
              </div>
              <textarea
                className="prompt-area"
                rows={2}
                value={j.rubric}
                onChange={(e) => edit(i, { rubric: e.target.value })}
                placeholder="Scoring rubric / system prompt for this judge…"
              />
            </div>
          ))}
        </section>

        {neededProviders.length > 0 && (
          <section className="setting-block">
            <h3>API keys for judge models</h3>
            <p className="muted small">Stored in this browser, sent per match. Needed by the models above.</p>
            {neededProviders.map((kind) => (
              <div className="key-row" key={kind}>
                <label>
                  {PROVIDER_LABEL[kind]}
                  {serverKeys[kind] && <span className="badge ok">server key set</span>}
                </label>
                <div className="key-input">
                  <input
                    type="password"
                    placeholder={serverKeys[kind] ? "Using server key (override optional)" : "sk-…"}
                    value={config.keys?.[kind] ?? ""}
                    onChange={(e) => setKey(kind, e.target.value)}
                  />
                  <button className="btn ghost small" onClick={() => runTest(kind)} disabled={test[kind] === "testing"}>
                    {test[kind] === "testing" ? "…" : "Test"}
                  </button>
                </div>
                {test[kind] && test[kind] !== "testing" && (
                  <span className={`test-msg ${test[kind]}`}>{testMsg[kind]}</span>
                )}
              </div>
            ))}
          </section>
        )}
      </div>
    </div>
  );
}
