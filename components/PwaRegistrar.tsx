"use client";
import { useEffect } from "react";

export default function PwaRegistrar({ buildId }: { buildId: string }) {
  useEffect(() => {
    if (!("serviceWorker" in navigator) || process.env.NODE_ENV !== "production") return;

    let registration: ServiceWorkerRegistration | undefined;
    let cancelled = false;

    const purgeShellCache = () => {
      registration?.active?.postMessage({ type: "PURGE_DOM_SHELL_CACHE" });
      navigator.serviceWorker.controller?.postMessage({ type: "PURGE_DOM_SHELL_CACHE" });
    };

    const forceFreshBuild = (nextBuildId: string) => {
      if (cancelled || !nextBuildId || nextBuildId === buildId) return;
      purgeShellCache();
      const url = new URL(window.location.href);
      url.searchParams.set("_dom_build", nextBuildId.slice(0, 12));
      window.location.replace(url.toString());
    };

    const checkBuild = async () => {
      try {
        const response = await fetch("/api/build", {
          cache: "no-store",
          headers: { "x-dom-build-check": buildId },
        });
        if (!response.ok) return;
        const data = await response.json();
        if (data?.buildId && data.buildId !== buildId) {
          forceFreshBuild(data.buildId);
        }
      } catch {
        // A transient build-check failure should never block DOM.
      }
    };

    navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" })
      .then(async (nextRegistration) => {
        registration = nextRegistration;
        await nextRegistration.update().catch(() => undefined);
        void checkBuild();
      })
      .catch(() => {
        void checkBuild();
      });

    const onFocus = () => { void checkBuild(); };
    const onVisibility = () => {
      if (document.visibilityState === "visible") void checkBuild();
    };

    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") void checkBuild();
    }, 60_000);

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("dom:session-ended", purgeShellCache);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("dom:session-ended", purgeShellCache);
    };
  }, [buildId]);

  return null;
}
