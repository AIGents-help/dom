"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { getSupabaseBrowser } from "@/lib/supabaseBrowser";

export default function AdminAuthGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [authorized, setAuthorized] = useState(pathname === "/admin/login");

  useEffect(() => {
    if (pathname === "/admin/login") {
      setAuthorized(true);
      return;
    }

    let cancelled = false;
    (async () => {
      const supabase = getSupabaseBrowser();
      const { data: sessionData } = await supabase.auth.getSession();
      const session = sessionData.session;
      if (!session?.user?.email) {
        if (!cancelled) router.replace("/admin/login");
        return;
      }

      const { data: allow, error } = await supabase
        .from("admin_users")
        .select("email")
        .eq("email", session.user.email)
        .maybeSingle();

      if (error || !allow) {
        await supabase.auth.signOut();
        if (!cancelled) router.replace("/admin/login");
        return;
      }

      if (!cancelled) setAuthorized(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [pathname, router]);

  if (!authorized) {
    return (
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#F5F7FA", color: "#5F6B7A" }}>
        Verifying admin access…
      </div>
    );
  }

  return <>{children}</>;
}
