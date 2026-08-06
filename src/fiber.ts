/**
 * React fiber introspection for the DevInspector widget.
 *
 * React 19 removed `_debugSource`, so source locations are recovered from the
 * dev-only `_debugStack` (an Error captured at JSX creation). Frames pointing
 * at same-origin chunks are mapped back to original files by fetching and
 * decoding the chunk's source map client-side (Turbopack); anything else
 * falls back to the dev server's overlay resolver endpoint (webpack dev).
 * All of this only exists in development builds.
 */

import {
  RawStackFrame,
  normalizeSourcePath,
  parseComponentStack,
} from "./parseStack";
import { originalPositionFor, SourceMapPayload } from "./sourceMap";

interface ReactFiber {
  type: unknown;
  memoizedProps?: unknown;
  _debugOwner?: ReactFiber | null;
  _debugStack?: Error | string | null;
}

export interface ResolverOptions {
  /** GET endpoint that opens a file in the editor (Next.js dev server). */
  editorEndpoint?: string;
  /**
   * POST endpoint that resolves bundled stack frames server-side — the
   * fallback for webpack-dev `webpack-internal:///` frames. Pass null to
   * disable the fallback entirely (e.g. on Vite).
   */
  stackFramesEndpoint?: string | null;
}

export const DEFAULT_EDITOR_ENDPOINT = "/__nextjs_launch-editor";
export const DEFAULT_STACK_FRAMES_ENDPOINT = "/__nextjs_original-stack-frames";

export interface ResolvedLocation {
  /** Display path, e.g. "src/components/Cart/TipSection.tsx" */
  file: string;
  /** What the dev server's launch-editor endpoint should receive */
  editorFile: string;
  line1: number | null;
  column1: number | null;
}

export interface InspectedEntry {
  /** "div.foo" for the host element, component name otherwise */
  name: string;
  kind: "host" | "component";
  stackFrames: RawStackFrame[];
  /** Snapshot of the fiber's props at inspect time */
  props: unknown;
  /** null = resolved to nothing app-owned (library code); undefined = pending */
  location?: ResolvedLocation | null;
}

const MAX_OWNER_DEPTH = 32;
const MAX_FRAMES_PER_REQUEST = 12;

export function getFiberFromNode(node: Node | null): ReactFiber | null {
  let el: Element | null =
    node instanceof Element ? node : (node?.parentElement ?? null);
  while (el) {
    const key = Object.keys(el).find((k) => k.startsWith("__reactFiber$"));
    if (key) {
      return (el as unknown as Record<string, ReactFiber>)[key];
    }
    el = el.parentElement;
  }
  return null;
}

function getDisplayName(type: unknown): string | null {
  if (typeof type === "string") return type;
  if (typeof type === "function") {
    const fn = type as { displayName?: string; name?: string };
    return fn.displayName || fn.name || null;
  }
  if (type && typeof type === "object") {
    const obj = type as {
      displayName?: string;
      render?: unknown;
      type?: unknown;
    };
    if (obj.displayName) return obj.displayName;
    if (obj.render) return getDisplayName(obj.render); // forwardRef
    if (obj.type) return getDisplayName(obj.type); // memo
  }
  return null;
}

function getStackFrames(fiber: ReactFiber): RawStackFrame[] {
  const debugStack = fiber._debugStack;
  const stack =
    typeof debugStack === "string" ? debugStack : debugStack?.stack;
  return parseComponentStack(stack);
}

function describeHost(fiber: ReactFiber, el: Element): string {
  const tag = typeof fiber.type === "string" ? fiber.type : el.tagName.toLowerCase();
  const cls = typeof el.className === "string" ? el.className.trim() : "";
  return cls ? `${tag}.${cls.split(/\s+/)[0]}` : tag;
}

/**
 * Builds the chain to display: the clicked host element first (its JSX
 * callsite is inside the file that authored it), then the owner components
 * outward (each entry's callsite = where that component is used).
 */
export function buildInspectChain(el: Element): InspectedEntry[] {
  const fiber = getFiberFromNode(el);
  if (!fiber) return [];

  const entries: InspectedEntry[] = [
    {
      name: describeHost(fiber, el),
      kind: "host",
      stackFrames: getStackFrames(fiber),
      props: fiber.memoizedProps,
    },
  ];

  let owner = fiber._debugOwner;
  let depth = 0;
  while (owner && depth++ < MAX_OWNER_DEPTH) {
    entries.push({
      name: getDisplayName(owner.type) ?? "Anonymous",
      kind: "component",
      stackFrames: getStackFrames(owner),
      props: owner.memoizedProps,
    });
    owner = owner._debugOwner;
  }
  return entries;
}

interface SourceInfo {
  display: string;
  editorFile: string;
  ignored: boolean;
}

/** Turns a source-map `sources` entry into display + editor-openable forms. */
function describeSource(source: string): SourceInfo {
  const ignored = source.includes("node_modules");

  if (source.startsWith("turbopack://[project]/")) {
    const rel = source.slice("turbopack://[project]/".length);
    return { display: rel, editorFile: rel, ignored };
  }
  if (source.startsWith("file://")) {
    // launch-editor accepts file:// URLs as-is; for display, prefer the
    // repo-relative tail (e.g. "src/…"), falling back to the last segments.
    let path = "";
    try {
      path = decodeURIComponent(new URL(source).pathname).replace(
        /^\/(?=[A-Za-z]:)/,
        ""
      );
    } catch {
      path = source;
    }
    const rootMarker = path.match(/\/(src|app|pages|components|lib|tests|scripts|public)\//);
    const display =
      rootMarker?.index !== undefined
        ? path.slice(rootMarker.index + 1)
        : path.split("/").slice(-2).join("/");
    return { display, editorFile: source, ignored };
  }
  if (source.startsWith("webpack-internal:///")) {
    const rel = source
      .slice("webpack-internal:///".length)
      .replace(/^\.\//, "");
    return { display: rel, editorFile: rel, ignored };
  }
  const normalized = normalizeSourcePath(source);
  return { display: normalized, editorFile: normalized, ignored };
}

const sourceMapCache = new Map<string, Promise<SourceMapPayload | null>>();

/** Fetches (and caches) the sibling ".map" of a same-origin chunk URL. */
function fetchSourceMap(chunkUrl: string): Promise<SourceMapPayload | null> {
  const cached = sourceMapCache.get(chunkUrl);
  if (cached) return cached;
  const promise = fetch(`${chunkUrl}.map`)
    .then((res) => (res.ok ? (res.json() as Promise<SourceMapPayload>) : null))
    .catch(() => null);
  sourceMapCache.set(chunkUrl, promise);
  return promise;
}

async function resolveFrameViaSourceMap(
  frame: RawStackFrame
): Promise<ResolvedLocation | null> {
  let url: URL;
  try {
    url = new URL(frame.file);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (url.origin !== window.location.origin) return null;

  const map = await fetchSourceMap(url.origin + url.pathname);
  if (!map) return null;
  const pos = originalPositionFor(map, frame.line1 - 1, frame.column1 - 1);
  if (!pos) return null;
  const info = describeSource(pos.source);
  if (info.ignored) return null;
  return {
    file: info.display,
    editorFile: info.editorFile,
    line1: pos.line1,
    column1: pos.column1,
  };
}

interface OriginalStackFrameResult {
  status: "fulfilled" | "rejected";
  value?: {
    originalStackFrame?: {
      file: string | null;
      line1: number | null;
      column1: number | null;
      ignored: boolean;
    } | null;
  };
}

/**
 * Fallback for frames the source-map path can't handle (e.g. webpack dev's
 * "webpack-internal:///" URLs): the dev server's own overlay resolver.
 */
async function resolveViaServer(
  frames: RawStackFrame[],
  endpoint: string
): Promise<ResolvedLocation | null> {
  if (frames.length === 0) return null;
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        frames,
        isServer: false,
        isEdgeServer: false,
        isAppDirectory: false,
      }),
    });
    if (!res.ok) return null;
    const results = (await res.json()) as OriginalStackFrameResult[];
    for (const result of results) {
      const frame =
        result.status === "fulfilled" ? result.value?.originalStackFrame : null;
      if (!frame?.file || frame.ignored) continue;
      const file = normalizeSourcePath(frame.file);
      if (file.includes("node_modules")) continue;
      return {
        file,
        editorFile: file,
        line1: frame.line1,
        column1: frame.column1,
      };
    }
  } catch {
    // Dev server unreachable — nothing to resolve against.
  }
  return null;
}

const locationCache = new Map<string, Promise<ResolvedLocation | null>>();

/**
 * Resolves raw (bundled) stack frames to the first app-owned original source
 * location. Returns null when everything is library code.
 */
export function resolveLocation(
  frames: RawStackFrame[],
  options?: ResolverOptions
): Promise<ResolvedLocation | null> {
  const batch = frames.slice(0, MAX_FRAMES_PER_REQUEST);
  if (batch.length === 0) return Promise.resolve(null);

  const stackFramesEndpoint =
    options?.stackFramesEndpoint === undefined
      ? DEFAULT_STACK_FRAMES_ENDPOINT
      : options.stackFramesEndpoint;

  const cacheKey = batch
    .map((f) => `${f.file}:${f.line1}:${f.column1}`)
    .join("|");
  const cached = locationCache.get(cacheKey);
  if (cached) return cached;

  const promise = (async () => {
    for (const frame of batch) {
      const loc = await resolveFrameViaSourceMap(frame);
      if (loc) return loc;
    }
    if (!stackFramesEndpoint) return null;
    // The dev server resolver hangs on full http URLs — only send the rest.
    const serverFrames = batch.filter((f) => !/^https?:\/\//.test(f.file));
    return resolveViaServer(serverFrames, stackFramesEndpoint);
  })().catch(() => {
    locationCache.delete(cacheKey);
    return null;
  });

  locationCache.set(cacheKey, promise);
  return promise;
}

/** Asks the dev server to open the file in the configured editor. */
export function openInEditor(
  location: ResolvedLocation,
  options?: ResolverOptions
): void {
  const endpoint = options?.editorEndpoint ?? DEFAULT_EDITOR_ENDPOINT;
  const params = new URLSearchParams({
    file: location.editorFile,
    line1: String(location.line1 ?? 1),
    column1: String(location.column1 ?? 1),
  });
  fetch(`${endpoint}?${params.toString()}`).catch(() => {
    // Dev-only convenience; nothing to do if the server rejects it.
  });
}
