import { describe, expect, it } from "vitest";
import { findTranslationKeys, flattenResource } from "../src/i18nLookup";

const data = {
  en: {
    translation: {
      cart: {
        tip_label: "Add a tip for your rider",
        total: "Total: {{amount}}",
      },
      common: { close: "Close" },
    },
  },
  hi: {
    translation: {
      cart: { tip_label: "अपने राइडर के लिए टिप जोड़ें" },
    },
  },
};

describe("flattenResource", () => {
  it("flattens nested trees into dotted paths", () => {
    expect(flattenResource(data.en.translation)).toEqual({
      "cart.tip_label": "Add a tip for your rider",
      "cart.total": "Total: {{amount}}",
      "common.close": "Close",
    });
  });

  it("returns empty for non-object input", () => {
    expect(flattenResource(null)).toEqual({});
    expect(flattenResource(42)).toEqual({});
  });
});

describe("findTranslationKeys", () => {
  it("finds exact matches, preferring the current language", () => {
    const matches = findTranslationKeys(data, "Add a tip for your rider", "en");
    expect(matches).toEqual([
      {
        lng: "en",
        key: "cart.tip_label",
        value: "Add a tip for your rider",
      },
    ]);
  });

  it("normalizes whitespace before comparing", () => {
    const matches = findTranslationKeys(
      data,
      "  Add a tip   for your rider \n",
      "en"
    );
    expect(matches).toHaveLength(1);
    expect(matches[0].key).toBe("cart.tip_label");
  });

  it("matches interpolated values by their static prefix", () => {
    const matches = findTranslationKeys(data, "Total: ₹120.00", "en");
    expect(matches).toEqual([
      { lng: "en", key: "cart.total", value: "Total: {{amount}}" },
    ]);
  });

  it("finds matches in other languages too", () => {
    const matches = findTranslationKeys(
      data,
      "अपने राइडर के लिए टिप जोड़ें",
      "en"
    );
    expect(matches).toEqual([
      {
        lng: "hi",
        key: "cart.tip_label",
        value: "अपने राइडर के लिए टिप जोड़ें",
      },
    ]);
  });

  it("returns empty for unmatched or empty text", () => {
    expect(findTranslationKeys(data, "no such text", "en")).toEqual([]);
    expect(findTranslationKeys(data, "   ", "en")).toEqual([]);
  });
});
