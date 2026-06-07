import { useEffect, useId, useState } from "react";
import { fetchLocalModels } from "./api.js";
import type { ModelOption } from "./types.js";

const localCache = new Map<string, string[]>();

/** A model <select>. When "Local (LM Studio)" is picked, the model name is
 *  OPTIONAL — leave it blank to auto-use whatever is loaded on the server. We also
 *  offer the server's loaded models as autocomplete suggestions. The stored value
 *  is a providerId string, e.g. "openai:gpt-4o" or "local:" / "local:my-model". */
export function ModelPicker(props: {
  value: string;
  onChange: (providerId: string) => void;
  models: ModelOption[];
  localBaseUrl?: string;
}) {
  const { value, onChange, models, localBaseUrl } = props;
  const listId = useId();
  const isLocal = value === "local" || value.startsWith("local:");
  const selectValue = isLocal ? "local" : value;
  const localModel = isLocal ? value.replace(/^local:?/, "") : "";

  const [available, setAvailable] = useState<string[]>([]);
  useEffect(() => {
    if (!isLocal) return;
    const key = localBaseUrl || "";
    const cached = localCache.get(key);
    if (cached) {
      setAvailable(cached);
      return;
    }
    fetchLocalModels(localBaseUrl).then((m) => {
      localCache.set(key, m);
      setAvailable(m);
    });
  }, [isLocal, localBaseUrl]);

  return (
    <div className="model-picker">
      <select value={selectValue} onChange={(e) => onChange(e.target.value === "local" ? `local:${localModel}` : e.target.value)}>
        {models.map((m) => (
          <option key={m.id} value={m.id}>
            {m.label}
          </option>
        ))}
      </select>
      {isLocal && (
        <>
          <input
            className="local-model-input"
            list={listId}
            value={localModel}
            onChange={(e) => onChange(`local:${e.target.value}`)}
            placeholder={available[0] ? `Auto: ${available[0]}` : "Blank = auto-detect loaded model"}
          />
          {available.length > 0 && (
            <datalist id={listId}>
              {available.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
          )}
          <span className="local-hint">
            {available.length > 0
              ? `${available.length} model(s) loaded — blank uses the first automatically.`
              : "Optional — blank uses whatever model your server has loaded."}
          </span>
        </>
      )}
    </div>
  );
}
