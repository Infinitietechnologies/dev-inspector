// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PropsPanel } from "../src/PropsPanel";
import { buildInspectChain, type InspectedEntry } from "../src/fiber";

vi.mock("../src/fiber", () => ({ buildInspectChain: vi.fn() }));
let container: HTMLDivElement;
let target: HTMLButtonElement;
let root: Root;
let entry: InspectedEntry;

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  target = document.createElement("button");
  document.body.append(container, target);
  root = createRoot(container);
  entry = { name: "Counter", kind: "component", identity: {}, props: { quantity: 1 }, stackFrames: [] };
  vi.mocked(buildInspectChain).mockImplementation(() => [entry]);
  act(() => root.render(createElement(PropsPanel, { el: target, index: 0 })));
});
afterEach(() => {
  act(() => root.unmount());
  document.body.replaceChildren();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
function tick() { act(() => { vi.advanceTimersByTime(250); }); }
function click(label: string) {
  const button = [...container.querySelectorAll("button")].find(button => button.textContent === label)!;
  act(() => button.click());
}

describe("live props panel", () => {
  it("shows and retains the latest change, then resets the baseline", () => {
    entry.props = { quantity: 2 };
    tick();
    expect(container.textContent).toContain("Before: 1");
    expect(container.textContent).toContain("After: 2");
    tick();
    expect(container.textContent).toContain("Before: 1");
    click("Reset changes");
    expect(container.textContent).not.toContain("Before:");
    entry.props = { quantity: 3 };
    tick();
    expect(container.textContent).toContain("Before: 2");
  });
  it("pauses polling and resumes from the last observation", () => {
    click("Pause");
    const calls = vi.mocked(buildInspectChain).mock.calls.length;
    entry.props = { quantity: 5 };
    tick();
    expect(buildInspectChain).toHaveBeenCalledTimes(calls);
    expect(container.textContent).not.toContain("After: 5");
    click("Resume");
    expect(container.textContent).toContain("After: 5");
  });
  it("does not compare different component instances", () => {
    entry = { ...entry, identity: {}, props: { quantity: 99 } };
    tick();
    expect(container.textContent).not.toContain("Before:");
    expect(container.textContent).toContain("99");
  });
  it("reports a removed target and cleans up polling on unmount", () => {
    target.remove();
    tick();
    expect(container.textContent).toContain("Element removed");
    act(() => root.render(null));
    expect(vi.getTimerCount()).toBe(0);
  });
});
