"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import { LyricPlayer } from "./player"
import type { LyricLine, LyricPlayerOptions, LyricToken } from "./types"
import { searchLrclib } from "./lrclib"
import type { LrclibResult, LrclibTrackInfo } from "./lrclib"

export interface UseLyricPlayerOptions extends Omit<
  LyricPlayerOptions,
  "audio"
> {
  /** Audio source URL. Set on the bound <audio> element. */
  audio?: string
  /** Skip CBR conversion if your audio is already constant bitrate. */
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
   * Pass a result from `useLrclibSearch` to let the user pick which track
   * to load without refetching.
   *
   * Note: pass a stable reference (e.g. from useState) to avoid triggering
   * unnecessary re-initializations.
   */
  lrclibResult?: LrclibResult | null
}

export interface UseLyricPlayerResult {
  /** The underlying player instance (null until mounted and ready). */
  player: LyricPlayer | null
  /** Ref to attach to your <audio> element. */
  audioRef: React.RefObject<HTMLAudioElement | null>
  /** The currently active lyric line, or null before the first line. */
  currentLine: LyricLine | null
  /** Index of the currently active lyric line (-1 if none yet). */
  currentIndex: number
  /** The currently active word/token (for word-level LRC), or null. */
  currentToken: LyricToken | null
  /** All parsed lyric lines (empty until lyrics are loaded). */
  lines: LyricLine[]
  /** Whether the player is initializing (CBR conversion in progress). */
  isLoading: boolean
  /** Error if initialization failed. */
  error: Error | null
  /** Whether audio is currently playing. */
  isPlaying: boolean
  /** Current playback time in seconds. */
  currentTime: number
  /** Total audio duration in seconds (0 if unknown). */
  duration: number
  /** Whether the track is instrumental (no lyrics). */
  instrumental: boolean
  /** Jump to a specific time in seconds. */
  seek: (timeSeconds: number) => void
  /** Jump to the start of a specific lyric line. */
  seekToLine: (index: number) => void
  /** Play the audio. */
  play: () => Promise<void>
  /** Pause the audio. */
  pause: () => void
  /** Toggle play/pause. */
  toggle: () => Promise<void> | void
}

/**
 * React hook that creates a {@link LyricPlayer} bound to an `<audio>`
 * element via ref, and keeps the active lyric line in sync with React
 * state via the `linechange` event.
 *
 * Must be used in a Client Component - `LyricPlayer` requires a real
 * `HTMLAudioElement`, which doesn't exist during SSR.
 *
 * ```tsx
 * 'use client';
 *
 * const { audioRef, currentLine, lines, isLoading, isPlaying } = useLyricPlayer({
 *   audio: '/song.mp3',
 *   lyrics: lrcText,
 * });
 *
 * return (
 *   <>
 *     <audio ref={audioRef} controls />
 *     {isLoading && <p>Loading…</p>}
 *     <p>{currentLine?.text}</p>
 *   </>
 * );
 * ```
 */
export function useLyricPlayer(
  options: UseLyricPlayerOptions,
): UseLyricPlayerResult {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [player, setPlayer] = useState<LyricPlayer | null>(null)
  const [currentLine, setCurrentLine] = useState<LyricLine | null>(null)
  const [currentIndex, setCurrentIndex] = useState(-1)
  const [currentToken, setCurrentToken] = useState<LyricToken | null>(null)
  const [lines, setLines] = useState<LyricLine[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [instrumental, setInstrumental] = useState(false)

  const optionsRef = useRef(options)
  optionsRef.current = options

  useEffect(() => {
    const audioEl = audioRef.current
    if (!audioEl) return

    const {
      audio,
      lyrics,
      offsetMs,
      skipCBR,
      cbrBitrate,
      lrclib,
      lrclibResult,
    } = optionsRef.current
    if (audio) audioEl.src = audio

    let cancelled = false

    setIsLoading(true)
    setError(null)
    setPlayer(null)
    setLines([])
    setCurrentLine(null)
    setCurrentIndex(-1)
    setCurrentToken(null)
    setIsPlaying(false)
    setCurrentTime(0)
    setDuration(0)
    setInstrumental(false)

    LyricPlayer.create({
      audio: audioEl,
      lyrics,
      offsetMs,
      skipCBR,
      cbrBitrate,
      lrclib,
      lrclibResult: lrclibResult ?? undefined,
    })
      .then((instance) => {
        if (cancelled) {
          instance.destroy()
          return
        }

        setPlayer(instance)
        setLines(instance.lines)
        setIsLoading(false)

        if (!isNaN(instance.duration)) {
          setDuration(instance.duration)
        }

        instance.audio.addEventListener("loadedmetadata", () => {
          setDuration(instance.duration)
        })

        instance.on("linechange", (line, index) => {
          setCurrentLine(line)
          setCurrentIndex(index)
        })

        instance.on("timeupdate", (time) => {
          setCurrentTime(time)
          setCurrentToken(instance.getCurrentToken())
        })

        instance.on("instrumental", () => setInstrumental(true))
        instance.on("play", () => setIsPlaying(true))
        instance.on("pause", () => setIsPlaying(false))
        instance.on("ended", () => setIsPlaying(false))
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err : new Error(String(err)))
          setIsLoading(false)
        }
      })

    return () => {
      cancelled = true
      setPlayer((prev) => {
        prev?.destroy()
        return null
      })
    }
  }, [
    options.audio,
    options.lyrics,
    options.offsetMs,
    options.skipCBR,
    options.cbrBitrate,
    options.lrclib,
    options.lrclibResult, // stable ref from useState - re-initializes when user picks a result
  ])

  const seek = useCallback(
    (timeSeconds: number) => {
      player?.seek(timeSeconds)
    },
    [player],
  )

  const seekToLine = useCallback(
    (index: number) => {
      player?.seekToLine(index)
    },
    [player],
  )

  const play = useCallback(() => {
    return player?.play() ?? Promise.resolve()
  }, [player])

  const pause = useCallback(() => {
    player?.pause()
  }, [player])

  const toggle = useCallback(() => {
    return player?.toggle()
  }, [player])

  return {
    player,
    audioRef,
    currentLine,
    currentIndex,
    currentToken,
    lines,
    isLoading,
    error,
    isPlaying,
    currentTime,
    duration,
    instrumental,
    seek,
    seekToLine,
    play,
    pause,
    toggle,
  }
}

/**
 * React hook to search LRCLIB for tracks matching a query string.
 * Returns results with metadata and lyrics availability. Call `search()`
 * manually (e.g. on button click or Enter key) to trigger the fetch.
 *
 * ```tsx
 * 'use client';
 *
 * const [query, setQuery] = useState('')
 * const { results, isLoading, error, search } = useLrclibSearch(query)
 *
 * return (
 *   <>
 *     <input value={query} onChange={(e) => setQuery(e.target.value)}
 *            onKeyDown={(e) => e.key === 'Enter' && search()} />
 *     <button onClick={search} disabled={!query || isLoading}>Search</button>
 *     {results.map((r) => (
 *       <div key={r.trackName}>{r.artistName} - {r.trackName}</div>
 *     ))}
 *   </>
 * )
 * ```
 */
export function useLrclibSearch(query: string | null) {
  const [results, setResults] = useState<LrclibResult[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const cancelledRef = useRef(false)

  useEffect(() => {
    return () => {
      cancelledRef.current = true
    }
  }, [])

  const search = useCallback(async () => {
    if (!query) return

    cancelledRef.current = false
    setIsLoading(true)
    setError(null)

    try {
      const r = await searchLrclib(query)
      if (!cancelledRef.current) setResults(r)
    } catch (e) {
      if (!cancelledRef.current)
        setError(e instanceof Error ? e : new Error(String(e)))
    } finally {
      if (!cancelledRef.current) setIsLoading(false)
    }
  }, [query])

  return { results, isLoading, error, search }
}

export type { LyricSource } from "./player"
