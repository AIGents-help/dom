import { NextResponse } from "next/server";

export function reviewPayload(body:any){const rating=(v:any)=>{const n=Number(v);return Number.isInteger(n)&&n>=1&&n<=5?n:null};const overall=rating(body.overallRating);if(!overall)return null;return {overall_rating:overall,communication_rating:rating(body.communicationRating),preparedness_rating:rating(body.preparednessRating),accuracy_rating:rating(body.accuracyRating),would_work_again:typeof body.wouldWorkAgain==="boolean"?body.wouldWorkAgain:null,comments:String(body.comments??"").trim().slice(0,3000)||null,private_notes:String(body.privateNotes??"").trim().slice(0,3000)||null,updated_at:new Date().toISOString()}}
export function badReview(){return NextResponse.json({error:"Overall rating must be between 1 and 5."},{status:400})}
