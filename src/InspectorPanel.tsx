import { useEffect, useRef, useState, type ReactNode } from "react";

type Dock = "floating" | "left" | "right";
export function clampPanelWidth(width: number, viewport: number): number {
  const maximum = Math.max(0, viewport - 16);
  return Math.min(
    Math.max(Number.isFinite(width) ? width : 420, Math.min(280, maximum)),
    maximum,
  );
}

export function InspectorPanel({
  storageKey,
  x,
  y,
  above,
  menuExtra,
  zIndex,
  children,
}: {
  storageKey: string;
  x: number;
  y: number;
  above: boolean;
  menuExtra: number;
  zIndex: number;
  children: ReactNode;
}) {
  const [viewport, setViewport] = useState(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
  }));
  const [layout, setLayout] = useState<{ dock: Dock; width: number }>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) ?? "null");
      if (
        saved &&
        ["floating", "left", "right"].includes(saved.dock) &&
        Number.isFinite(saved.width)
      ) {
        return { dock: saved.dock, width: saved.width };
      }
    } catch {
      /* Storage unavailable. */
    }
    return { dock: "floating", width: 420 };
  });
  const drag = useRef<{ x: number; width: number } | null>(null);
  const width = clampPanelWidth(layout.width, viewport.width);
  useEffect(() => {
    const resize = () =>
      setViewport({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(layout));
    } catch {
      /* Optional persistence. */
    }
  }, [storageKey, layout]);
  const setWidth = (value: number) =>
    setLayout((previous) => ({
      ...previous,
      width: clampPanelWidth(value, viewport.width),
    }));
  const floating = layout.dock === "floating";
  const left =
    layout.dock === "left"
      ? 8
      : layout.dock === "right"
        ? Math.max(8, viewport.width - width - 8)
        : Math.max(8, Math.min(x, viewport.width - width - 8));
  const offset = Math.max(
    8,
    Math.min(
      above ? viewport.height - y + 12 + menuExtra : y + 52 + menuExtra,
      Math.max(8, viewport.height - 200),
    ),
  );
  const availableHeight = Math.max(0, viewport.height - offset - 8);

  return (
    <section
      aria-label="Inspector panel"
      style={{
        position: "fixed",
        left,
        width,
        boxSizing: "border-box",
        ...(floating
          ? above
            ? { bottom: offset }
            : { top: offset }
          : { top: 8, bottom: 8 }),
        maxHeight: floating
          ? Math.min(viewport.height * 0.6, availableHeight)
          : viewport.height - 16,
        display: "flex",
        flexDirection: "column",
        background: "#18181b",
        color: "#e4e4e7",
        border: "1px solid #3f3f46",
        borderRadius: 10,
        boxShadow: "0 8px 30px rgba(0,0,0,0.45)",
        font: "12px/1.5 ui-monospace, monospace",
        zIndex,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "6px 12px",
          flexShrink: 0,
        }}
      >
        <label htmlFor={`${storageKey}-dock`}>Panel</label>
        <select
          id={`${storageKey}-dock`}
          aria-label="Panel position"
          value={layout.dock}
          onChange={(event) =>
            setLayout((previous) => ({
              ...previous,
              dock: event.target.value as Dock,
            }))
          }
          style={{
            background: "#27272a",
            color: "#e4e4e7",
            border: "1px solid #52525b",
            borderRadius: 4,
            font: "inherit",
          }}
        >
          <option value="floating">Floating</option>
          <option value="left">Dock left</option>
          <option value="right">Dock right</option>
        </select>
        <span style={{ color: "#a1a1aa", marginLeft: "auto" }}>
          {Math.round(width)}px
        </span>
      </div>
      {children}
      <div
        role="separator"
        tabIndex={0}
        aria-label="Resize inspector panel"
        aria-orientation="vertical"
        aria-valuemin={Math.min(280, Math.max(0, viewport.width - 16))}
        aria-valuemax={Math.max(0, viewport.width - 16)}
        aria-valuenow={Math.round(width)}
        title="Drag to resize; arrow keys adjust width"
        onPointerDown={(event) => {
          event.preventDefault();
          drag.current = { x: event.clientX, width };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          if (drag.current)
            setWidth(
              drag.current.width +
                (event.clientX - drag.current.x) *
                  (layout.dock === "right" ? -1 : 1),
            );
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
        onLostPointerCapture={() => {
          drag.current = null;
        }}
        onKeyDown={(event) => {
          if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
          event.preventDefault();
          event.stopPropagation();
          setWidth(
            width +
              (event.key === "ArrowRight" ? 20 : -20) *
                (layout.dock === "right" ? -1 : 1),
          );
        }}
        style={{
          position: "absolute",
          top: 8,
          bottom: 8,
          [layout.dock === "right" ? "left" : "right"]: -4,
          width: 8,
          cursor: "ew-resize",
          touchAction: "none",
        }}
      />
    </section>
  );
}
