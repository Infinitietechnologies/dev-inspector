import { t } from "../lib/i18n";
import { demoStore } from "../lib/store";

export function ProductCard({ name, price }: { name: string; price: number }) {
  return (
    <div
      style={{
        border: "1px solid #3f3f46",
        borderRadius: 10,
        padding: 16,
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <strong>{name}</strong>
      <span style={{ color: "#a1a1aa" }}>
        {t("product.price").replace("{{amount}}", `€${price.toFixed(2)}`)}
      </span>
      <button
        type="button"
        onClick={() => demoStore.addToCart(name, price)}
        style={{
          background: "#7c3aed",
          color: "#fff",
          border: "none",
          borderRadius: 6,
          padding: "8px 12px",
          cursor: "pointer",
        }}
      >
        {t("product.add_to_cart")}
      </button>
    </div>
  );
}
