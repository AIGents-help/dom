alter table public.admin_messages
  add column if not exists category text not null default 'request_drone_services';

alter table public.admin_messages
  drop constraint if exists admin_messages_category_check;

alter table public.admin_messages
  add constraint admin_messages_category_check check (category in (
    'general_inquiry',
    'thank_you_feedback',
    'partnership_opportunity',
    'media_inquiry',
    'vendor_inquiry',
    'pilot_question',
    'request_drone_services'
  ));

create index if not exists admin_messages_category_created_idx
  on public.admin_messages(category, created_at desc);

