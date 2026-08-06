/**
 * Builds a paste-ready context block for AI coding assistants from a locked
 * inspection: component chain with file:line, selected props, class list,
 * and i18n matches. Pure logic — unit tested in tests/aiContext.test.ts.
 */

import { InspectedEntry } from "./fiber";
import { I18nMatch } from "./i18nLookup";

const MAX_DEPTH = 3;
const MAX_ENTRIES = 20;
const MAX_ARRAY = 10;
const MAX_STRING = 80;

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

/** Compact JSON-ish rendering of an arbitrary value, safe on cycles. */
export function serializeValue(
  value: unknown,
  depth = 0,
  seen = new WeakSet<object>()
): string {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  switch (typeof value) {
    case "string": {
      const text =
        value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}…` : value;
      return JSON.stringify(text);
    }
    case "number":
    case "boolean":
      return String(value);
    case "bigint":
      return `${value}n`;
    case "function": {
      const name = (value as { name?: string }).name;
      return `ƒ ${name || "anonymous"}()`;
    }
    case "symbol":
      return value.toString();
    default:
      break;
  }

  const obj = value as object;
  if (seen.has(obj)) return "[Circular]";
  if (typeof Node !== "undefined" && obj instanceof Node) {
    const tag =
      obj instanceof Element ? obj.tagName.toLowerCase() : obj.nodeName;
    return `<${tag}>`;
  }
  if (isReactElement(obj)) return `<${elementName(obj)} />`;
  if (depth >= MAX_DEPTH) return Array.isArray(obj) ? "[…]" : "{…}";

  seen.add(obj);
  try {
    if (Array.isArray(obj)) {
      const items = obj
        .slice(0, MAX_ARRAY)
        .map((v) => serializeValue(v, depth + 1, seen));
      if (obj.length > MAX_ARRAY) items.push(`… +${obj.length - MAX_ARRAY} more`);
      return `[${items.join(", ")}]`;
    }
    const entries = Object.entries(obj);
    if (entries.length === 0) return "{}";
    const parts = entries
      .slice(0, MAX_ENTRIES)
      .map(([k, v]) => `${k}: ${serializeValue(v, depth + 1, seen)}`);
    if (entries.length > MAX_ENTRIES) {
      parts.push(`… +${entries.length - MAX_ENTRIES} more`);
    }
    return `{ ${parts.join(", ")} }`;
  } finally {
    seen.delete(obj);
  }
}

export interface AiContextInput {
  entries: InspectedEntry[];
  i18nMatches: I18nMatch[];
  className: string;
  selectedIdx: number;
}

const entryLabel = (entry: InspectedEntry): string =>
  entry.kind === "host" ? entry.name : `<${entry.name}>`;

const entryLocation = (entry: InspectedEntry): string =>
  entry.location
    ? `${entry.location.file}${entry.location.line1 ? `:${entry.location.line1}` : ""}`
    : "(library / generated)";

/** The text the panel's "Copy for AI" button puts on the clipboard. */
export function buildAiContext(input: AiContextInput): string {
  const { entries, i18nMatches, className, selectedIdx } = input;
  const lines: string[] = ["Inspected element (via next-dev-inspector):", ""];

  if (entries.length > 0) {
    lines.push("Component chain (innermost first):");
    entries.forEach((entry, index) => {
      lines.push(`${index + 1}. ${entryLabel(entry)} — ${entryLocation(entry)}`);
    });
  }

  if (className) {
    lines.push("", `Classes: ${className}`);
  }

  const selected =
    entries[selectedIdx] ?? entries.find((e) => e.kind === "component");
  if (selected && selected.props !== undefined) {
    lines.push(
      "",
      `Props of ${entryLabel(selected)}:`,
      serializeValue(selected.props)
    );
  }

  if (i18nMatches.length > 0) {
    lines.push("", "i18n matches:");
    for (const match of i18nMatches) {
      lines.push(`- ${match.key} (${match.lng}) = ${JSON.stringify(match.value)}`);
    }
  }

  return lines.join("\n");
}
