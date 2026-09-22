"use client";

/*
 * QR — real, scannable QR codes for the MQ share system.
 *
 * Engine: vendored Nayuki qrcodegen (MIT) — src/lib/vendor/qrcodegen.ts.
 * This wrapper turns a matrix into a crisp SVG (share dialog) or a
 * high-contrast canvas raster (PNG download).
 *
 * Contract (task §12):
 *  - error correction MEDIUM (≈15%) by default — tolerant, keeps density low;
 *  - quiet zone of 4 modules on every side (ISO/IEC 18004 minimum);
 *  - pure #000 modules on #fff background — maximum contrast for scanners;
 *  - SVG uses shape-rendering="crispEdges" (no anti-aliased half pixels);
 *  - decode round-trip is proven by src/__tests__/lib/qr.test.ts using the
 *    real jsQR decoder.
 */

import qrcodegen from "./vendor/qrcodegen";

export type QrEcl = "low" | "medium" | "quartile" | "high";

const ECL_MAP: Record<QrEcl, qrcodegen.QrCode.Ecc> = {
  low: qrcodegen.QrCode.Ecc.LOW,
  medium: qrcodegen.QrCode.Ecc.MEDIUM,
  quartile: qrcodegen.QrCode.Ecc.QUARTILE,
  high: qrcodegen.QrCode.Ecc.HIGH,
};

/** Quiet zone in modules — ISO/IEC 18004 requires at least 4. */
export const QR_QUIET_ZONE = 4;

export interface QrMatrix {
  /** Side length in modules (version*4 + 17). */
  size: number;
  /** QR version (1..40). */
  version: number;
  /** True when the module at (x, y) is dark. */
  get(x: number, y: number): boolean;
}

/** Build a real QR matrix for `text`. Throws for empty/too-long input. */
export function buildQrMatrix(text: string, ecl: QrEcl = "medium"): QrMatrix {
  if (!text) throw new Error("QR: empty payload");
  const qr = qrcodegen.QrCode.encodeText(text, ECL_MAP[ecl]);
  return {
    size: qr.size,
    version: qr.version,
    get: (x: number, y: number) => qr.getModule(x, y),
  };
}

export interface QrSvgOptions {
  /** Total pixel size of the rendered square. Modules scale automatically. */
  size?: number;
  /** CSS class for the <svg> element. */
  className?: string;
  /** DOM id for the <svg> element (used by the PNG exporter). */
  id?: string;
  /** Accessible label; defaults to a neutral description. */
  ariaLabel?: string;
  /** Dark module color. Keep #000 for scannability. */
  dark?: string;
  /** Light module / background color. Keep #fff for scannability. */
  light?: string;
}

/**
 * Render a QR payload as a complete, self-contained <svg> string.
 * The caller injects it via dangerouslySetInnerHTML.
 */
export function qrSvgString(text: string, opts: QrSvgOptions = {}, ecl: QrEcl = "medium"): string {
  const size = opts.size ?? 200;
  const dark = opts.dark ?? "#000000";
  const light = opts.light ?? "#ffffff";
  const matrix = buildQrMatrix(text, ecl);
  const total = matrix.size + QR_QUIET_ZONE * 2;
  const unit = 1000 / total; // work in a fixed viewBox — crisp at any size
  const quiet = QR_QUIET_ZONE * unit;

  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg"${opts.id ? ` id="${escapeAttr(opts.id)}"` : ""}${
      opts.className ? ` class="${escapeAttr(opts.className)}"` : ""
    } width="${size}" height="${size}" viewBox="0 0 1000 1000" role="img" aria-label="${escapeAttr(
      opts.ariaLabel ?? "QR-код ссылки"
    )}" shape-rendering="crispEdges">`
  );
  parts.push(`<rect width="1000" height="1000" fill="${light}"/>`);
  // One <path> for all dark modules — far fewer DOM nodes than per-module rects.
  let d = "";
  for (let y = 0; y < matrix.size; y++) {
    for (let x = 0; x < matrix.size; x++) {
      if (matrix.get(x, y)) {
        const px = quiet + x * unit;
        const py = quiet + y * unit;
        d += `M${trim(px)} ${trim(py)}h${trim(unit)}v${trim(unit)}h-${trim(unit)}z`;
      }
    }
  }
  if (d) parts.push(`<path d="${d}" fill="${dark}"/>`);
  parts.push("</svg>");
  return parts.join("");
}

function trim(n: number): string {
  return (Math.round(n * 100) / 100).toString();
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

/**
 * Paint a QR onto a canvas (device-pixel sharp). Used by the PNG download.
 * Returns the canvas so the caller can export it.
 */
export function drawQrToCanvas(
  canvas: HTMLCanvasElement,
  text: string,
  sizePx = 640,
  ecl: QrEcl = "medium"
): HTMLCanvasElement {
  const matrix = buildQrMatrix(text, ecl);
  const total = matrix.size + QR_QUIET_ZONE * 2;
  const dpr = Math.max(1, Math.min(3, typeof window === "undefined" ? 1 : window.devicePixelRatio || 1));
  canvas.width = Math.round(sizePx * dpr);
  canvas.height = Math.round(sizePx * dpr);
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#000000";
  const unit = canvas.width / total;
  for (let y = 0; y < matrix.size; y++) {
    for (let x = 0; x < matrix.size; x++) {
      if (matrix.get(x, y)) {
        ctx.fillRect(
          Math.round((x + QR_QUIET_ZONE) * unit),
          Math.round((y + QR_QUIET_ZONE) * unit),
          Math.ceil(unit),
          Math.ceil(unit)
        );
      }
    }
  }
  return canvas;
}
