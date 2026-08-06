import { describe, expect, it } from "vitest";
import { buildAiContext, serializeValue } from "../src/aiContext";
import { InspectedEntry } from "../src/fiber";

describe("serializeValue", () => {
  it("renders primitives", () => {
    expect(serializeValue("hi")).toBe('"hi"');
    expect(serializeValue(42)).toBe("42");
    expect(serializeValue(true)).toBe("true");
    expect(serializeValue(null)).toBe("null");
    expect(serializeValue(undefined)).toBe("undefined");
    expect(serializeValue(10n)).toBe("10n");
  });

  it("truncates long strings", () => {
    const out = serializeValue("x".repeat(200));
    expect(out.length).toBeLessThan(100);
    expect(out).toContain("…");
  });

  it("renders functions and React elements as placeholders", () => {
    function onClick() {}
    expect(serializeValue(onClick)).toBe("ƒ onClick()");
    const element = { $$typeof: Symbol("react"), type: onClick, props: {} };
    expect(serializeValue(element)).toBe("<onClick />");
  });

  it("renders nested objects and arrays with caps", () => {
    expect(serializeValue({ a: 1, b: [1, 2] })).toBe("{ a: 1, b: [1, 2] }");
    const long = serializeValue(Array.from({ length: 15 }, (_, i) => i));
    expect(long).toContain("… +5 more");
  });

  it("collapses beyond max depth", () => {
    expect(serializeValue({ a: { b: { c: { d: 1 } } } })).toBe(
      "{ a: { b: { c: {…} } } }"
    );
  });

  it("survives circular references", () => {
    const obj: Record<string, unknown> = { name: "loop" };
    obj.self = obj;
    expect(serializeValue(obj)).toBe('{ name: "loop", self: [Circular] }');
  });
});

describe("buildAiContext", () => {
  const entries: InspectedEntry[] = [
    {
      name: "button.btn",
      kind: "host",
      stackFrames: [],
      props: { type: "button" },
      location: {
        file: "components/ProductCard.tsx",
        editorFile: "components/ProductCard.tsx",
        line1: 20,
        column1: 7,
      },
    },
    {
      name: "ProductCard",
      kind: "component",
      stackFrames: [],
      props: { name: "Espresso", price: 2.5 },
      location: {
        file: "app/page.tsx",
        editorFile: "app/page.tsx",
        line1: 26,
        column1: 11,
      },
    },
    {
      name: "Page",
      kind: "component",
      stackFrames: [],
      props: {},
      location: null,
    },
  ];

  it("formats chain, classes, selected props and i18n matches", () => {
    const text = buildAiContext({
      entries,
      i18nMatches: [{ lng: "en", key: "product.add_to_cart", value: "Add to cart" }],
      className: "btn btn-primary",
      selectedIdx: 1,
    });
    expect(text).toContain("1. button.btn — components/ProductCard.tsx:20");
    expect(text).toContain("2. <ProductCard> — app/page.tsx:26");
    expect(text).toContain("3. <Page> — (library / generated)");
    expect(text).toContain("Classes: btn btn-primary");
    expect(text).toContain("Props of <ProductCard>:");
    expect(text).toContain('{ name: "Espresso", price: 2.5 }');
    expect(text).toContain('- product.add_to_cart (en) = "Add to cart"');
  });

  it("falls back to the first component entry when selection is out of range", () => {
    const text = buildAiContext({
      entries,
      i18nMatches: [],
      className: "",
      selectedIdx: 99,
    });
    expect(text).toContain("Props of <ProductCard>:");
    expect(text).not.toContain("i18n matches");
  });
});
