"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type ConsentChoice = "accepted" | "essential";

const STORAGE_KEY = "dom-cookie-consent";

export default function CookieConsent() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(!window.localStorage.getItem(STORAGE_KEY));
  }, []);

  function save(choice: ConsentChoice) {
    window.localStorage.setItem(STORAGE_KEY, choice);
    document.cookie = `dom_cookie_consent=${choice}; path=/; max-age=31536000; samesite=lax`;
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <section
      aria-label="Cookie consent"
      className="fixed inset-x-4 bottom-4 z-[100] mx-auto max-w-4xl rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl sm:p-6"
    >
      <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="max-w-2xl">
          <h2 className="text-base font-bold text-ink">Your privacy matters</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            DOM uses essential cookies to keep the site and secure portals working. Optional cookies
            will only be used with your permission. Read our{" "}
            <Link href="/privacy" className="font-semibold text-accent hover:underline">
              Privacy Policy
            </Link>
            .
          </p>
        </div>
        <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={() => save("essential")}
            className="rounded-lg border border-slate-300 px-5 py-3 text-sm font-semibold text-ink transition hover:border-accent hover:text-accent"
          >
            Essential Only
          </button>
          <button type="button" onClick={() => save("accepted")} className="btn-primary">
            Accept All
          </button>
        </div>
      </div>
    </section>
  );
}
