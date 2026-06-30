# Drone Operation Management

Premium commercial drone operations platform for **DroneOpsMan.com**.

## Stack
- Next.js 15 (App Router) + TypeScript
- Tailwind CSS (dark enterprise theme, blue/cyan accents)
- Supabase-ready data layer (`lib/supabase.ts`)
- Resend-ready transactional email (`lib/resend.ts`)
- Notion-ready CRM sync (`lib/notion.ts`)
- Vercel deployment ready

## Pages
- `/` — Home
- `/services` — Services
- `/industries` — Industries
- `/request-mission` — Request a Mission (form → API route → Supabase + Resend + Notion)
- `/about` — About
- `/faa-compliance` — FAA Compliance
- `/admin/login` — Admin Login
- `/admin/dashboard` — Admin Dashboard (Leads, Mission Requests, Clients, Jobs, Schedule, Deliverables, Notes, Status Tracking)

## Local development

```bash
npm install
cp .env.example .env.local
npm run dev
```

## Connecting integrations

### Supabase
1. Create a Supabase project.
2. Run the SQL schema documented at the bottom of `lib/supabase.ts` (leads, mission_requests, clients, jobs, deliverables, notes tables).
3. Add `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` to your environment.
4. Wire the Admin Dashboard tabs (`components/AdminDashboardClient.tsx`) to live Supabase queries — they currently render sample data.

### Resend
1. Verify your sending domain in Resend.
2. Add `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, and `NOTIFY_EMAIL`.
3. `app/api/mission-request/route.ts` will automatically send confirmation + internal notification emails.

### Notion CRM
1. Create a Notion integration and two databases: Mission Requests and Leads.
2. Share both databases with the integration.
3. Add `NOTION_API_KEY`, `NOTION_MISSIONS_DB_ID`, `NOTION_LEADS_DB_ID`.

### Admin Auth
The included `/admin/login` flow uses a simple env-based credential check (`ADMIN_EMAIL` / `ADMIN_PASSWORD`) for demo purposes. For production, replace `app/api/admin/login/route.ts` with Supabase Auth and protect `/admin/dashboard` with middleware-based session checks.

## Deploying to Vercel

1. Push this repository to GitHub.
2. Import the repo in Vercel.
3. Add the environment variables from `.env.example` in the Vercel project settings.
4. Deploy — `npm run build` runs automatically.
5. Point the `droneopsman.com` domain at the Vercel project in Project Settings → Domains.
