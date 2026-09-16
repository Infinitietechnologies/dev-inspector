import { describe, expect, it } from "vitest";
import { currentFiber } from "../src/fiber";

type Fiber = Parameters<typeof currentFiber>[0];
function pair(): [Fiber, Fiber] {
  const a: Fiber = { type: "div" };
  const b: Fiber = { type: "div", alternate: a };
  a.alternate = b;
  return [a, b];
}

describe("committed fiber selection", () => {
  it("follows the root's current branch across repeated commits", () => {
    const [a, b] = pair();
    const [rootA, rootB] = pair();
    rootA.tag = rootB.tag = 3;
    const state = { current: rootA };
    rootA.stateNode = rootB.stateNode = state;
    a.return = rootA;
    b.return = rootB;
    rootA.child = a;
    rootB.child = b;
    expect(currentFiber(a)).toBe(a);
    state.current = rootB;
    expect(currentFiber(a)).toBe(b);
    state.current = rootA;
    expect(currentFiber(b)).toBe(a);
  });
  it("handles shared children from a parent bailout", () => {
    const [a, b] = pair();
    const [parentA, parentB] = pair();
    a.return = parentA;
    b.return = parentB;
    parentA.child = parentB.child = b;
    expect(currentFiber(a)).toBe(b);
  });
  it("handles alternate children sharing a return pointer", () => {
    const [a, b] = pair();
    const [rootA, rootB] = pair();
    rootA.tag = rootB.tag = 3;
    rootA.stateNode = rootB.stateNode = { current: rootA };
    a.return = b.return = rootA;
    rootA.child = b;
    rootB.child = a;
    expect(currentFiber(a)).toBe(b);
  });
  it("rejects detached alternate branches", () => {
    const [a] = pair();
    expect(currentFiber(a)).toBeNull();
  });
});
