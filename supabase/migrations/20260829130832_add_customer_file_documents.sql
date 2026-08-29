insert into storage.buckets (id, name, public, file_size_limit)
values ('customer-documents', 'customer-documents', false, 26214400)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit;

create table if not exists public.customer_documents (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  storage_path text not null unique,
  original_name text not null,
  description text,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 26214400),
  uploaded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists customer_documents_lead_created_idx
  on public.customer_documents (lead_id, created_at desc);
create index if not exists customer_documents_uploaded_by_idx
  on public.customer_documents (uploaded_by) where uploaded_by is not null;

alter table public.customer_documents enable row level security;
revoke all on public.customer_documents from anon, authenticated;

comment on table public.customer_documents is
  'Private server-mediated documents attached to the unified prospect/client CRM file.';
