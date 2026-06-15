import { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";

/**
 * Live camera QR scanner. Prefers the native `BarcodeDetector` (Android
 * Chrome / Edge) for speed + battery, falling back to `jsqr` (pure JS, works
 * everywhere incl. iOS Safari + desktop). Stops the stream on unmount and the
 * instant a code is found. Callbacks are kept in refs so a parent re-render
 * never tears down + re-opens the camera mid-scan.
 */
export function QrScanner({
  onResult,
  onError,
}: {
  onResult: (text: string) => void;
  onError?: (kind: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const onResultRef = useRef(onResult);
  const onErrorRef = useRef(onError);
  onResultRef.current = onResult;
  onErrorRef.current = onError;
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let stopped = false;
    let stream: MediaStream | null = null;
    let raf = 0;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let detector: any = null;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });

    const found = (text: string) => {
      if (stopped) return;
      stopped = true;
      onResultRef.current(text);
    };

    const tick = async () => {
      if (stopped) return;
      const v = videoRef.current;
      if (v && v.readyState >= v.HAVE_ENOUGH_DATA && ctx) {
        canvas.width = v.videoWidth;
        canvas.height = v.videoHeight;
        ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
        try {
          if (detector) {
            const codes = await detector.detect(canvas);
            if (codes && codes.length && codes[0].rawValue) {
              return found(codes[0].rawValue);
            }
          } else {
            const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const res = jsQR(img.data, img.width, img.height, {
              inversionAttempts: "dontInvert",
            });
            if (res && res.data) return found(res.data);
          }
        } catch {
          /* transient decode error — keep scanning */
        }
      }
      raf = requestAnimationFrame(tick);
    };

    (async () => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const BD = (window as any).BarcodeDetector;
        if (BD) {
          try {
            const formats = await BD.getSupportedFormats?.();
            if (!formats || formats.includes("qr_code")) {
              detector = new BD({ formats: ["qr_code"] });
            }
          } catch {
            detector = null;
          }
        }
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
        if (stopped) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        const v = videoRef.current;
        if (v) {
          v.srcObject = stream;
          await v.play();
          setReady(true);
          raf = requestAnimationFrame(tick);
        }
      } catch (e) {
        onErrorRef.current?.((e as Error)?.name || String(e));
      }
    })();

    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return (
    <div className="relative w-full overflow-hidden rounded-xl bg-black aspect-square">
      <video
        ref={videoRef}
        playsInline
        muted
        className="h-full w-full object-cover"
      />
      {/* Reticle */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className="h-2/3 w-2/3 rounded-xl border-2 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
      </div>
      {!ready && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="h-6 w-6 rounded-full border-2 border-white/40 border-t-white animate-spin" />
        </div>
      )}
    </div>
  );
}
