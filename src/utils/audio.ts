// ISO 11172-3 Table B.2
// Maps the 4-bit bitrate index in each frame header to kbps
// Index 0 (free) and 15 (bad) are invalid, kept as 0 so we can skip them
const BITRATE_TABLE = [
  0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0,
]

/**
 * Detects if an MP3 file is VBR by sampling frame bitrates throughout the file.
 * This is a fallback method when no VBR header is present, and may be slow on large files.
 *
 * @param file The MP3 file to analyze
 * @param samples The number of frames to sample (default: 50). More samples may improve accuracy but increase processing time.
 * @returns True if the file is likely VBR, false if likely CBR. Note that this is a heuristic and may not be 100% accurate.
 */
export async function sampleFrameBitrates(
  file: File | Blob,
  samples = 50,
): Promise<boolean> {
  const buf = new Uint8Array(await file.arrayBuffer())
  const bitrates = new Set<number>()
  const step = Math.max(1, Math.floor(buf.length / samples))

  for (let i = 0; i < buf.length - 4; i += step) {
    // Scan forward to find the next sync word
    let j = i
    while (j < i + 1000 && j < buf.length - 4) {
      if (buf[j] === 0xff && (buf[j + 1] & 0xe0) === 0xe0) {
        const bitrateIdx = (buf[j + 2] >> 4) & 0xf
        const br = BITRATE_TABLE[bitrateIdx]
        if (br > 0) {
          bitrates.add(br)
          break
        }
      }
      j++
    }
    if (bitrates.size > 1) return true
  }

  return bitrates.size > 1
}

/**
 * Detects if an MP3 file is VBR by checking for VBR headers and sampling frames if needed.
 * This is the main function to call for bitrate detection.
 *
 * @param file The MP3 file to analyze
 * @returns True if the file is likely VBR, false if likely CBR. Note that this is a heuristic and may not be 100% accurate.
 */
export async function isVBR(file: File | Blob): Promise<boolean> {
  const slice = file.slice(0, 4096)
  const buf = new Uint8Array(await slice.arrayBuffer())

  let offset = 0
  if (buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33) {
    const size =
      ((buf[6] & 0x7f) << 21) |
      ((buf[7] & 0x7f) << 14) |
      ((buf[8] & 0x7f) << 7) |
      (buf[9] & 0x7f)
    offset = size + 10
  }

  const chunk = buf.slice(offset, offset + 200)
  const text = new TextDecoder("latin1").decode(chunk)

  // Xing/VBRI are safe to string-match
  // Avoids bare "Info" false positives by checking its position
  // relative to the frame header instead
  if (text.includes("Xing") || text.includes("VBRI")) return true

  // "Info" at a known offset is reliable
  // Typical offsets after frame header: 36 bytes (stereo) or 21 bytes (mono)
  const infoAtStereoOffset =
    chunk[36] === 0x49 &&
    chunk[37] === 0x6e &&
    chunk[38] === 0x66 &&
    chunk[39] === 0x6f
  const infoAtMonoOffset =
    chunk[21] === 0x49 &&
    chunk[22] === 0x6e &&
    chunk[23] === 0x66 &&
    chunk[24] === 0x6f
  if (infoAtStereoOffset || infoAtMonoOffset) return false

  // If no headers found, sample frame bitrates as a heuristic
  return sampleFrameBitrates(file)
}
