// Tiny PNG/WebP dimension reader (no deps) for verify-orders.
import { readFileSync } from "fs";

export function imageSize(path) {
  const b = readFileSync(path);
  // PNG: bytes 16-23 of IHDR
  if (b[0] === 0x89 && b[1] === 0x50) {
    return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
  }
  // WebP VP8X / VP8 / VP8L
  if (b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP") {
    const chunk = b.toString("ascii", 12, 16);
    if (chunk === "VP8X")
      return {
        width: 1 + b.readUIntLE(24, 3),
        height: 1 + b.readUIntLE(27, 3),
      };
    if (chunk === "VP8 ")
      return { width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff };
    if (chunk === "VP8L") {
      const n = b.readUInt32LE(21);
      return { width: 1 + (n & 0x3fff), height: 1 + ((n >> 14) & 0x3fff) };
    }
  }
  throw new Error("unsupported format");
}
