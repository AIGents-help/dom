-- Aggregate every owned row in one snapshot; returned finding detail stays bounded.
-- Exact counts scan the inspection's index entries, not an API-limited first page.
create function public.read_dominic_issue_verification(p_issue_id uuid, p_user_id uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$
  with owned_issue as materialized (
    select i.id,i.asset_id,i.title,i.severity,i.status,i.recommended_action,i.resolution_notes,
      i.resolved_at,i.verified_at,i.metadata,i.updated_at
    from public.dominic_issues i join public.dominic_assets a on a.id = i.asset_id and a.user_id = p_user_id
    where i.id = p_issue_id and i.user_id = p_user_id
  ), verification_inspection as materialized (
    select s.id,s.status,s.objective,s.summary,s.ai_summary,s.completed_at,s.created_at
    from public.dominic_inspections s join owned_issue i on s.id::text = i.metadata->>'verificationInspectionId'
      and s.asset_id = i.asset_id where s.user_id = p_user_id
  ), owned_findings as materialized (
    select f.id,f.title,f.severity,f.review_status,f.detector,f.observed_at
    from public.dominic_findings f join verification_inspection s on s.id = f.inspection_id
      join owned_issue i on i.asset_id = f.asset_id where f.user_id = p_user_id
  ), finding_counts as (
    select count(*) as total, count(*) filter (where review_status in ('detected','needs_review')) as pending,
      count(*) filter (where review_status = 'confirmed') as confirmed,
      count(*) filter (where review_status = 'dismissed') as dismissed,
      coalesce(jsonb_agg(distinct case when lower(detector->>'comparisonState') in ('improving','unchanged','worsening')
        then lower(detector->>'comparisonState') else 'unknown' end)
        filter (where review_status = 'confirmed'), '[]'::jsonb) as comparison_states from owned_findings
  ), owned_media as materialized (
    select m.analysis_status,m.media_type,m.analysis_summary,
      case when jsonb_typeof(m.analysis_summary->'candidateCount') = 'number' then
        case when (m.analysis_summary->>'candidateCount')::numeric >= 0
          and trunc((m.analysis_summary->>'candidateCount')::numeric) = (m.analysis_summary->>'candidateCount')::numeric
          then (m.analysis_summary->>'candidateCount')::numeric end
      end as candidate_count
    from public.dominic_inspection_media m join verification_inspection s on s.id = m.inspection_id
      join owned_issue i on i.asset_id = m.asset_id where m.user_id = p_user_id
  ), media_counts as (
    select count(*) as total, count(*) filter (where analysis_status not in ('review','complete')) as unfinished,
      count(*) filter (where media_type <> 'image' or candidate_count is null
        or (analysis_summary->'baselineCompared') is distinct from 'true'::jsonb
        or coalesce(analysis_summary->'comparisonComparability'->>'level','unknown') not in ('medium','high')) as invalid_comparison,
      coalesce(sum(candidate_count),0) as screened_candidates from owned_media
  ), finding_sample as (
    select id,title,severity,review_status,detector from owned_findings
    order by case when review_status in ('detected','needs_review') then 0 else 1 end,
      case severity when 'critical' then 0 when 'high' then 1 when 'medium' then 2 when 'low' then 3 else 4 end,
      observed_at,id limit 12
  )
  select jsonb_build_object('issue',to_jsonb(i),
    'verificationInspection',(select to_jsonb(s) from verification_inspection s),
    'verificationFindings',coalesce((select jsonb_agg(to_jsonb(f)) from finding_sample f),'[]'::jsonb),
    'verificationCounts',jsonb_build_object('total',f.total,'pending',f.pending,'confirmed',f.confirmed,'dismissed',f.dismissed,
      'comparisonStates',f.comparison_states,'mediaTotal',m.total,'unfinished',m.unfinished,
      'invalidComparison',m.invalid_comparison,'screenedCandidates',m.screened_candidates))
  from owned_issue i cross join finding_counts f cross join media_counts m;
$$;
revoke all on function public.read_dominic_issue_verification(uuid,uuid) from public, anon, authenticated;
grant execute on function public.read_dominic_issue_verification(uuid,uuid) to service_role;
