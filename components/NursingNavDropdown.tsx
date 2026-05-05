"use client";

import { useEffect, useRef, useState } from "react";
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

export default function NursingNavDropdown({ items }: NursingNavDropdownProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLLIElement>(null);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    function closeOnOutsideClick(event: MouseEvent | TouchEvent) {
      if (!open) return;
      const target = event.target as Node | null;
      if (!target) return;
      if (rootRef.current?.contains(target)) return;
      setOpen(false);
    }

    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("touchstart", closeOnOutsideClick);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("touchstart", closeOnOutsideClick);
    };
  }, [open]);

  return (
    <li
      ref={rootRef}
      className="relative shrink-0"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        className="inline-flex items-center whitespace-nowrap px-2 py-2 text-white hover:bg-nav-hover sm:px-3"
        aria-haspopup={items.length > 0}
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
      >
        Nursing
        <ChevronDown size={18} className={`transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </button>

      {items.length > 0 && open ? (
        <div className="absolute left-0 top-full z-50 w-[280px] pt-2" role="menu" aria-label="Nursing links">
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_16px_40px_-18px_rgba(15,23,42,0.45)]">
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
        </div>
      ) : null}
    </li>
  );
}
