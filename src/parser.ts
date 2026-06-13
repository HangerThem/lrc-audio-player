import { LyricLine, LyricMetadata, LyricToken, ParsedLyrics } from "./types"

// [mm:ss.xx] or [mm:ss] or [h:mm:ss.xx] timestamps
const TIME_TAG = /\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]/g

// Metadata tags like [ti:Title], [ar:Artist], [offset:1000]
const META_TAG = /^\[([a-zA-Z]+):(.*)\]$/

// Word-level timing tags within a line: <mm:ss.xx>
const WORD_TAG = /<(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?>/g

const KNOWN_META_KEYS: Record<string, keyof LyricMetadata> = {
  ti: "title",
  ar: "artist",
  al: "album",
  au: "author",
  by: "author",
  offset: "offset",
}

function timeToSeconds(min: string, sec: string, frac?: string): number {
  const fraction = frac ? Number(`0.${frac}`) : 0
  return Number(min) * 60 + Number(sec) + fraction
}

/**
 * Parse the word-level tokens out of a line's text, if any are present.
 * Returns the plain text (tags stripped) and the token list (or undefined
 * if the line has no word-level timing).
 */
function parseTokens(
  raw: string,
  lineTime: number,
): { text: string; tokens?: LyricToken[] } {
  if (!WORD_TAG.test(raw)) {
    return { text: raw.trim() }
  }
  WORD_TAG.lastIndex = 0

  const tokens: LyricToken[] = []
  let lastIndex = 0
  let lastTime = lineTime
  let match: RegExpExecArray | null
  let plain = ""

  // The text before the first <tag> belongs to the line's start time.
  while ((match = WORD_TAG.exec(raw))) {
    const chunk = raw.slice(lastIndex, match.index)
    if (chunk.length) {
      tokens.push({ time: lastTime, text: chunk })
      plain += chunk
    }
    lastTime = timeToSeconds(match[1], match[2], match[3])
    lastIndex = WORD_TAG.lastIndex
  }

  const tail = raw.slice(lastIndex)
  if (tail.length) {
    tokens.push({ time: lastTime, text: tail })
    plain += tail
  }

  return { text: plain.trim(), tokens }
}

/**
 * Parse an LRC-format lyric file into structured, time-sorted lines plus
 * any metadata tags found at the top of the file.
 *
 * Supports:
 *  - Standard line timestamps: `[01:23.45]Some lyric text`
 *  - Multiple timestamps per line (repeated lines): `[00:01.00][00:05.00]Chorus`
 *  - Word-level / "enhanced" timing: `[00:01.00]<00:01.00>Hello <00:01.50>world`
 *  - Metadata tags: `[ti:Title]`, `[ar:Artist]`, `[al:Album]`, `[by:Author]`, `[offset:1000]`
 */
export function parseLRC(lrc: string): ParsedLyrics {
  const metadata: LyricMetadata = {}
  const lines: LyricLine[] = []

  const rawLines = lrc.split(/\r?\n/)

  for (const rawLine of rawLines) {
    const trimmed = rawLine.trim()
    if (!trimmed) continue

    // Pure metadata line, e.g. [ti:Song Name]
    const metaMatch = trimmed.match(META_TAG)
    if (metaMatch && !TIME_TAG.test(trimmed)) {
      const key = metaMatch[1].toLowerCase()
      const value = metaMatch[2].trim()
      const knownKey = KNOWN_META_KEYS[key]
      if (knownKey === "offset") {
        metadata.offset = Number(value)
      } else if (knownKey) {
        metadata[knownKey] = value
      } else {
        metadata[key] = value
      }
      TIME_TAG.lastIndex = 0
      continue
    }
    TIME_TAG.lastIndex = 0

    // Collect all leading [mm:ss.xx] timestamps (a line can repeat at
    // multiple times, e.g. a chorus).
    const times: number[] = []
    let rest = trimmed
    let leadingMatch: RegExpMatchArray | null
    // eslint-disable-next-line no-cond-assign
    while (
      (leadingMatch = rest.match(/^\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]/))
    ) {
      times.push(
        timeToSeconds(leadingMatch[1], leadingMatch[2], leadingMatch[3]),
      )
      rest = rest.slice(leadingMatch[0].length)
    }

    if (times.length === 0) {
      // No timestamp at all (stray text) - skip it.
      continue
    }

    for (const time of times) {
      const { text, tokens } = parseTokens(rest, time)
      lines.push({ time, text, tokens })
    }
  }

  lines.sort((a, b) => a.time - b.time)

  return { metadata, lines }
}

/**
 * Parse a simple JSON lyric format:
 * `[{ "time": 1.0, "text": "Hello" }, ...]`
 * Useful as an alternative to LRC when you control the lyric source yourself.
 */
export function parseJSONLyrics(json: string | LyricLine[]): ParsedLyrics {
  const lines: LyricLine[] = typeof json === "string" ? JSON.parse(json) : json
  const sorted = [...lines].sort((a, b) => a.time - b.time)
  return { metadata: {}, lines: sorted }
}
