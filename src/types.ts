import { LyricSource } from "./react"

/**
 * A single token within a lyric line (for word/syllable-level timing,
 * "enhanced LRC" style: <mm:ss.xx>word).
 */
export interface LyricToken {
  /** Time in seconds at which this token starts. */
  time: number
  /** The text of the token (word, syllable, or chunk). */
  text: string
}

/**
 * A single line of lyrics with its start time and optional
 * word-level timing tokens.
 */
export interface LyricLine {
  /** Time in seconds at which this line starts. */
  time: number
  /** Full text of the line (tokens stripped of timestamps, joined). */
  text: string
  /** Optional word/syllable-level tokens, if the source had enhanced timing. */
  tokens?: LyricToken[]
  /** Optional metadata tag, e.g. for translation/extension lines (`[tr]` etc). */
  tag?: string
}

/**
 * Options for constructing a LyricPlayer instance.
 */
export type LyricPlayerOptions = {
  audio: string | HTMLAudioElement
  lyrics?: string | LyricLine[] | ParsedLyrics | LyricSource
  offsetMs?: number
}

/**
 * Metadata commonly found in LRC files ([ti], [ar], [al], [by], [offset], etc).
 */
export interface LyricMetadata {
  title?: string
  artist?: string
  album?: string
  author?: string
  /** Offset in milliseconds. Positive values make lyrics appear later. */
  offset?: number
  [key: string]: string | number | undefined
}

/**
 * Parsed lyric file: metadata plus a time-sorted array of lines.
 */
export interface ParsedLyrics {
  metadata: LyricMetadata
  lines: LyricLine[]
}

/**
 * Events emitted by LyricPlayer.
 */
export interface LyricPlayerEvents {
  /** Fired whenever the active lyric line index changes (including to -1). */
  linechange: (line: LyricLine | null, index: number) => void
  /** Fired on every underlying `timeupdate` from the audio element. */
  timeupdate: (currentTime: number) => void
  /** Fired when playback starts. */
  play: () => void
  /** Fired when playback pauses. */
  pause: () => void
  /** Fired when the track finishes playing. */
  ended: () => void
  /** Fired if the audio element raises an error. */
  error: (error: Event) => void
  /** Fired when the track is instrumental (no lyrics). */
  instrumental: () => void
}

export type LyricPlayerEventName = keyof LyricPlayerEvents
