import { describe, expect, it } from "vitest";
import { originalPositionFor, SourceMapPayload } from "../src/sourceMap";

// Handy VLQ reference for the mappings used below:
//   "AAAA" = [0,0,0,0]     "GAAG" = [+3,0,0,+3]     "AACA" = [0,0,+1,0]

describe("originalPositionFor (plain map)", () => {
  const map: SourceMapPayload = {
    version: 3,
    sources: ["file:///proj/src/App.tsx"],
    mappings: "AAAA,GAAG;AACA",
  };

  it("finds the exact segment for a generated position", () => {
    expect(originalPositionFor(map, 0, 0)).toEqual({
      source: "file:///proj/src/App.tsx",
      line1: 1,
      column1: 1,
    });
  });

  it("uses the greatest segment at or before the column", () => {
    expect(originalPositionFor(map, 0, 5)).toEqual({
      source: "file:///proj/src/App.tsx",
      line1: 1,
      column1: 4,
    });
  });

  it("tracks cumulative source state across generated lines", () => {
    // Source line/column deltas carry across generated lines per the spec:
    // after "GAAG" the source column is 3, and "AACA" adds +1 line, +0 cols.
    expect(originalPositionFor(map, 1, 0)).toEqual({
      source: "file:///proj/src/App.tsx",
      line1: 2,
      column1: 4,
    });
  });

  it("returns null when there are no mappings at all", () => {
    expect(
      originalPositionFor({ version: 3, sources: [], mappings: "" }, 0, 0)
    ).toBeNull();
  });
});

describe("originalPositionFor (index map with sections)", () => {
  const map: SourceMapPayload = {
    version: 3,
    sections: [
      {
        offset: { line: 0, column: 0 },
        map: {
          sources: ["file:///proj/src/A.tsx"],
          mappings: "AAAA",
        },
      },
      {
        offset: { line: 10, column: 0 },
        map: {
          sources: ["file:///proj/src/B.tsx"],
          mappings: "AAAA;AACA",
        },
      },
    ],
  };

  it("selects the section containing the generated line", () => {
    expect(originalPositionFor(map, 11, 0)).toEqual({
      source: "file:///proj/src/B.tsx",
      line1: 2,
      column1: 1,
    });
  });

  it("adjusts line numbers relative to the section offset", () => {
    expect(originalPositionFor(map, 10, 0)).toEqual({
      source: "file:///proj/src/B.tsx",
      line1: 1,
      column1: 1,
    });
  });

  it("resolves positions in the first section", () => {
    expect(originalPositionFor(map, 0, 0)).toEqual({
      source: "file:///proj/src/A.tsx",
      line1: 1,
      column1: 1,
    });
  });
});
