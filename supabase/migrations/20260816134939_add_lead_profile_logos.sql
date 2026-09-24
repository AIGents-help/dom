alter table public.leads
  add column if not exists logo_url text,
  add column if not exists logo_path text;

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('relationship-logos','relationship-logos',true,5242880,array['image/jpeg','image/png','image/webp','image/svg+xml'])
on conflict (id) do update set public=true,file_size_limit=5242880,allowed_mime_types=excluded.allowed_mime_types;

comment on column public.leads.logo_url is 'Public company/profile logo used in DOM relationship listings.';
comment on column public.leads.logo_path is 'Storage object path for controlled replacement of the relationship logo.';
