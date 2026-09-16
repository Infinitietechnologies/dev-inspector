import { describe, expect, it } from "vitest";
import { diffProps, snapshotProps } from "../src/propsChanges";

const compare = (before: unknown, after: unknown) => diffProps(snapshotProps(before), snapshotProps(after));

describe("props changes", () => {
  it("distinguishes added and removed props from undefined values", () => {
    expect(compare({ removed: undefined, quantity: 1 }, { added: undefined, quantity: 2 })).toEqual([
      { key: "removed", kind: "removed", before: "undefined", after: undefined, referenceOnly: false },
      { key: "quantity", kind: "changed", before: "1", after: "2", referenceOnly: false },
      { key: "added", kind: "added", before: undefined, after: "undefined", referenceOnly: false },
    ]);
  });
  it("uses Object.is for NaN, signed zero, and object references", () => {
    const shared = {};
    expect(compare({ nan: NaN, shared }, { nan: NaN, shared })).toEqual([]);
    expect(compare({ n: 0 }, { n: -0 })[0]).toMatchObject({ before: "0", after: "-0" });
    expect(compare({ options: {} }, { options: {} })[0].referenceOnly).toBe(true);
    expect(compare({ onClick: () => {} }, { onClick: () => {} })[0].referenceOnly).toBe(true);
  });
  it("preserves previous previews after mutation and safely handles cycles", () => {
    const value = { count: 1 };
    const before = snapshotProps({ value });
    value.count = 2;
    expect(diffProps(before, snapshotProps({ value: { count: 3 } }))[0].before).toBe("{ count: 1 }");
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(snapshotProps({ circular }).get("circular")?.text).toContain("[Circular]");
  });
  it("does not invoke top-level accessors", () => {
    const props = { get dangerous() { throw new Error("getter invoked"); } };
    expect(snapshotProps(props).get("dangerous")?.text).toBe("[Accessor]");
  });
  it("bounds the number of tracked props", () => {
    expect(snapshotProps(Object.fromEntries(Array.from({ length: 250 }, (_, i) => [i, i]))).size).toBe(200);
  });
});
