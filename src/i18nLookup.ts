/**
 * Reverse i18n lookup for the DevInspector widget: given rendered text, find
 * which translation key(s) produced it. Pure logic over an i18next-shaped
 * resource store (`{ [lng]: { [ns]: nestedTree } }`) — the data is supplied
 * by the consumer via the `getI18nData` config hook. Unit tested in
 * tests/i18nLookup.test.ts.
 */

export interface I18nMatch {
  lng: string;
  key: string;
  value: string;
}

const MAX_TEXT_LENGTH = 200;
const MIN_TEMPLATE_PREFIX = 3;

const normalize = (text: string): string => text.replace(/\s+/g, " ").trim();

/** Flattens a nested resource tree into dotted-path string leaves. */
export function flattenResource(
  tree: unknown,
  prefix = ""
): Record<string, string> {
  const result: Record<string, string> = {};
  if (typeof tree === "string") {
    if (prefix) result[prefix] = tree;
    return result;
  }
  if (tree && typeof tree === "object" && !Array.isArray(tree)) {
    for (const [key, value] of Object.entries(tree)) {
      const path = prefix ? `${prefix}.${key}` : key;
      Object.assign(result, flattenResource(value, path));
    }
  }
  return result;
}

const flatCache = new WeakMap<object, Record<string, string>>();

function flattenLanguage(lngData: object): Record<string, string> {
  const cached = flatCache.get(lngData);
  if (cached) return cached;
  const flat: Record<string, string> = {};
  // Per-namespace; the default "translation" namespace stays unprefixed.
  for (const [ns, tree] of Object.entries(lngData)) {
    const entries = flattenResource(tree);
    for (const [key, value] of Object.entries(entries)) {
      flat[ns === "translation" ? key : `${ns}:${key}`] = value;
    }
  }
  flatCache.set(lngData, flat);
  return flat;
}

/**
 * Finds translation keys whose value matches the given rendered text.
 * Exact (whitespace-normalized) matches win; if there are none, values with
 * interpolation (`{{…}}`) match by their static prefix. `data` is
 * i18next's `store.data`: `{ [lng]: { [ns]: nestedTree } }`.
 */
export function findTranslationKeys(
  data: Record<string, unknown>,
  text: string,
  preferredLng?: string,
  limit = 3
): I18nMatch[] {
  const target = normalize(text).slice(0, MAX_TEXT_LENGTH);
  if (!target) return [];

  const languages = Object.keys(data).sort((a, b) => {
    if (a === preferredLng) return -1;
    if (b === preferredLng) return 1;
    return 0;
  });

  const exact: I18nMatch[] = [];
  const templated: I18nMatch[] = [];

  for (const lng of languages) {
    const lngData = data[lng];
    if (!lngData || typeof lngData !== "object") continue;
    const flat = flattenLanguage(lngData);
    for (const [key, value] of Object.entries(flat)) {
      if (exact.length >= limit) break;
      const normValue = normalize(value);
      if (normValue === target) {
        exact.push({ lng, key, value });
        continue;
      }
      if (templated.length < limit) {
        const templateIdx = value.indexOf("{{");
        if (templateIdx >= MIN_TEMPLATE_PREFIX) {
          const prefix = normalize(value.slice(0, templateIdx));
          if (prefix.length >= MIN_TEMPLATE_PREFIX && target.startsWith(prefix)) {
            templated.push({ lng, key, value });
          }
        }
      }
    }
    if (exact.length >= limit) break;
  }

  return (exact.length > 0 ? exact : templated).slice(0, limit);
}
