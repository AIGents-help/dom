"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Radar } from "lucide-react";

export default function Footer() {
  const pathname = usePathname();
  if (pathname?.startsWith("/admin") || pathname === "/pilot" || pathname?.startsWith("/pilot/")) return null;

  return (
    <footer className="border-t border-border bg-surface/40">
      <div className="container-app grid gap-10 py-16 lg:grid-cols-4">
        <div>
          <div className="mb-4 flex items-center gap-2">
            <Radar className="h-5 w-5 text-accent" />
            <span className="text-sm font-bold uppercase tracking-wide text-white">
              Drone Operation Management
            </span>
          </div>
          <p className="body-muted max-w-xs">
            Commercial drone operations, aerial intelligence, and mission documentation for enterprise and government clients.
          </p>
        </div>

        <div>
          <h4 className="mb-4 text-sm font-semibold text-white">Company</h4>
          <ul className="space-y-3 text-sm text-slate-400">
            <li><Link href="/about" className="hover:text-accent">About</Link></li>
            <li><Link href="/services" className="hover:text-accent">Services</Link></li>
            <li><Link href="/industries" className="hover:text-accent">Industries</Link></li>
            <li><Link href="/faa-compliance" className="hover:text-accent">FAA Compliance</Link></li>
          </ul>
        </div>

        <div>
          <h4 className="mb-4 text-sm font-semibold text-white">Operations</h4>
          <ul className="space-y-3 text-sm text-slate-400">
            <li><Link href="/request-mission" className="hover:text-accent">Request a Mission</Link></li>
            <li><Link href="/admin/login" className="hover:text-accent">Admin Login</Link></li>
          </ul>
        </div>

        <div>
          <h4 className="mb-4 text-sm font-semibold text-white">Contact</h4>
          <ul className="space-y-3 text-sm text-slate-400">
            <li>ops@droneopsman.com</li>
            <li>DroneOpsMan.com</li>
            <li>FAA Part 107 Certified Operations</li>
          </ul>
        </div>
      </div>

      <div className="border-t border-border py-6">
        <p className="container-app text-xs text-slate-500">
          © {new Date().getFullYear()} Drone Operation Management. All rights reserved. Operated under FAA Part 107 regulations.
        </p>
      </div>
    </footer>
  );
}
