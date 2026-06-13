import { parseLRC, parseJSONLyrics } from "./parser"
import {
  LyricLine,
  LyricMetadata,
  LyricPlayerEventName,
  LyricPlayerEvents,
  LyricToken,
  ParsedLyrics,
} from "./types"

export type LyricSource =
  | { type: "lrc"; data: string }
  | { type: "json"; data: string | LyricLine[] }
  | { type: "parsed"; data: ParsedLyrics }

export interface LyricPlayerOptions {
  /** Audio source: URL/path, or an existing HTMLAudioElement to take over. */
  audio: string | HTMLAudioElement
  /** Lyrics source. Defaults to LRC text if a plain string is passed. */
  lyrics?: string | LyricLine[] | ParsedLyrics | LyricSource
  /**
   * Additional offset in milliseconds applied on top of any [offset:] tag
   * in the LRC file. Positive values shift lyrics later.
   */
  offsetMs?: number
}

type Listener<E extends LyricPlayerEventName> = LyricPlayerEvents[E]

/**
 * Wraps an HTMLAudioElement together with parsed, time-synced lyrics.
 *
 * ```ts
 * const player = new LyricPlayer({ audio: 'song.mp3', lyrics: lrcText });
 * player.on('linechange', (line) => console.log(line?.text));
 * player.play();
 * ```
 */
export class LyricPlayer {
  readonly audio: HTMLAudioElement
  readonly metadata: LyricMetadata
  readonly lines: LyricLine[]

  private offsetSeconds: number
  private currentIndex = -1
  private listeners: Record<string, Set<Function>> = {}

  constructor(options: LyricPlayerOptions) {
    this.audio =
      typeof options.audio === "string"
        ? new Audio(options.audio)
        : options.audio

    const parsed = this.resolveLyrics(options.lyrics)
    this.metadata = parsed.metadata
    this.lines = parsed.lines

    // Per the de-facto LRC convention, a positive [offset:] tag means the
    // lyrics are tagged "early" and should be shown later, i.e. line.time
    // should be increased to match audio.currentTime. Combine with any
    // extra constructor offset (also positive = shift lyrics later).
    const tagOffsetMs = parsed.metadata.offset ?? 0
    this.offsetSeconds = (tagOffsetMs + (options.offsetMs ?? 0)) / 1000

    this.audio.addEventListener("timeupdate", this.handleTimeUpdate)
    this.audio.addEventListener("play", () => this.emit("play"))
    this.audio.addEventListener("pause", () => this.emit("pause"))
    this.audio.addEventListener("ended", () => this.emit("ended"))
    this.audio.addEventListener("error", (e) => this.emit("error", e))
  }

  // ---------------------------------------------------------------------
  // Lyric source resolution
  // ---------------------------------------------------------------------

  private resolveLyrics(lyrics: LyricPlayerOptions["lyrics"]): ParsedLyrics {
    if (!lyrics) return { metadata: {}, lines: [] }

    if (typeof lyrics === "string") {
      return parseLRC(lyrics)
    }

    if (Array.isArray(lyrics)) {
      return parseJSONLyrics(lyrics)
    }

    if ("type" in lyrics) {
      switch (lyrics.type) {
        case "lrc":
          return parseLRC(lyrics.data)
        case "json":
          return parseJSONLyrics(lyrics.data)
        case "parsed":
          return lyrics.data
      }
    }

    // Already a ParsedLyrics object
    return lyrics as ParsedLyrics
  }

  /** Replace the loaded lyrics at any time (e.g. after fetching a file). */
  setLyrics(lyrics: LyricPlayerOptions["lyrics"]): void {
    const parsed = this.resolveLyrics(lyrics)
    ;(this.metadata as LyricMetadata) = parsed.metadata
    ;(this.lines as LyricLine[]).length = 0
    ;(this.lines as LyricLine[]).push(...parsed.lines)
    this.currentIndex = -1
    this.handleTimeUpdate()
  }

  /** Adjust the global lyric offset (in milliseconds) at runtime. */
  setOffset(offsetMs: number): void {
    this.offsetSeconds = offsetMs / 1000
    this.currentIndex = -1
    this.handleTimeUpdate()
  }

  // ---------------------------------------------------------------------
  // Playback controls (thin wrappers over the audio element)
  // ---------------------------------------------------------------------

  play(): Promise<void> {
    return this.audio.play()
  }

  pause(): void {
    this.audio.pause()
  }

  toggle(): Promise<void> | void {
    return this.audio.paused ? this.audio.play() : this.audio.pause()
  }

  seek(timeSeconds: number): void {
    this.audio.currentTime = Math.max(0, timeSeconds)
    this.handleTimeUpdate()
  }

  /** Seek directly to the start of a given lyric line. */
  seekToLine(index: number): void {
    const line = this.lines[index]
    if (line) this.seek(line.time + this.offsetSeconds)
  }

  get currentTime(): number {
    return this.audio.currentTime
  }

  get duration(): number {
    return this.audio.duration
  }

  get paused(): boolean {
    return this.audio.paused
  }

  set volume(value: number) {
    this.audio.volume = value
  }

  get volume(): number {
    return this.audio.volume
  }

  // ---------------------------------------------------------------------
  // Lyric lookup
  // ---------------------------------------------------------------------

  /** The currently active lyric line, or null if before the first line. */
  getCurrentLine(): LyricLine | null {
    return this.currentIndex >= 0 ? this.lines[this.currentIndex] : null
  }

  /** The index of the currently active lyric line (-1 if none yet). */
  getCurrentIndex(): number {
    return this.currentIndex
  }

  /** The next lyric line after the current one, if any. */
  getNextLine(): LyricLine | null {
    const next = this.lines[this.currentIndex + 1]
    return next ?? null
  }

  /**
   * For lines with word-level timing, returns the index of the active
   * token within the current line (-1 if no tokens or none active yet).
   */
  getCurrentTokenIndex(): number {
    const line = this.getCurrentLine()
    if (!line?.tokens?.length) return -1
    const t = this.audio.currentTime - this.offsetSeconds
    let idx = -1
    for (let i = 0; i < line.tokens.length; i++) {
      if (line.tokens[i].time <= t) idx = i
      else break
    }
    return idx
  }

  getCurrentToken(): LyricToken | null {
    const line = this.getCurrentLine()
    const idx = this.getCurrentTokenIndex()
    return line?.tokens && idx >= 0 ? line.tokens[idx] : null
  }

  /**
   * Find the line index active at an arbitrary time, without affecting
   * playback or the cached current index. Uses binary search.
   */
  findLineIndexAtTime(timeSeconds: number): number {
    const t = timeSeconds - this.offsetSeconds
    const lines = this.lines
    if (lines.length === 0 || t < lines[0].time) return -1

    let lo = 0
    let hi = lines.length - 1
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1
      if (lines[mid].time <= t) lo = mid
      else hi = mid - 1
    }
    return lo
  }

  // ---------------------------------------------------------------------
  // Event handling
  // ---------------------------------------------------------------------

  on<E extends LyricPlayerEventName>(event: E, listener: Listener<E>): void {
    let set = this.listeners[event]
    if (!set) {
      set = new Set()
      this.listeners[event] = set
    }
    set.add(listener)
  }

  off<E extends LyricPlayerEventName>(event: E, listener: Listener<E>): void {
    this.listeners[event]?.delete(listener)
  }

  private emit<E extends LyricPlayerEventName>(
    event: E,
    ...args: Parameters<Listener<E>>
  ): void {
    this.listeners[event]?.forEach((listener) => listener(...args))
  }

  private handleTimeUpdate = (): void => {
    const time = this.audio.currentTime
    const newIndex = this.findLineIndexAtTime(time)

    if (newIndex !== this.currentIndex) {
      this.currentIndex = newIndex
      this.emit("linechange", this.getCurrentLine(), newIndex)
    }

    this.emit("timeupdate", time)
  }

  /** Remove all listeners and detach from the underlying audio element. */
  destroy(): void {
    this.audio.removeEventListener("timeupdate", this.handleTimeUpdate)
    this.audio.pause()
    this.listeners = {}
  }
}
