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
}

const MAX_FLASHES_PER_FRAME = 30;

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
