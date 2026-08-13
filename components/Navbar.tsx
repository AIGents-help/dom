"use client";

import Link from "next/link";
import { useState } from "react";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";

const links = [
  { href: "/services", label: "Services" },
  { href: "/industries", label: "Industries" },
  { href: "/fly-for-dom", label: "Fly for DOM" },
  { href: "/faa-compliance", label: "FAA Compliance" },
  { href: "/shop", label: "Shop" },
  { href: "/about", label: "About" },
];

export default function Navbar() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Admin and pilot dashboards have their own in-app sidebar nav — the
  // marketing header/CTAs are redundant chrome there, not a real nav choice.
  if (pathname?.startsWith("/admin") || pathname === "/pilot" || pathname?.startsWith("/pilot/")) return null;

  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-navy/95 shadow-sm backdrop-blur-md">
      <div className="container-app flex h-18 items-center justify-between py-4">
        <Link href="/" className="flex items-center">
          <img
            src="/brand/dom-lockup-horizontal.png?v=3"
            alt="DOM — Drone Operation Management"
            className="h-9 w-auto"
          />
        </Link>

        <nav className="hidden items-center gap-8 lg:flex">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={l.href === "/shop" ? "text-sm font-bold text-[#f26a1b] transition hover:text-[#ff8a3d]" : "text-sm font-medium text-slate-200 transition hover:text-white"}
            >
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-3 lg:flex">
          <Link
            href="/pilot/login"
            className="rounded-lg border border-white/20 px-6 py-3 text-sm font-semibold text-white transition hover:border-accent"
          >
            Pilot Login
          </Link>
          <Link href="/request-mission" className="btn-primary">
            Request a Mission
          </Link>
        </div>

        <button
          className="text-white lg:hidden"
          onClick={() => setOpen(!open)}
          aria-label="Toggle menu"
        >
          {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </div>

      {open && (
        <div className="border-t border-white/10 bg-navy lg:hidden">
          <div className="container-app flex flex-col gap-4 py-6">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className={l.href === "/shop" ? "text-sm font-bold text-[#f26a1b] hover:text-[#ff8a3d]" : "text-sm font-medium text-slate-200 hover:text-white"}
              >
                {l.label}
              </Link>
            ))}
            <Link
              href="/pilot/login"
              onClick={() => setOpen(false)}
              className="rounded-lg border border-white/20 px-6 py-3 text-center text-sm font-semibold text-white transition hover:border-accent"
            >
              Pilot Login
            </Link>
            <Link href="/request-mission" onClick={() => setOpen(false)} className="btn-primary w-full">
              Request a Mission
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
