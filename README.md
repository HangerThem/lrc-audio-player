# lrc-audio-player

Time-synced lyrics for the browser.

`lrc-audio-player` wraps an `HTMLAudioElement` and keeps LRC lyrics (including
word-level timing) in sync with playback and seeking. It can also convert audio
to CBR in-browser with `ffmpeg.wasm` to reduce post-seek drift.

## Features

- Parse standard and enhanced LRC (`<mm:ss.xx>` word timing)
- Support repeated timestamps and common metadata tags (`[ti]`, `[ar]`, `[al]`, `[by]`, `[au]`, `[offset]`)
- Fast line lookup via binary search (`findLineIndexAtTime`)
- Runtime lyric replacement (`setLyrics`) and offset control (`setOffset`)
- Optional LRCLIB lookup (`lrclib` option or `fromLrclib`)
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

If you do not install ffmpeg packages, set `skipCBR: true`.

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

You can provide lyrics as:

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

Enhanced LRC example:

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
avoid transcoding.

## LRCLIB Integration

If `lyrics` is omitted and `lrclib` metadata is provided, the player attempts
to fetch lyrics from LRCLIB.

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
  console.log("Track is marked instrumental")
})
```

You can also use:

```ts
const player = await LyricPlayer.fromLrclib({
  audio: "/song.mp3",
  lrclib: {
    trackName: "Creep",
    artistName: "Radiohead",
    albumName: "Pablo Honey",
  },
})
```

## API

### `LyricPlayer.create(options)`

Recommended async factory. Returns a ready player.

### `new LyricPlayer(options)`

Immediate constructor. Call `await player.ready()` before relying on
playback/lyrics state.

### Options

| Option       | Type                                                   | Notes                                    |
| ------------ | ------------------------------------------------------ | ---------------------------------------- |
| `audio`      | `string \| HTMLAudioElement`                           | URL/source or existing element           |
| `lyrics`     | `string \| LyricLine[] \| ParsedLyrics \| LyricSource` | Optional; if missing, LRCLIB can be used |
| `offsetMs`   | `number`                                               | Added to parsed `[offset]` during init   |
| `skipCBR`    | `boolean`                                              | Default `false`                          |
| `cbrBitrate` | `string`                                               | Default `'128k'`                         |
| `lrclib`     | `LrclibTrackInfo`                                      | Optional LRCLIB fetch metadata           |

### Core Methods

- `ready()`
- `play()` / `pause()` / `toggle()`
- `seek(seconds)` / `seekToLine(index)`
- `setLyrics(source)`
- `setOffset(ms)` (sets runtime offset directly)
- `getCurrentLine()` / `getCurrentIndex()` / `getNextLine()`
- `getCurrentToken()` / `getCurrentTokenIndex()`
- `findLineIndexAtTime(seconds)`
- `destroy()`

### Properties

- `audio`
- `lines`
- `metadata`
- `currentTime`
- `duration`
- `paused`
- `volume`

### Events

Use `on(event, handler)` and `off(event, handler)`.

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
import {
  parseLRC,
  parseJSONLyrics,
  searchLrclib,
  useLyricPlayer,
  useLrclibSearch,
} from "lrc-audio-player"
```

React-focused import path is also available:

```ts
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
