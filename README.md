# lrc-audio-player

Sync LRC (and word-level "enhanced" LRC) lyrics to an `HTMLAudioElement`
with accurate seeking. Automatically converts variable-bitrate (VBR)
audio to constant bitrate (CBR) for precise `currentTime` synchronization
— critical for lyrics that must stay locked to the audio.

## Install

```bash
npm install lrc-audio-player
```

**Optional:** If you need CBR conversion (recommended), also install:

```bash
npm install @ffmpeg/ffmpeg @ffmpeg/util
```

> `ffmpeg.wasm` is loaded on-demand and only when needed. If you skip
> installing it, you must set `skipCBR: true` and provide CBR-encoded
> audio files yourself.

## Quick start

```ts
import { LyricPlayer } from 'lrc-audio-player';

const lrcText = await fetch('/song.lrc').then((r) => r.text());

// Async factory — handles CBR conversion in the background
const player = await LyricPlayer.create({
  audio: '/song.mp3',
  lyrics: lrcText,
});

player.on('linechange', (line, index) => {
  console.log(index, line?.text);
});

player.play();
```

You can also hand it an existing `<audio>` element instead of a URL:

```ts
const audioEl = document.querySelector('audio')!;
const player = await LyricPlayer.create({ audio: audioEl, lyrics: lrcText });
```

## Why CBR conversion?

Browsers estimate `audio.currentTime` from average bitrate when seek tables
are missing. With VBR files, this causes drift — lyrics appear early or
late after seeking. **CBR guarantees linear time-to-byte mapping**, so
seeking is sample-accurate.

By default, `lrc-audio-player` detects VBR MP3s and re-encodes them to
CBR using `ffmpeg.wasm` (all in-browser, no server needed). If your audio
is already CBR, set `skipCBR: true` to skip conversion.

## Lyric formats

- **Standard LRC**: `[01:23.45]Some lyric line`
- **Repeated lines** (e.g. choruses): `[00:10.00][00:20.00]Same line`
- **Word-level / enhanced LRC**: `[00:01.00]<00:01.00>Hello <00:01.50>world`
- **Metadata tags**: `[ti:]`, `[ar:]`, `[al:]`, `[by:]`/`[au:]`, `[offset:]`
- **Plain JSON**: pass an array of `{ time, text }` objects directly, or
  use `lyrics: { type: 'json', data: [...] }`

```ts
await LyricPlayer.create({
  audio: '/song.mp3',
  lyrics: [
    { time: 0, text: 'First line' },
    { time: 3.5, text: 'Second line' },
  ],
});
```

## API

### `LyricPlayer.create(options)` (recommended)

Async factory that waits for CBR conversion (if needed) before returning
a ready-to-use player.

| Option       | Type                                                | Description                                      |
| ------------ | --------------------------------------------------- | ------------------------------------------------ |
| `audio`      | `string \| HTMLAudioElement`                        | Audio source URL, or an existing element         |
| `lyrics`     | `string \| LyricLine[] \| ParsedLyrics \| LyricSource` | LRC text, JSON lines, or pre-parsed lyrics    |
| `offsetMs`   | `number` (optional)                                 | Extra global offset on top of `[offset:]`        |
| `skipCBR`    | `boolean` (optional, default `false`)               | Skip CBR conversion if your file is already CBR  |
| `cbrBitrate` | `string` (optional, default `'128k'`)               | Target bitrate for CBR conversion              |

### `new LyricPlayer(options)` (advanced)

Synchronous constructor. The instance is returned immediately but
**is not ready until `await player.ready()` resolves**. Use this if you
need to attach listeners before initialization completes.

```ts
const player = new LyricPlayer({ audio: '/song.mp3', lyrics: lrcText });
await player.ready();
player.play();
```

### Playback

- `play()` / `pause()` / `toggle()` — delegate to the underlying audio element
- `seek(seconds)` — jump to a specific time
- `seekToLine(index)` — jump to the start of a given lyric line
- `currentTime`, `duration`, `paused`, `volume` — pass-through getters/setters

### Lyrics

- `lines: LyricLine[]` — all parsed lines, sorted by time
- `metadata` — parsed `[ti]`/`[ar]`/`[al]`/`[by]`/`[offset]` tags
- `getCurrentLine()` / `getCurrentIndex()` — active line right now
- `getNextLine()` — line after the current one
- `getCurrentToken()` / `getCurrentTokenIndex()` — active word, for
  karaoke-style word highlighting (enhanced LRC only)
- `findLineIndexAtTime(seconds)` — binary-search lookup at an arbitrary time,
  without touching playback state
- `setLyrics(...)` — swap in a new lyric source at runtime
- `setOffset(ms)` — adjust global timing offset at runtime

### Events

`on(event, handler)` / `off(event, handler)`:

| Event        | Payload                                    |
| ------------ | ------------------------------------------ |
| `linechange` | `(line: LyricLine \| null, index: number)` |
| `timeupdate` | `(currentTime: number)`                    |
| `play`       | —                                          |
| `pause`      | —                                          |
| `ended`      | —                                          |
| `error`      | `(event: Event)`                           |

## Example: word-by-word highlighting

```ts
player.on('timeupdate', () => {
  const line = player.getCurrentLine();
  const tokenIndex = player.getCurrentTokenIndex();

  if (!line?.tokens) return;
  renderLine(line.tokens.map((tok, i) => ({
    text: tok.text,
    active: i === tokenIndex,
  })));
});
```

## Example: skip CBR for already-optimized files

```ts
const player = await LyricPlayer.create({
  audio: '/song-cbr.mp3',
  lyrics: lrcText,
  skipCBR: true, // No conversion — instant load
});
```

## Development

```bash
npm install
npm run build      # bundle to dist/ (cjs + esm + types)
npm test           # run vitest
npm run typecheck  # tsc --noEmit
```

## License

MIT