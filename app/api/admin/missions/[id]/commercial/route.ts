import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/authz";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(req:NextRequest,{params}:{params:Promise<{id:string}>}){
  if(!(await isAdminRequest(req)))return NextResponse.json({error:"Admin access required"},{status:403});
  const{id}=await params;const body=await req.json().catch(()=>null) as Record<string,unknown>|null;
  if(!body||typeof body.action!=="string")return NextResponse.json({error:"Invalid request"},{status:400});
  const admin=getSupabaseAdmin();const{data:mission}=await admin.from("mission_requests").select("id").eq("id",id).maybeSingle();
  if(!mission)return NextResponse.json({error:"Mission not found"},{status:404});
  if(body.action==="create_change"){
    const title=typeof body.title==="string"?body.title.trim().slice(0,200):"";const reason=typeof body.reason==="string"?body.reason.trim().slice(0,2000):"";
    const scope=typeof body.scope==="string"?body.scope.trim().slice(0,5000):"";const amount=Number(body.amountDeltaCents);
    if(!title||!reason||!Number.isInteger(amount))return NextResponse.json({error:"Title, reason, and a valid price change are required"},{status:400});
    const{error}=await admin.from("mission_change_orders").insert({mission_request_id:id,title,reason,scope_delta:scope||null,amount_delta_cents:amount,status:"draft"});
    if(error)return NextResponse.json({error:"Change order could not be created"},{status:500});return NextResponse.json({ok:true});
  }
  if(body.action==="send_change"||body.action==="cancel_change"){
    const changeId=typeof body.changeOrderId==="string"?body.changeOrderId:"";const next=body.action==="send_change"?"sent":"cancelled";
    const patch=next==="sent"?{status:next,sent_at:new Date().toISOString()}:{status:next};
    const{data,error}=await admin.from("mission_change_orders").update(patch).eq("id",changeId).eq("mission_request_id",id).eq("status","draft").select("id").maybeSingle();
    if(error)return NextResponse.json({error:"Change order could not be updated"},{status:500});if(!data)return NextResponse.json({error:"Only a draft change order can be changed"},{status:409});return NextResponse.json({ok:true,status:next});
  }
  if(body.action==="send_quote"){
    const quoteId=typeof body.quoteId==="string"?body.quoteId:"";const now=new Date();const expires=new Date(now.getTime()+30*86400000);
    const{data,error}=await admin.from("quotes").update({status:"sent",sent_at:now.toISOString(),locked_at:now.toISOString(),expires_at:expires.toISOString()}).eq("id",quoteId).eq("mission_request_id",id).eq("status","draft").select("id").maybeSingle();
    if(error)return NextResponse.json({error:error.message},{status:500});if(!data)return NextResponse.json({error:"Only a draft quote can be sent"},{status:409});
    await admin.from("mission_requests").update({status:"quoted"}).eq("id",id).is("created_by_contractor_id",null);
    return NextResponse.json({ok:true,status:"sent"});
  }
  if(body.action==="version_quote"){
    const quoteId=typeof body.quoteId==="string"?body.quoteId:"";const{data:q}=await admin.from("quotes").select("*").eq("id",quoteId).eq("mission_request_id",id).maybeSingle();
    if(!q)return NextResponse.json({error:"Quote not found"},{status:404});
    await admin.from("quotes").update({locked_at:new Date().toISOString()}).eq("id",q.id);
    const{id:_id,created_at:_created,sent_at:_sent,accepted_at:_accepted,rejected_at:_rejected,locked_at:_locked,status:_status,client_response_notes:_notes,responded_by:_responded,...pricing}=q;
    void _id;void _created;void _sent;void _accepted;void _rejected;void _locked;void _status;void _notes;void _responded;
    const{error}=await admin.from("quotes").insert({...pricing,version_number:(q.version_number??1)+1,supersedes_quote_id:q.id,status:"draft",expires_at:null});
    if(error)return NextResponse.json({error:error.message},{status:500});return NextResponse.json({ok:true});
  }
  return NextResponse.json({error:"Invalid action"},{status:400});
}
