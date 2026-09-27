"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { getSupabaseBrowser } from "@/lib/supabaseBrowser";

export default function AdminAuthGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [verifiedPath, setVerifiedPath] = useState<string | null>(null);

  useEffect(() => {
    if (pathname === "/admin/login") {
      setVerifiedPath(pathname);
      return;
    }

    let cancelled = false;
    setVerifiedPath(null);

    (async () => {
      const supabase = getSupabaseBrowser();
      const { data: sessionData } = await supabase.auth.getSession();
      const session = sessionData.session;
      if (!session?.user?.email) {
        if (!cancelled) router.replace("/admin/login");
        return;
      }

      const response = await fetch("/api/admin/session", {
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: "no-store",
      });

      if (!response.ok) {
        await supabase.auth.signOut();
        if (!cancelled) router.replace("/admin/login");
        return;
      }

      if (!cancelled) setVerifiedPath(pathname);
    })();

    return () => {
      cancelled = true;
    };
  }, [pathname, router]);

  if (verifiedPath !== pathname) {
    return (
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#F5F7FA", color: "#5F6B7A" }}>
        Verifying admin access…
      </div>
    );
  }

  return <>{children}</>;
}
