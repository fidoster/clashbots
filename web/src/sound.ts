let audioCtx: AudioContext | null = null;
let masterVolume = 0.5;
let soundsEnabled = true;

function getAudioContext(): AudioContext {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  if (audioCtx.state === "suspended") {
    void audioCtx.resume();
  }
  return audioCtx;
}

export function setSoundEnabled(enabled: boolean): void {
  soundsEnabled = enabled;
}

export function setSoundVolume(volume: number): void {
  masterVolume = Math.max(0, Math.min(1, volume));
}

function playTone(
  freq: number,
  type: OscillatorType,
  duration: number,
  volume = 0.1,
  freqEnd?: number
): void {
  if (!soundsEnabled) return;
  try {
    const ctx = getAudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    if (freqEnd !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(freqEnd, ctx.currentTime + duration);
    }

    const vol = volume * masterVolume;
    gain.gain.setValueAtTime(vol, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + duration);
  } catch (e) {
    console.warn("Failed to play retro sound tone:", e);
  }
}

/** Play a retro coin / game start sound */
export function playCoin(): void {
  // Retro coin sound: 2 quick tones (B5 -> E6)
  playTone(987.77, "square", 0.08, 0.08);
  setTimeout(() => {
    playTone(1318.51, "square", 0.25, 0.08);
  }, 80);
}

/** Play a dramatic game start rumble / whoosh */
export function playFightStart(): void {
  playCoin();
  // Followed by a retro fight alarm / buzzer
  setTimeout(() => {
    playTone(300, "sawtooth", 0.4, 0.1, 100);
    setTimeout(() => {
      playTone(300, "sawtooth", 0.4, 0.1, 100);
    }, 120);
  }, 350);
}

/** Play a tiny, clean retro keyboard/scroll tick */
export function playTick(): void {
  // Randomize pitch slightly for a more dynamic and satisfying feel
  const pitch = 1100 + Math.random() * 400;
  // Very short decay, sine wave for clean tick, low volume so it's not annoying
  playTone(pitch, "sine", 0.03, 0.06);
}

/** Play a fast retro laser whoosh for turn transitions or actions */
export function playLaser(): void {
  // Classic downward sweep laser sound
  playTone(1600, "triangle", 0.18, 0.08, 200);
}

/** Play a gavel-like thud or score chime */
export function playScore(): void {
  // Score chime: high pleasant sine wave chime
  playTone(880, "sine", 0.15, 0.08, 440);
}

/** Play an 8-bit winner victory fanfare */
export function playFanfare(): void {
  const tempo = 120; // ms per note
  // C major arpeggio/chime: C5 -> E5 -> G5 -> C6 (long)
  const notes = [
    { freq: 523.25, duration: 0.1 },
    { freq: 659.25, duration: 0.1 },
    { freq: 783.99, duration: 0.1 },
    { freq: 1046.50, duration: 0.6 },
  ];

  notes.forEach((note, i) => {
    setTimeout(() => {
      playTone(note.freq, "square", note.duration, 0.08);
    }, i * tempo);
  });
}

/** Play an 8-bit error / buzzer sound */
export function playError(): void {
  playTone(150, "sawtooth", 0.4, 0.12, 80);
}
