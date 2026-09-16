import { useEffect, useMemo, useState } from "react";
import { buildInspectChain } from "./fiber";
import {
  flattenComponents,
  scanComponents,
  type ComponentNode,
} from "./componentTree";

const controlStyle = {
  background: "#27272a",
  color: "#e4e4e7",
  border: "1px solid #52525b",
  borderRadius: 4,
  padding: "4px 8px",
  font: "inherit",
};

export function ComponentBrowser({
  onSelect,
  onPreview,
}: {
  onSelect: (node: ComponentNode) => void;
  onPreview: (node: ComponentNode | null) => void;
}) {
  const [tree, setTree] = useState(() => scanComponents(document.body));
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState<Set<object>>(new Set());
  const [selected, setSelected] = useState<object | null>(null);
  const [message, setMessage] = useState("");
  useEffect(() => () => onPreview(null), []);
  const all = useMemo(() => flattenComponents(tree.roots), [tree]);
  const matches = useMemo(
    () =>
      all.filter((node) =>
        node.entry.name.toLowerCase().includes(query.trim().toLowerCase()),
      ),
    [all, query],
  );
  const searching = query.trim().length > 0;
  const rows: { node: ComponentNode; depth: number }[] = [];
  const append = (nodes: ComponentNode[], depth: number) => {
    for (const node of nodes) {
      rows.push({ node, depth });
      if (!collapsed.has(node.identity)) append(node.children, depth + 1);
    }
  };
  if (searching) rows.push(...matches.map((node) => ({ node, depth: 0 })));
  else append(tree.roots, 0);

  const choose = (node: ComponentNode) => {
    if (
      !node.element.isConnected ||
      !buildInspectChain(node.element).some(
        (entry) => entry.identity === node.identity,
      )
    ) {
      setMessage("Component removed or replaced. Refresh the tree.");
      return;
    }
    setMessage("");
    setSelected(node.identity);
    onSelect(node);
  };
  const toggle = (identity: object) =>
    setCollapsed((previous) => {
      const next = new Set(previous);
      if (next.has(identity)) next.delete(identity);
      else next.add(identity);
      return next;
    });
  const navigate = (direction: number) => {
    if (!matches.length) return;
    const current = matches.findIndex((node) => node.identity === selected);
    const next =
      current < 0
        ? direction > 0
          ? 0
          : matches.length - 1
        : (current + direction + matches.length) % matches.length;
    choose(matches[next]);
  };

  return (
    <div style={{ padding: "8px 12px" }} onMouseLeave={() => onPreview(null)}>
      <div style={{ display: "flex", gap: 6 }}>
        <input
          aria-label="Search components"
          placeholder="Search components…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              navigate(event.shiftKey ? -1 : 1);
            }
          }}
          style={{ ...controlStyle, minWidth: 0, flex: 1 }}
        />
        <button
          type="button"
          style={controlStyle}
          onClick={() => {
            setTree(scanComponents(document.body));
            setMessage("");
            onPreview(null);
          }}
        >
          Refresh
        </button>
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          margin: "8px 0",
        }}
      >
        <span role="status" style={{ flex: 1, color: "#a1a1aa" }}>
          {searching
            ? `${matches.length} matches${matches.some((node) => node.identity === selected) ? ` · ${matches.findIndex((node) => node.identity === selected) + 1} of ${matches.length}` : ""}`
            : `${all.length} components`}
        </span>
        {searching && (
          <>
            <button
              type="button"
              style={controlStyle}
              aria-label="Previous matching component"
              disabled={!matches.length}
              onClick={() => navigate(-1)}
            >
              Previous
            </button>
            <button
              type="button"
              style={controlStyle}
              aria-label="Next matching component"
              disabled={!matches.length}
              onClick={() => navigate(1)}
            >
              Next
            </button>
          </>
        )}
      </div>
      <div style={{ color: "#a1a1aa", fontSize: 11, marginBottom: 8 }}>
        Select a component, then open Source or Props. Refresh after page
        changes.
      </div>
      {message && <div role="status">{message}</div>}
      {tree.truncated && (
        <div role="status">Large page: showing a limited component tree.</div>
      )}
      {!rows.length && (
        <div>
          {searching
            ? "No matching components."
            : "No components with rendered elements found."}
        </div>
      )}
      <div
        role="tree"
        aria-label={searching ? "Matching components" : "Component tree"}
      >
        {rows.map(({ node, depth }, index) => (
          <div
            key={all.indexOf(node)}
            role="treeitem"
            aria-level={depth + 1}
            aria-selected={selected === node.identity}
            aria-expanded={
              !searching && node.children.length
                ? !collapsed.has(node.identity)
                : undefined
            }
            tabIndex={0}
            onMouseEnter={() => onPreview(node)}
            onFocus={() => onPreview(node)}
            onBlur={() => onPreview(null)}
            onKeyDown={(event) => {
              if (event.target !== event.currentTarget) return;
              const focusRow = (offset: number) =>
                (
                  event.currentTarget.parentElement?.children[
                    index + offset
                  ] as HTMLElement | undefined
                )?.focus();
              if (event.key === "ArrowDown") focusRow(1);
              else if (event.key === "ArrowUp") focusRow(-1);
              else if (
                event.key === "ArrowLeft" &&
                !searching &&
                node.children.length &&
                !collapsed.has(node.identity)
              )
                toggle(node.identity);
              else if (
                event.key === "ArrowRight" &&
                !searching &&
                node.children.length &&
                collapsed.has(node.identity)
              )
                toggle(node.identity);
              else if (event.key === "Enter" || event.key === " ") choose(node);
              else return;
              event.preventDefault();
            }}
            style={{
              display: "flex",
              alignItems: "center",
              paddingLeft: Math.min(depth * 12, 120),
              background: selected === node.identity ? "#312e81" : undefined,
              borderRadius: 4,
            }}
          >
            {!searching && node.children.length > 0 ? (
              <button
                type="button"
                style={{
                  ...controlStyle,
                  border: 0,
                  background: "none",
                  padding: "2px 4px",
                }}
                aria-label={`${collapsed.has(node.identity) ? "Expand" : "Collapse"} ${node.entry.name}`}
                onClick={() => toggle(node.identity)}
              >
                {collapsed.has(node.identity) ? "▸" : "▾"}
              </button>
            ) : (
              <span style={{ width: 20, flexShrink: 0 }} />
            )}
            <button
              type="button"
              onClick={() => choose(node)}
              style={{
                ...controlStyle,
                border: 0,
                background: "none",
                textAlign: "left",
                cursor: "pointer",
                overflowWrap: "anywhere",
              }}
            >
              &lt;{node.entry.name}&gt;
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
