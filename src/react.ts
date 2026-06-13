"use client"

import { useEffect, useRef, useState } from "react"
import { LyricPlayer } from "./player"
import type { LyricLine, LyricPlayerOptions } from "./types"
import type { LyricSource } from "./player"

export interface UseLyricPlayerOptions extends Omit<
  LyricPlayerOptions,
  "audio"
> {
  /** Audio source URL. Set on the bound <audio> element. */
  audio?: string
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
 * const { audioRef, currentLine, lines, player } = useLyricPlayer({
 *   audio: '/song.mp3',
 *   lyrics: lrcText,
 * });
 *
 * return (
 *   <>
 *     <audio ref={audioRef} controls />
 *     <p>{currentLine?.text}</p>
 *   </>
 * );
 * ```
 *
 * The player is recreated whenever `audio` or `lyrics` change. If you're
 * fetching lyrics asynchronously, wait until they're loaded before calling
 * this hook (or pass `lyrics: ''` while loading - an empty string parses
 * to zero lines and is cheap to recreate).
 */
export function useLyricPlayer(
  options: UseLyricPlayerOptions,
): UseLyricPlayerResult {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [player, setPlayer] = useState<LyricPlayer | null>(null)
  const [currentLine, setCurrentLine] = useState<LyricLine | null>(null)
  const [currentIndex, setCurrentIndex] = useState(-1)
  const [lines, setLines] = useState<LyricLine[]>([])

  // Keep latest options in a ref so the effect doesn't need them in deps
  // beyond the values that should actually trigger recreation.
  const optionsRef = useRef(options)
  optionsRef.current = options

  useEffect(() => {
    const audioEl = audioRef.current
    if (!audioEl) return

    const { audio, lyrics, offsetMs } = optionsRef.current
    if (audio) audioEl.src = audio

    const instance = new LyricPlayer({
      audio: audioEl,
      lyrics,
      offsetMs,
    })

    setPlayer(instance)
    setLines(instance.lines)
    setCurrentLine(null)
    setCurrentIndex(-1)

    instance.on("linechange", (line, index) => {
      setCurrentLine(line)
      setCurrentIndex(index)
    })

    return () => {
      instance.destroy()
      setPlayer(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options.audio, options.lyrics, options.offsetMs])

  return { player, audioRef, currentLine, currentIndex, lines }
}

export type { LyricSource }
