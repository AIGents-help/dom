"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const HERO_PAYLOAD = "/brand/dom-safety-hero/ultra.txt?v=20260922-approved";

export default function HomeSafetyHero() {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetch(HERO_PAYLOAD, { cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error("DOM safety hero payload failed to load");
        return response.text();
      })
      .then((payload) => {
        if (!cancelled) setSrc(`data:image/jpeg;base64,${payload.replace(/\s/g, "")}`);
      })
      .catch(() => {
        if (!cancelled) setSrc(null);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="relative border-b border-[#f45a1e] bg-black">
      <div className="relative mx-auto aspect-[640/229] w-full overflow-hidden bg-[#080c10]">
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt="DOM safety-first drone operation with protected aircraft and pilot zones"
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src="/images/drone-operation-safety.png?v=20260922-fallback"
            alt=""
            className="absolute inset-0 h-full w-full object-cover opacity-35"
          />
        )}

        <Link
          href="/request-mission"
          aria-label="Request a Mission"
          className="absolute left-[1.6%] top-[58%] h-[9%] w-[12.8%] rounded-md"
        />
        <Link
          href="/services"
          aria-label="Our Services"
          className="absolute left-[15.4%] top-[58%] h-[9%] w-[9.5%] rounded-md"
        />
      </div>
    </section>
  );
}
