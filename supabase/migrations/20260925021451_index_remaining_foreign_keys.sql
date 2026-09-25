-- Complete the remaining foreign-key coverage reported by the Supabase
-- performance advisor. These indexes support joins, deletes/updates of parent
-- rows, and the Admin/mission/CRM queries already used by DOM.

create index if not exists admin_messages_client_id_idx
  on public.admin_messages(client_id);
create index if not exists assignment_sops_sop_document_id_idx
  on public.assignment_sops(sop_document_id);
create index if not exists checklist_items_sop_document_id_idx
  on public.checklist_items(sop_document_id);
create index if not exists contractors_insurance_verified_by_idx
  on public.contractors(insurance_verified_by);
create index if not exists crm_ownership_reviews_contractor_id_idx
  on public.crm_ownership_reviews(contractor_id);
create index if not exists jobs_client_id_idx
  on public.jobs(client_id);
create index if not exists leads_external_prospect_id_idx
  on public.leads(external_prospect_id);
create index if not exists mission_expenses_assignment_id_idx
  on public.mission_expenses(assignment_id);
create index if not exists mission_program_runs_mission_request_id_idx
  on public.mission_program_runs(mission_request_id);
create index if not exists mission_programs_client_id_idx
  on public.mission_programs(client_id);
create index if not exists mission_programs_created_by_idx
  on public.mission_programs(created_by);
create index if not exists mission_programs_preferred_contractor_id_idx
  on public.mission_programs(preferred_contractor_id);
create index if not exists mission_reviews_reviewer_user_id_idx
  on public.mission_reviews(reviewer_user_id);
create index if not exists mission_support_requests_assignment_id_idx
  on public.mission_support_requests(assignment_id);
create index if not exists mission_support_requests_created_by_idx
  on public.mission_support_requests(created_by);
create index if not exists mission_support_requests_mission_request_id_idx
  on public.mission_support_requests(mission_request_id);
create index if not exists notification_log_assignment_id_idx
  on public.notification_log(assignment_id);
create index if not exists outreach_events_campaign_id_idx
  on public.outreach_events(campaign_id);
create index if not exists payments_client_id_idx
  on public.payments(client_id);
create index if not exists payments_contractor_id_idx
  on public.payments(contractor_id);
create index if not exists payments_mission_request_id_idx
  on public.payments(mission_request_id);
create index if not exists quotes_responded_by_idx
  on public.quotes(responded_by);
create index if not exists quotes_supersedes_quote_id_idx
  on public.quotes(supersedes_quote_id);
