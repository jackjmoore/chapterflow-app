/**
 * Intrinsic pixel dimensions from an image file's header.
 *
 * docx's ImageRun requires an explicit width and height — there is no
 * "natural size" fallback the way an HTML <img> has — so exporting an image
 * without its real dimensions would mean guessing an aspect ratio and
 * visibly distorting the picture. Reading the four container formats the
 * image picker accepts is a few dozen bytes of header parsing and avoids
 * adding an image-decoding dependency for it.
 */
export interface ImageDimensions {
  width: number
  height: number
}

function pngSize(buffer: Buffer): ImageDimensions | null {
  // 8-byte signature, then an IHDR chunk whose width/height are big-endian
  // uint32s at offsets 16 and 20.
  if (buffer.length < 24) return null
  if (buffer.readUInt32BE(0) !== 0x89504e47) return null
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) }
}

function gifSize(buffer: Buffer): ImageDimensions | null {
  if (buffer.length < 10) return null
  if (buffer.toString('ascii', 0, 3) !== 'GIF') return null
  return { width: buffer.readUInt16LE(6), height: buffer.readUInt16LE(8) }
}

function jpegSize(buffer: Buffer): ImageDimensions | null {
  if (buffer.length < 4 || buffer.readUInt16BE(0) !== 0xffd8) return null
  let offset = 2
  while (offset + 9 < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1
      continue
    }
    const marker = buffer[offset + 1]
    // SOF0/1/2/3, 5-7, 9-11, 13-15 carry the frame dimensions; DHT/DAC/RST
    // and the like are skipped by their own segment length.
    const isSof =
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf)
    const segmentLength = buffer.readUInt16BE(offset + 2)
    if (isSof) {
      return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) }
    }
    if (segmentLength <= 0) return null
    offset += 2 + segmentLength
  }
  return null
}

function webpSize(buffer: Buffer): ImageDimensions | null {
  if (buffer.length < 30) return null
  if (buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WEBP') return null
  const format = buffer.toString('ascii', 12, 16)
  if (format === 'VP8 ') {
    // Lossy: 14-bit dimensions follow a 3-byte start code at offset 26.
    return { width: buffer.readUInt16LE(26) & 0x3fff, height: buffer.readUInt16LE(28) & 0x3fff }
  }
  if (format === 'VP8L') {
    // Lossless: 14 bits each, packed across four bytes after the 1-byte
    // signature at offset 20.
    const bits = buffer.readUInt32LE(21)
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 }
  }
  if (format === 'VP8X') {
    // Extended: 24-bit canvas dimensions minus one, at offset 24.
    const width = buffer.readUIntLE(24, 3) + 1
    const height = buffer.readUIntLE(27, 3) + 1
    return { width, height }
  }
  return null
}

/** Returns null for anything unrecognized, so one odd file degrades to a
 *  skipped image rather than failing the whole export. */
export function imageSize(buffer: Buffer): ImageDimensions | null {
  return pngSize(buffer) ?? jpegSize(buffer) ?? gifSize(buffer) ?? webpSize(buffer)
}

/**
 * Scales an image down to fit the printable column, preserving aspect ratio.
 * Images smaller than the column keep their own size rather than being
 * stretched up to fill it.
 */
export function fitWithin(size: ImageDimensions, maxWidthPx: number): ImageDimensions {
  if (size.width <= maxWidthPx) return size
  const scale = maxWidthPx / size.width
  return { width: Math.round(size.width * scale), height: Math.round(size.height * scale) }
}
