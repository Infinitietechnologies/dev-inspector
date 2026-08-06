/**
 * DOM-update flasher for the DevInspector widget.
 *
 * Watches the document with a MutationObserver and reports which elements
 * changed, batched per animation frame, with a running per-element counter.
 * Note: this flashes *DOM updates* (React commit mutations) — a memoized
 * re-render that produces no DOM change won't flash. Installing the real
 * React DevTools hook isn't possible from code that loads after React.
 */

export interface FlashEvent {
  el: Element;
  rect: DOMRect;
  count: number;
  /** Component name — only present in re-render mode (early hook installed). */
  name?: string | null;
}

/** Entry pushed by the early hook script (see hookScript.ts). */
export interface RenderFlashEntry {
  node: Element;
  name: string | null;
}

interface RenderBridge {
  enabled: boolean;
  listeners: Array<(entries: RenderFlashEntry[]) => void>;
}

/**
 * The bridge the early hook script exposes on the DevTools hook, or null if
 * the consumer didn't install it (see "next-dev-inspector/hook").
 */
export function getRenderBridge(): RenderBridge | null {
  if (typeof window === "undefined") return null;
  const hook = (
    window as unknown as {
      __REACT_DEVTOOLS_GLOBAL_HOOK__?: { __nextDevInspector?: RenderBridge };
    }
  ).__REACT_DEVTOOLS_GLOBAL_HOOK__;
  return hook?.__nextDevInspector ?? null;
}

const MAX_FLASHES_PER_FRAME = 30;

/**
 * Flashes true component re-renders via the early hook's commit events.
 * Returns null when the hook isn't installed — fall back to startFlasher.
 *
 * Commit events arrive synchronously from inside React's commit phase, so
 * they are buffered and flushed on the next animation frame — calling
 * setState from the listener directly would count as a nested update and
 * eventually trip React's update-depth limit.
 */
export function startRenderFlasher(
  onFlash: (events: FlashEvent[]) => void
): (() => void) | null {
  const bridge = getRenderBridge();
  if (!bridge) return null;

  const counts = new WeakMap<Element, number>();
  let pending: RenderFlashEntry[] = [];
  let scheduled = false;
  let stopped = false;

  const flush = () => {
    scheduled = false;
    if (stopped) return;
    const entries = pending;
    pending = [];
    const events: FlashEvent[] = [];
    const seen = new Set<Element>();
    for (const { node, name } of entries) {
      if (events.length >= MAX_FLASHES_PER_FRAME) break;
      if (!node.isConnected || seen.has(node)) continue;
      if (node.closest("[data-dev-inspector-ui]")) continue;
      seen.add(node);
      const rect = node.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) continue;
      const count = (counts.get(node) ?? 0) + 1;
      counts.set(node, count);
      events.push({ el: node, rect, count, name });
    }
    if (events.length > 0) onFlash(events);
  };

  const listener = (entries: RenderFlashEntry[]) => {
    pending.push(...entries);
    if (!scheduled && pending.length > 0) {
      scheduled = true;
      requestAnimationFrame(flush);
    }
  };

  bridge.listeners.push(listener);
  bridge.enabled = true;
  return () => {
    stopped = true;
    pending = [];
    const index = bridge.listeners.indexOf(listener);
    if (index >= 0) bridge.listeners.splice(index, 1);
    bridge.enabled = bridge.listeners.length > 0;
  };
}

export function startFlasher(
  onFlash: (events: FlashEvent[]) => void
): () => void {
  const counts = new WeakMap<Element, number>();
  const pending = new Set<Element>();
  let scheduled = false;
  let stopped = false;

  const flush = () => {
    scheduled = false;
    if (stopped) return;
    const events: FlashEvent[] = [];
    for (const el of pending) {
      if (events.length >= MAX_FLASHES_PER_FRAME) break;
      if (!el.isConnected) continue;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) continue;
      const count = (counts.get(el) ?? 0) + 1;
      counts.set(el, count);
      events.push({ el, rect, count });
    }
    pending.clear();
    if (events.length > 0) onFlash(events);
  };

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      const target = mutation.target;
      const el =
        target instanceof Element ? target : target.parentElement;
      if (
        !el ||
        el === document.body ||
        el === document.documentElement ||
        el.closest("[data-dev-inspector-ui]")
      ) {
        continue;
      }
      pending.add(el);
    }
    if (!scheduled && pending.size > 0) {
      scheduled = true;
      requestAnimationFrame(flush);
    }
  });

  observer.observe(document.body, {
    subtree: true,
    childList: true,
    attributes: true,
    characterData: true,
  });

  return () => {
    stopped = true;
    observer.disconnect();
    pending.clear();
  };
}
