import { t } from "../lib/i18n";

export function Hero() {
  return (
    <header style={{ marginBottom: 32 }}>
      <h1 style={{ fontSize: 28, margin: "0 0 8px" }}>{t("hero.title")}</h1>
      <p style={{ color: "#a1a1aa", margin: 0 }}>{t("hero.subtitle")}</p>
    </header>
  );
}
