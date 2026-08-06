/**
 * Parses a JS error stack (React 19 fiber `_debugStack`) into structured
 * frames, dropping React-internal noise. Pure logic — unit tested in
 * tests/parseStack.test.ts.
 */

export interface RawStackFrame {
  methodName: string;
  file: string;
  line1: number;
  column1: number;
}

// "at Comp (http://host/chunk.js:10:20)" | "at http://host/chunk.js:10:20"
const CHROME_FRAME_RE = /^at\s+(?:(.+?)\s+\()?(.+?):(\d+):(\d+)\)?$/;
// "Comp@http://host/chunk.js:10:20" | "@http://host/chunk.js:10:20"
const FIREFOX_FRAME_RE = /^(?:(.*?)@)?(.+?):(\d+):(\d+)$/;

// Marker frames React injects when capturing owner stacks, plus the JSX
// runtime itself — never the frame the user is looking for.
const REACT_INTERNAL_RE =
  /react[-_.]stack[-_.](?:top|bottom)[-_.]frame|\bjsxDEV\b|\bjsx-dev-runtime\b/i;

export function parseComponentStack(
  stack: string | null | undefined
): RawStackFrame[] {
  if (!stack) return [];

  const frames: RawStackFrame[] = [];
  for (const rawLine of stack.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("Error")) continue;

    const match =
      line.match(CHROME_FRAME_RE) ??
      (line.startsWith("at ") ? null : line.match(FIREFOX_FRAME_RE));
    if (!match) continue;

    const [, methodName, file, lineStr, colStr] = match;
    if (!file || file === "<anonymous>" || file.startsWith("node:")) continue;
    if (methodName && REACT_INTERNAL_RE.test(methodName)) continue;
    if (REACT_INTERNAL_RE.test(file)) continue;

    frames.push({
      methodName: methodName || "<unknown>",
      file,
      line1: parseInt(lineStr, 10),
      column1: parseInt(colStr, 10),
    });
  }
  return frames;
}

/** Normalizes a dev-server-resolved path for display ("src/…/File.tsx"). */
export function normalizeSourcePath(file: string): string {
  return file
    .replace(/\\/g, "/")
    .replace(/^\[project\]\//, "")
    .replace(/^\.\//, "");
}
