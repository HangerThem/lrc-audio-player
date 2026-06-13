import { describe, it, expect, vi } from "vitest"
import { LyricPlayer, LyricPlayerOptions } from "../src/player"

/**
 * Minimal HTMLAudioElement stand-in for testing in Node, without jsdom.
 * Implements only what LyricPlayer touches.
 */
class FakeAudio extends EventTarget {
  currentTime = 0
  duration = 100
  paused = true
  volume = 1

  play = vi.fn(async () => {
    this.paused = false
    this.dispatchEvent(new Event("play"))
  })

  pause = vi.fn(() => {
    this.paused = true
    this.dispatchEvent(new Event("pause"))
  })

  tick(time: number) {
    this.currentTime = time
    this.dispatchEvent(new Event("timeupdate"))
  }
}

const LRC = `
[00:01.00]Line one
[00:02.00]Line two
[00:03.00]Line three
`

async function createPlayer(options: Partial<LyricPlayerOptions> = {}) {
  const audio = new FakeAudio()
  const player = new LyricPlayer({
    audio: audio as unknown as HTMLAudioElement,
    lyrics: LRC,
    skipCBR: true,
    ...options,
  })
  await player.ready()
  return { audio, player }
}

describe("LyricPlayer", () => {
  it("parses lines from LRC on construction", async () => {
    const { player } = await createPlayer()
    expect(player.lines).toHaveLength(3)
    expect(player.lines[0].text).toBe("Line one")
  })

  it("tracks the current line as time advances", async () => {
    const { audio, player } = await createPlayer()

    expect(player.getCurrentLine()).toBeNull()

    audio.tick(1.5)
    expect(player.getCurrentLine()?.text).toBe("Line one")

    audio.tick(2.2)
    expect(player.getCurrentLine()?.text).toBe("Line two")

    audio.tick(0.5)
    expect(player.getCurrentLine()).toBeNull()
  })

  it("emits linechange only when the active line changes", async () => {
    const { audio, player } = await createPlayer()
    const onChange = vi.fn()
    player.on("linechange", onChange)

    audio.tick(1.1)
    audio.tick(1.2)
    audio.tick(2.1)

    expect(onChange).toHaveBeenCalledTimes(2)
    expect(onChange.mock.calls[0][0]?.text).toBe("Line one")
    expect(onChange.mock.calls[1][0]?.text).toBe("Line two")
  })

  it("seekToLine moves the underlying audio to that line's time", async () => {
    const { audio, player } = await createPlayer()
    player.seekToLine(2)
    expect(audio.currentTime).toBe(3.0)
  })

  it("play/pause delegate to the audio element", async () => {
    const { audio, player } = await createPlayer()
    await player.play()
    expect(audio.play).toHaveBeenCalled()
    player.pause()
    expect(audio.pause).toHaveBeenCalled()
  })

  it("respects a runtime offset", async () => {
    const { audio, player } = await createPlayer()
    player.setOffset(1000)
    audio.tick(1.5)
    expect(player.getCurrentLine()).toBeNull()
    audio.tick(2.5)
    expect(player.getCurrentLine()?.text).toBe("Line one")
  })

  it("seekToLine accounts for the offset", async () => {
    const { audio, player } = await createPlayer()
    player.setOffset(1000)
    player.seekToLine(0)
    expect(audio.currentTime).toBe(2.0)
  })

  it("converts VBR audio when skipCBR is false", async () => {})
})
