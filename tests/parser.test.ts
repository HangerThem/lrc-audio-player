import { describe, it, expect } from "vitest"
import { parseJSONLyrics, parseLRC } from "../src/parser"

const SAMPLE_LRC = `
[ti:Test Song]
[ar:Test Artist]
[offset:0]
[00:01.00]Hello world
[00:05.50]<00:05.50>Second <00:06.00>line <00:06.50>here
[00:10.00][00:20.00]Repeated chorus line
`

describe("parseLRC", () => {
  it("extracts metadata", () => {
    const { metadata } = parseLRC(SAMPLE_LRC)
    expect(metadata.title).toBe("Test Song")
    expect(metadata.artist).toBe("Test Artist")
  })

  it("parses plain timed lines", () => {
    const { lines } = parseLRC(SAMPLE_LRC)
    const first = lines.find((l) => l.text === "Hello world")
    expect(first?.time).toBeCloseTo(1.0)
    expect(first?.tokens).toBeUndefined()
  })

  it("parses word-level tokens", () => {
    const { lines } = parseLRC(SAMPLE_LRC)
    const line = lines.find((l) => l.text.startsWith("Second"))
    expect(line?.tokens?.length).toBe(3)
    expect(line?.tokens?.[0]).toEqual({ time: 5.5, text: "Second " })
    expect(line?.tokens?.[1].time).toBeCloseTo(6.0)
  })

  it("handles repeated timestamps for the same line", () => {
    const { lines } = parseLRC(SAMPLE_LRC)
    const repeats = lines.filter((l) => l.text === "Repeated chorus line")
    expect(repeats.map((l) => l.time)).toEqual([10, 20])
  })

  it("returns lines sorted by time", () => {
    const { lines } = parseLRC(SAMPLE_LRC)
    const times = lines.map((l) => l.time)
    const sorted = [...times].sort((a, b) => a - b)
    expect(times).toEqual(sorted)
  })

  it("exposes the [offset:] tag in metadata without altering line times", () => {
    const { metadata, lines } = parseLRC(
      "[offset:1000]\n[00:10.00]Untouched line",
    )
    expect(metadata.offset).toBe(1000)
    expect(lines[0].time).toBeCloseTo(10.0)
  })
})

describe("parseJSONLyrics", () => {
  it("accepts a JSON string and sorts lines by time", () => {
    const parsed = parseJSONLyrics(
      JSON.stringify([
        { time: 3, text: "third" },
        { time: 1, text: "first" },
      ]),
    )

    expect(parsed.metadata).toEqual({})
    expect(parsed.lines.map((l) => l.text)).toEqual(["first", "third"])
  })

  it("accepts a LyricLine array and sorts lines by time", () => {
    const parsed = parseJSONLyrics([
      { time: 2, text: "two" },
      { time: 0.5, text: "half" },
    ])

    expect(parsed.lines.map((l) => l.time)).toEqual([0.5, 2])
  })
})
