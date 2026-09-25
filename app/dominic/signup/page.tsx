"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getSupabaseBrowser } from "@/lib/supabaseBrowser";
import DominicBrandLockup from "@/components/dominic/DominicBrandLockup";
import DominicMascotImage from "@/components/dominic/DominicMascotImage";

export default function DominicSignupPage() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [company, setCompany] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSignup() {
    setError(null);
    setMessage(null);
    if (!fullName.trim() || !email.trim() || password.length < 8) {
      setError("Enter your name, email, and a password with at least 8 characters.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/dominic/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName, company, email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Unable to create account");

      if (data.session) {
        const sb = getSupabaseBrowser();
        const { error: sessionError } = await sb.auth.setSession({
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
        });
        if (sessionError) throw sessionError;
        router.push("/dominic");
        return;
      }

      setMessage("Your free DOMINIC profile is created. Check your email to confirm your address, then sign in.");
    } catch (e: any) {
      setError(e.message ?? "Unable to create account");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#070b0f] text-white">
      <div className="mx-auto grid min-h-screen max-w-[1380px] lg:grid-cols-[.95fr_1.05fr]">
        <div className="flex items-center px-6 py-12 lg:px-12">
          <div className="w-full max-w-[520px]">
            <Link href="/dominic/licensing" className="text-xs font-bold text-white/45 hover:text-[#F45A1E]">
              ← Back to DOMINIC
            </Link>

            <div className="mt-8">
              <DominicBrandLockup size="md" />
            </div>

            <div className="mt-8">
              <div className="text-[10px] font-black uppercase tracking-[.18em] text-[#F45A1E]">Free Forever</div>
              <h1 className="mt-2 font-saira text-4xl font-black tracking-[-.04em] sm:text-5xl">
                Create your DOMINIC profile.
              </h1>
              <p className="mt-4 max-w-xl text-sm leading-6 text-white/55">
                Start with DOMINIC Home, manual Capture Planner, basic mission planning, and preview access to upcoming modules. No credit card required.
              </p>
            </div>

            <div className="mt-8 space-y-4">
              <label className="block">
                <span className="text-xs font-bold text-white/60">Full name</span>
                <input value={fullName} onChange={(e) => setFullName(e.target.value)} className="mt-2 w-full rounded-lg border border-white/12 bg-[#0d1319] px-4 py-3 text-sm text-white outline-none focus:border-[#F45A1E]" />
              </label>

              <label className="block">
                <span className="text-xs font-bold text-white/60">Company <span className="text-white/30">(optional)</span></span>
                <input value={company} onChange={(e) => setCompany(e.target.value)} className="mt-2 w-full rounded-lg border border-white/12 bg-[#0d1319] px-4 py-3 text-sm text-white outline-none focus:border-[#F45A1E]" />
              </label>

              <label className="block">
                <span className="text-xs font-bold text-white/60">Email</span>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-2 w-full rounded-lg border border-white/12 bg-[#0d1319] px-4 py-3 text-sm text-white outline-none focus:border-[#F45A1E]" />
              </label>

              <label className="block">
                <span className="text-xs font-bold text-white/60">Password</span>
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleSignup()} className="mt-2 w-full rounded-lg border border-white/12 bg-[#0d1319] px-4 py-3 text-sm text-white outline-none focus:border-[#F45A1E]" />
              </label>
            </div>

            {error ? <div className="mt-4 rounded-lg border border-red-400/25 bg-red-400/10 px-4 py-3 text-sm text-red-200">{error}</div> : null}
            {message ? <div className="mt-4 rounded-lg border border-emerald-400/25 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-200">{message}</div> : null}

            <button onClick={handleSignup} disabled={loading} className="mt-6 w-full rounded-lg bg-[#F45A1E] px-5 py-3 text-sm font-black text-black transition hover:bg-[#ff7338] disabled:opacity-50">
              {loading ? "Creating your profile…" : "Create Free DOMINIC Profile"}
            </button>

            <p className="mt-5 text-center text-xs text-white/40">
              Already have an account?{" "}
              <Link href="/dominic/login" className="font-black text-[#F45A1E]">Sign in to DOMINIC</Link>
            </p>
          </div>
        </div>

        <div className="relative hidden overflow-hidden border-l border-white/10 bg-[radial-gradient(circle_at_50%_25%,rgba(244,90,30,.18),transparent_42%)] lg:block">
          <div className="absolute inset-x-[8%] bottom-0 top-[5%]">
            <DominicMascotImage priority className="object-contain object-bottom" />
          </div>
          <div className="absolute bottom-12 left-10 right-10 rounded-xl border border-white/10 bg-black/55 p-5 backdrop-blur-md">
            <div className="text-[10px] font-black uppercase tracking-[.16em] text-[#F45A1E]">DOMINIC FREE</div>
            <div className="mt-2 font-saira text-2xl font-black">Same perspective. Higher purpose.</div>
            <p className="mt-2 text-sm leading-6 text-white/55">Start planning smarter missions today. Upgrade only when your operation needs more.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
