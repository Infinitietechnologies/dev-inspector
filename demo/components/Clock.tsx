"use client";

import { useEffect, useState } from "react";
import { t } from "../lib/i18n";

export function Clock() {
  const [now, setNow] = useState<string | null>(null);

  useEffect(() => {
    const tick = () => setNow(new Date().toLocaleTimeString());
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div style={{ marginTop: 32, color: "#71717a" }}>
      <span style={{ fontVariantNumeric: "tabular-nums", color: "#e4e4e7" }}>
        {now ?? "…"}
      </span>
      <span style={{ marginLeft: 12, fontSize: 13 }}>{t("clock.label")}</span>
    </div>
  );
}
