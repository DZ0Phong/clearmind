/**
 * Microphone audio capture utility — emits a single Float32 PCM buffer
 * at 16 kHz mono on stop(). Used by the Whisper transcription path.
 *
 * Why 16 kHz mono: that's what Whisper expects natively. Resampling on
 * the device-side via AudioContext's intrinsic sample-rate conversion is
 * cheaper + higher quality than doing it ourselves with a linear filter.
 *
 * Why no streaming: this version captures full utterance → transcribe in
 * batch. Streaming with overlapping windows is significantly more complex
 * and only buys ~1-2s latency improvement — defer.
 */

const TARGET_SAMPLE_RATE = 16_000;

export interface AudioCaptureHandle {
  /** Stop recording and return the captured PCM. */
  stop(): Promise<Float32Array>;
  /** Abort without producing audio (e.g. permission revoked mid-record). */
  abort(): void;
  /** Live elapsed-time subscription, ms since start. */
  onTick(cb: (ms: number) => void): () => void;
  /** Crude live volume meter (0..1) for the UI ring. */
  onLevel(cb: (level: number) => void): () => void;
}

export async function startMicCapture(): Promise<AudioCaptureHandle> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      // Hint browser to skip noise suppression — Whisper is robust + we
      // want the raw signal. Browsers can still ignore this hint.
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      channelCount: 1,
    },
  });

  const AudioCtor =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext })
      .webkitAudioContext;
  // Try to ask for 16 kHz directly. Many browsers ignore the option and
  // give 44.1 / 48 kHz instead — we handle that with a final resample.
  let ctx: AudioContext;
  try {
    ctx = new AudioCtor({ sampleRate: TARGET_SAMPLE_RATE });
  } catch {
    ctx = new AudioCtor();
  }

  const source = ctx.createMediaStreamSource(stream);
  const chunks: Float32Array[] = [];
  let totalSamples = 0;

  // ScriptProcessorNode is deprecated but universally supported. AudioWorklet
  // would be cleaner but requires shipping a second worker file just for
  // capture — overkill for our short utterance window.
  const proc = ctx.createScriptProcessor(4096, 1, 1);
  let level = 0;
  proc.onaudioprocess = (e) => {
    const data = e.inputBuffer.getChannelData(0);
    // Copy — the underlying buffer is reused across ticks.
    const copy = new Float32Array(data.length);
    copy.set(data);
    chunks.push(copy);
    totalSamples += copy.length;
    // RMS for level meter — single pass, no allocations.
    let sum = 0;
    for (let i = 0; i < copy.length; i++) sum += copy[i] * copy[i];
    level = Math.sqrt(sum / copy.length);
    levelListeners.forEach((cb) => {
      try { cb(level); } catch { /* ignore */ }
    });
  };
  source.connect(proc);
  proc.connect(ctx.destination);

  const start = performance.now();
  const tickListeners = new Set<(ms: number) => void>();
  const levelListeners = new Set<(level: number) => void>();
  const tickHandle = window.setInterval(() => {
    const elapsed = performance.now() - start;
    tickListeners.forEach((cb) => {
      try { cb(elapsed); } catch { /* ignore */ }
    });
  }, 100);

  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    clearInterval(tickHandle);
    try { proc.disconnect(); } catch { /* ignore */ }
    try { source.disconnect(); } catch { /* ignore */ }
    stream.getTracks().forEach((t) => t.stop());
    try { ctx.close(); } catch { /* ignore */ }
  };

  return {
    onTick(cb) {
      tickListeners.add(cb);
      return () => tickListeners.delete(cb);
    },
    onLevel(cb) {
      levelListeners.add(cb);
      return () => levelListeners.delete(cb);
    },
    async stop() {
      const captureRate = ctx.sampleRate;
      cleanup();
      // Flatten all chunks.
      const flat = new Float32Array(totalSamples);
      let off = 0;
      for (const c of chunks) {
        flat.set(c, off);
        off += c.length;
      }
      if (Math.abs(captureRate - TARGET_SAMPLE_RATE) < 1) return flat;
      // Resample to 16 kHz with linear interpolation. Quality is "good
      // enough" for speech — Whisper's mel-spectrogram step blurs aliasing
      // anyway. A higher-order filter wouldn't help recognition meaningfully.
      return resampleLinear(flat, captureRate, TARGET_SAMPLE_RATE);
    },
    abort() {
      cleanup();
    },
  };
}

function resampleLinear(
  src: Float32Array,
  srcRate: number,
  dstRate: number
): Float32Array {
  if (srcRate === dstRate) return src;
  const ratio = srcRate / dstRate;
  const outLen = Math.round(src.length / ratio);
  const out = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const t = i * ratio;
    const i0 = Math.floor(t);
    const frac = t - i0;
    const a = src[i0] ?? 0;
    const b = src[i0 + 1] ?? a;
    out[i] = a + (b - a) * frac;
  }
  return out;
}
