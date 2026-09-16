// @vitest-environment jsdom
import { act, createElement, Fragment } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flattenComponents, scanComponents } from "../src/componentTree";

beforeEach(() => vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true));
afterEach(() => {
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

describe("component index", () => {
  it("preserves ownership, distinct instances, and fragment deduplication", () => {
    function Item() {
      return createElement(
        Fragment,
        null,
        createElement("span", null, "one"),
        createElement("span", null, "two"),
      );
    }
    function List() {
      return createElement(
        "main",
        null,
        createElement(Item),
        createElement(Item),
      );
    }
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    try {
      act(() => root.render(createElement(List)));
      const tree = scanComponents(document.body);
      expect(tree.roots.map((node) => node.entry.name)).toEqual(["List"]);
      expect(tree.roots[0].children.map((node) => node.entry.name)).toEqual([
        "Item",
        "Item",
      ]);
      const all = flattenComponents(tree.roots);
      expect(all).toHaveLength(3);
      expect(all[1].identity).not.toBe(all[2].identity);
      expect(scanComponents(document.body).roots[0].identity).toBe(
        tree.roots[0].identity,
      );
      act(() => root.render(null));
      expect(scanComponents(document.body).roots).toHaveLength(0);
    } finally {
      act(() => root.unmount());
    }
  });
  it("excludes inspector UI and bounds work on large pages", () => {
    function OwnUi() {
      return createElement("button", null, "Inspector");
    }
    const container = document.createElement("div");
    container.setAttribute("data-dev-inspector-ui", "");
    document.body.append(container);
    const root = createRoot(container);
    try {
      act(() => root.render(createElement(OwnUi)));
      expect(scanComponents(document.body).roots).toHaveLength(0);
      const large = document.createElement("main");
      large.innerHTML = "<div></div>".repeat(5001);
      document.body.append(large);
      expect(scanComponents(document.body).truncated).toBe(true);
    } finally {
      act(() => root.unmount());
    }
  });
});
