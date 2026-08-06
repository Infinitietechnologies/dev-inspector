import { describe, expect, it } from "vitest";
import { normalizeSourcePath, parseComponentStack } from "../src/parseStack";

describe("parseComponentStack", () => {
  it("parses Chrome-style frames with and without method names", () => {
    const stack = [
      "Error",
      "    at TipSection (http://localhost:3000/_next/static/chunks/src_c0ffee.js:341:88)",
      "    at http://localhost:3000/_next/static/chunks/src_c0ffee.js:12:5",
    ].join("\n");

    expect(parseComponentStack(stack)).toEqual([
      {
        methodName: "TipSection",
        file: "http://localhost:3000/_next/static/chunks/src_c0ffee.js",
        line1: 341,
        column1: 88,
      },
      {
        methodName: "<unknown>",
        file: "http://localhost:3000/_next/static/chunks/src_c0ffee.js",
        line1: 12,
        column1: 5,
      },
    ]);
  });

  it("parses Firefox-style frames", () => {
    const stack =
      "TipSection@http://localhost:3000/_next/static/chunks/src_c0ffee.js:341:88";
    expect(parseComponentStack(stack)).toEqual([
      {
        methodName: "TipSection",
        file: "http://localhost:3000/_next/static/chunks/src_c0ffee.js",
        line1: 341,
        column1: 88,
      },
    ]);
  });

  it("drops React marker frames, jsx runtime, node internals and anonymous frames", () => {
    const stack = [
      "Error",
      "    at react-stack-bottom-frame (http://localhost:3000/_next/static/chunks/node_modules_react.js:1:1)",
      "    at exports.jsxDEV (http://localhost:3000/_next/static/chunks/node_modules_react_jsx-dev-runtime.js:2:2)",
      "    at Anon (<anonymous>:1:1)",
      "    at internal (node:internal/process:10:3)",
      "    at CartAdditionalInfo (http://localhost:3000/_next/static/chunks/src_views.js:50:10)",
    ].join("\n");

    const frames = parseComponentStack(stack);
    expect(frames).toHaveLength(1);
    expect(frames[0].methodName).toBe("CartAdditionalInfo");
  });

  it("returns an empty array for missing or garbage input", () => {
    expect(parseComponentStack(undefined)).toEqual([]);
    expect(parseComponentStack(null)).toEqual([]);
    expect(parseComponentStack("not a stack at all")).toEqual([]);
  });
});

describe("normalizeSourcePath", () => {
  it("strips the turbopack [project] prefix", () => {
    expect(normalizeSourcePath("[project]/src/components/Cart/TipSection.tsx")).toBe(
      "src/components/Cart/TipSection.tsx"
    );
  });

  it("converts Windows separators to forward slashes", () => {
    expect(normalizeSourcePath("src\\components\\Cart\\TipSection.tsx")).toBe(
      "src/components/Cart/TipSection.tsx"
    );
  });
});
