const LRCLIB_BASE = "https://lrclib.net/api"
const USER_AGENT =
  "lrc-audio-player v0.2.0 (https://github.com/HangerThem/lrc-audio-player)"

export interface LrclibTrackInfo {
  trackName: string
  artistName?: string
  albumName?: string
  /** Duration in seconds - auto-detected from audio if omitted */
  duration?: number
}

export interface LrclibResult {
  id: number
  trackName: string
  artistName: string
  albumName: string
  duration: number
  instrumental: boolean
  plainLyrics: string | null
  syncedLyrics: string | null
  lyricsfile: string | null
}

/**
 * Search for tracks on LRCLIB matching the given info. Returns an array of
 * results with basic metadata and lyrics availability - use `fetchFromLrclib`
 * to get the actual lyrics content.
 */
export async function searchLrclib(search: string): Promise<LrclibResult[]> {
  const params = new URLSearchParams({ q: search })
  const results = await fetchJson(`${LRCLIB_BASE}/search?${params}`)
  if (!Array.isArray(results)) return []
  return results
}

/**
 * Fetch lyrics from LRCLIB. Tries exact match first, falls back to search.
 * Returns null if nothing is found.
 */
async function fetchJson(url: string): Promise<any> {
  const res = await fetch(url, { headers: { "x-user-agent": USER_AGENT } })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`LRCLIB error ${res.status}`)
  return res.json()
}

/** Exact match - requires trackName + artistName + albumName + duration */
async function getExact(
  info: Required<LrclibTrackInfo>,
): Promise<LrclibResult | null> {
  const params = new URLSearchParams({
    track_name: info.trackName,
    artist_name: info.artistName,
    album_name: info.albumName,
    duration: String(Math.round(info.duration)),
  })
  const data = await fetchJson(`${LRCLIB_BASE}/get?${params}`)
  return data ?? null
}

/** Fuzzy search fallback - picks first result with synced lyrics */
async function search(info: LrclibTrackInfo): Promise<LrclibResult | null> {
  const q = [info.artistName, info.trackName].filter(Boolean).join(" ")
  const params = new URLSearchParams({ q })
  const results = await fetchJson(`${LRCLIB_BASE}/search?${params}`)
  if (!Array.isArray(results)) return null

  const hit = results.find((r: any) => r.syncedLyrics) ?? results[0] ?? null
  return hit ?? null
}

/**
 * Fetch lyrics from LRCLIB. Tries exact match first, falls back to search.
 * Returns null if nothing is found.
 */
export async function fetchFromLrclib(
  info: LrclibTrackInfo,
  duration?: number,
): Promise<LrclibResult | null> {
  const dur = info.duration ?? duration

  if (dur && info.artistName && info.albumName) {
    const exact = await getExact({
      trackName: info.trackName,
      artistName: info.artistName,
      albumName: info.albumName,
      duration: dur,
    })
    if (exact) return exact
  }

  return search(info)
}
