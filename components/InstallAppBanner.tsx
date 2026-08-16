"use client";
import { useEffect, useState } from "react";

interface InstallPromptEvent extends Event { prompt(): Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> }

export default function InstallAppBanner() {
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null);
  const [ios, setIos] = useState(false);
  const [hidden, setHidden] = useState(true);
  const [showIosSteps, setShowIosSteps] = useState(false);
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
  return <>{showIosSteps&&<div className="dom-install-overlay" role="dialog" aria-modal="true" aria-labelledby="dom-install-title"><div className="dom-install-steps"><button className="steps-close" aria-label="Close instructions" onClick={()=>setShowIosSteps(false)}>×</button><img src="/icon.png" alt=""/><h2 id="dom-install-title">Add DOM OS to your iPhone</h2><ol><li>Tap the <strong>••• menu</strong> at the bottom-right of Safari.</li><li>Tap <strong>Share</strong>.</li><li>Scroll down and tap <strong>Add to Home Screen</strong>.</li><li>Confirm the name <strong>DOM OS</strong>, then tap <strong>Add</strong>.</li></ol><p>Apple requires these Safari steps; a website cannot press Add to Home Screen for you.</p><button className="steps-done" onClick={()=>setShowIosSteps(false)}>Got it</button></div></div>}<div className="dom-install-banner" role="region" aria-label="Install DOM OS"><img src="/icon.png" alt=""/><div><strong>Install DOM OS</strong><span>{ios ? "Add DOM OS to your iPhone Home Screen." : "Faster field access from your home screen."}</span></div>{ios?<button onClick={()=>setShowIosSteps(true)}>Show Steps</button>:prompt&&<button onClick={async()=>{await prompt.prompt();const choice=await prompt.userChoice;if(choice.outcome==="accepted")setHidden(true)}}>Install</button>}<button className="dismiss" aria-label="Dismiss install message" onClick={dismiss}>×</button></div></>;
}
