import { NextResponse } from 'next/server';import { supabaseAdmin } from '@/lib/supabase';
export async function GET(){const {data,error}=await supabaseAdmin().from('jobs').select('*,clients(*)').order('scheduled_date',{ascending:true});if(error)return NextResponse.json({error:error.message},{status:400});return NextResponse.json(data)}
export async function POST(req:Request){const body=await req.json();const {data,error}=await supabaseAdmin().from('jobs').insert(body).select().single();if(error)return NextResponse.json({error:error.message},{status:400});return NextResponse.json(data)}
