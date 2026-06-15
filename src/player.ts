import { parseLRC, parseJSONLyrics } from "./parser"
import {
  LyricLine,
  LyricMetadata,
  LyricPlayerEventName,
  LyricPlayerEvents,
  LyricToken,
  ParsedLyrics,
} from "./types"
import type { LrclibResult, LrclibTrackInfo } from "./lrclib"
import { fetchFromLrclib } from "./lrclib"
import { isVBR } from "./utils/audio"

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
  /**
   * Disable CBR conversion if you know your audio file is already
   * constant bitrate (e.g., properly encoded MP3/AAC with seek tables).
   * @default false
   */
  skipCBR?: boolean
  /** Target bitrate for CBR conversion. @default '128k' */
  cbrBitrate?: string
  /**
   * Optional metadata to auto-fetch lyrics from LRCLIB if no lyrics are
   * provided. Duration is detected from the audio element automatically.
   */
  lrclib?: LrclibTrackInfo
  /**
   * A previously fetched LRCLIB result. Takes priority over `lrclib` and
   * skips any network request - lyrics and metadata are extracted directly.
   */
  lrclibResult?: LrclibResult
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
  readonly audio!: HTMLAudioElement
  readonly metadata!: LyricMetadata
  readonly lines!: LyricLine[]

  private offsetSeconds!: number
  private currentIndex = -1
  private currentTokenIndex = -1
  private listeners: Record<string, Set<Function>> = {}

  private _readyPromise: Promise<void>
  private _externalOffsetMs: number = 0

  constructor(options: LyricPlayerOptions) {
    this._readyPromise = this.initialize(options)
  }

  /** Initialize the player, including CBR conversion if needed. */
  private async initialize(options: LyricPlayerOptions): Promise<void> {
    const { skipCBR = false, cbrBitrate = "128k" } = options

    let audioSrc: string
    let audioEl: HTMLAudioElement
    let lrclibMeta: LyricMetadata = {}

    if (typeof options.audio === "string") {
      audioSrc = options.audio
      audioEl = new Audio()
    } else {
      audioEl = options.audio
      audioSrc = options.audio.src || options.audio.currentSrc
    }

    if (options.lrclibResult && !options.lyrics) {
      // Use a pre-fetched result directly - no network request needed.
      const result = options.lrclibResult

      lrclibMeta = {
        title: result.trackName ?? undefined,
        artist: result.artistName ?? undefined,
        album: result.albumName ?? undefined,
      }

      if (result.instrumental) {
        this.emit("instrumental")
      } else if (result.syncedLyrics) {
        options.lyrics = result.syncedLyrics
      } else if (result.plainLyrics) {
        console.warn(
          "[lrc-audio-player] Only unsynced lyrics found for this track",
        )
      }
    } else if (options.lrclib && !options.lyrics) {
      const duration = await new Promise<number>((resolve) => {
        if (!isNaN(audioEl.duration)) return resolve(audioEl.duration)
        audioEl.addEventListener(
          "loadedmetadata",
          () => resolve(audioEl.duration),
          { once: true },
        )
        audioEl.load()
      })

      const result = await fetchFromLrclib(options.lrclib, duration)

      lrclibMeta = {
        title: result?.trackName ?? undefined,
        artist: result?.artistName ?? undefined,
        album: result?.albumName ?? undefined,
      }

      if (result?.instrumental) {
        this.emit("instrumental")
      } else if (result?.syncedLyrics) {
        options.lyrics = result.syncedLyrics
      } else if (result?.plainLyrics) {
        console.warn(
          "[lrc-audio-player] Only unsynced lyrics found for this track",
        )
      }
    }

    if (!skipCBR && audioSrc) {
      const needsConversion = await this.detectNeedsCBR(audioSrc)
      if (needsConversion) {
        audioSrc = await this.convertToCBR(audioSrc, cbrBitrate)
      }
    }

    audioEl.src = audioSrc
    ;(this as any).audio = audioEl

    const parsed = this.resolveLyrics(options.lyrics)
    // LRC file tags win over LRCLIB metadata if both are present.
    ;(this as any).metadata = { ...lrclibMeta, ...parsed.metadata }
    ;(this as any).lines = parsed.lines

    const tagOffsetMs = parsed.metadata.offset ?? 0
    this.offsetSeconds = (tagOffsetMs + (options.offsetMs ?? 0)) / 1000
    this._externalOffsetMs = options.offsetMs ?? 0

    this.audio.addEventListener("timeupdate", this.handleTimeUpdate)
    this.audio.addEventListener("play", () => this.emit("play"))
    this.audio.addEventListener("pause", () => this.emit("pause"))
    this.audio.addEventListener("ended", () => this.emit("ended"))
    this.audio.addEventListener("error", (e) => this.emit("error", e))
  }

  /** Wait for initialization (CBR conversion, etc.) before playing. */
  ready(): Promise<void> {
    return this._readyPromise
  }

  /** Create a new LyricPlayer instance and wait for it to be ready. */
  static async create(options: LyricPlayerOptions): Promise<LyricPlayer> {
    const player = new LyricPlayer(options)
    await player.ready()
    return player
  }

  /**
   * Auto-fetch lyrics from LRCLIB and create a ready player in one step.
   * Duration is detected from the audio element automatically.
   */
  static async fromLrclib(
    options: Omit<LyricPlayerOptions, "lyrics" | "lrclibResult"> & {
      lrclib: LrclibTrackInfo
    },
  ): Promise<LyricPlayer> {
    return LyricPlayer.create(options)
  }

  /**
   * Create a player from a previously fetched LRCLIB result, with no
   * additional network request. Lyrics and metadata are taken directly
   * from the result object.
   */
  static async fromLrclibResult(
    options: Omit<LyricPlayerOptions, "lyrics" | "lrclib"> & {
      lrclibResult: LrclibResult
    },
  ): Promise<LyricPlayer> {
    return LyricPlayer.create(options)
  }

  /** Detect if file is VBR or lacks proper seek tables. */
  private async detectNeedsCBR(src: string): Promise<boolean> {
    try {
      const file = await fetch(src).then((res) => res.blob())
      return await isVBR(file)
    } catch (e) {
      console.warn(
        "[lrc-audio-player] Failed to detect bitrate mode, assuming CBR is needed",
        e,
      )
      return true
    }
  }

  /** Convert audio to CBR using ffmpeg.wasm. */
  private async convertToCBR(src: string, bitrate: string): Promise<string> {
    const [{ FFmpeg }, { fetchFile }] = await Promise.all([
      import("@ffmpeg/ffmpeg"),
      import("@ffmpeg/util"),
    ])

    const ffmpeg = new FFmpeg()
    await ffmpeg.load()

    await ffmpeg.writeFile("input", await fetchFile(src))
    await ffmpeg.exec([
      "-i",
      "input",
      "-c:a",
      "libmp3lame",
      "-b:a",
      bitrate,
      "-minrate",
      bitrate,
      "-maxrate",
      bitrate,
      "-bufsize",
      "256k",
      "-preset",
      "ultrafast",
      "-fflags",
      "+fastseek",
      "-id3v2_version",
      "3",
      "output.mp3",
    ])

    const data = await ffmpeg.readFile("output.mp3")
    const bytes =
      typeof data === "string" ? new TextEncoder().encode(data) : data
    const blob = new Blob(
      // @ts-ignore - Uint8Array is valid per spec, TS types are overly strict
      [bytes],
      { type: "audio/mpeg" },
    )

    return URL.createObjectURL(blob)
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

    return lyrics as ParsedLyrics
  }

  /** Replace the loaded lyrics at any time (e.g. after fetching a file). */
  setLyrics(lyrics: LyricPlayerOptions["lyrics"]): void {
    const parsed = this.resolveLyrics(lyrics)
    ;(this.metadata as LyricMetadata) = parsed.metadata
    ;(this.lines as LyricLine[]).length = 0
    ;(this.lines as LyricLine[]).push(...parsed.lines)
    if (parsed.metadata.offset !== undefined) {
      this.offsetSeconds =
        (parsed.metadata.offset + this._externalOffsetMs) / 1000
    }
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

  async play(): Promise<void> {
    await this.ready()
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
    if (line) this.seek(line.time - this.offsetSeconds)
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

  /** The previous lyric line before the current one, if any. */
  getPreviousLine(): LyricLine | null {
    const prev = this.lines[this.currentIndex - 1]
    return prev ?? null
  }

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
    const newTokenIndex = this.getCurrentTokenIndex()

    if (newIndex !== this.currentIndex) {
      this.currentIndex = newIndex
      this.emit("linechange", this.getCurrentLine(), newIndex)
    }

    if (newTokenIndex !== this.currentTokenIndex) {
      this.currentTokenIndex = newTokenIndex
      this.emit("tokenchange", this.getCurrentLine(), this.currentIndex)
    }

    this.emit("timeupdate", time)
  }

  /** Remove all listeners and detach from the underlying audio element. */
  destroy(): void {
    this.audio.removeEventListener("timeupdate", this.handleTimeUpdate)
    this.audio.pause()
    if (this.audio.src.startsWith("blob:")) {
      URL.revokeObjectURL(this.audio.src)
    }
    this.listeners = {}
  }
}
