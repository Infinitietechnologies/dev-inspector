// @vitest-environment jsdom
import { act, createElement, Fragment } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DevInspector } from "../src/DevInspector";
import { clampPanelWidth } from "../src/InspectorPanel";

let root: Root;
let showSecond = true;
function Item({ label }: { label: string }) {
  return createElement("button", null, label);
}
function App() {
  return createElement(
    Fragment,
    null,
    createElement(Item, { label: "First" }),
    showSecond && createElement(Item, { label: "Second" }),
    createElement(DevInspector),
  );
}
function click(label: string) {
  const button = [...document.querySelectorAll("button")].find(
    (button) =>
      button.getAttribute("aria-label") === label ||
      button.textContent === label,
  );
  expect(button, label).toBeTruthy();
  act(() => button!.click());
}
function search(query: string) {
  const input = document.querySelector<HTMLInputElement>(
    'input[aria-label="Search components"]',
  )!;
  act(() => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!.call(input, query);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
beforeEach(() => {
  showSecond = true;
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  localStorage.clear();
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() => root.render(createElement(App)));
  click("Open inspector menu");
  click("Browse components");
});
afterEach(() => {
  act(() => root.unmount());
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

describe("inspector navigation", () => {
  it("searches distinct instances and selects their props", () => {
    search("item");
    expect(document.querySelectorAll('[role="treeitem"]')).toHaveLength(2);
    click("Next matching component");
    expect(document.body.textContent).toContain("1 of 2");
    click("Next matching component");
    expect(document.body.textContent).toContain("2 of 2");
    click("Props");
    const panel = document.querySelector('[aria-label="Inspector panel"]')!;
    expect(panel.textContent).toContain('"Second"');
    click("Tree");
    search("does-not-exist");
    expect(panel.textContent).toContain("No matching components.");
  });
  it("collapses the tree and keeps keyboard arrows inside it", () => {
    click("Collapse App");
    expect(document.querySelectorAll('[role="treeitem"]')).toHaveLength(1);
    const row = document.querySelector<HTMLElement>('[role="treeitem"]')!;
    act(() =>
      row.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }),
      ),
    );
    expect(document.querySelectorAll('[role="treeitem"]')).toHaveLength(3);
  });
  it("persists docking and keyboard resizing across panel reopening", () => {
    search("Item");
    click("Next matching component");
    const select = document.querySelector<HTMLSelectElement>(
      '[aria-label="Panel position"]',
    )!;
    act(() => {
      select.value = "right";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    const separator = document.querySelector(
      '[aria-label="Resize inspector panel"]',
    )!;
    act(() =>
      separator.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }),
      ),
    );
    expect(separator.getAttribute("aria-valuenow")).toBe("440");
    click("Close inspector panel");
    click("Open inspector menu");
    click("Browse components");
    expect(
      document.querySelector<HTMLSelectElement>(
        '[aria-label="Panel position"]',
      )!.value,
    ).toBe("right");
    expect(
      document
        .querySelector('[aria-label="Resize inspector panel"]')!
        .getAttribute("aria-valuenow"),
    ).toBe("440");
  });
  it("clamps widths to narrow viewports and rejects invalid sizes", () => {
    expect(clampPanelWidth(1000, 320)).toBe(304);
    expect(clampPanelWidth(100, 1000)).toBe(280);
    expect(clampPanelWidth(NaN, 1000)).toBe(420);
  });
  it("rejects stale selections and refreshes after components unmount", () => {
    search("Item");
    showSecond = false;
    act(() => root.render(createElement(App)));
    click("Previous matching component");
    expect(document.body.textContent).toContain("Component removed or replaced");
    click("Refresh");
    expect(document.querySelectorAll('[role="treeitem"]')).toHaveLength(1);
  });
  it("resizes by pointer and stops when capture is cancelled", () => {
    const separator = document.querySelector<HTMLElement>('[aria-label="Resize inspector panel"]')!;
    Object.defineProperty(separator, "setPointerCapture", { value: vi.fn() });
    act(() => separator.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, clientX: 100 })));
    act(() => separator.dispatchEvent(new MouseEvent("pointermove", { bubbles: true, clientX: 160 })));
    expect(separator.getAttribute("aria-valuenow")).toBe("480");
    act(() => separator.dispatchEvent(new MouseEvent("pointercancel", { bubbles: true })));
    act(() => separator.dispatchEvent(new MouseEvent("pointermove", { bubbles: true, clientX: 200 })));
    expect(separator.getAttribute("aria-valuenow")).toBe("480");
  });
  it("preserves selection when using arrow keys in the search field", () => {
    search("Item"); click("Next matching component");
    const input = document.querySelector<HTMLInputElement>('[aria-label="Search components"]')!;
    act(() => input.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true })));
    expect(document.querySelector('[aria-label="Search components"]')).toBe(input);
    expect(document.body.textContent).toContain("1 of 2");
  });
});
