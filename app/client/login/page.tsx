"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowser } from "@/lib/supabaseBrowser";
import { V } from "@/lib/theme";

export default function ClientLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState(""); const [password, setPassword] = useState("");
  const [activate, setActivate] = useState(false); const [error, setError] = useState<string|null>(null); const [loading, setLoading] = useState(false);
  async function submit() {
    setLoading(true); setError(null);
    try {
      const res = await fetch("/api/client/access", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({email,password,action:activate?"activate":"login"}) });
      const body = await res.json(); if (!res.ok) throw new Error(body.error);
      if (body.confirmationRequired) { setError("Check your email to confirm your account, then sign in."); setActivate(false); return; }
      await getSupabaseBrowser().auth.setSession({ access_token:body.session.access_token, refresh_token:body.session.refresh_token });
      router.push("/client");
    } catch(e:any) { setError(e.message ?? "Access failed"); } finally { setLoading(false); }
  }
  return <div style={{minHeight:"100vh",display:"grid",placeItems:"center",background:V.ground,padding:24,color:V.ink}}><div style={{width:"min(390px,100%)",padding:30,border:`1px solid ${V.line}`,borderRadius:16,background:V.surface}}><img src="/brand/dom-lockup-horizontal.png?v=3" alt="DOM" style={{height:28}}/><h1 className="font-saira" style={{fontSize:24,marginTop:18}}>Client Mission Portal</h1><p style={{color:V.inkDim,fontSize:13,margin:"6px 0 20px"}}>Track missions, approvals, payments, and deliverables.</p><label style={label}>Email used for your DOM mission</label><input style={input} type="email" value={email} onChange={e=>setEmail(e.target.value)}/><label style={{...label,display:"block",marginTop:12}}>Password</label><input style={input} type="password" value={password} onChange={e=>setPassword(e.target.value)} onKeyDown={e=>e.key==="Enter"&&submit()}/>{error&&<p style={{color:error.startsWith("Check")?V.telemetry:V.danger,fontSize:12,marginTop:10}}>{error}</p>}<button onClick={submit} disabled={loading} style={button}>{loading?"Please wait…":activate?"Activate client access":"Sign in"}</button><button onClick={()=>{setActivate(!activate);setError(null)}} style={{...button,background:"transparent",border:`1px solid ${V.line}`,color:V.ink,marginTop:9}}>{activate?"I already have access":"Activate my client account"}</button></div></div>;
}
const input:React.CSSProperties={width:"100%",marginTop:6,padding:"11px 12px",borderRadius:9,border:`1px solid ${V.line}`,background:V.ground,color:V.ink};
const label:React.CSSProperties={fontSize:12,color:V.inkDim};
const button:React.CSSProperties={width:"100%",marginTop:18,padding:11,borderRadius:9,border:"none",background:V.signal,color:V.ground,fontWeight:700,cursor:"pointer"};
