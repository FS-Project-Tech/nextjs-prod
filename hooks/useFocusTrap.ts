import { useEffect, useRef } from "react";

type Options = {
  enabled: boolean;
  onEscape?: () => void;
  initialFocusSelector?: string;
};

function getFocusable(container: HTMLElement): HTMLElement[] {
  const selectors = [
    "a[href]",
    "button:not([disabled])",
    "textarea:not([disabled])",
    "input:not([disabled])",
    "select:not([disabled])",
    "[tabindex]:not([tabindex='-1'])",
  ];
  return Array.from(container.querySelectorAll<HTMLElement>(selectors.join(","))).filter(
    (el) => !el.hasAttribute("disabled") && el.tabIndex !== -1 && !el.getAttribute("aria-hidden")
  );
}

export function useFocusTrap({ enabled, onEscape, initialFocusSelector }: Options) {
  const containerRef = useRef<HTMLElement | null>(null);
  const openerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!enabled) return;
    openerRef.current = (document.activeElement as HTMLElement) || null;

    const container = containerRef.current;
    if (!container) return;

    const focusInitial = () => {
      if (initialFocusSelector) {
        const el = container.querySelector<HTMLElement>(initialFocusSelector);
        if (el) {
          el.focus();
          return;
        }
      }
      const focusables = getFocusable(container);
      (focusables[0] || container).focus();
    };

    focusInitial();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onEscape?.();
        return;
      }
      if (e.key !== "Tab") return;

      const focusables = getFocusable(container);
      if (!focusables.length) {
        e.preventDefault();
        return;
      }

      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement as HTMLElement | null;

      if (e.shiftKey) {
        if (!active || active === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      openerRef.current?.focus?.();
    };
  }, [enabled, onEscape, initialFocusSelector]);

  return { containerRef };
}
