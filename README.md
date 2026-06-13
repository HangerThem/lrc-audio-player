# lrc-audio-player

Sync LRC (and word-level "enhanced" LRC) lyrics to an `HTMLAudioElement`
from a single constructor. Gives you the current line, the next line,
word-level highlighting, seeking by line, and change events — without
re-scanning the whole lyric file on every `timeupdate`.

## Install

```bash
npm install lrc-audio-player
```

## Quick start

```ts
import { LyricPlayer } from 'lrc-audio-player';

const lrcText = await fetch('/song.lrc').then((r) => r.text());

const player = new LyricPlayer({
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
const player = new LyricPlayer({ audio: audioEl, lyrics: lrcText });
```

## Lyric formats

- **Standard LRC**: `[01:23.45]Some lyric line`
- **Repeated lines** (e.g. choruses): `[00:10.00][00:20.00]Same line`
- **Word-level / enhanced LRC**: `[00:01.00]<00:01.00>Hello <00:01.50>world`
- **Metadata tags**: `[ti:]`, `[ar:]`, `[al:]`, `[by:]`/`[au:]`, `[offset:]`
- **Plain JSON**: pass an array of `{ time, text }` objects directly, or
  use `lyrics: { type: 'json', data: [...] }`

```ts
new LyricPlayer({
  audio: '/song.mp3',
  lyrics: [
    { time: 0, text: 'First line' },
    { time: 3.5, text: 'Second line' },
  ],
});
```

## API

### `new LyricPlayer(options)`

| Option     | Type                                              | Description                                  |
| ---------- | ------------------------------------------------- | --------------------------------------------- |
| `audio`    | `string \| HTMLAudioElement`                      | Audio source URL, or an existing element       |
| `lyrics`   | `string \| LyricLine[] \| ParsedLyrics \| LyricSource` | LRC text, JSON lines, or pre-parsed lyrics |
| `offsetMs` | `number` (optional)                               | Extra global offset on top of `[offset:]`      |

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

| Event        | Payload                                  |
| ------------ | ------------------------------------------ |
| `linechange` | `(line: LyricLine \| null, index: number)` |
| `timeupdate` | `(currentTime: number)`                    |
| `play`       | —                                           |
| `pause`      | —                                           |
| `ended`      | —                                           |
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

## Development

```bash
npm install
npm run build      # bundle to dist/ (cjs + esm + types)
npm test           # run vitest
npm run typecheck  # tsc --noEmit
```
