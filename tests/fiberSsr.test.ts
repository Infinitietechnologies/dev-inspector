import { afterEach, describe, expect, it, vi } from "vitest";
import { buildInspectChain } from "../src/fiber";

class FakeElement {
  parentElement: FakeElement | null = null;
  tagName = "BUTTON";
  className = "primary";
}

afterEach(() => vi.unstubAllGlobals());

function elementWithFiber(fiber: object): Element {
  vi.stubGlobal("Element", FakeElement);
  const element = new FakeElement();
  Object.assign(element, { "__reactFiber$test": fiber });
  return element as unknown as Element;
}

describe("SSR/RSC fiber metadata", () => {
  it("adds React 19 Server Components from _debugInfo", () => {
    const page = {
      name: "Page",
      env: "Server",
      props: { locale: "en" },
      stack: [["<anonymous>", "file:///app/entry.tsx", 8, 3]],
    };
    const card = {
      name: "ProductCard",
      env: "Server",
      props: { name: "Espresso" },
      stack: [["Page", "about://React/Server/app/page.js?1", 22, 7]],
      owner: page,
    };
    const element = elementWithFiber({
      type: "button",
      memoizedProps: { type: "button" },
      _debugStack:
        "Error\n    at ProductCard (about://React/Server/components/card.js?1:14:5)",
      _debugInfo: [{ time: 1 }, card],
      _debugOwner: null,
    });

    const chain = buildInspectChain(element);

    expect(chain.map((entry) => entry.name)).toEqual([
      "button.primary",
      "ProductCard",
      "Page",
    ]);
    expect(chain[0].stackFrames[0]).toMatchObject({ line1: 14, column1: 5 });
    expect(chain[0].stackFrames[0].runtime).toBe("server");
    expect(chain[1].stackFrames[0]).toMatchObject({
      methodName: "Page",
      line1: 22,
      column1: 7,
      runtime: "server",
    });
    expect(chain[1].props).toEqual({ name: "Espresso" });
  });

  it("uses React 18 _debugSource as an already-resolved location", () => {
    const element = elementWithFiber({
      type: "button",
      memoizedProps: {},
      _debugSource: {
        fileName: "webpack-internal:///./components/Button.tsx",
        lineNumber: 12,
        columnNumber: 4,
      },
      _debugOwner: null,
    });

    expect(buildInspectChain(element)[0].location).toEqual({
      file: "components/Button.tsx",
      editorFile: "components/Button.tsx",
      line1: 12,
      column1: 4,
    });
  });
});
