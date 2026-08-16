"use client";
import { useEffect, useState } from "react";

interface InstallPromptEvent extends Event { prompt(): Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> }

export default function InstallAppBanner() {
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null);
  const [ios, setIos] = useState(false);
  const [hidden, setHidden] = useState(true);
  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone;
    if (standalone || sessionStorage.getItem("dom_install_dismissed")) return;
    setIos(/iphone|ipad|ipod/i.test(navigator.userAgent));
    const handler = (event: Event) => { event.preventDefault(); setPrompt(event as InstallPromptEvent); setHidden(false) };
    window.addEventListener("beforeinstallprompt", handler);
    if (/iphone|ipad|ipod/i.test(navigator.userAgent)) setHidden(false);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);
  if (hidden) return null;
  const dismiss = () => { sessionStorage.setItem("dom_install_dismissed", "1"); setHidden(true) };
  return <div className="dom-install-banner" role="region" aria-label="Install DOM OS"><img src="/icon.png" alt=""/><div><strong>Install DOM OS</strong><span>{ios ? "Tap Share, then Add to Home Screen." : "Faster field access from your home screen."}</span></div>{prompt&&<button onClick={async()=>{await prompt.prompt();const choice=await prompt.userChoice;if(choice.outcome==="accepted")setHidden(true)}}>Install</button>}<button className="dismiss" aria-label="Dismiss install message" onClick={dismiss}>×</button></div>;
}
