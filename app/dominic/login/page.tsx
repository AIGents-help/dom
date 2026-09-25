"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getSupabaseBrowser } from "@/lib/supabaseBrowser";
import DominicBrandLockup from "@/components/dominic/DominicBrandLockup";

export default function DominicLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleLogin() {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/dominic/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Login failed");

      const sb = getSupabaseBrowser();
      const { error: sessionError } = await sb.auth.setSession({
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
      });
      if (sessionError) throw sessionError;
      router.push("/dominic");
    } catch (e: any) {
      setError(e.message ?? "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid min-h-screen place-items-center bg-[#070b0f] px-6 text-white">
      <div className="w-full max-w-[430px]">
        <Link href="/dominic/licensing" className="text-xs font-bold text-white/45 hover:text-[#F45A1E]">← Back to DOMINIC</Link>
        <div className="mt-7 rounded-2xl border border-white/10 bg-[#0d1319] p-7 shadow-2xl shadow-black/40">
          <DominicBrandLockup size="md" />
          <h1 className="mt-7 font-saira text-3xl font-black">Sign in to DOMINIC</h1>
          <p className="mt-2 text-sm leading-6 text-white/50">Open your free or licensed DOMINIC workspace.</p>

          <label className="mt-7 block">
            <span className="text-xs font-bold text-white/60">Email</span>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-2 w-full rounded-lg border border-white/12 bg-[#070b0f] px-4 py-3 text-sm text-white outline-none focus:border-[#F45A1E]" />
          </label>
          <label className="mt-4 block">
            <span className="text-xs font-bold text-white/60">Password</span>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleLogin()} className="mt-2 w-full rounded-lg border border-white/12 bg-[#070b0f] px-4 py-3 text-sm text-white outline-none focus:border-[#F45A1E]" />
          </label>

          {error ? <div className="mt-4 rounded-lg border border-red-400/25 bg-red-400/10 px-4 py-3 text-sm text-red-200">{error}</div> : null}

          <button onClick={handleLogin} disabled={loading} className="mt-6 w-full rounded-lg bg-[#F45A1E] px-5 py-3 text-sm font-black text-black hover:bg-[#ff7338] disabled:opacity-50">
            {loading ? "Opening DOMINIC…" : "Sign in"}
          </button>

          <p className="mt-5 text-center text-xs text-white/40">
            New to DOMINIC?{" "}
            <Link href="/dominic/signup" className="font-black text-[#F45A1E]">Create a free profile</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
