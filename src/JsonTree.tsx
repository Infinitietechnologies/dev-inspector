/**
 * Compact read-only value tree for the DevInspector Props/State tabs.
 * Depth-capped, entry-capped, and aware of functions / React elements /
 * DOM nodes so dumping component props never explodes.
 */

const MAX_DEPTH = 5;
const MAX_ENTRIES = 30;
const MAX_STRING = 120;

const COLORS = {
  key: "#d4d4d8",
  string: "#86efac",
  number: "#fca5a5",
  boolean: "#fcd34d",
  nullish: "#71717a",
  function: "#a78bfa",
  element: "#67e8f9",
  muted: "#71717a",
};

function isReactElement(value: object): boolean {
  return "$$typeof" in value && "type" in value && "props" in value;
}

function elementName(value: { type?: unknown }): string {
  const type = value.type;
  if (typeof type === "string") return type;
  if (typeof type === "function") {
    const fn = type as { displayName?: string; name?: string };
    return fn.displayName || fn.name || "Component";
  }
  return "Component";
}

function Leaf({ color, text }: { color: string; text: string }) {
  return <span style={{ color }}>{text}</span>;
}

export function JsonTree({
  value,
  depth = 0,
}: {
  value: unknown;
  depth?: number;
}) {
  if (value === null) return <Leaf color={COLORS.nullish} text="null" />;
  if (value === undefined)
    return <Leaf color={COLORS.nullish} text="undefined" />;

  switch (typeof value) {
    case "string": {
      const text =
        value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}…` : value;
      return <Leaf color={COLORS.string} text={`"${text}"`} />;
    }
    case "number":
    case "bigint":
      return <Leaf color={COLORS.number} text={String(value)} />;
    case "boolean":
      return <Leaf color={COLORS.boolean} text={String(value)} />;
    case "function": {
      const name = (value as { name?: string }).name;
      return <Leaf color={COLORS.function} text={`ƒ ${name || "anonymous"}()`} />;
    }
    case "symbol":
      return <Leaf color={COLORS.muted} text={value.toString()} />;
    default:
      break;
  }

  const obj = value as object;
  if (typeof Node !== "undefined" && obj instanceof Node) {
    const tag = obj instanceof Element ? obj.tagName.toLowerCase() : obj.nodeName;
    return <Leaf color={COLORS.element} text={`<${tag}>`} />;
  }
  if (isReactElement(obj)) {
    return <Leaf color={COLORS.element} text={`<${elementName(obj)} />`} />;
  }
  if (depth >= MAX_DEPTH) return <Leaf color={COLORS.muted} text="…" />;

  const entries = Array.isArray(obj)
    ? obj.map((v, i) => [String(i), v] as const)
    : Object.entries(obj);
  const label = Array.isArray(obj)
    ? `Array(${obj.length})`
    : `{…} ${entries.length} ${entries.length === 1 ? "key" : "keys"}`;

  if (entries.length === 0) {
    return <Leaf color={COLORS.muted} text={Array.isArray(obj) ? "[]" : "{}"} />;
  }

  return (
    <details open={depth < 1} style={{ display: "inline-block", verticalAlign: "top" }}>
      <summary style={{ cursor: "pointer", color: COLORS.muted, listStylePosition: "inside" }}>
        {label}
      </summary>
      <div style={{ paddingLeft: 14, borderLeft: "1px solid #27272a" }}>
        {entries.slice(0, MAX_ENTRIES).map(([key, val]) => (
          <div key={key} style={{ padding: "1px 0" }}>
            <span style={{ color: COLORS.key }}>{key}</span>
            <span style={{ color: COLORS.muted }}>: </span>
            <JsonTree value={val} depth={depth + 1} />
          </div>
        ))}
        {entries.length > MAX_ENTRIES && (
          <div style={{ color: COLORS.muted }}>
            …{entries.length - MAX_ENTRIES} more
          </div>
        )}
      </div>
    </details>
  );
}
