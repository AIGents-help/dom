"use client";
import { useEffect } from "react";

export default function PwaRegistrar() {
  useEffect(() => {
    if (!("serviceWorker" in navigator) || process.env.NODE_ENV !== "production") return;

    let registration: ServiceWorkerRegistration | undefined;
    navigator.serviceWorker.register("/sw.js")
      .then((nextRegistration) => {
        registration = nextRegistration;
      })
      .catch(() => undefined);

    const purgeShellCache = () => {
      registration?.active?.postMessage({ type: "PURGE_DOM_SHELL_CACHE" });
      navigator.serviceWorker.controller?.postMessage({ type: "PURGE_DOM_SHELL_CACHE" });
    };

    window.addEventListener("dom:session-ended", purgeShellCache);
    return () => window.removeEventListener("dom:session-ended", purgeShellCache);
  }, []);
  return null;
}
