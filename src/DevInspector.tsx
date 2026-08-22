/**
 * DevInspector — dev-only widget to pinpoint which source file a DOM element
 * comes from. Render it behind an env flag so it is dead-code-eliminated in
 * production builds (see README for the Next.js pattern).
 *
 * Ways to inspect: open the wrench launcher and click the crosshair (or use
 * the hotkey, default Ctrl+Shift+X) to arm, or hold the hover modifier
 * (default Alt) and hover.
 * Click an element to lock the panel: Source shows the component chain with
 * file:line (click a row to open in the editor), Props/State show live data,
 * History revisits recent picks, and arrow keys walk the DOM while locked.
 * The Zap button flashes DOM updates as they happen. Everything resolves
 * through the chunk source maps client-side.
 */

import {
  Component,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { CopyButton } from "./CopyButton";
import {
  EditorProtocol,
  InspectedEntry,
  ResolverOptions,
  buildInspectChain,
  openInEditor,
  resolveLocation,
} from "./fiber";
import { JsonTree } from "./JsonTree";
import { buildAiContext } from "./aiContext";
import type { FlashEvent } from "./flasher";
import { getRenderBridge, startFlasher, startRenderFlasher } from "./flasher";
import { I18nMatch, findTranslationKeys } from "./i18nLookup";
import { BoxModel, getBoxModel } from "./boxModel";
import {
  BracesIcon,
  CrosshairIcon,
  ExternalLinkIcon,
  RefreshIcon,
  WrenchIcon,
  XIcon,
  ZapIcon,
} from "./icons";

export type HoverModifier = "alt" | "ctrl" | "meta" | "shift" | "none";

export interface DevInspectorColors {
  /** Highlight/selection accent. Hex #rrggbb. Default: violet #7c3aed */
  accent?: string;
  /** Lighter accent for component names. Default: #a78bfa */
  accentLight?: string;
  /** DOM-update flash color. Hex #rrggbb. Default: orange #f97316 */
  flash?: string;
}

export interface DevInspectorProps {
  /**
   * Render nothing when false. Combine with an env check so bundlers strip
   * the widget from production builds entirely (see README).
   */
  enabled?: boolean;
  /** Arm/disarm hotkey combo, e.g. "ctrl+shift+x" (default). */
  hotkey?: string;
  /** Modifier held to hover-inspect without arming. Default "alt". */
  hoverModifier?: HoverModifier;
  /** localStorage key for the persisted launcher-button position. */
  storageKey?: string;
  /** Base z-index for the overlay layers. */
  zIndex?: number;
  /** Palette overrides (hex #rrggbb). */
  colors?: DevInspectorColors;
  /** Override the GET open-in-editor endpoint. Default: Next.js dev server. */
  editorEndpoint?: string;
  /**
   * Force a specific editor: opens `vscode://file/…` (or the equivalent
   * scheme) directly from the browser instead of asking the dev server.
   * Relative source paths (Turbopack/webpack) also need `projectRoot`.
   */
  editor?: EditorProtocol;
  /**
   * Absolute project root used to absolutize relative source paths for
   * `editor` deep links, e.g. inlined at build time via
   * `env: { NEXT_PUBLIC_PROJECT_ROOT: process.cwd() }` in next.config.
   */
  projectRoot?: string;
  /**
   * Override the POST server-side stack-frame resolver endpoint used as a
   * fallback for webpack-dev frames. Pass null to disable the fallback.
   */
  stackFramesEndpoint?: string | null;
  /**
   * Supply i18next-shaped resources to enable reverse text → key lookup:
   * `() => ({ data: i18n.store.data, language: i18n.language })`.
   */
  getI18nData?: () => {
    data: Record<string, unknown>;
    language?: string;
  } | null;
  /**
   * Supply a state snapshot to enable the State tab. Works for any store:
   * Redux `() => store.getState()`, Zustand `() => useStore.getState()`, etc.
   */
  getStateSnapshot?: () => Promise<unknown> | unknown;
  /** Heading for the State tab, e.g. "Redux store". Default "Store". */
  stateLabel?: string;
}

interface HoverState {
  el: Element;
  rect: DOMRect;
  box: BoxModel;
  name: string;
  locationLabel: string | null;
}

interface LockedState {
  el: Element;
  rect: DOMRect;
  box: BoxModel;
  entries: InspectedEntry[];
  i18nMatches: I18nMatch[];
  className: string;
}

interface HistoryEntry {
  el: Element;
  label: string;
}

interface FlashRecord {
  id: number;
  rect: DOMRect;
  count: number;
  name?: string | null;
}

type PanelTab = "source" | "props" | "state" | "history";

const BUTTON_SIZE = 40;
const BUTTON_GAP = 6;
/** Extra height the menu adds beyond the launcher when expanded (2 actions). */
const MENU_EXTRA = (BUTTON_SIZE + BUTTON_GAP) * 2;
const PANEL_WIDTH = 420;
const HISTORY_LIMIT = 8;

interface Position {
  x: number;
  y: number;
}

interface ParsedHotkey {
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
  meta: boolean;
  key: string;
}

const MODIFIER_NAMES = ["ctrl", "control", "shift", "alt", "meta", "cmd"];

function parseHotkey(hotkey: string): ParsedHotkey {
  const parts = hotkey.toLowerCase().split("+").map((p) => p.trim());
  return {
    ctrl: parts.includes("ctrl") || parts.includes("control"),
    shift: parts.includes("shift"),
    alt: parts.includes("alt"),
    meta: parts.includes("meta") || parts.includes("cmd"),
    key: parts.filter((p) => p && !MODIFIER_NAMES.includes(p)).pop() ?? "x",
  };
}

const matchesHotkey = (e: KeyboardEvent, h: ParsedHotkey): boolean =>
  e.ctrlKey === h.ctrl &&
  e.shiftKey === h.shift &&
  e.altKey === h.alt &&
  e.metaKey === h.meta &&
  e.key.toLowerCase() === h.key;

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const formatHotkey = (hotkey: string): string =>
  hotkey.split("+").map((p) => capitalize(p.trim())).join("+");

const modifierHeld = (
  e: { altKey: boolean; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean },
  modifier: HoverModifier
): boolean =>
  modifier === "alt"
    ? e.altKey
    : modifier === "ctrl"
      ? e.ctrlKey
      : modifier === "meta"
        ? e.metaKey
        : modifier === "shift"
          ? e.shiftKey
          : false;

/** "#rrggbb" + alpha → "rgba(…)"; non-hex input falls back to the raw color. */
function hexAlpha(hex: string, alpha: number): string {
  const m = hex.match(/^#([0-9a-f]{6})$/i);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

const clampToViewport = (pos: Position): Position => ({
  x: Math.min(Math.max(pos.x, 8), window.innerWidth - BUTTON_SIZE - 8),
  y: Math.min(Math.max(pos.y, 8), window.innerHeight - BUTTON_SIZE - 8),
});

const loadPosition = (storageKey: string): Position => {
  try {
    const saved = localStorage.getItem(storageKey);
    if (saved) {
      const parsed = JSON.parse(saved) as Position;
      if (typeof parsed.x === "number" && typeof parsed.y === "number") {
        return clampToViewport(parsed);
      }
    }
  } catch {
    // Corrupt/unavailable storage — fall through to the default corner.
  }
  return { x: 16, y: window.innerHeight - BUTTON_SIZE - 16 };
};

const isOwnUi = (target: EventTarget | null): boolean =>
  target instanceof Element && !!target.closest("[data-dev-inspector-ui]");

const locationText = (entry: InspectedEntry): string | null =>
  entry.location
    ? `${entry.location.file}${entry.location.line1 ? `:${entry.location.line1}` : ""}`
    : null;

const fabStyle: React.CSSProperties = {
  width: BUTTON_SIZE,
  height: BUTTON_SIZE,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  border: "1px solid #3f3f46",
  borderRadius: "50%",
  cursor: "pointer",
  boxShadow: "0 2px 10px rgba(0,0,0,0.35)",
};

const iconButtonStyle: React.CSSProperties = {
  background: "none",
  border: "none",
  color: "#71717a",
  cursor: "pointer",
  padding: 2,
  display: "flex",
  flexShrink: 0,
};

/**
 * A dev tool must never take the host app down with it: if anything in the
 * widget throws during render, collapse the widget for this page load and
 * leave the app untouched.
 */
class CrashShield extends Component<
  { children: React.ReactNode },
  { crashed: boolean }
> {
  state = { crashed: false };
  static getDerivedStateFromError() {
    return { crashed: true };
  }
  componentDidCatch(error: unknown) {
    console.warn(
      "[next-dev-inspector] The inspector crashed and was disabled for this page load. Please report this:",
      error
    );
  }
  render() {
    return this.state.crashed ? null : this.props.children;
  }
}

/** Text button that copies AI-assistant-ready context with feedback. */
function CopyAiButton({
  getText,
  accent,
}: {
  getText: () => string;
  accent: string;
}) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    []
  );
  return (
    <button
      type="button"
      title="Copy component chain, file paths and props — paste into your AI assistant"
      onClick={() => {
        navigator.clipboard?.writeText(getText()).then(() => {
          setCopied(true);
          if (timerRef.current) clearTimeout(timerRef.current);
          timerRef.current = setTimeout(() => setCopied(false), 1200);
        });
      }}
      style={{
        background: "none",
        border: `1px solid ${copied ? "#4ade80" : "#3f3f46"}`,
        borderRadius: 5,
        color: copied ? "#4ade80" : accent,
        cursor: "pointer",
        padding: "1px 8px",
        font: "inherit",
        flexShrink: 0,
      }}
    >
      {copied ? "Copied ✓" : "Copy for AI"}
    </button>
  );
}

/** Margin (orange) and padding (green) bands around/inside a rect. */
function BoxModelBands({
  rect,
  box,
  zIndex,
}: {
  rect: DOMRect;
  box: BoxModel;
  zIndex: number;
}) {
  const m = box.margin;
  const p = box.padding;
  const b = box.border;
  const marginColor = "rgba(249, 115, 22, 0.18)";
  const paddingColor = "rgba(34, 197, 94, 0.2)";
  const innerTop = rect.top + b.top;
  const innerLeft = rect.left + b.left;
  const innerWidth = rect.width - b.left - b.right;
  const innerHeight = rect.height - b.top - b.bottom;
  const band = (
    top: number,
    left: number,
    width: number,
    height: number,
    background: string
  ): React.CSSProperties => ({
    position: "fixed",
    top,
    left,
    width: Math.max(0, width),
    height: Math.max(0, height),
    background,
    pointerEvents: "none",
    zIndex,
  });
  return (
    <>
      <div style={band(rect.top - m.top, rect.left - m.left, rect.width + m.left + m.right, m.top, marginColor)} />
      <div style={band(rect.bottom, rect.left - m.left, rect.width + m.left + m.right, m.bottom, marginColor)} />
      <div style={band(rect.top, rect.left - m.left, m.left, rect.height, marginColor)} />
      <div style={band(rect.top, rect.right, m.right, rect.height, marginColor)} />
      <div style={band(innerTop, innerLeft, innerWidth, p.top, paddingColor)} />
      <div style={band(innerTop + innerHeight - p.bottom, innerLeft, innerWidth, p.bottom, paddingColor)} />
      <div style={band(innerTop + p.top, innerLeft, p.left, innerHeight - p.top - p.bottom, paddingColor)} />
      <div style={band(innerTop + p.top, innerLeft + innerWidth - p.right, p.right, innerHeight - p.top - p.bottom, paddingColor)} />
    </>
  );
}

export function DevInspector(props: DevInspectorProps) {
  return (
    <CrashShield>
      <DevInspectorInner {...props} />
    </CrashShield>
  );
}

function DevInspectorInner({
  enabled = true,
  hotkey = "ctrl+shift+x",
  hoverModifier = "alt",
  storageKey = "dev-inspector-pos",
  zIndex = 2147483000,
  colors,
  editorEndpoint,
  editor,
  projectRoot,
  stackFramesEndpoint,
  getI18nData,
  getStateSnapshot,
  stateLabel = "Store",
}: DevInspectorProps) {
  const accent = colors?.accent ?? "#7c3aed";
  const accentLight = colors?.accentLight ?? "#a78bfa";
  const flashColor = colors?.flash ?? "#f97316";

  const [active, setActive] = useState(false);
  const [hover, setHover] = useState<HoverState | null>(null);
  const [locked, setLocked] = useState<LockedState | null>(null);
  // null until mounted — keeps the component SSR-safe (no window at render).
  const [pos, setPos] = useState<Position | null>(null);
  const [tab, setTab] = useState<PanelTab>("source");
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [stateSnapshot, setStateSnapshot] = useState<unknown>(undefined);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [flashOn, setFlashOn] = useState(false);
  const [flashes, setFlashes] = useState<FlashRecord[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);

  const parsedHotkey = useMemo(() => parseHotkey(hotkey), [hotkey]);
  const resolverOptions = useMemo<ResolverOptions>(
    () => ({ editorEndpoint, stackFramesEndpoint, editor, projectRoot }),
    [editorEndpoint, stackFramesEndpoint, editor, projectRoot]
  );

  const activeRef = useRef(active);
  const hoverRef = useRef(hover);
  const lockedElRef = useRef<Element | null>(null);
  // Mirror state into refs after each render so the always-attached
  // document listeners see current values without re-subscribing.
  useEffect(() => {
    activeRef.current = active;
    hoverRef.current = hover;
    lockedElRef.current = locked?.el ?? null;
  });
  const dragRef = useRef<{ pointerStart: Position; posStart: Position } | null>(
    null
  );
  const draggedRef = useRef(false);
  const flashIdRef = useRef(0);

  useEffect(() => {
    if (enabled) setPos(loadPosition(storageKey));
  }, [enabled, storageKey]);

  const lockElement = useCallback(
    (el: Element) => {
      const entries = buildInspectChain(el);
      const text = el.textContent ?? "";
      const i18nSource = getI18nData?.() ?? null;
      const i18nMatches = i18nSource
        ? findTranslationKeys(i18nSource.data, text, i18nSource.language)
        : [];
      const className = typeof el.className === "string" ? el.className : "";
      setLocked({
        el,
        rect: el.getBoundingClientRect(),
        box: getBoxModel(el),
        entries,
        i18nMatches,
        className,
      });
      setHover(null);
      setActive(false);
      setTab("source");
      const firstComponent = entries.findIndex((e) => e.kind === "component");
      setSelectedIdx(firstComponent === -1 ? 0 : firstComponent);
      const label =
        entries.find((e) => e.kind === "component")?.name ??
        entries[0]?.name ??
        el.tagName.toLowerCase();
      setHistory((prev) =>
        [{ el, label }, ...prev.filter((h) => h.el !== el)].slice(
          0,
          HISTORY_LIMIT
        )
      );
      entries.forEach((entry, index) => {
        // React 18's `_debugSource` already contains an original location.
        if (entry.location !== undefined) return;
        resolveLocation(entry.stackFrames, resolverOptions).then((location) => {
          setLocked((prev) =>
            prev && prev.el === el
              ? {
                  ...prev,
                  entries: prev.entries.map((e, i) =>
                    i === index ? { ...e, location } : e
                  ),
                }
              : prev
          );
        });
      });
    },
    [getI18nData, resolverOptions]
  );

  // Inspect listeners are always attached: armed mode OR modifier-held both
  // work. Capture phase so the app never sees the click. The fiber-chain
  // walk is coalesced to one per animation frame — mousemove can fire far
  // more often than the screen paints.
  useEffect(() => {
    if (!enabled) return;
    const inspecting = (e: MouseEvent | PointerEvent) =>
      activeRef.current || modifierHeld(e, hoverModifier);

    let pendingEl: Element | null = null;
    let rafId = 0;

    const processHover = () => {
      rafId = 0;
      const el = pendingEl;
      pendingEl = null;
      if (!el || !el.isConnected) return;
      const chain = buildInspectChain(el);
      if (chain.length === 0) {
        if (hoverRef.current) setHover(null);
        return;
      }
      const componentName =
        chain.find((entry) => entry.kind === "component")?.name ?? chain[0].name;
      const immediateLocation = chain[0].location;
      setHover({
        el,
        rect: el.getBoundingClientRect(),
        box: getBoxModel(el),
        name: componentName,
        locationLabel: immediateLocation
          ? `${immediateLocation.file}${immediateLocation.line1 ? `:${immediateLocation.line1}` : ""}`
          : null,
      });
      if (immediateLocation !== undefined) return;
      resolveLocation(chain[0].stackFrames, resolverOptions).then((location) => {
        setHover((prev) =>
          prev && prev.el === el
            ? {
                ...prev,
                locationLabel: location
                  ? `${location.file}${location.line1 ? `:${location.line1}` : ""}`
                  : null,
              }
            : prev
        );
      });
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!inspecting(e) || isOwnUi(e.target) || !(e.target instanceof Element)) {
        pendingEl = null;
        if (hoverRef.current) setHover(null);
        return;
      }
      pendingEl = e.target;
      if (!rafId) rafId = requestAnimationFrame(processHover);
    };

    const onClick = (e: MouseEvent) => {
      if (!inspecting(e) || isOwnUi(e.target)) return;
      e.preventDefault();
      e.stopPropagation();
      if (e.target instanceof Element) lockElement(e.target);
    };

    const swallow = (e: MouseEvent | PointerEvent) => {
      if (inspecting(e) && !isOwnUi(e.target)) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    document.addEventListener("mousemove", onMouseMove, true);
    document.addEventListener("click", onClick, true);
    document.addEventListener("mousedown", swallow, true);
    document.addEventListener("pointerdown", swallow, true);
    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      document.removeEventListener("mousemove", onMouseMove, true);
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("mousedown", swallow, true);
      document.removeEventListener("pointerdown", swallow, true);
    };
  }, [enabled, hoverModifier, lockElement, resolverOptions]);

  // Crosshair cursor while armed
  useEffect(() => {
    if (!active) return;
    const style = document.createElement("style");
    style.textContent = "* { cursor: crosshair !important; }";
    document.head.appendChild(style);
    return () => style.remove();
  }, [active]);

  // Esc exits, hotkey toggles, arrows walk the DOM while locked
  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setActive(false);
        setHover(null);
        setLocked(null);
        return;
      }
      if (matchesHotkey(e, parsedHotkey)) {
        e.preventDefault();
        setLocked(null);
        setHover(null);
        setActive((prev) => !prev);
        return;
      }
      const el = lockedElRef.current;
      if (!el || !e.key.startsWith("Arrow")) return;
      const next =
        e.key === "ArrowUp"
          ? el.parentElement
          : e.key === "ArrowDown"
            ? el.firstElementChild
            : e.key === "ArrowLeft"
              ? el.previousElementSibling
              : el.nextElementSibling;
      if (
        next &&
        next !== document.documentElement &&
        !next.closest("[data-dev-inspector-ui]")
      ) {
        e.preventDefault();
        e.stopPropagation();
        lockElement(next);
      }
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [enabled, parsedHotkey, lockElement]);

  // Flasher: true re-renders when the early hook is installed (see
  // "next-dev-inspector/hook"), raw DOM mutations otherwise.
  useEffect(() => {
    if (!flashOn) return;
    const handle = (events: FlashEvent[]) => {
      const records = events.map((ev) => ({
        id: ++flashIdRef.current,
        rect: ev.rect,
        count: ev.count,
        name: ev.name,
      }));
      setFlashes((prev) => [...prev.slice(-40), ...records]);
      const ids = new Set(records.map((r) => r.id));
      setTimeout(() => {
        setFlashes((prev) => prev.filter((f) => !ids.has(f.id)));
      }, 600);
    };
    const stop = startRenderFlasher(handle) ?? startFlasher(handle);
    return () => {
      stop();
      setFlashes([]);
    };
  }, [flashOn]);

  // State snapshot when the State tab opens
  useEffect(() => {
    if (tab !== "state" || !locked || !getStateSnapshot) return;
    Promise.resolve(getStateSnapshot()).then(setStateSnapshot);
  }, [tab, locked, getStateSnapshot]);

  if (!enabled || pos === null) return null;

  const modifierLabel =
    hoverModifier === "none" ? null : capitalize(hoverModifier);
  const hotkeyLabel = formatHotkey(hotkey);

  const highlightRect = hover?.rect ?? locked?.rect ?? null;
  const highlightBox = hover?.box ?? locked?.box ?? null;
  const labelBelow = (highlightRect?.top ?? 100) < 44;

  // The action menu drops away from the nearest edge: upward when the
  // launcher sits in the lower half of the viewport, downward otherwise.
  const menuUp = pos.y > window.innerHeight / 2;
  const menuExtra = menuOpen ? MENU_EXTRA : 0;

  // Panel follows the (draggable) launcher: above it when in the lower half
  // of the viewport, below it otherwise; clears the open menu; clamped
  // horizontally.
  const panelAbove = menuUp;
  const panelLeft = Math.min(
    Math.max(pos.x, 8),
    Math.max(8, window.innerWidth - PANEL_WIDTH - 16)
  );
  const panelAnchor: React.CSSProperties = panelAbove
    ? { bottom: window.innerHeight - pos.y + 12 + menuExtra }
    : { top: pos.y + BUTTON_SIZE + 12 + menuExtra };

  const selectedEntry = locked?.entries[selectedIdx] ?? null;

  const tabButton = (id: PanelTab, label: string) => (
    <button
      key={id}
      type="button"
      onClick={() => setTab(id)}
      style={{
        background: "none",
        border: "none",
        borderBottom:
          tab === id ? `2px solid ${accent}` : "2px solid transparent",
        color: tab === id ? "#e4e4e7" : "#71717a",
        cursor: "pointer",
        padding: "4px 8px",
        font: "inherit",
      }}
    >
      {label}
    </button>
  );

  return createPortal(
    <div data-dev-inspector-ui="" dir="ltr">
      {/* Update flashes */}
      <style>{`@keyframes devinspector-flash { to { opacity: 0; } }`}</style>
      {flashes.map((flash) => (
        <div
          key={flash.id}
          style={{
            position: "fixed",
            top: flash.rect.top,
            left: flash.rect.left,
            width: flash.rect.width,
            height: flash.rect.height,
            outline: `2px solid ${flashColor}`,
            outlineOffset: "-1px",
            background: hexAlpha(flashColor, 0.06),
            pointerEvents: "none",
            zIndex: zIndex - 1,
            animation: "devinspector-flash 600ms ease-out forwards",
          }}
        >
          <span
            style={{
              position: "absolute",
              top: -8,
              right: -4,
              background: flashColor,
              color: "#fff",
              borderRadius: 8,
              padding: "0 5px",
              font: "10px/16px ui-monospace, monospace",
            }}
          >
            {flash.name ? `${flash.name} ` : ""}×{flash.count}
          </span>
        </div>
      ))}

      {/* Box model bands + highlight box */}
      {highlightRect && highlightBox && (
        <BoxModelBands rect={highlightRect} box={highlightBox} zIndex={zIndex} />
      )}
      {highlightRect && (
        <div
          style={{
            position: "fixed",
            top: highlightRect.top,
            left: highlightRect.left,
            width: highlightRect.width,
            height: highlightRect.height,
            background: hexAlpha(accent, 0.12),
            outline: `2px solid ${accent}`,
            outlineOffset: "-1px",
            borderRadius: 3,
            pointerEvents: "none",
            zIndex,
          }}
        >
          {hover && (
            <div
              style={{
                position: "absolute",
                [labelBelow ? "top" : "bottom"]: "100%",
                [labelBelow ? "marginTop" : "marginBottom"]: 4,
                left: 0,
                maxWidth: "80vw",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                background: "#18181b",
                color: "#e4e4e7",
                border: "1px solid #3f3f46",
                borderRadius: 6,
                padding: "3px 8px",
                font: "11px/1.5 ui-monospace, monospace",
              }}
            >
              <span style={{ color: accentLight }}>&lt;{hover.name}&gt;</span>
              <span style={{ marginLeft: 8, color: "#52525b" }}>
                {Math.round(hover.rect.width)}×{Math.round(hover.rect.height)}
              </span>
              {hover.locationLabel && (
                <span style={{ marginLeft: 8, color: "#a1a1aa" }}>
                  {hover.locationLabel}
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Locked details panel */}
      {locked && (
        <div
          style={{
            position: "fixed",
            ...panelAnchor,
            left: panelLeft,
            width: PANEL_WIDTH,
            maxWidth: "calc(100vw - 32px)",
            maxHeight: "60vh",
            display: "flex",
            flexDirection: "column",
            background: "#18181b",
            color: "#e4e4e7",
            border: "1px solid #3f3f46",
            borderRadius: 10,
            boxShadow: "0 8px 30px rgba(0,0,0,0.45)",
            font: "12px/1.5 ui-monospace, monospace",
            zIndex: zIndex + 2,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              padding: "6px 12px 0",
              borderBottom: "1px solid #3f3f46",
            }}
          >
            {tabButton("source", "Source")}
            {tabButton("props", "Props")}
            {getStateSnapshot && tabButton("state", "State")}
            {tabButton("history", "History")}
            <span style={{ flex: 1 }} />
            <button
              type="button"
              aria-label="Close inspector panel"
              onClick={() => setLocked(null)}
              style={{ ...iconButtonStyle, color: "#a1a1aa" }}
            >
              <XIcon size={14} />
            </button>
          </div>

          <div style={{ overflowY: "auto", padding: "4px 0" }}>
            {tab === "source" && (
              <>
                {locked.className && (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "baseline",
                      gap: 8,
                      padding: "5px 12px",
                      borderBottom: "1px solid #27272a",
                      color: "#a1a1aa",
                    }}
                  >
                    <span
                      style={{
                        overflow: "hidden",
                        display: "-webkit-box",
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical",
                        flex: 1,
                      }}
                    >
                      {locked.className}
                    </span>
                    <CopyButton text={locked.className} label="Copy class list" />
                  </div>
                )}
                {locked.entries.map((entry, index) => {
                  const loc = locationText(entry);
                  const pending = entry.location === undefined;
                  return (
                    <div
                      key={`${entry.name}-${index}`}
                      role={entry.location ? "button" : undefined}
                      onClick={() =>
                        entry.location &&
                        openInEditor(entry.location, resolverOptions)
                      }
                      title={entry.location ? "Open in editor" : undefined}
                      style={{
                        display: "flex",
                        alignItems: "baseline",
                        gap: 8,
                        padding: "5px 12px",
                        cursor: entry.location ? "pointer" : "default",
                        background:
                          index === selectedIdx
                            ? hexAlpha(accent, 0.08)
                            : undefined,
                      }}
                    >
                      <span
                        style={{
                          color: entry.kind === "host" ? "#67e8f9" : accentLight,
                          flexShrink: 0,
                        }}
                      >
                        {entry.kind === "host" ? entry.name : `<${entry.name}>`}
                      </span>
                      <span
                        style={{
                          color: "#a1a1aa",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          direction: "rtl",
                          textAlign: "left",
                          flex: 1,
                        }}
                      >
                        {loc ?? (pending ? "resolving…" : "library / generated")}
                      </span>
                      <button
                        type="button"
                        aria-label={`Show props of ${entry.name}`}
                        title="Show props"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedIdx(index);
                          setTab("props");
                        }}
                        style={iconButtonStyle}
                      >
                        <BracesIcon size={12} />
                      </button>
                      {loc && (
                        <>
                          <CopyButton text={loc} label="Copy path" />
                          <ExternalLinkIcon
                            size={12}
                            style={{ color: "#52525b", flexShrink: 0 }}
                          />
                        </>
                      )}
                    </div>
                  );
                })}
                {locked.i18nMatches.length > 0 && (
                  <div style={{ borderTop: "1px solid #27272a", marginTop: 4 }}>
                    <div style={{ padding: "4px 12px 0", color: "#52525b" }}>
                      i18n
                    </div>
                    {locked.i18nMatches.map((match) => (
                      <div
                        key={`${match.lng}:${match.key}`}
                        style={{
                          display: "flex",
                          alignItems: "baseline",
                          gap: 8,
                          padding: "3px 12px",
                        }}
                      >
                        <span style={{ color: "#fcd34d", flexShrink: 0 }}>
                          {match.key}
                        </span>
                        <span
                          style={{
                            color: "#71717a",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            flex: 1,
                          }}
                        >
                          {match.lng} · {match.value}
                        </span>
                        <CopyButton
                          text={match.key}
                          label={`Copy key ${match.key}`}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            {tab === "props" && (
              <div style={{ padding: "6px 12px" }}>
                {selectedEntry ? (
                  <>
                    <div style={{ marginBottom: 6, color: accentLight }}>
                      {selectedEntry.kind === "host"
                        ? selectedEntry.name
                        : `<${selectedEntry.name}>`}
                      <span style={{ color: "#52525b" }}> props</span>
                    </div>
                    <JsonTree value={selectedEntry.props} />
                  </>
                ) : (
                  <span style={{ color: "#71717a" }}>Nothing selected.</span>
                )}
              </div>
            )}

            {tab === "state" && getStateSnapshot && (
              <div style={{ padding: "6px 12px" }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    marginBottom: 6,
                  }}
                >
                  <span style={{ color: accentLight }}>
                    {stateLabel}
                    <span style={{ color: "#52525b" }}> snapshot</span>
                  </span>
                  <button
                    type="button"
                    aria-label="Refresh state snapshot"
                    title="Refresh"
                    onClick={() =>
                      Promise.resolve(getStateSnapshot()).then(setStateSnapshot)
                    }
                    style={iconButtonStyle}
                  >
                    <RefreshIcon size={12} />
                  </button>
                </div>
                {stateSnapshot !== undefined ? (
                  <JsonTree value={stateSnapshot} />
                ) : (
                  <span style={{ color: "#71717a" }}>Loading…</span>
                )}
              </div>
            )}

            {tab === "history" && (
              <div style={{ padding: "2px 0" }}>
                {history.length === 0 && (
                  <div style={{ padding: "4px 12px", color: "#71717a" }}>
                    Nothing inspected yet.
                  </div>
                )}
                {history.map((item, index) => {
                  const gone = !item.el.isConnected;
                  return (
                    <div
                      key={index}
                      role={gone ? undefined : "button"}
                      onClick={() => !gone && lockElement(item.el)}
                      title={gone ? "Element unmounted" : "Re-inspect"}
                      style={{
                        display: "flex",
                        alignItems: "baseline",
                        gap: 8,
                        padding: "5px 12px",
                        cursor: gone ? "default" : "pointer",
                      }}
                    >
                      <span style={{ color: accentLight }}>
                        &lt;{item.label}&gt;
                      </span>
                      {gone && (
                        <span style={{ color: "#52525b" }}>unmounted</span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "6px 12px",
              borderTop: "1px solid #3f3f46",
              color: "#71717a",
              fontSize: 10,
            }}
          >
            <span style={{ flex: 1 }}>
              {modifierLabel ? `${modifierLabel}+hover to inspect · ` : ""}
              ↑↓←→ walk DOM · click row → editor · Esc close
            </span>
            <CopyAiButton
              accent={accentLight}
              getText={() =>
                buildAiContext({
                  entries: locked.entries,
                  i18nMatches: locked.i18nMatches,
                  className: locked.className,
                  selectedIdx,
                })
              }
            />
          </div>
        </div>
      )}

      {/* Launcher — one draggable button; the actions drop out of it one
          after another (away from the nearest viewport edge) and tuck back
          in when it is clicked again. */}
      <div
        style={{
          position: "fixed",
          top: pos.y,
          left: pos.x,
          width: BUTTON_SIZE,
          height: BUTTON_SIZE,
          zIndex: zIndex + 3,
        }}
      >
        <button
          type="button"
          aria-label={menuOpen ? "Close inspector menu" : "Open inspector menu"}
          aria-expanded={menuOpen}
          title={`Dev inspector · click to ${menuOpen ? "close" : "open"} · drag to move`}
          onPointerDown={(e) => {
            dragRef.current = {
              pointerStart: { x: e.clientX, y: e.clientY },
              posStart: pos,
            };
            draggedRef.current = false;
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            const drag = dragRef.current;
            if (!drag) return;
            const dx = e.clientX - drag.pointerStart.x;
            const dy = e.clientY - drag.pointerStart.y;
            if (!draggedRef.current && Math.hypot(dx, dy) < 4) return;
            draggedRef.current = true;
            setPos(
              clampToViewport({
                x: drag.posStart.x + dx,
                y: drag.posStart.y + dy,
              })
            );
          }}
          onPointerUp={() => {
            if (dragRef.current && draggedRef.current) {
              setPos((current) => {
                try {
                  localStorage.setItem(storageKey, JSON.stringify(current));
                } catch {
                  // Storage unavailable — position just won't persist.
                }
                return current;
              });
            }
            dragRef.current = null;
          }}
          onClick={() => {
            if (draggedRef.current) {
              draggedRef.current = false;
              return;
            }
            setMenuOpen((prev) => !prev);
          }}
          style={{
            ...fabStyle,
            position: "relative",
            zIndex: 1,
            touchAction: "none",
            background: "#18181b",
            color: menuOpen ? "#e4e4e7" : "#a1a1aa",
          }}
        >
          <span
            style={{
              display: "flex",
              transition: "transform 200ms ease",
              transform: menuOpen ? "rotate(90deg)" : "none",
            }}
          >
            {menuOpen ? <XIcon size={18} /> : <WrenchIcon size={18} />}
          </span>
          {!menuOpen && (active || flashOn) && (
            <span
              style={{
                position: "absolute",
                top: 1,
                right: 1,
                width: 9,
                height: 9,
                borderRadius: "50%",
                background: active ? accent : flashColor,
                border: "2px solid #18181b",
              }}
            />
          )}
        </button>
        {[
          {
            key: "inspect",
            label: `Toggle element inspector (${hotkeyLabel})`,
            title: `Inspect element source (${hotkeyLabel})${modifierLabel ? ` · or ${modifierLabel}+hover` : ""}`,
            on: active,
            onColor: accent,
            icon: <CrosshairIcon size={18} />,
            onClick: () => {
              setLocked(null);
              setHover(null);
              setActive((prev) => !prev);
            },
          },
          {
            key: "flash",
            label: "Toggle update flashes",
            title: getRenderBridge()
              ? "Flash component re-renders as they happen"
              : "Flash DOM updates as they happen (install next-dev-inspector/hook for true re-renders)",
            on: flashOn,
            onColor: flashColor,
            icon: <ZapIcon size={18} />,
            onClick: () => setFlashOn((prev) => !prev),
          },
        ].map((action, index, actions) => {
          const offset = (BUTTON_SIZE + BUTTON_GAP) * (index + 1);
          return (
            <button
              key={action.key}
              type="button"
              aria-label={action.label}
              aria-hidden={!menuOpen}
              tabIndex={menuOpen ? 0 : -1}
              title={action.title}
              onClick={action.onClick}
              style={{
                ...fabStyle,
                position: "absolute",
                left: 0,
                [menuUp ? "bottom" : "top"]: offset,
                background: action.on ? action.onColor : "#18181b",
                color: action.on ? "#ffffff" : "#a1a1aa",
                opacity: menuOpen ? 1 : 0,
                transform: menuOpen
                  ? "none"
                  : `translateY(${menuUp ? offset : -offset}px) scale(0.5)`,
                pointerEvents: menuOpen ? "auto" : "none",
                transition:
                  "transform 220ms cubic-bezier(0.34, 1.3, 0.64, 1), opacity 160ms ease",
                transitionDelay: `${(menuOpen ? index : actions.length - 1 - index) * 60}ms`,
              }}
            >
              {action.icon}
            </button>
          );
        })}
      </div>
    </div>,
    document.body
  );
}
