import { describe, expect, it } from "vitest";
import { buildEditorUrl } from "../src/fiber";
import type { ResolvedLocation } from "../src/fiber";

const loc = (editorFile: string, line1: number | null = 42, column1: number | null = 7): ResolvedLocation => ({
  file: editorFile,
  editorFile,
  line1,
  column1,
});

describe("buildEditorUrl", () => {
  it("prefixes relative paths with the project root", () => {
    expect(
      buildEditorUrl(loc("src/components/Cart.tsx"), "vscode", "/home/me/app")
    ).toBe("vscode://file//home/me/app/src/components/Cart.tsx:42:7");
  });

  it("handles Windows roots and trailing slashes", () => {
    expect(
      buildEditorUrl(loc("src/Cart.tsx"), "vscode", "C:\\dev\\app\\")
    ).toBe("vscode://file/C:/dev/app/src/Cart.tsx:42:7");
  });

  it("returns null for relative paths without a root", () => {
    expect(buildEditorUrl(loc("src/Cart.tsx"), "vscode")).toBeNull();
  });

  it("uses absolute posix paths as-is, ignoring the root", () => {
    expect(
      buildEditorUrl(loc("/home/me/app/src/Cart.tsx"), "cursor", "/elsewhere")
    ).toBe("cursor://file//home/me/app/src/Cart.tsx:42:7");
  });

  it("unwraps file:// URLs, including Windows drive paths", () => {
    expect(
      buildEditorUrl(loc("file:///D:/projects/app/src/Cart.tsx"), "vscode")
    ).toBe("vscode://file/D:/projects/app/src/Cart.tsx:42:7");
    expect(
      buildEditorUrl(loc("file:///home/me/app/src/Cart.tsx"), "vscode")
    ).toBe("vscode://file//home/me/app/src/Cart.tsx:42:7");
  });

  it("decodes percent-encoded file:// paths", () => {
    expect(
      buildEditorUrl(loc("file:///home/me/my%20app/src/Cart.tsx"), "vscode")
    ).toBe("vscode://file//home/me/my app/src/Cart.tsx:42:7");
  });

  it("defaults missing line/column to 1", () => {
    expect(
      buildEditorUrl(loc("src/Cart.tsx", null, null), "vscode-insiders", "/app")
    ).toBe("vscode-insiders://file//app/src/Cart.tsx:1:1");
  });
});
