"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import { LyricPlayer } from "./player"
import type { LyricLine, LyricPlayerOptions } from "./types"
import type { LyricSource } from "./player"

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
  /** All parsed lyric lines (empty until lyrics are loaded). */
  lines: LyricLine[]
  /** Whether the player is initializing (CBR conversion in progress). */
  isLoading: boolean
  /** Error if initialization failed. */
  error: Error | null
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
 * const { audioRef, currentLine, lines, player, isLoading } = useLyricPlayer({
 *   audio: '/song.mp3',
 *   lyrics: lrcText,
 * });
 *
 * return (
 *   <>
 *     <audio ref={audioRef} controls />
 *     {isLoading && <p>Loading audio…</p>}
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
  const [lines, setLines] = useState<LyricLine[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  // Keep latest options in a ref so the effect doesn't need them in deps
  // beyond the values that should actually trigger recreation.
  const optionsRef = useRef(options)
  optionsRef.current = options

  useEffect(() => {
    const audioEl = audioRef.current
    if (!audioEl) return

    const { audio, lyrics, offsetMs, skipCBR, cbrBitrate } = optionsRef.current
    if (audio) audioEl.src = audio

    let cancelled = false

    setIsLoading(true)
    setError(null)
    setPlayer(null)
    setLines([])
    setCurrentLine(null)
    setCurrentIndex(-1)

    // Async initialization
    LyricPlayer.create({
      audio: audioEl,
      lyrics,
      offsetMs,
      skipCBR,
      cbrBitrate,
    })
      .then((instance) => {
        if (cancelled) {
          instance.destroy()
          return
        }

        setPlayer(instance)
        setLines(instance.lines)
        setIsLoading(false)

        instance.on("linechange", (line, index) => {
          setCurrentLine(line)
          setCurrentIndex(index)
        })
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err : new Error(String(err)))
          setIsLoading(false)
        }
      })

    return () => {
      cancelled = true
      // Note: we can't await destroy() in cleanup, but it's sync enough
      setPlayer((prev) => {
        prev?.destroy()
        return null
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    options.audio,
    options.lyrics,
    options.offsetMs,
    options.skipCBR,
    options.cbrBitrate,
  ])

  return {
    player,
    audioRef,
    currentLine,
    currentIndex,
    lines,
    isLoading,
    error,
  }
}

export type { LyricSource }
