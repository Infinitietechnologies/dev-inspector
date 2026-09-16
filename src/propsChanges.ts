import { serializeValue } from "./aiContext";

export interface PropSnapshot {
  value: unknown;
  text: string;
}
export type PropsSnapshot = Map<string, PropSnapshot>;
export interface PropChange {
  key: string;
  kind: "added" | "removed" | "changed";
  before?: string;
  after?: string;
  referenceOnly: boolean;
}

/** Shallow comparisons match React's Object.is semantics. Store display text
 * immediately so later object mutations cannot rewrite the previous display. */
export function snapshotProps(props: unknown): PropsSnapshot {
  const result: PropsSnapshot = new Map();
  if (!props || typeof props !== "object") return result;
  for (const key of Object.keys(props).slice(0, 200)) {
    const descriptor = Object.getOwnPropertyDescriptor(props, key);
    if (!descriptor) continue;
    if (!("value" in descriptor)) {
      result.set(key, { value: descriptor.get, text: "[Accessor]" });
      continue;
    }
    const value: unknown = descriptor.value;
    let text: string;
    try {
      text = Object.is(value, -0) ? "-0" : serializeValue(value);
    } catch {
      text = "[Unavailable]";
    }
    result.set(key, { value, text });
  }
  return result;
}

export function diffProps(before: PropsSnapshot, after: PropsSnapshot): PropChange[] {
  const changes: PropChange[] = [];
  for (const key of new Set([...before.keys(), ...after.keys()])) {
    const previous = before.get(key);
    const next = after.get(key);
    if (previous && next && Object.is(previous.value, next.value)) continue;
    const value = next?.value;
    changes.push({
      key,
      kind: !previous ? "added" : !next ? "removed" : "changed",
      before: previous?.text,
      after: next?.text,
      referenceOnly: !!previous && !!next && previous.text === next.text &&
        ((value !== null && typeof value === "object") || typeof value === "function"),
    });
  }
  return changes;
}
