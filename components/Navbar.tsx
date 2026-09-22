"use client";

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import { usePathname } from "next/navigation";
import { ChevronDown, Menu, X } from "lucide-react";

const primaryLinks = [
  { href: "/industry", label: "Pilot Intel" },
  { href: "/fly-for-dom", label: "Fly for DOM" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
];

export default function Navbar() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  if (
    pathname?.startsWith("/admin")
    || pathname === "/pilot"
    || pathname?.startsWith("/pilot/")
    || pathname === "/dominic"
    || pathname?.startsWith("/dominic/")
  ) return null;

  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-navy/95 shadow-sm backdrop-blur-md">
      <div className="container-app flex h-18 items-center justify-between py-4">
        <Link href="/" className="flex items-center">
          <Image src="/brand/dom-lockup-horizontal.png" alt="DOM — Drone Operation Management" width={122} height={36} priority />
        </Link>

        <nav className="hidden items-center gap-6 lg:flex">
          <div className="group relative">
            <Link href="/services" className="flex items-center gap-1 text-sm font-medium text-slate-200 transition hover:text-white">
              Services <ChevronDown className="h-3.5 w-3.5" />
            </Link>
            <div className="invisible absolute left-0 top-full z-50 mt-3 w-64 translate-y-1 rounded-xl border border-white/10 bg-[#101720] p-2 opacity-0 shadow-2xl transition group-hover:visible group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:visible group-focus-within:translate-y-0 group-focus-within:opacity-100">
              <Link href="/services" className="block rounded-lg px-4 py-3 text-sm font-bold text-white transition hover:bg-white/5 hover:text-[#F45A1E]">
                Drone Services
                <span className="mt-1 block text-xs font-normal text-slate-400">What DOM can inspect, map, document, and deliver.</span>
              </Link>
              <Link href="/industries" className="block rounded-lg px-4 py-3 text-sm font-bold text-white transition hover:bg-white/5 hover:text-[#F45A1E]">
                Industries Served
                <span className="mt-1 block text-xs font-normal text-slate-400">Commercial, solar, construction, infrastructure, public safety, and more.</span>
              </Link>
            </div>
          </div>

          {primaryLinks.slice(0, 2).map((link) => (
            <Link key={link.href} href={link.href} className="text-sm font-medium text-slate-200 transition hover:text-white">
              {link.label}
            </Link>
          ))}

          <div className="group relative">
            <Link href="/safety-equipment" className="flex items-center gap-1 text-sm font-black text-[#F45A1E] transition hover:text-[#ff8a3d]">
              Safety & Shop <ChevronDown className="h-3.5 w-3.5" />
            </Link>
            <div className="invisible absolute left-1/2 top-full z-50 mt-3 w-[520px] -translate-x-1/2 translate-y-1 rounded-2xl border border-white/10 bg-[#101720] p-3 opacity-0 shadow-2xl transition group-hover:visible group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:visible group-focus-within:translate-y-0 group-focus-within:opacity-100">
              <div className="grid grid-cols-[1.25fr_.75fr] gap-3">
                <Link href="/safety-equipment" className="group/card relative min-h-[210px] overflow-hidden rounded-xl border border-[#F45A1E]/35 bg-black">
                  <Image src="/images/drone-operation-safety.png" alt="DOM drone operation safety equipment" fill sizes="325px" className="object-cover transition duration-500 group-hover/card:scale-105" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black via-black/45 to-transparent" />
                  <div className="absolute inset-x-0 bottom-0 p-5">
                    <span className="text-[10px] font-black uppercase tracking-[.16em] text-[#F45A1E]">Priority</span>
                    <div className="mt-1 text-xl font-black text-white">Safety Equipment</div>
                    <p className="mt-1 text-xs leading-5 text-slate-300">Barriers, vests, landing pads, and field-safety gear for real drone operations.</p>
                  </div>
                </Link>

                <Link href="/shop" className="group/card relative min-h-[210px] overflow-hidden rounded-xl border border-white/10 bg-black">
                  <Image src="/shop/merch/dom-merch-collection.webp" alt="DOM shop merchandise" fill sizes="195px" className="object-cover transition duration-500 group-hover/card:scale-105" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black via-black/45 to-transparent" />
                  <div className="absolute inset-x-0 bottom-0 p-5">
                    <div className="text-lg font-black text-white">Shop</div>
                    <p className="mt-1 text-xs leading-5 text-slate-300">DOM apparel, accessories, and branded gear.</p>
                  </div>
                </Link>
              </div>
            </div>
          </div>

          {primaryLinks.slice(2).map((link) => (
            <Link key={link.href} href={link.href} className="text-sm font-medium text-slate-200 transition hover:text-white">
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-3 lg:flex">
          <Link href="/pilot/login" className="rounded-lg border border-white/20 px-6 py-3 text-sm font-semibold text-white transition hover:border-accent">Pilot Login</Link>
          <Link href="/request-mission" className="btn-primary">Request a Mission</Link>
        </div>

        <button className="text-white lg:hidden" onClick={() => setOpen(!open)} aria-label="Toggle menu">
          {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </div>

      {open && (
        <div className="border-t border-white/10 bg-navy lg:hidden">
          <div className="container-app flex flex-col gap-4 py-6">
            <div>
              <Link href="/services" onClick={() => setOpen(false)} className="text-sm font-bold text-slate-100">Services</Link>
              <div className="mt-2 flex flex-col gap-2 border-l border-white/10 pl-4">
                <Link href="/services" onClick={() => setOpen(false)} className="text-sm text-slate-300">Drone Services</Link>
                <Link href="/industries" onClick={() => setOpen(false)} className="text-sm text-slate-300">Industries Served</Link>
              </div>
            </div>

            {primaryLinks.slice(0, 2).map((link) => (
              <Link key={link.href} href={link.href} onClick={() => setOpen(false)} className="text-sm font-medium text-slate-200 hover:text-white">{link.label}</Link>
            ))}

            <div>
              <div className="mb-3 text-sm font-black text-[#F45A1E]">Safety & Shop</div>
              <div className="grid grid-cols-[1.25fr_.75fr] gap-2">
                <Link href="/safety-equipment" onClick={() => setOpen(false)} className="relative min-h-[145px] overflow-hidden rounded-xl border border-[#F45A1E]/35">
                  <Image src="/images/drone-operation-safety.png" alt="DOM drone operation safety equipment" fill sizes="60vw" className="object-cover" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black via-black/35 to-transparent" />
                  <div className="absolute inset-x-0 bottom-0 p-3">
                    <div className="text-sm font-black text-white">Safety Equipment</div>
                    <div className="mt-1 text-[10px] font-bold uppercase tracking-[.12em] text-[#F45A1E]">Priority</div>
                  </div>
                </Link>
                <Link href="/shop" onClick={() => setOpen(false)} className="relative min-h-[145px] overflow-hidden rounded-xl border border-white/10">
                  <Image src="/shop/merch/dom-merch-collection.webp" alt="DOM shop merchandise" fill sizes="40vw" className="object-cover" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black via-black/35 to-transparent" />
                  <div className="absolute inset-x-0 bottom-0 p-3 text-sm font-black text-white">Shop</div>
                </Link>
              </div>
            </div>

            {primaryLinks.slice(2).map((link) => (
              <Link key={link.href} href={link.href} onClick={() => setOpen(false)} className="text-sm font-medium text-slate-200 hover:text-white">{link.label}</Link>
            ))}

            <Link href="/pilot/login" onClick={() => setOpen(false)} className="rounded-lg border border-white/20 px-6 py-3 text-center text-sm font-semibold text-white transition hover:border-accent">Pilot Login</Link>
            <Link href="/request-mission" onClick={() => setOpen(false)} className="btn-primary w-full">Request a Mission</Link>
          </div>
        </div>
      )}
    </header>
  );
}
