import { describe, expect, it, vi } from "vitest";
import { devInspectorHookScript } from "../src/hookScript";

interface FakeFiber {
  tag: number;
  type?: unknown;
  flags: number;
  stateNode?: unknown;
  child: FakeFiber | null;
  sibling: FakeFiber | null;
  alternate?: FakeFiber | null;
}

interface FakeWindow {
  __REACT_DEVTOOLS_GLOBAL_HOOK__?: {
    supportsFiber: boolean;
    inject: (renderer: unknown) => number;
    onCommitFiberRoot: (id: number, root: unknown) => void;
    __nextDevInspector: {
      enabled: boolean;
      listeners: Array<(entries: { node: unknown; name: string | null }[]) => void>;
    };
  };
}

const runScript = (win: FakeWindow) =>
  new Function("window", devInspectorHookScript)(win);

const installWithListener = () => {
  const win: FakeWindow = {};
  runScript(win);
  const hook = win.__REACT_DEVTOOLS_GLOBAL_HOOK__!;
  const listener = vi.fn();
  hook.__nextDevInspector.listeners.push(listener);
  hook.__nextDevInspector.enabled = true;
  return { win, hook, listener };
};

function TipSection() {}
function StaleCard() {}

const host = (): FakeFiber => ({
  tag: 5,
  stateNode: { nodeType: 1 },
  flags: 0,
  child: null,
  sibling: null,
});

/** Mount-shaped tree: no alternates anywhere. */
const makeMountTree = (flags: number) => {
  const hostFiber = host();
  const compFiber: FakeFiber = {
    tag: 0,
    type: TipSection,
    flags,
    child: hostFiber,
    sibling: null,
  };
  const rootFiber: FakeFiber = {
    tag: 3,
    flags: 0,
    child: compFiber,
    sibling: null,
    alternate: null,
  };
  return { root: { current: rootFiber }, hostNode: hostFiber.stateNode };
};

/**
 * Update-shaped commit mirroring React's cloning rules: the path to the
 * updated component is cloned (fresh fibers with alternates and reset-then-
 * set flags); an untouched sibling subtree is REUSED — the same fiber object
 * hangs off both the current and alternate parent, still carrying stale
 * PerformedWork flags and alternate === null.
 */
const makeUpdateTree = () => {
  const staleHost = host();
  const staleComp: FakeFiber = {
    tag: 0,
    type: StaleCard,
    flags: 1, // stale PerformedWork from its mount commit
    child: staleHost,
    sibling: null,
    alternate: null, // never cloned since mount
  };

  const renderedHost = host();
  renderedHost.sibling = staleComp; // reused subtree sits beside the host

  const compPrev: FakeFiber = {
    tag: 0,
    type: TipSection,
    flags: 0,
    child: renderedHost,
    sibling: null,
  };
  const compNext: FakeFiber = {
    tag: 0,
    type: TipSection,
    flags: 1, // re-rendered this commit
    child: renderedHost, // same child pointer -> subtree pruned
    sibling: null,
    alternate: compPrev,
  };

  const rootPrev: FakeFiber = { tag: 3, flags: 0, child: compPrev, sibling: null };
  const rootNext: FakeFiber = {
    tag: 3,
    flags: 0,
    child: compNext,
    sibling: null,
    alternate: rootPrev,
  };
  return {
    root: { current: rootNext },
    renderedNode: renderedHost.stateNode,
  };
};

describe("devInspectorHookScript", () => {
  it("installs a fiber-capable hook when none exists", () => {
    const win: FakeWindow = {};
    runScript(win);
    const hook = win.__REACT_DEVTOOLS_GLOBAL_HOOK__!;
    expect(hook.supportsFiber).toBe(true);
    expect(hook.inject({})).toBe(1);
    expect(hook.inject({})).toBe(2);
    expect(hook.__nextDevInspector).toEqual({ enabled: false, listeners: [] });
  });

  it("reports every component on a mount commit (no alternate tree)", () => {
    const { hook, listener } = installWithListener();
    const { root, hostNode } = makeMountTree(0);
    hook.onCommitFiberRoot(1, root);
    expect(listener).toHaveBeenCalledWith([{ node: hostNode, name: "TipSection" }]);
  });

  it("on updates, reports re-rendered components and prunes reused subtrees with stale flags", () => {
    const { hook, listener } = installWithListener();
    const { root, renderedNode } = makeUpdateTree();
    hook.onCommitFiberRoot(1, root);
    // TipSection (flags=1, cloned) is in; StaleCard (reused object, stale
    // flags, alternate null) is pruned because its parent's child pointer
    // is unchanged.
    expect(listener).toHaveBeenCalledWith([
      { node: renderedNode, name: "TipSection" },
    ]);
  });

  it("skips cloned-but-bailed-out components (flags reset by cloning)", () => {
    const { hook, listener } = installWithListener();
    const { root } = makeUpdateTree();
    const comp = (root.current as FakeFiber).child!;
    comp.flags = 0; // bailed out: cloned, no PerformedWork
    hook.onCommitFiberRoot(1, root);
    expect(listener).not.toHaveBeenCalled();
  });

  it("stays silent when the bridge is disabled", () => {
    const { hook, listener } = installWithListener();
    hook.__nextDevInspector.enabled = false;
    hook.onCommitFiberRoot(1, makeMountTree(1).root);
    expect(listener).not.toHaveBeenCalled();
  });

  it("piggybacks on an existing DevTools hook instead of replacing it", () => {
    const original = vi.fn();
    const existing = {
      supportsFiber: true,
      inject: () => 1,
      onCommitFiberRoot: original,
    };
    const win = {
      __REACT_DEVTOOLS_GLOBAL_HOOK__: existing,
    } as unknown as FakeWindow;
    runScript(win);

    const hook = win.__REACT_DEVTOOLS_GLOBAL_HOOK__!;
    expect(hook).toBe(existing as unknown as typeof hook);
    const listener = vi.fn();
    hook.__nextDevInspector.listeners.push(listener);
    hook.__nextDevInspector.enabled = true;

    const { root, hostNode } = makeMountTree(1);
    hook.onCommitFiberRoot(7, root);
    expect(listener).toHaveBeenCalledWith([{ node: hostNode, name: "TipSection" }]);
    expect(original).toHaveBeenCalledWith(7, root, undefined, undefined);
  });

  it("is idempotent — running twice keeps one bridge", () => {
    const win: FakeWindow = {};
    runScript(win);
    const bridge = win.__REACT_DEVTOOLS_GLOBAL_HOOK__!.__nextDevInspector;
    runScript(win);
    expect(win.__REACT_DEVTOOLS_GLOBAL_HOOK__!.__nextDevInspector).toBe(bridge);
  });
});
