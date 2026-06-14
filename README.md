# lrc-audio-player

[![npm version](https://img.shields.io/npm/v/lrc-audio-player)](https://www.npmjs.com/package/lrc-audio-player)
[![npm downloads](https://img.shields.io/npm/dm/lrc-audio-player)](https://www.npmjs.com/package/lrc-audio-player)
[![bundle size](https://img.shields.io/bundlephobia/minzip/lrc-audio-player)](https://bundlephobia.com/package/lrc-audio-player)
[![license](https://img.shields.io/npm/l/lrc-audio-player)](./LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-ready-blue?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

Time-synced lyrics for the browser.

`lrc-audio-player` wraps an `HTMLAudioElement` and keeps LRC lyrics (including
word-level timing) in sync with playback and seeking. It can also convert audio
to CBR in-browser with `ffmpeg.wasm` to reduce post-seek drift, and integrates
with [LRCLIB](https://lrclib.net) to fetch synced lyrics automatically.

## What's New (v0.2.3)

- **LRCLIB integration** - search and fetch synced/unsynced lyrics via `searchLrclib` and `fetchFromLrclib`.
- **React hooks** - `useLyricPlayer` and `useLrclibSearch` available at `lrc-audio-player/react`.
- **CBR conversion** - optional in-browser transcoding using `@ffmpeg/ffmpeg` + `@ffmpeg/util` for reliable seeking.
- **Factory helpers** - `LyricPlayer.fromLrclib` and `LyricPlayer.fromLrclibResult`.

## Features

- Parse standard and enhanced LRC (`<mm:ss.xx>` word timing)
- Support repeated timestamps and common metadata tags (`[ti]`, `[ar]`, `[al]`, `[by]`, `[au]`, `[offset]`)
- Fast line lookup via binary search (`findLineIndexAtTime`)
- Runtime lyric replacement (`setLyrics`) and offset control (`setOffset`)
- Optional LRCLIB lookup (`lrclib` option, `lrclibResult` option, or `fromLrclib` / `fromLrclibResult`)
- Optional React hooks (`useLyricPlayer`, `useLrclibSearch`)
- Optional CBR transcoding using `@ffmpeg/ffmpeg` + `@ffmpeg/util`

## Install

```bash
npm install lrc-audio-player
```

Optional peer dependencies:

```bash
# Needed for automatic CBR conversion
npm install @ffmpeg/ffmpeg @ffmpeg/util

# Needed only if you use React hooks
npm install react
```

If you do not install the ffmpeg packages, set `skipCBR: true`.

## Quick Start

```ts
import { LyricPlayer } from "lrc-audio-player"

const lrcText = await fetch("/song.lrc").then((r) => r.text())

const player = await LyricPlayer.create({
  audio: "/song.mp3",
  lyrics: lrcText,
})

player.on("linechange", (line, index) => {
  console.log(index, line?.text)
})

await player.play()
```

You can also pass an existing audio element:

```ts
const audioEl = document.querySelector("audio")!

const player = await LyricPlayer.create({
  audio: audioEl,
  lyrics: lrcText,
})
```

## Lyric Inputs

Lyrics can be provided in several formats:

- LRC string
- JSON lines array (`LyricLine[]`)
- JSON string (`[{"time":1.2,"text":"..."}]`)
- Parsed object (`ParsedLyrics`)
- Tagged source object (`LyricSource`)

```ts
await LyricPlayer.create({
  audio: "/song.mp3",
  lyrics: [
    { time: 0, text: "First line" },
    { time: 3.5, text: "Second line" },
  ],
})
```

Enhanced LRC example (word-level timing):

```lrc
[00:05.50]<00:05.50>Hello <00:06.00>world
```

## CBR Behavior

When `skipCBR` is `false` (default), the player checks whether conversion is
needed and may transcode audio to CBR MP3 for more stable seeking behavior.

- MP3 sources are probed for common VBR headers (`Xing`, `Info`, `VBRI`)
- Sources that cannot be confidently identified are treated conservatively
  and may be converted

Set `skipCBR: true` if your files are already seek-accurate and you want to
skip transcoding.

## LRCLIB Integration

If `lyrics` is omitted and `lrclib` metadata is provided, the player
auto-fetches lyrics from LRCLIB. Duration is detected from the audio element
automatically - no need to pass it manually.

```ts
const player = await LyricPlayer.create({
  audio: "/song.mp3",
  lrclib: {
    trackName: "Creep",
    artistName: "Radiohead",
    albumName: "Pablo Honey",
  },
})

player.on("instrumental", () => {
  console.log("Track is marked instrumental - no lyrics available")
})
```

Convenience factory shorthand:

```ts
const player = await LyricPlayer.fromLrclib({
  audio: "/song.mp3",
  lrclib: { trackName: "Creep", artistName: "Radiohead" },
})
```

If you already have a search result (e.g. from `searchLrclib` or
`useLrclibSearch`) and want to create a player from it without a second
network request, use `lrclibResult` or `fromLrclibResult`:

```ts
// Via option
const player = await LyricPlayer.create({
  audio: "/song.mp3",
  lrclibResult: result,
})

// Via factory helper
const player = await LyricPlayer.fromLrclibResult({
  audio: "/song.mp3",
  lrclibResult: result,
})
```

To search LRCLIB directly without creating a player:

```ts
import { searchLrclib, fetchFromLrclib } from "lrc-audio-player"

// Fuzzy search - returns an array of results
const results = await searchLrclib("Radiohead Creep")

// Exact/best match - returns a single result or null
const result = await fetchFromLrclib({
  trackName: "Creep",
  artistName: "Radiohead",
  albumName: "Pablo Honey",
})
```

## React

Import hooks from the dedicated subpath to avoid pulling browser-only code
into SSR environments:

```ts
import { useLyricPlayer, useLrclibSearch } from "lrc-audio-player/react"
```

### `useLyricPlayer`

Bind a player to an `<audio>` ref and keep lyric state in sync automatically.
Must be used in a Client Component.

```tsx
"use client"

import { useLyricPlayer } from "lrc-audio-player/react"

export function Player({ lrcText }: { lrcText: string }) {
  const {
    audioRef,
    currentLine,
    lines,
    isLoading,
    isPlaying,
    currentTime,
    duration,
    play,
    pause,
    seekToLine,
  } = useLyricPlayer({
    audio: "/song.mp3",
    lyrics: lrcText,
  })

  return (
    <>
      <audio ref={audioRef} />
      {isLoading && <p>Loading…</p>}
      <ul>
        {lines.map((line, i) => (
          <li
            key={i}
            onClick={() => seekToLine(i)}
            style={{ fontWeight: line === currentLine ? "bold" : "normal" }}
          >
            {line.text}
          </li>
        ))}
      </ul>
      <button onClick={isPlaying ? pause : play}>
        {isPlaying ? "Pause" : "Play"}
      </button>
    </>
  )
}
```

You can also pass `lrclib` or `lrclibResult` to fetch lyrics automatically:

```tsx
const { audioRef, currentLine, instrumental } = useLyricPlayer({
  audio: "/song.mp3",
  lrclib: { trackName: "Creep", artistName: "Radiohead" },
})
```

Or load a picked search result without refetching:

```tsx
const [selectedResult, setSelectedResult] = useState<LrclibResult | null>(null)

const { audioRef, currentLine } = useLyricPlayer({
  audio: "/song.mp3",
  lrclibResult: selectedResult,
})
```

### `useLrclibSearch`

Search LRCLIB on demand. Call `search()` manually - on button click or
Enter key - to trigger the fetch.

```tsx
"use client"

import { useState } from "react"
import { useLrclibSearch } from "lrc-audio-player/react"

export function LyricsSearch({ onSelect }) {
  const [query, setQuery] = useState("")
  const { results, isLoading, error, search } = useLrclibSearch(query)

  return (
    <>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && search()}
        placeholder="Search for songs…"
      />
      <button onClick={search} disabled={!query || isLoading}>
        Search
      </button>
      {error && <p>Error: {error.message}</p>}
      <ul>
        {results.map((result, i) => (
          <li
            key={i}
            onClick={() => onSelect(result)}
            style={{ cursor: "pointer" }}
          >
            {result.artistName} - {result.trackName}
            {result.instrumental && " (Instrumental)"}
            {!result.syncedLyrics && !result.instrumental && " (Unsynced only)"}
          </li>
        ))}
      </ul>
    </>
  )
}
```

## API

### `LyricPlayer.create(options)`

Recommended async factory. Returns a fully initialized, ready-to-use player.

### `new LyricPlayer(options)`

Immediate constructor. Call `await player.ready()` before relying on
playback or lyric state.

### Options

| Option         | Type                                                   | Default  | Notes                                                           |
| -------------- | ------------------------------------------------------ | -------- | --------------------------------------------------------------- |
| `audio`        | `string \| HTMLAudioElement`                           | -        | URL/path or existing element                                    |
| `lyrics`       | `string \| LyricLine[] \| ParsedLyrics \| LyricSource` | -        | Optional; LRCLIB is used as fallback when omitted               |
| `offsetMs`     | `number`                                               | `0`      | Added on top of any `[offset:]` tag in the LRC file             |
| `skipCBR`      | `boolean`                                              | `false`  | Skip in-browser CBR transcoding                                 |
| `cbrBitrate`   | `string`                                               | `'128k'` | Target bitrate for CBR conversion                               |
| `lrclib`       | `LrclibTrackInfo`                                      | -        | Auto-fetch lyrics from LRCLIB; ignored if `lyrics` is set       |
| `lrclibResult` | `LrclibResult`                                         | -        | Use a pre-fetched result directly; takes priority over `lrclib` |

### Factory Helpers

- `LyricPlayer.fromLrclib(options)` - shorthand for `create()` with `lrclib` metadata; auto-fetches lyrics before returning.
- `LyricPlayer.fromLrclibResult(options)` - shorthand for `create()` with a pre-fetched `LrclibResult`; no network request is made.

### Methods

| Method                         | Description                                                 |
| ------------------------------ | ----------------------------------------------------------- |
| `ready()`                      | Resolves when initialization (including CBR) is complete    |
| `play()`                       | Start playback                                              |
| `pause()`                      | Pause playback                                              |
| `toggle()`                     | Toggle play/pause                                           |
| `seek(seconds)`                | Seek to a time in seconds                                   |
| `seekToLine(index)`            | Seek to the start of a lyric line                           |
| `setLyrics(source)`            | Replace lyrics at runtime                                   |
| `setOffset(ms)`                | Adjust the lyric offset at runtime                          |
| `getCurrentLine()`             | Currently active `LyricLine`, or `null`                     |
| `getCurrentIndex()`            | Index of the active line (`-1` if none)                     |
| `getNextLine()`                | The line after the active one, or `null`                    |
| `getCurrentToken()`            | Active word-level token, or `null`                          |
| `getCurrentTokenIndex()`       | Index of the active token (`-1` if none)                    |
| `findLineIndexAtTime(seconds)` | Look up the active line at any time without affecting state |
| `destroy()`                    | Remove listeners and stop audio                             |

### Properties

| Property      | Type               | Notes                                     |
| ------------- | ------------------ | ----------------------------------------- |
| `audio`       | `HTMLAudioElement` | The underlying element                    |
| `lines`       | `LyricLine[]`      | All parsed lyric lines                    |
| `metadata`    | `LyricMetadata`    | Parsed LRC tags (title, artist, album, …) |
| `currentTime` | `number`           | Current playback position                 |
| `duration`    | `number`           | Total audio duration                      |
| `paused`      | `boolean`          | Whether audio is paused                   |
| `volume`      | `number`           | Playback volume (0–1)                     |

### Events

Use `player.on(event, handler)` and `player.off(event, handler)`.

| Event          | Payload                                    |
| -------------- | ------------------------------------------ |
| `linechange`   | `(line: LyricLine \| null, index: number)` |
| `timeupdate`   | `(currentTime: number)`                    |
| `play`         | `()`                                       |
| `pause`        | `()`                                       |
| `ended`        | `()`                                       |
| `error`        | `(event: Event)`                           |
| `instrumental` | `()`                                       |

## Utility Exports

```ts
// Vanilla - safe in any environment
import {
  LyricPlayer,
  parseLRC,
  parseJSONLyrics,
  fetchFromLrclib,
  searchLrclib,
} from "lrc-audio-player"

// React hooks - client-only, import from the subpath
import { useLyricPlayer, useLrclibSearch } from "lrc-audio-player/react"
```

## Development

```bash
npm install
npm run build
npm test
npm run typecheck
```

## License

MIT
