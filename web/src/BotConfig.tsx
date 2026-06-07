import { useState } from "react";
import { testProvider } from "./api.js";
import { ModelPicker } from "./ModelPicker.js";
import { PERSONAS, personaVoice } from "./personas.js";
import { cancelSpeech, pickVoiceByGender, speak, speechSupported } from "./speech.js";
import type { ClientConfig, ModelsInfo, ProviderKind } from "./types.js";

const PROVIDER_LABEL: Record<ProviderKind, string> = {
  anthropic: "Anthropic (Claude)",
  openai: "OpenAI (GPT)",
  deepseek: "DeepSeek",
  nvidia: "NVIDIA NIM",
  openrouter: "OpenRouter",
};

const CATEGORIES = [
  { id: "all", label: "All" },
  { id: "default", label: "Styles" },
  { id: "historical", label: "History" },
  { id: "fictional", label: "Fictional" },
  { id: "tech", label: "Tech/Pop" },
  { id: "archetypes", label: "Archetypes" },
  { id: "scifi", label: "Sci-Fi" },
];

/** Per-character config: model, the API key its provider needs, and an editable
 *  system prompt (pre-filled with the shared default). */
export function BotConfig(props: {
  side: "for" | "against";
  name: string;
  config: ClientConfig;
  info: ModelsInfo | null;
  onChange: (c: ClientConfig) => void;
  onClose: () => void;
}) {
  const { side, name, config, info, onChange, onClose } = props;
  const [test, setTest] = useState<"idle" | "testing" | "ok" | "fail">("idle");
  const [testMsg, setTestMsg] = useState("");
  const [activeTab, setActiveTab] = useState<string>("default");

  const mode = info?.mode;
  const restricted = !!mode?.publicDemo && !mode.allowBYOK; // public demo, no BYOK → lock things down
  const allModels = info?.models ?? [{ id: "mock", label: "🤖 Mock (free, no key)" }];
  const models = restricted ? allModels.filter((m) => m.id === "mock" || m.id === mode!.demoModel) : allModels;
  const serverKeys = info?.serverKeys ?? { anthropic: false, openai: false, openrouter: false, deepseek: false, nvidia: false };
  const defaultPrompt = info?.defaultDebaterPrompt ?? "";

  const modelId = config.models?.[side] ?? "mock";
  const modelOpt = models.find((m) => m.id === modelId);
  const needs = modelOpt?.needs as ProviderKind | undefined;
  const isLocal = modelId === "local" || modelId.startsWith("local:");

  const custom = config.prompts?.[side];
  const promptValue = custom ?? defaultPrompt;
  const isCustom = custom != null && custom.trim() !== "" && custom !== defaultPrompt;

  const sideColor = side === "for" ? "blue" : "green";

  const setModel = (id: string) => onChange({ ...config, models: { ...config.models, [side]: id } });
  const setKey = (kind: ProviderKind, v: string) =>
    onChange({ ...config, keys: { ...config.keys, [kind]: v } });
  const setPrompt = (v: string | undefined) =>
    onChange({ ...config, prompts: { ...config.prompts, [side]: v } });

  const currentPersona = config.personas?.[side];
  const setPersona = (text: string | undefined) =>
    onChange({ ...config, personas: { ...config.personas, [side]: text } });
  const activePersona = PERSONAS.find((p) => p.persona === currentPersona) ?? PERSONAS[0];

  // Voice preview for the selected persona (mirrors the engine's voice resolution).
  const activeVoice = personaVoice(activePersona.id);
  const voiceDesc = (() => {
    if (!activeVoice) return "auto voice";
    const pitch = activeVoice.pitch ?? 1;
    const rate = activeVoice.rate ?? 1;
    const tone = pitch <= 0.8 ? "deep " : pitch >= 1.2 ? "high " : "";
    const pace = rate <= 0.9 ? ", slow" : rate >= 1.15 ? ", fast" : "";
    return `${tone}${activeVoice.gender}${pace}`;
  })();
  const testVoice = () => {
    cancelSpeech();
    const baseRate = config.voice?.rate ?? 1;
    const manual = config.voice?.[side];
    const name = activeVoice ? manual || pickVoiceByGender(activeVoice.gender) : manual;
    const rate = activeVoice ? Math.max(0.6, Math.min(1.5, baseRate * (activeVoice.rate ?? 1))) : baseRate;
    const pitch = activeVoice?.pitch ?? 1;
    const line =
      activePersona.id === "default"
        ? "This is the default debater voice. Let the debate begin."
        : `I am ${activePersona.label}. Prepare to lose this debate.`;
    speak(line, name, rate, pitch);
  };

  async function runTest() {
    setTest("testing");
    const r = await testProvider(modelId, config.keys, config.local?.baseUrl);
    setTest(r.ok ? "ok" : "fail");
    setTestMsg(r.ok ? "Connected ✓" : r.error ?? "Failed");
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2 className={sideColor}>
            {side === "for" ? "🔵" : "🟢"} {name} — {side.toUpperCase()} fighter
          </h2>
          <button className="btn ghost small" onClick={onClose}>
            ✕ Close
          </button>
        </div>

        <section className="setting-block">
          <h3>Model</h3>
          <div className="model-row">
            <span>Powered by</span>
            <ModelPicker value={modelId} onChange={setModel} models={models} localBaseUrl={config.local?.baseUrl} />
          </div>
          {restricted ? (
            <p className="muted small">
              Powered by the host's key on the public demo. Run it locally to use your own models &amp; keys.
            </p>
          ) : needs ? (
            <div className="key-row">
              <label>
                {PROVIDER_LABEL[needs]} API key
                {serverKeys[needs] && <span className="badge ok">server key set</span>}
              </label>
              <div className="key-input">
                <input
                  type="password"
                  placeholder={serverKeys[needs] ? "Using server key (override optional)" : "sk-…"}
                  value={config.keys?.[needs] ?? ""}
                  onChange={(e) => setKey(needs, e.target.value)}
                />
                <button className="btn ghost small" onClick={runTest} disabled={test === "testing"}>
                  {test === "testing" ? "…" : "Test"}
                </button>
              </div>
              {test !== "idle" && test !== "testing" && (
                <span className={`test-msg ${test}`}>{testMsg}</span>
              )}
            </div>
          ) : isLocal ? (
            <p className="muted small">
              Runs on your local server (URL in ⚙️ Settings). No API key, and the model name is
              optional — blank auto-uses whatever is loaded.
            </p>
          ) : (
            <p className="muted small">Mock needs no API key — free for demos.</p>
          )}
        </section>

        <section className="setting-block">
          <h3>Persona</h3>
          <p className="muted small">
            Picks this bot's debating style — fills the <code>{"{persona}"}</code> slot in the prompt.
          </p>
          <div className="tabs" style={{ marginBottom: "12px", borderBottom: "1px solid var(--line)" }}>
            {CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                type="button"
                className={`tab ${activeTab === cat.id ? "active" : ""}`}
                onClick={() => setActiveTab(cat.id)}
              >
                {cat.label}
              </button>
            ))}
          </div>
          <div className="persona-grid">
            {PERSONAS.filter(p => activeTab === "all" || p.category === activeTab).map((p) => {
              const active = p.persona === currentPersona;
              return (
                <button
                  key={p.id}
                  type="button"
                  className={`persona-chip ${sideColor} ${active ? "active" : ""}`}
                  title={p.blurb}
                  onClick={() => setPersona(p.persona)}
                >
                  <span className="persona-emoji">{p.emoji}</span>
                  <span className="persona-label">{p.label}</span>
                </button>
              );
            })}
          </div>
          <p className="muted small persona-blurb" style={{ minHeight: "36px", marginTop: "8px" }}>
            <b>{activePersona.label}</b>: {activePersona.blurb}
          </p>
          {speechSupported() && (
            <div className="persona-voice-row">
              <span className="muted small">🔊 Voice: {voiceDesc}</span>
              <button type="button" className="btn ghost small" onClick={testVoice}>
                ▶ Test voice
              </button>
            </div>
          )}
        </section>

        <section className="setting-block">
          <h3>
            System prompt{" "}
            <span className={`prompt-tag ${isCustom ? "custom" : "default"}`}>
              {isCustom ? "custom" : "default"}
            </span>
          </h3>
          <p className="muted small">
            Controls this bot's personality &amp; behaviour. Placeholders:{" "}
            <code>{"{name}"}</code> <code>{"{opponent}"}</code> <code>{"{persona}"}</code>{" "}
            <code>{"{side}"}</code>.
          </p>
          <textarea
            className="prompt-area"
            rows={6}
            value={promptValue}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={defaultPrompt}
          />
          <div className="prompt-actions">
            <button className="btn ghost small" onClick={() => setPrompt(undefined)} disabled={!isCustom}>
              ↺ Reset to default
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
