/**
 * Miniature i18next-shaped resource store. The page renders its text through
 * t() so the inspector's reverse lookup (rendered text → translation key)
 * has real data to match against.
 */

export const resources = {
  en: {
    translation: {
      hero: {
        title: "Everything you render leaves a trail",
        subtitle:
          "Hold Alt and hover anything on this page — or press Ctrl+Shift+X and click.",
      },
      product: {
        add_to_cart: "Add to cart",
        price: "Price: {{amount}}",
      },
      clock: {
        label: "Live clock (toggle the Zap button to see DOM updates flash)",
      },
    },
  },
  de: {
    translation: {
      hero: { title: "Alles, was du renderst, hinterlässt eine Spur" },
      product: { add_to_cart: "In den Warenkorb" },
    },
  },
};

export function t(key: string): string {
  let node: unknown = resources.en.translation;
  for (const part of key.split(".")) {
    if (!node || typeof node !== "object") return key;
    node = (node as Record<string, unknown>)[part];
  }
  return typeof node === "string" ? node : key;
}
