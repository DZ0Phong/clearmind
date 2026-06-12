/* eslint-disable @typescript-eslint/no-explicit-any */
/// <reference lib="webworker" />

import { pipeline, env } from "@huggingface/transformers";

// Force CDN-hosted models. Local models would require shipping ~40MB of
// ONNX weights with the build, which is the opposite of "lazy load".
env.allowLocalModels = false;
env.allowRemoteModels = true;
// Some Vite + WASM combos miss the worker basename when resolving the
// onnxruntime web binary; pinning to the CDN avoids 404s in production.
if (env.backends?.onnx?.wasm) {
  env.backends.onnx.wasm.proxy = false;
}

interface InitMessage {
  type: "init";
  model: string;
  device: "wasm" | "webgpu";
}
interface TranscribeMessage {
  type: "transcribe";
  audio: Float32Array;
  /** Force a language (e.g. 'en', 'vi'). Omit/undefined → auto-detect. */
  language?: string;
}
interface UnloadMessage {
  type: "unload";
}
type InboundMessage = InitMessage | TranscribeMessage | UnloadMessage;

// Single pipeline instance per worker. Reuse across transcribe calls so
// model weights stay in VRAM/WASM heap (each load = 30-150 MB download).
let pipe: any | null = null;
let activeModel: string | null = null;
let activeDevice: string | null = null;

const ctx: DedicatedWorkerGlobalScope = self as unknown as DedicatedWorkerGlobalScope;

ctx.addEventListener("message", async (e: MessageEvent<InboundMessage>) => {
  const msg = e.data;

  if (msg.type === "init") {
    // No-op if the requested model/device already loaded.
    if (pipe && activeModel === msg.model && activeDevice === msg.device) {
      ctx.postMessage({ type: "ready" });
      return;
    }
    try {
      pipe = await pipeline("automatic-speech-recognition", msg.model, {
        device: msg.device as any,
        // Progress callback fires for each file (weights, tokenizer, etc.)
        // Forward to main thread so the UI can render a progress bar.
        progress_callback: (p: any) => {
          ctx.postMessage({ type: "progress", data: p });
        },
      });
      activeModel = msg.model;
      activeDevice = msg.device;
      ctx.postMessage({ type: "ready" });
    } catch (err) {
      ctx.postMessage({
        type: "error",
        error: (err as Error)?.message || String(err),
      });
    }
    return;
  }

  if (msg.type === "transcribe") {
    if (!pipe) {
      ctx.postMessage({ type: "error", error: "Pipeline not initialized" });
      return;
    }
    try {
      // Whisper expects mono Float32 PCM at 16 kHz. Caller is responsible
      // for resampling — we don't redo it here to avoid double work.
      //
      // language: undefined → Whisper auto-detect (best for mixed VN+EN).
      // chunk_length_s = 30 with stride 5 handles utterances longer than
      // 30s by overlapping windows so word boundaries don't get clipped.
      // task='transcribe' keeps text in the source language (vs 'translate'
      // which would force-translate everything to English).
      const result: any = await pipe(msg.audio, {
        language: msg.language || undefined,
        task: "transcribe",
        chunk_length_s: 30,
        stride_length_s: 5,
        return_timestamps: false,
      });
      const text: string = Array.isArray(result)
        ? result.map((r: { text: string }) => r.text).join(" ")
        : (result.text ?? "");
      ctx.postMessage({ type: "result", text: text.trim() });
    } catch (err) {
      ctx.postMessage({
        type: "error",
        error: (err as Error)?.message || String(err),
      });
    }
    return;
  }

  if (msg.type === "unload") {
    pipe = null;
    activeModel = null;
    activeDevice = null;
    ctx.postMessage({ type: "unloaded" });
    return;
  }
});

// Tell the main thread we're alive — useful for diagnostics.
ctx.postMessage({ type: "alive" });
