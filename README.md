# Drone Operation Management
Premium Next.js website + backend scaffold for DroneOpsMan.com.

## Included
- Premium responsive marketing site
- Request a Mission form
- Supabase lead capture
- Resend owner/client emails
- Optional Notion CRM sync
- Admin dashboard scaffold
- Supabase schema

## Run locally
```bash
npm install
cp .env.example .env.local
npm run dev
```

## Supabase setup
1. Create a Supabase project.
2. Run `supabase/schema.sql` in SQL Editor.
3. Add env vars from Project Settings > API.
4. Use the service role key only server-side.

## Resend setup
1. Create a Resend API key.
2. Verify your domain when ready.
3. Set `OWNER_EMAIL` so new mission requests notify you.

## Notion setup
1. Create a Notion integration.
2. Share your CRM database with the integration.
3. Add `NOTION_API_KEY` and `NOTION_DATABASE_ID`.

## Deploy
Deploy to Vercel and point DroneOpsMan.com to the Vercel project.
