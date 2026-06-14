import { afterEach, describe, it, expect, vi } from "vitest"
import { LyricPlayer, LyricPlayerOptions } from "../src/player"
import * as lrclibModule from "../src/lrclib"

/**
 * Minimal HTMLAudioElement stand-in for testing in Node, without jsdom.
 * Implements only what LyricPlayer touches.
 */
class FakeAudio extends EventTarget {
  src = ""
  currentSrc = ""
  currentTime = 0
  duration = 100
  paused = true
  volume = 1

  load = vi.fn(() => {
    this.dispatchEvent(new Event("loadedmetadata"))
  })

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

afterEach(() => {
  vi.restoreAllMocks()
})

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

  it("replaces lyrics at runtime with setLyrics", async () => {
    const { audio, player } = await createPlayer()
    audio.tick(2.2)
    expect(player.getCurrentLine()?.text).toBe("Line two")

    player.setLyrics("[00:00.50]New line")

    expect(player.lines).toHaveLength(1)
    expect(player.lines[0].text).toBe("New line")
    expect(player.getCurrentLine()?.text).toBe("New line")
  })

  it("returns the active token for enhanced LRC", async () => {
    const { audio, player } = await createPlayer({
      lyrics: "[00:05.50]<00:05.50>Second <00:06.00>line <00:06.50>here",
    })

    audio.tick(5.6)
    expect(player.getCurrentTokenIndex()).toBe(0)
    expect(player.getCurrentToken()?.text).toBe("Second ")

    audio.tick(6.1)
    expect(player.getCurrentTokenIndex()).toBe(1)
    expect(player.getCurrentToken()?.text).toBe("line ")
  })

  it("removes listeners with off", async () => {
    const { audio, player } = await createPlayer()
    const onChange = vi.fn()
    player.on("linechange", onChange)
    player.off("linechange", onChange)

    audio.tick(1.1)
    expect(onChange).not.toHaveBeenCalled()
  })

  it("loads synced lyrics from LRCLIB when lyrics are omitted", async () => {
    vi.spyOn(lrclibModule, "fetchFromLrclib").mockResolvedValue({
      id: 1,
      trackName: "Song",
      artistName: "Artist",
      albumName: "Album",
      duration: 123,
      instrumental: false,
      plainLyrics: null,
      syncedLyrics: "[00:01.00]From LRCLIB",
      lyricsfile: null,
    })

    const audio = new FakeAudio()
    audio.src = "/song.mp3"

    const player = new LyricPlayer({
      audio: audio as unknown as HTMLAudioElement,
      lrclib: { trackName: "Song", artistName: "Artist", albumName: "Album" },
      skipCBR: true,
    })
    await player.ready()

    expect(player.lines).toHaveLength(1)
    expect(player.lines[0].text).toBe("From LRCLIB")
    expect(lrclibModule.fetchFromLrclib).toHaveBeenCalledWith(
      { trackName: "Song", artistName: "Artist", albumName: "Album" },
      100,
    )
  })

  it("emits instrumental when LRCLIB marks a track as instrumental", async () => {
    vi.spyOn(lrclibModule, "fetchFromLrclib").mockResolvedValue({
      id: 2,
      trackName: "Instrumental",
      artistName: "Artist",
      albumName: "Album",
      duration: 120,
      instrumental: true,
      plainLyrics: null,
      syncedLyrics: null,
      lyricsfile: null,
    })

    const audio = new FakeAudio()
    audio.src = "/song.mp3"
    audio.duration = Number.NaN

    const player = new LyricPlayer({
      audio: audio as unknown as HTMLAudioElement,
      lrclib: { trackName: "Instrumental" },
      skipCBR: true,
    })

    const instrumental = vi.fn()
    player.on("instrumental", instrumental)

    audio.dispatchEvent(new Event("loadedmetadata"))
    await player.ready()

    expect(instrumental).toHaveBeenCalledTimes(1)
    expect(player.lines).toHaveLength(0)
  })

  it("warns when only unsynced LRCLIB lyrics are available", async () => {
    vi.spyOn(lrclibModule, "fetchFromLrclib").mockResolvedValue({
      id: 3,
      trackName: "Unsynced",
      artistName: "Artist",
      albumName: "Album",
      duration: 111,
      instrumental: false,
      plainLyrics: "plain only",
      syncedLyrics: null,
      lyricsfile: null,
    })
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})

    const audio = new FakeAudio()
    audio.src = "/song.mp3"

    const player = new LyricPlayer({
      audio: audio as unknown as HTMLAudioElement,
      lrclib: { trackName: "Unsynced" },
      skipCBR: true,
    })
    await player.ready()

    expect(warn).toHaveBeenCalledOnce()
    expect(player.lines).toHaveLength(0)
  })

  it("converts VBR audio when skipCBR is false", async () => {
    vi.spyOn(LyricPlayer.prototype as any, "detectNeedsCBR").mockResolvedValue(
      true,
    )
    vi.spyOn(LyricPlayer.prototype as any, "convertToCBR").mockResolvedValue(
      "blob:converted-audio",
    )

    const audio = new FakeAudio()
    audio.src = "/song.mp3"

    const player = new LyricPlayer({
      audio: audio as unknown as HTMLAudioElement,
      lyrics: LRC,
      skipCBR: false,
    })
    await player.ready()

    expect((LyricPlayer.prototype as any).detectNeedsCBR).toHaveBeenCalledWith(
      "/song.mp3",
    )
    expect((LyricPlayer.prototype as any).convertToCBR).toHaveBeenCalledWith(
      "/song.mp3",
      "128k",
    )
    expect(player.audio.src).toBe("blob:converted-audio")
  })
})
