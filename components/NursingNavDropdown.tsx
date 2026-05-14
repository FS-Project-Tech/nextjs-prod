"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { ChevronDown } from "lucide-react";
import PrefetchLink from "@/components/PrefetchLink";

type NursingItem = {
  name: string;
  href: string;
};

type NursingNavDropdownProps = {
  items: NursingItem[];
};

/** Above header shell (z-[100]), mini-cart escape hatch, and typical Swiper/chat layers */
const MENU_Z = 50_000;

export default function NursingNavDropdown({ items }: NursingNavDropdownProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLLIElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const updatePosition = useCallback(() => {
    const el = buttonRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({
      top: r.bottom + 8,
      left: r.left,
      width: Math.max(280, r.width),
    });
  }, []);

  useLayoutEffect(() => {
    if (!open || items.length === 0) {
      setPos(null);
      return;
    }
    updatePosition();
  }, [open, items.length, updatePosition]);

  useEffect(() => {
    if (!open || items.length === 0) return;
    updatePosition();
    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);
    return () => {
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
    };
  }, [open, items.length, updatePosition]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  useEffect(() => {
    function closeOnOutside(event: MouseEvent | TouchEvent) {
      if (!open) return;
      const target = event.target as Node | null;
      if (!target) return;
      if (rootRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", closeOnOutside);
    document.addEventListener("touchstart", closeOnOutside);
    return () => {
      document.removeEventListener("mousedown", closeOnOutside);
      document.removeEventListener("touchstart", closeOnOutside);
    };
  }, [open]);

  const menu =
    open && items.length > 0 && pos && mounted ? (
      <div
        ref={panelRef}
        className="fixed min-w-[280px] rounded-xl border border-slate-200 bg-white shadow-[0_16px_40px_-18px_rgba(15,23,42,0.45)]"
        style={{
          top: pos.top,
          left: pos.left,
          width: pos.width,
          zIndex: MENU_Z,
        }}
        role="menu"
        aria-label="Nursing links"
      >
        <ul className="space-y-1 p-2.5">
          {items.map((item) => (
            <li key={item.href}>
              <PrefetchLink
                href={item.href}
                className="block rounded-lg px-3 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-teal-50 hover:text-teal-900"
                onClick={() => setOpen(false)}
              >
                {item.name}
              </PrefetchLink>
            </li>
          ))}
        </ul>
      </div>
    ) : null;

  return (
    <li ref={rootRef} className="relative shrink-0">
      <button
        ref={buttonRef}
        type="button"
        className="inline-flex items-center whitespace-nowrap px-2 py-2 text-white hover:bg-nav-hover sm:px-3"
        aria-haspopup={items.length > 0}
        aria-expanded={open}
        disabled={items.length === 0}
        onClick={() => items.length > 0 && setOpen((prev) => !prev)}
      >
        Nursing
        {items.length > 0 ? (
          <ChevronDown size={18} className={`transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
        ) : null}
      </button>

      {mounted && menu ? createPortal(menu, document.body) : null}
    </li>
  );
}
