"use client";

import { useEffect, useRef } from "react";
import { Menu, X } from "lucide-react";
import DominicNavigation from "./DominicNavigation";

export default function DominicMobileModules({ activeModule, hasProject, onOpen }: {
  activeModule: string; hasProject: boolean; onOpen: (module: string) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const previousOverflow = useRef<string | null>(null);
  const unlockScroll = () => {
    if (previousOverflow.current !== null) {
      document.body.style.overflow = previousOverflow.current;
      previousOverflow.current = null;
    }
  };
  const closeMenu = () => {
    unlockScroll();
    dialog.current?.close();
  };
  useEffect(() => () => {
    if (previousOverflow.current !== null) document.body.style.overflow = previousOverflow.current;
  }, []);
  return <>
    <button type="button" aria-label="All modules" aria-haspopup="dialog" onClick={() => {
      if (!dialog.current || dialog.current.open) return;
      dialog.current.showModal();
      previousOverflow.current = document.body.style.overflow;
      document.body.style.overflow = "hidden";
    }} style={{ minHeight: 48, border: "1px solid #354553", borderRadius: 10, background: "#202B35", color: "#F5F7FA", display: "grid", justifyItems: "center", alignContent: "center", gap: 3, fontSize: 8, fontWeight: 800, cursor: "pointer" }}>
      <Menu size={17} /><span>All modules</span>
    </button>
    <dialog ref={dialog} aria-labelledby="dominic-mobile-modules-title" className="dominic-mobile-modules" onCancel={unlockScroll} onClose={() => { if (!dialog.current?.open) unlockScroll(); }} onKeyDown={(event) => {
      if (event.key !== "Tab") return;
      const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')).filter((element) => element.getClientRects().length > 0);
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }}
      style={{ margin: "auto", width: "min(420px, calc(100vw - 24px))", maxHeight: "calc(100dvh - 32px)", overflowY: "auto", border: "1px solid #354553", borderRadius: 14, padding: 16, background: "#10161D", color: "#F5F7FA" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <h2 id="dominic-mobile-modules-title" style={{ fontSize: 20, margin: 0 }}>All DOMINIC modules</h2>
        <button type="button" aria-label="Close module menu" onClick={closeMenu} style={{ minWidth: 44, minHeight: 44, borderRadius: 8, background: "#202B35", border: "1px solid #354553", color: "#FFF", cursor: "pointer", display: "grid", placeItems: "center" }}><X size={20} /></button>
      </div>
      <p style={{ fontSize: 12, color: "#A7B0BA", margin: "8px 0 16px" }}>Current workspace: {activeModule}. {hasProject ? "Your selected project stays open." : "Select a project to open its inspection and mapping tools."}</p>
      <DominicNavigation activeModule={activeModule} hasProject={hasProject} collapsed={false} operationsExpanded onOpen={(module) => { closeMenu(); onOpen(module); }} />
    </dialog>
    <style>{`.dominic-mobile-modules::backdrop { background: rgba(0,0,0,.72); }`}</style>
  </>;
}
