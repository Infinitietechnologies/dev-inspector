import type { Metadata } from "next";
import { DevInspectorMount } from "./inspector";

export const metadata: Metadata = {
  title: "next-dev-inspector demo",
  description: "Hover any element to see which source file rendered it.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          background: "#09090b",
          color: "#e4e4e7",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        {children}
        <DevInspectorMount />
      </body>
    </html>
  );
}
