alter table public.leads
  add column if not exists industry text,
  add column if not exists engagement_model text,
  add column if not exists opportunity_ownership text,
  add column if not exists relationship_type text,
  add column if not exists service_opportunity text,
  add column if not exists dji_permitted text,
  add column if not exists ndaa_required boolean,
  add column if not exists blue_uas_required boolean,
  add column if not exists total_project_value numeric,
  add column if not exists expected_dom_revenue numeric,
  add column if not exists prime_contractor text,
  add column if not exists end_client text,
  add column if not exists source_url text,
  add column if not exists verification_notes text,
  add column if not exists smartlead_campaign_id text,
  add column if not exists smartlead_lead_id text,
  add column if not exists outreach_approved_at timestamptz,
  add column if not exists outreach_paused_at timestamptz,
  add column if not exists next_action text;

alter table public.leads
  drop constraint if exists leads_industry_check;

alter table public.leads
  add constraint leads_industry_check check (
    industry is null or industry in (
      'telecom_towers', 'refinery_petrochemical', 'utilities', 'construction',
      'surveying_engineering', 'commercial_real_estate', 'roofing', 'solar',
      'municipal', 'public_safety', 'environmental', 'agriculture', 'other'
    )
  );

alter table public.leads
  drop constraint if exists leads_engagement_model_check;

alter table public.leads
  add constraint leads_engagement_model_check check (
    engagement_model is null or engagement_model in (
      'direct_project', 'subcontracted_project', 'joint_project',
      'staff_augmentation', 'white_label_service', 'referral_only', 'unknown'
    )
  );

alter table public.leads
  drop constraint if exists leads_opportunity_ownership_check;

alter table public.leads
  add constraint leads_opportunity_ownership_check check (
    opportunity_ownership is null or opportunity_ownership in (
      'dom_owned', 'partner_owned', 'shared', 'unknown'
    )
  );

alter table public.leads
  drop constraint if exists leads_dji_permitted_check;

alter table public.leads
  add constraint leads_dji_permitted_check check (
    dji_permitted is null or dji_permitted in (
      'yes', 'no', 'unknown', 'project_dependent'
    )
  );

create index if not exists idx_leads_industry on public.leads (industry);
create index if not exists idx_leads_engagement_model on public.leads (engagement_model);
create index if not exists idx_leads_opportunity_ownership on public.leads (opportunity_ownership);
create index if not exists idx_leads_status on public.leads (status);
create index if not exists idx_leads_email_lower on public.leads (lower(email)) where email is not null;
create index if not exists idx_leads_smartlead_lead_id on public.leads (smartlead_lead_id) where smartlead_lead_id is not null;
