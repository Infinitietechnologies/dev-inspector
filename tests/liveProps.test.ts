// @vitest-environment jsdom
import { act, createElement, memo, useState } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { buildInspectChain } from "../src/fiber";

it("reads current owner props through repeated React commits and memo bailouts", () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  let update: (value: number) => void = () => {};
  const Child = memo(function Child({ value }: { value: number }) {
    // Props change even though this component's DOM output stays the same.
    void value;
    return createElement("button", null, "Counter");
  });
  function Parent() {
    const [count, setCount] = useState(0);
    update = setCount;
    return createElement(Child, { value: Math.floor(count / 2) });
  }
  try {
    act(() => root.render(createElement(Parent)));
    const el = container.querySelector("button")!;
    const initial = buildInspectChain(el).find(entry => entry.name === "Child")!;
    expect(initial.props).toEqual({ value: 0 });
    for (let count = 1; count <= 6; count++) {
      act(() => update(count));
      const child = buildInspectChain(el).find(entry => entry.name === "Child")!;
      expect(child.props).toEqual({ value: Math.floor(count / 2) });
      expect(child.identity).toBe(initial.identity);
    }
  } finally {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  }
});
