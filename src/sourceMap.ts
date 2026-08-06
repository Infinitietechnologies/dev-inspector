/**
 * Minimal source map consumer for the DevInspector widget.
 *
 * Turbopack serves each dev chunk with a sibling `<chunk>.js.map` — an
 * "index map" (`sections[]`, one module per section, sources as `file:///`
 * URLs). Decoding it client-side is the reliable way to map a stack frame
 * back to the original file. Pure logic — unit tested in
 * tests/sourceMap.test.ts.
 */

interface PlainSourceMap {
  sources: string[];
  sourceRoot?: string;
  mappings: string;
}

interface SourceMapSection {
  offset: { line: number; column: number };
  map: PlainSourceMap;
}

export interface SourceMapPayload extends Partial<PlainSourceMap> {
  version: number;
  sections?: SourceMapSection[];
}

export interface OriginalPosition {
  source: string;
  /** 1-based */
  line1: number;
  /** 1-based */
  column1: number;
}

const BASE64_CHARS =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const CHAR_TO_INT = new Map<string, number>(
  BASE64_CHARS.split("").map((c, i) => [c, i])
);

function decodeVlqSegment(segment: string): number[] {
  const result: number[] = [];
  let value = 0;
  let shift = 0;
  for (const char of segment) {
    const digit = CHAR_TO_INT.get(char);
    if (digit === undefined) break;
    value += (digit & 31) << shift;
    if (digit & 32) {
      shift += 5;
    } else {
      const negative = value & 1;
      const abs = value >>> 1;
      result.push(negative ? -abs : abs);
      value = 0;
      shift = 0;
    }
  }
  return result;
}

/**
 * Finds the original position for a 0-based generated line/column in a plain
 * (non-indexed) map. Segments within the map belong to the same few sources,
 * so falling back to the closest earlier mapping is safe and useful.
 */
function findInPlainMap(
  map: PlainSourceMap,
  line0: number,
  column0: number
): OriginalPosition | null {
  const lines = map.mappings.split(";");
  let sourceIdx = 0;
  let srcLine = 0;
  let srcCol = 0;
  type MappingState = { sourceIdx: number; srcLine: number; srcCol: number };
  let best: MappingState | null = null;
  let firstOnTargetLine: MappingState | null = null;

  for (let line = 0; line <= line0 && line < lines.length; line++) {
    let genCol = 0;
    for (const segment of lines[line].split(",")) {
      if (!segment) continue;
      const values = decodeVlqSegment(segment);
      if (values.length === 0) continue;
      genCol += values[0];
      if (values.length < 4) continue;
      sourceIdx += values[1];
      srcLine += values[2];
      srcCol += values[3];
      const state = { sourceIdx, srcLine, srcCol };
      if (line < line0) {
        best = state;
      } else if (genCol <= column0) {
        best = state;
      } else {
        firstOnTargetLine ??= state;
      }
    }
  }

  const hit = best ?? firstOnTargetLine;
  if (!hit) return null;
  const source = map.sources[hit.sourceIdx];
  if (!source) return null;
  return {
    source: map.sourceRoot ? map.sourceRoot + source : source,
    line1: hit.srcLine + 1,
    column1: hit.srcCol + 1,
  };
}

/**
 * Resolves a 0-based generated position to the original source position.
 * Handles both plain maps and index maps with sections.
 */
export function originalPositionFor(
  map: SourceMapPayload,
  line0: number,
  column0: number
): OriginalPosition | null {
  if (map.sections && map.sections.length > 0) {
    let section: SourceMapSection | null = null;
    for (const candidate of map.sections) {
      const { line, column } = candidate.offset;
      if (line < line0 || (line === line0 && column <= column0)) {
        section = candidate;
      } else {
        break;
      }
    }
    if (!section) return null;
    const lineInSection = line0 - section.offset.line;
    const columnInSection =
      line0 === section.offset.line ? column0 - section.offset.column : column0;
    return findInPlainMap(section.map, lineInSection, columnInSection);
  }
  if (map.mappings && map.sources) {
    return findInPlainMap(map as PlainSourceMap, line0, column0);
  }
  return null;
}
