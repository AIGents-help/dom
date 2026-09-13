# Drone Operation Management

Premium commercial drone operations platform for **DroneOpsMan.com**.

## Stack
- Next.js 15 (App Router) + TypeScript
- Tailwind CSS (dark enterprise theme, blue/cyan accents)
- Supabase data, authentication, row-level security, and private storage
- Resend transactional email and Stripe payment workflows
- Optional Notion and Smartlead CRM integrations
- Independent NodeODM mapper worker with optional Google Drive archiving
- Vercel deployment ready

## Pages
- `/` — Home
- `/services` — Services
- `/industries` — Industries
- `/request-mission` — Request a Mission (form → API route → Supabase + Resend + Notion)
- `/contact` — General inquiries, partnerships, feedback, and thank-you messages
- `/about` — About
- `/faa-compliance` — FAA Compliance
- `/admin/login` — Admin Login
- `/admin/dashboard` — Admin Dashboard (Leads, Mission Requests, Clients, Jobs, Schedule, Deliverables, Notes, Status Tracking)
- `/admin/messages` — Admin Inbox for non-mission messages
- `/pilot` — Pilot operations dashboard
- `/client` — Client mission and deliverable portal

## Local development

```bash
npm install
cp .env.example .env.local
npm run dev
```

## Connecting integrations

### Supabase
1. Create a Supabase project.
2. Apply the SQL migrations in `supabase/migrations` in timestamp order.
3. Add `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` to your environment.
4. Create the administrator in Supabase Auth and add the same email to `public.admin_users`.

### Resend
1. Verify your sending domain in Resend.
2. Add `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, and `NOTIFY_EMAIL`.
3. `app/api/mission-request/route.ts` will automatically send confirmation + internal notification emails.

### Notion CRM
1. Create a Notion integration and two databases: Mission Requests and Leads.
2. Share both databases with the integration.
3. Add `NOTION_API_KEY`, `NOTION_MISSIONS_DB_ID`, `NOTION_LEADS_DB_ID`.

### Authentication
Admin, pilot, and client access use Supabase Auth. Admin API access additionally requires membership in the `admin_users` allowlist.

## Deploying to Vercel

1. Push this repository to GitHub.
2. Import the repo in Vercel.
3. Add the environment variables from `.env.example` in the Vercel project settings.
4. Deploy — `npm run build` runs automatically.
5. Point the `droneopsman.com` domain at the Vercel project in Project Settings → Domains.
