/**
 * Whisper STT manager — wraps the worker in a small singleton API.
 *
 * Why a singleton: model weights are 40-150 MB and take 5-20s to download
 * + initialize. We want a single worker per browser session, reused for
 * every transcription. Calling `loadWhisper` twice with the same model is
 * a no-op (returns immediately when ready).
 *
 * Why a worker: ONNX Runtime + WASM tensor math would block the main
 * thread for hundreds of ms per inference. The worker keeps the UI
 * responsive even while a 30s utterance is being transcribed.
 *
 * Cache: the underlying @huggingface/transformers library stores weights
 * in the browser Cache Storage API on first load. Subsequent reloads use
 * the cached copy — no network hit.
 */

import WhisperWorker from "@/workers/whisper.worker?worker";

export type WhisperState =
  | "idle" // never initialized
  | "loading" // downloading + initializing model
  | "ready" // model in memory, ready to transcribe
  | "transcribing" // active inference in progress
  | "error";

export type WhisperDevice = "wasm" | "webgpu";

export interface WhisperProgress {
  /** Filename being downloaded (e.g. 'onnx/encoder_model_quantized.onnx'). */
  file?: string;
  /** 0..1, or undefined if indeterminate. */
  progress?: number;
  loaded?: number;
  total?: number;
  /** Status string from transformers.js ('initiate'|'download'|'progress'|'done'|'ready'). */
  status?: string;
}

export interface WhisperHandle {
  state: WhisperState;
  /** Subscribe to state changes. Returns unsubscribe. */
  onState(cb: (s: WhisperState) => void): () => void;
  /** Subscribe to download/init progress. */
  onProgress(cb: (p: WhisperProgress) => void): () => void;
  /** Transcribe a mono 16 kHz Float32 PCM buffer. Resolves to text. */
  transcribe(audio: Float32Array, language?: string): Promise<string>;
  /** Throw away the worker + model. Next load() will redownload weights. */
  unload(): void;
}

interface LoadOptions {
  model?: string;
  device?: WhisperDevice;
}

const DEFAULT_MODEL = "Xenova/whisper-tiny";
const DEFAULT_DEVICE: WhisperDevice = "wasm";

let worker: Worker | null = null;
let state: WhisperState = "idle";
let activeModel: string | null = null;
let activeDevice: WhisperDevice | null = null;
const stateListeners = new Set<(s: WhisperState) => void>();
const progressListeners = new Set<(p: WhisperProgress) => void>();

/** In-flight transcribe call. Whisper worker is single-threaded; we queue. */
let pendingTranscribe: {
  resolve: (text: string) => void;
  reject: (err: Error) => void;
} | null = null;

/** Pending ready promise(s) from concurrent load() calls. */
let pendingLoad: {
  resolve: () => void;
  reject: (err: Error) => void;
}[] = [];

function setState(s: WhisperState) {
  state = s;
  for (const cb of stateListeners) {
    try {
      cb(s);
    } catch {
      /* ignore */
    }
  }
}

function emitProgress(p: WhisperProgress) {
  for (const cb of progressListeners) {
    try {
      cb(p);
    } catch {
      /* ignore */
    }
  }
}

function attachHandlers(w: Worker) {
  w.addEventListener("message", (e: MessageEvent) => {
    const msg = e.data;
    if (!msg || typeof msg !== "object") return;
    switch (msg.type) {
      case "ready": {
        setState("ready");
        const loaders = pendingLoad;
        pendingLoad = [];
        for (const l of loaders) l.resolve();
        break;
      }
      case "progress":
        emitProgress(msg.data as WhisperProgress);
        break;
      case "result":
        setState("ready");
        if (pendingTranscribe) {
          pendingTranscribe.resolve(msg.text as string);
          pendingTranscribe = null;
        }
        break;
      case "error": {
        const err = new Error(msg.error || "Whisper worker error");
        if (pendingTranscribe) {
          setState("ready");
          pendingTranscribe.reject(err);
          pendingTranscribe = null;
        } else {
          setState("error");
          const loaders = pendingLoad;
          pendingLoad = [];
          for (const l of loaders) l.reject(err);
        }
        break;
      }
      case "alive":
      case "unloaded":
        break;
      default:
        break;
    }
  });
  w.addEventListener("error", (e) => {
    const err = new Error(e.message || "Worker crashed");
    setState("error");
    if (pendingTranscribe) {
      pendingTranscribe.reject(err);
      pendingTranscribe = null;
    }
    const loaders = pendingLoad;
    pendingLoad = [];
    for (const l of loaders) l.reject(err);
  });
}

export function getWhisperState(): WhisperState {
  return state;
}

export function onWhisperState(cb: (s: WhisperState) => void): () => void {
  stateListeners.add(cb);
  return () => stateListeners.delete(cb);
}

export function onWhisperProgress(
  cb: (p: WhisperProgress) => void
): () => void {
  progressListeners.add(cb);
  return () => progressListeners.delete(cb);
}

/**
 * Ensure the worker is initialized with the requested model + device.
 * Idempotent — resolves immediately if already ready with the same config.
 */
export async function loadWhisper(opts?: LoadOptions): Promise<void> {
  const model = opts?.model ?? DEFAULT_MODEL;
  const device = opts?.device ?? DEFAULT_DEVICE;

  if (
    worker &&
    activeModel === model &&
    activeDevice === device &&
    state === "ready"
  ) {
    return;
  }
  if (!worker) {
    worker = new WhisperWorker();
    attachHandlers(worker);
  }
  // Either fresh worker or config change — re-init.
  activeModel = model;
  activeDevice = device;
  setState("loading");
  return new Promise<void>((resolve, reject) => {
    pendingLoad.push({ resolve, reject });
    worker!.postMessage({ type: "init", model, device });
  });
}

export function transcribe(
  audio: Float32Array,
  language?: string
): Promise<string> {
  if (!worker || state !== "ready") {
    return Promise.reject(new Error("Whisper not ready — call loadWhisper() first"));
  }
  if (pendingTranscribe) {
    return Promise.reject(new Error("Whisper busy — already transcribing"));
  }
  setState("transcribing");
  return new Promise<string>((resolve, reject) => {
    pendingTranscribe = { resolve, reject };
    // Transfer the audio buffer so we don't copy 30s × 16kHz × 4 bytes
    // (~2 MB) across the worker boundary on every call.
    worker!.postMessage(
      { type: "transcribe", audio, language },
      [audio.buffer]
    );
  });
}

export function unloadWhisper(): void {
  if (worker) {
    try {
      worker.postMessage({ type: "unload" });
    } catch {
      /* worker may already be terminated */
    }
    worker.terminate();
    worker = null;
  }
  activeModel = null;
  activeDevice = null;
  if (pendingTranscribe) {
    pendingTranscribe.reject(new Error("Whisper unloaded"));
    pendingTranscribe = null;
  }
  const loaders = pendingLoad;
  pendingLoad = [];
  for (const l of loaders) l.reject(new Error("Whisper unloaded"));
  setState("idle");
}

/** Detect whether WebGPU is available in the current browser. */
export function hasWebGPU(): boolean {
  return typeof navigator !== "undefined" && "gpu" in navigator;
}
