"use client";

import { useSyncExternalStore } from "react";
import { demoStore } from "../lib/store";

export function CartSummary() {
  const state = useSyncExternalStore(
    demoStore.subscribe,
    demoStore.getState,
    demoStore.getState
  );

  return (
    <div style={{ marginTop: 24, color: "#a1a1aa" }}>
      Cart: {state.cart.length} item{state.cart.length === 1 ? "" : "s"} · €
      {state.cartTotal.toFixed(2)}
      <span style={{ marginLeft: 12, fontSize: 13, color: "#52525b" }}>
        (open the inspector&apos;s State tab to see this store)
      </span>
    </div>
  );
}
