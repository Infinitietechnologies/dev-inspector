/**
 * Source of the early re-render hook, kept as a plain-JS string so consumers
 * can inline it in a <script> tag that runs BEFORE React loads (the only
 * moment a __REACT_DEVTOOLS_GLOBAL_HOOK__ can be installed).
 *
 * If the real React DevTools hook is already present (browser extension —
 * its content script runs at document_start), we piggyback by wrapping its
 * onCommitFiberRoot instead of replacing it. Either way a small bridge
 * object is exposed at hook.__nextDevInspector; the widget's flasher
 * subscribes to it and, when present, flashes true component re-renders
 * (with names) instead of raw DOM mutations.
 *
 * Fiber internals relied on (stable across React 18/19 dev builds):
 * tag 0/1/11/14/15 = function/class/forwardRef/memo components,
 * tag 5/26/27 = host elements, flags bit 1 = PerformedWork.
 *
 * PerformedWork alone is not enough: subtrees that fully bail out are reused
 * as the SAME fiber objects (never re-cloned), keeping stale flags — and
 * alternate === null there despite being mounted long ago. So, like React
 * DevTools, commits are walked as a diff against the alternate tree, pruning
 * any subtree whose child pointer is unchanged (identical object = React
 * never touched it this commit). Within visited fibers, PerformedWork is
 * reliable because cloning resets it.
 */

export const devInspectorHookScript = String.raw`(function () {
  if (typeof window === "undefined") return;
  var g = window;
  var bridge = { enabled: false, listeners: [] };

  function displayName(type) {
    if (!type) return null;
    if (typeof type === "function") return type.displayName || type.name || null;
    if (typeof type === "object") {
      return type.displayName || displayName(type.render || type.type);
    }
    return null;
  }

  function findHostNode(fiber) {
    var f = fiber.child;
    var depth = 0;
    while (f && depth++ < 40) {
      if ((f.tag === 5 || f.tag === 26 || f.tag === 27) && f.stateNode) {
        return f.stateNode;
      }
      f = f.child;
    }
    return null;
  }

  function isComponent(tag) {
    return tag === 0 || tag === 1 || tag === 11 || tag === 14 || tag === 15;
  }

  function report(fiber, out) {
    var node = findHostNode(fiber);
    if (node && node.nodeType === 1) {
      out.push({ node: node, name: displayName(fiber.type) });
    }
  }

  /** Everything in a subtree with no alternate just mounted. */
  function collectMounts(fiber, out) {
    if (!fiber || out.length >= 60) return;
    if (isComponent(fiber.tag)) report(fiber, out);
    collectMounts(fiber.child, out);
    collectMounts(fiber.sibling, out);
  }

  /** Diff walk: prune subtrees React reused wholesale this commit. */
  function collectUpdates(next, prev, out) {
    if (!next || out.length >= 60) return;
    if (isComponent(next.tag) && (next.flags & 1) === 1) {
      report(next, out);
    }
    if (next.child === prev.child) return;
    var child = next.child;
    while (child && out.length < 60) {
      if (child.alternate) {
        collectUpdates(child, child.alternate, out);
      } else {
        collectMounts(child, out);
      }
      child = child.sibling;
    }
  }

  function onCommit(root) {
    if (!bridge.enabled || bridge.listeners.length === 0 || !root) return;
    var out = [];
    try {
      var current = root.current;
      if (current.alternate) {
        collectUpdates(current, current.alternate, out);
      } else {
        collectMounts(current, out);
      }
    } catch (e) {}
    if (out.length === 0) return;
    for (var i = 0; i < bridge.listeners.length; i++) {
      try {
        bridge.listeners[i](out);
      } catch (e) {}
    }
  }

  var existing = g.__REACT_DEVTOOLS_GLOBAL_HOOK__;
  if (existing) {
    if (existing.__nextDevInspector) return;
    existing.__nextDevInspector = bridge;
    var prev = existing.onCommitFiberRoot;
    existing.onCommitFiberRoot = function (id, root, priority, didError) {
      try {
        onCommit(root);
      } catch (e) {}
      if (typeof prev === "function") {
        return prev.call(existing, id, root, priority, didError);
      }
    };
    return;
  }

  var counter = 0;
  var hook = {
    renderers: new Map(),
    supportsFiber: true,
    isDisabled: false,
    __nextDevInspector: bridge,
    inject: function (renderer) {
      var id = ++counter;
      hook.renderers.set(id, renderer);
      return id;
    },
    checkDCE: function () {},
    setStrictMode: function () {},
    onScheduleFiberRoot: function () {},
    onCommitFiberUnmount: function () {},
    onPostCommitFiberRoot: function () {},
    onCommitFiberRoot: function (id, root) {
      onCommit(root);
    },
  };
  g.__REACT_DEVTOOLS_GLOBAL_HOOK__ = hook;
})();`;
