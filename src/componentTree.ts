import { buildInspectChain, type InspectedEntry } from "./fiber";

export interface ComponentNode {
  identity: object;
  entry: InspectedEntry;
  element: Element;
  children: ComponentNode[];
}

/** Index components with rendered elements, deduplicating owners and instances.
 * Explicit refresh keeps this bounded scan off the application's render path. */
export function scanComponents(root: Element): {
  roots: ComponentNode[];
  truncated: boolean;
} {
  const roots: ComponentNode[] = [];
  const nodes = new Map<object, ComponentNode>();
  const walker = root.ownerDocument.createTreeWalker(root, 1, {
    acceptNode: (node) =>
      (node as Element).hasAttribute("data-dev-inspector-ui") ? 2 : 1,
  });
  let element: Element | null = root;
  let visited = 0;
  let truncated = false;
  while (element) {
    if (++visited > 5000 || nodes.size >= 1000) {
      truncated = true;
      break;
    }
    if (!element.closest("[data-dev-inspector-ui]")) {
      try {
        const chain = buildInspectChain(element)
          .filter((entry) => entry.kind === "component")
          .reverse();
        let parent: ComponentNode | undefined;
        for (const entry of chain) {
          if (!entry.identity) continue;
          let node = nodes.get(entry.identity);
          if (!node) {
            if (nodes.size >= 1000) return { roots, truncated: true };
            node = { identity: entry.identity, entry, element, children: [] };
            nodes.set(entry.identity, node);
            (parent ? parent.children : roots).push(node);
          }
          parent = node;
        }
      } catch {
        // A malformed/unmounted fiber should not hide the rest of the page.
      }
    }
    element = walker.nextNode() as Element | null;
  }
  return { roots, truncated };
}

export function flattenComponents(roots: ComponentNode[]): ComponentNode[] {
  const result: ComponentNode[] = [];
  const pending = [...roots].reverse();
  while (pending.length) {
    const node = pending.pop()!;
    result.push(node);
    pending.push(...[...node.children].reverse());
  }
  return result;
}
