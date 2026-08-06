"use client";

import { CartSummary } from "../components/CartSummary";
import { Clock } from "../components/Clock";
import { Hero } from "../components/Hero";
import { ProductCard } from "../components/ProductCard";

const PRODUCTS = [
  { name: "Espresso", price: 2.5 },
  { name: "Cortado", price: 3.2 },
  { name: "Flat white", price: 3.8 },
];

export default function Page() {
  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: "48px 24px" }}>
      <Hero />
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 16,
        }}
      >
        {PRODUCTS.map((p) => (
          <ProductCard key={p.name} name={p.name} price={p.price} />
        ))}
      </div>
      <CartSummary />
      <Clock />
      <section style={{ marginTop: 40, fontSize: 14, color: "#71717a" }}>
        <p>Things to try:</p>
        <ul style={{ lineHeight: 1.9 }}>
          <li>
            Click the <b>wrench</b> button (bottom-left) — the crosshair and
            Zap actions drop out one after another; click it again to tuck
            them away. Drag it anywhere.
          </li>
          <li>
            <b>Alt+hover</b> any element — component name, size, and file:line
            appear instantly.
          </li>
          <li>
            <b>Click</b> while inspecting to lock the panel: the Source tab
            shows the owner chain (Page → ProductCard → button…); click a row
            to open that file in your editor.
          </li>
          <li>
            Lock the &quot;Add to cart&quot; button text and check the
            <b> i18n</b> section — it finds <code>product.add_to_cart</code>.
          </li>
          <li>
            Add items to the cart, then open the <b>State</b> tab.
          </li>
          <li>
            Toggle the <b>Zap</b> button in the menu and watch the clock flash
            every second — the dot on the collapsed launcher shows it&apos;s
            still on.
          </li>
          <li>
            While locked, walk the DOM with <b>arrow keys</b>.
          </li>
        </ul>
      </section>
    </main>
  );
}
