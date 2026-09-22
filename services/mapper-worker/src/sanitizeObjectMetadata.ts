import { readFileSync, writeFileSync } from "node:fs";

const JPEG_SOI_0 = 0xff;
const JPEG_SOI_1 = 0xd8;
const APP1 = 0xe1;
const EXIF_HEADER = Buffer.from("Exif\0\0", "binary");

// Removes only the GPS IFD pointer from JPEG EXIF metadata while preserving
// the compressed image pixels and the rest of EXIF (camera make/model,
// focal metadata, timestamps, etc.). This is used only on temporary worker
// copies for close-range object reconstruction; originals in Supabase/Drive
// remain untouched.
export function stripGpsFromJpegExif(filePath: string): boolean {
  const buffer = readFileSync(filePath);
  if (buffer.length < 4 || buffer[0] !== JPEG_SOI_0 || buffer[1] !== JPEG_SOI_1) return false;

  let offset = 2;
  while (offset + 4 <= buffer.length && buffer[offset] === 0xff) {
    const marker = buffer[offset + 1];

    // Start of Scan / End of Image: metadata segments are finished.
    if (marker === 0xda || marker === 0xd9) break;

    // Standalone markers have no length payload.
    if (marker >= 0xd0 && marker <= 0xd7) {
      offset += 2;
      continue;
    }

    const segmentLength = buffer.readUInt16BE(offset + 2);
    if (segmentLength < 2 || offset + 2 + segmentLength > buffer.length) break;

    if (marker === APP1) {
      const payloadStart = offset + 4;
      if (
        payloadStart + EXIF_HEADER.length <= buffer.length &&
        buffer.subarray(payloadStart, payloadStart + EXIF_HEADER.length).equals(EXIF_HEADER)
      ) {
        const tiffStart = payloadStart + EXIF_HEADER.length;
        if (tiffStart + 8 > buffer.length) return false;

        const byteOrder = buffer.toString("ascii", tiffStart, tiffStart + 2);
        const littleEndian = byteOrder === "II";
        if (!littleEndian && byteOrder !== "MM") return false;

        const read16 = (pos: number) => littleEndian ? buffer.readUInt16LE(pos) : buffer.readUInt16BE(pos);
        const read32 = (pos: number) => littleEndian ? buffer.readUInt32LE(pos) : buffer.readUInt32BE(pos);
        const write16 = (pos: number, value: number) => littleEndian ? buffer.writeUInt16LE(value, pos) : buffer.writeUInt16BE(value, pos);
        const write32 = (pos: number, value: number) => littleEndian ? buffer.writeUInt32LE(value, pos) : buffer.writeUInt32BE(value, pos);

        const ifd0Rel = read32(tiffStart + 4);
        const ifd0 = tiffStart + ifd0Rel;
        if (ifd0 + 2 > buffer.length) return false;

        const entryCount = read16(ifd0);
        let changed = false;
        for (let i = 0; i < entryCount; i++) {
          const entry = ifd0 + 2 + i * 12;
          if (entry + 12 > buffer.length) break;
          const tag = read16(entry);
          if (tag === 0x8825) {
            // Neutralize the GPSInfoIFDPointer entry in-place. Keeping the
            // APP1 segment length unchanged avoids touching JPEG image data.
            write16(entry, 0);
            write16(entry + 2, 1);
            write32(entry + 4, 1);
            write32(entry + 8, 0);
            changed = true;
          }
        }

        if (changed) writeFileSync(filePath, buffer);
        return changed;
      }
    }

    offset += 2 + segmentLength;
  }

  return false;
}

export function stripGpsFromObjectImages(paths: string[]): { stripped: number; skipped: number } {
  let stripped = 0;
  let skipped = 0;
  for (const path of paths) {
    try {
      if (stripGpsFromJpegExif(path)) stripped += 1;
      else skipped += 1;
    } catch {
      skipped += 1;
    }
  }
  return { stripped, skipped };
}
