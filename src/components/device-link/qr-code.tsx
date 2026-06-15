import { useEffect, useRef } from "react";
import QRCode from "qrcode";

/**
 * Renders `text` as a QR onto a canvas. Always painted on a solid white
 * background with a quiet zone — QR scanners need high contrast, so we don't
 * let the app theme tint it. `qrcode` is static-imported (dynamic import of
 * code-split chunks is unreliable in the desktop WebView — see App.tsx).
 */
export function QrCode({ text, size = 224 }: { text: string; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    QRCode.toCanvas(canvas, text, {
      width: size,
      margin: 2,
      errorCorrectionLevel: "M",
      color: { dark: "#0a0a0a", light: "#ffffff" },
    }).catch(() => {
      /* nothing sensible to do on a render failure; canvas stays blank */
    });
  }, [text, size]);

  return (
    <canvas
      ref={ref}
      width={size}
      height={size}
      className="rounded-xl bg-white shadow-sm"
      style={{ width: size, height: size }}
    />
  );
}
