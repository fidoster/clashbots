// Free, no-key text-to-speech via the browser's Web Speech API. Gracefully
// no-ops where speech isn't available (e.g. headless browsers).

export function listVoices(): SpeechSynthesisVoice[] {
  try {
    return window.speechSynthesis?.getVoices() ?? [];
  } catch {
    return [];
  }
}

// Heuristic gender detection from the OS voice NAME (the API doesn't expose gender).
// Covers the common Windows (Zira/David…) and Chrome (Google … Female/Male) voices.
const FEMALE_HINTS =
  /\b(female|zira|susan|hazel|eva|samantha|victoria|karen|moira|tessa|fiona|veena|catherine|heera|linda|aria|jenny|sonia|michelle|emma|joanna|salli|kendra|ivy|amy|hoda|elsa|paulina|helena|google uk english female)\b/i;
const MALE_HINTS =
  /\b(male|david|mark|george|james|ravi|daniel|alex|fred|oliver|thomas|guy|davis|tony|brandon|christopher|eric|rishi|william|richard|paul|stefan|google uk english male)\b/i;

export function voiceGender(name: string): "male" | "female" | "unknown" {
  if (FEMALE_HINTS.test(name)) return "female";
  if (MALE_HINTS.test(name)) return "male";
  return "unknown";
}

/** Pick an English voice name matching a desired gender; falls back to the first
 *  English voice (or first of any) when no gendered match is available. */
export function pickVoiceByGender(gender: "male" | "female" | "neutral"): string | undefined {
  const voices = listVoices();
  const en = voices.filter((v) => v.lang.toLowerCase().startsWith("en"));
  const pool = en.length ? en : voices;
  if (gender !== "neutral") {
    const match = pool.find((v) => voiceGender(v.name) === gender);
    if (match) return match.name;
  }
  return pool[0]?.name;
}

/** Voices load async in some browsers — subscribe to changes. Returns unsubscribe. */
export function onVoicesChanged(cb: () => void): () => void {
  const synth = window.speechSynthesis;
  if (!synth) return () => {};
  synth.addEventListener("voiceschanged", cb);
  return () => synth.removeEventListener("voiceschanged", cb);
}

/** Strip emojis, markdown and stray symbols so the speech sounds clean. */
function cleanForSpeech(text: string): string {
  return text
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, "") // emoji
    .replace(/[*_`#>]/g, "")
    .replace(/[''""]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/** Speak text and resolve when finished (or on a safety timeout). */
export function speak(text: string, voiceName?: string, rate = 1, pitch = 1): Promise<void> {
  return new Promise((resolve) => {
    const synth = window.speechSynthesis;
    const clean = cleanForSpeech(text);
    if (!synth || !clean) return resolve();

    const u = new SpeechSynthesisUtterance(clean);
    const v = voiceName ? listVoices().find((x) => x.name === voiceName) : undefined;
    if (v) {
      u.voice = v;
      u.lang = v.lang;
    }
    u.rate = rate;
    u.pitch = pitch;

    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve();
    };
    // Safety net: some browsers never fire onend (esp. if backgrounded).
    const timer = setTimeout(finish, 2500 + clean.length * 90);
    u.onend = finish;
    u.onerror = finish;

    try {
      synth.speak(u);
    } catch {
      finish();
    }
  });
}

export function cancelSpeech(): void {
  try {
    window.speechSynthesis?.cancel();
  } catch {
    /* ignore */
  }
}

export function speechSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}
