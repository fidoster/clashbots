import { useEffect, useState } from "react";
import { testProvider } from "./api.js";
import { ModelPicker } from "./ModelPicker.js";
import { listVoices, onVoicesChanged, speak, speechSupported } from "./speech.js";
import { playCoin, setSoundEnabled, setSoundVolume } from "./sound.js";
import type { ClientConfig, ModelOption, ModelsInfo, ProviderKind } from "./types.js";

const VOICE_ROLES: { key: "for" | "against" | "judge"; label: string }[] = [
  { key: "for", label: "🔵 FOR side" },
  { key: "against", label: "🟢 AGAINST side" },
  { key: "judge", label: "⚖️ Judges / narrator" },
];

const PROVIDERS: { kind: ProviderKind; label: string; hint: string }[] = [
  { kind: "anthropic", label: "Anthropic (Claude)", hint: "console.anthropic.com" },
  { kind: "openai", label: "OpenAI (GPT)", hint: "platform.openai.com" },
  { kind: "deepseek", label: "DeepSeek", hint: "platform.deepseek.com" },
  { kind: "nvidia", label: "NVIDIA NIM (free)", hint: "build.nvidia.com" },
  { kind: "openrouter", label: "OpenRouter (+ free models)", hint: "openrouter.ai" },
];

type TestState = Record<string, "idle" | "testing" | "ok" | "fail">;

export function Settings(props: {
  config: ClientConfig;
  info: ModelsInfo | null;
  onChange: (c: ClientConfig) => void;
  onClose: () => void;
}) {
  const { config, info, onChange, onClose } = props;
  const mode = info?.mode;
  const restricted = !!mode?.publicDemo && !mode.allowBYOK; // public demo, no BYOK → hide keys/local
  const [test, setTest] = useState<TestState>({});
  const [testMsg, setTestMsg] = useState<Record<string, string>>({});
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [tab, setTab] = useState<"models" | "keys" | "local" | "audio">("models");

  const ALL_TABS: { key: typeof tab; label: string }[] = [
    { key: "models", label: "🎭 Models" },
    { key: "keys", label: "🔑 API Keys" },
    { key: "local", label: "🖥️ Local" },
    { key: "audio", label: "🔊 Audio" },
  ];
  // On a locked-down public demo there are no keys or local servers to configure.
  const TABS = restricted ? ALL_TABS.filter((t) => t.key === "models" || t.key === "audio") : ALL_TABS;

  useEffect(() => {
    const load = () => setVoices(listVoices());
    load();
    return onVoicesChanged(load);
  }, []);

  const setVoice = (patch: Partial<NonNullable<ClientConfig["voice"]>>) =>
    onChange({ ...config, voice: { ...config.voice, ...patch } });

  const allModels = info?.models ?? [{ id: "mock", label: "🤖 Mock (free, no key)" }];
  const models = restricted ? allModels.filter((m) => m.id === "mock" || m.id === mode!.demoModel) : allModels;
  const serverKeys = info?.serverKeys ?? { anthropic: false, openai: false, openrouter: false, deepseek: false, nvidia: false };

  const setModel = (slot: "for" | "against" | "judge", id: string) =>
    onChange({ ...config, models: { ...config.models, [slot]: id } });
  const setKey = (kind: ProviderKind, value: string) =>
    onChange({ ...config, keys: { ...config.keys, [kind]: value } });

  async function runTest(kind: ProviderKind) {
    const model = models.find((m) => m.needs === kind);
    if (!model) return;
    setTest((t) => ({ ...t, [kind]: "testing" }));
    const r = await testProvider(model.id, config.keys);
    setTest((t) => ({ ...t, [kind]: r.ok ? "ok" : "fail" }));
    setTestMsg((m) => ({ ...m, [kind]: r.ok ? "Connected ✓" : r.error ?? "Failed" }));
  }

  async function runLocalTest() {
    setTest((t) => ({ ...t, local: "testing" }));
    const r = await testProvider("local:", config.keys, config.local?.baseUrl);
    setTest((t) => ({ ...t, local: r.ok ? "ok" : "fail" }));
    setTestMsg((m) => ({ ...m, local: r.ok ? "Local server reachable ✓" : r.error ?? "Unreachable" }));
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>⚙️ Settings</h2>
          <button className="btn ghost small" onClick={onClose}>
            ✕ Close
          </button>
        </div>

        <div className="tabs">
          {TABS.map((t) => (
            <button key={t.key} className={`tab ${tab === t.key ? "active" : ""}`} onClick={() => setTab(t.key)}>
              {t.label}
            </button>
          ))}
        </div>

        {tab === "models" && (
        <section className="setting-block">
          <h3>Fighters & Panel</h3>
          <p className="muted small">Pick the model behind each role. Mock is free and needs no key.</p>
          <ModelRow label="🔵 FOR side" value={config.models?.for ?? "mock"} models={models} localBaseUrl={config.local?.baseUrl} onChange={(v) => setModel("for", v)} />
          <ModelRow label="🟢 AGAINST side" value={config.models?.against ?? "mock"} models={models} localBaseUrl={config.local?.baseUrl} onChange={(v) => setModel("against", v)} />
          <ModelRow label="⚖️ Judge panel" value={config.models?.judge ?? "mock"} models={models} localBaseUrl={config.local?.baseUrl} onChange={(v) => setModel("judge", v)} />
          <p className="muted small">
            Tip: keep everything on <b>Mock</b> for a free demo, or use your free <b>Local</b> server.
          </p>
        </section>
        )}

        {tab === "keys" && (
        <section className="setting-block">
          <h3>API Keys</h3>
          <p className="muted small">
            Stored only in this browser (localStorage) and sent to your local backend per match — never
            saved on the server.
          </p>
          {PROVIDERS.map((p) => (
            <div className="key-row" key={p.kind}>
              <label>
                {p.label}
                {serverKeys[p.kind] && <span className="badge ok">server key set</span>}
              </label>
              <div className="key-input">
                <input
                  type="password"
                  placeholder={serverKeys[p.kind] ? "Using server key (override optional)" : `sk-… from ${p.hint}`}
                  value={config.keys?.[p.kind] ?? ""}
                  onChange={(e) => setKey(p.kind, e.target.value)}
                />
                <button className="btn ghost small" onClick={() => runTest(p.kind)} disabled={test[p.kind] === "testing"}>
                  {test[p.kind] === "testing" ? "…" : "Test"}
                </button>
              </div>
              {test[p.kind] && test[p.kind] !== "testing" && (
                <span className={`test-msg ${test[p.kind]}`}>{testMsg[p.kind]}</span>
              )}
            </div>
          ))}
        </section>
        )}

        {tab === "local" && (
        <section className="setting-block">
          <h3>Local LLM (LM Studio / Ollama)</h3>
          <p className="muted small">
            Pick <b>🖥️ Local</b> as any model and type the loaded model's name. Set your local
            server's OpenAI-compatible URL here (LM Studio: <code>http://localhost:1234/v1</code>,
            Ollama: <code>http://localhost:11434/v1</code>).
          </p>
          <div className="key-row">
            <label>Server URL</label>
            <div className="key-input">
              <input
                type="text"
                placeholder="http://localhost:1234/v1"
                value={config.local?.baseUrl ?? ""}
                onChange={(e) => onChange({ ...config, local: { ...config.local, baseUrl: e.target.value } })}
              />
              <button className="btn ghost small" onClick={runLocalTest} disabled={test.local === "testing"}>
                {test.local === "testing" ? "…" : "Test"}
              </button>
            </div>
            {test.local && test.local !== "testing" && <span className={`test-msg ${test.local}`}>{testMsg.local}</span>}
          </div>
        </section>
        )}

        {tab === "audio" && (
          <>
            <section className="setting-block">
              <h3>🎮 Retro Sound Effects</h3>
              <label className="voice-enable">
                <input
                  type="checkbox"
                  checked={config.sound?.enabled !== false}
                  onChange={(e) => {
                    const enabled = e.target.checked;
                    onChange({ ...config, sound: { ...config.sound, enabled } });
                    setSoundEnabled(enabled);
                    if (enabled) playCoin();
                  }}
                />
                Enable 8-bit game sound effects
              </label>
              <div className="voice-setting-row">
                <span className="voice-label">Effects Volume</span>
                <input
                  className="voice-speed"
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={config.sound?.volume ?? 0.5}
                  onChange={(e) => {
                    const volume = Number(e.target.value);
                    onChange({ ...config, sound: { ...config.sound, volume } });
                    setSoundVolume(volume);
                  }}
                />
                <button
                  className="btn ghost small"
                  onClick={() => {
                    setSoundVolume(config.sound?.volume ?? 0.5);
                    playCoin();
                  }}
                  disabled={config.sound?.enabled === false}
                >
                  ▶ Test
                </button>
              </div>
            </section>

            <section className="setting-block">
              <h3>🗣️ Voices (free, in-browser)</h3>
              {!speechSupported() ? (
                <p className="muted small">This browser doesn't support speech synthesis.</p>
              ) : (
                <>
                  <label className="voice-enable">
                    <input
                      type="checkbox"
                      checked={Boolean(config.voice?.enabled)}
                      onChange={(e) => setVoice({ enabled: e.target.checked })}
                    />
                    Read debates aloud (each side gets its own voice)
                  </label>
                  <p className="muted small">
                    Uses your OS voices — free, no key. For higher-quality neural voices, install them in
                    Windows Settings → Time &amp; Language → Speech, or use Microsoft Edge.
                  </p>
                  {VOICE_ROLES.map((r) => (
                    <div className="voice-setting-row" key={r.key}>
                      <span className="voice-label">{r.label}</span>
                      <div className="voice-row">
                        <select value={config.voice?.[r.key] ?? ""} onChange={(e) => setVoice({ [r.key]: e.target.value })}>
                          <option value="">Auto</option>
                          {voices.map((v) => (
                            <option key={v.name} value={v.name}>
                              {v.name} ({v.lang})
                            </option>
                          ))}
                        </select>
                        <button
                          className="btn ghost small"
                          onClick={() => speak("This is how I will sound in the debate.", config.voice?.[r.key] || undefined, config.voice?.rate ?? 1)}
                        >
                          ▶ Test
                        </button>
                      </div>
                    </div>
                  ))}
                  <div className="voice-setting-row">
                    <span className="voice-label">Voice Speed</span>
                    <input
                      className="voice-speed"
                      type="range"
                      min={0.7}
                      max={1.3}
                      step={0.05}
                      value={config.voice?.rate ?? 1}
                      onChange={(e) => setVoice({ rate: Number(e.target.value) })}
                    />
                  </div>
                </>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}

function ModelRow(props: {
  label: string;
  value: string;
  models: ModelOption[];
  localBaseUrl?: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="model-row">
      <span>{props.label}</span>
      <ModelPicker value={props.value} onChange={props.onChange} models={props.models} localBaseUrl={props.localBaseUrl} />
    </div>
  );
}
