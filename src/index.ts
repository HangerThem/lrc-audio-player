export { LyricPlayer } from "./player"
export type { LyricPlayerOptions, LyricSource } from "./player"
export { parseLRC, parseJSONLyrics } from "./parser"
export type {
  LyricLine,
  LyricToken,
  LyricMetadata,
  ParsedLyrics,
  LyricPlayerEvents,
  LyricPlayerEventName,
} from "./types"
export { searchLrclib, fetchFromLrclib } from "./lrclib"
export type { LrclibTrackInfo, LrclibResult } from "./lrclib"
