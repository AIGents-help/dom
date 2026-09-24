-- Add a distinct still-photography mission and turn the existing SOP catalog
-- into a more visual, repeatable field standard.

insert into public.sop_documents (
  slug, title, mission_type, category, version, is_current, body_md, required
) values (
  'aerial-images-complete',
  'Aerial Images — Complete SOP',
  'aerial_images',
  'complete',
  1,
  true,
  $sop$# Aerial Images — Complete SOP

Use this mission when the client wants professional aerial still photographs only. It is not a mapping survey, inspection report, real-estate video package, or technical measurement product. The value is a consistent set of sharp, intentional images that clearly show the requested subject and its surroundings.

## Define the client result before launch
- [ ] List every required subject: property, structure, equipment, landscape, event area, access route, or surrounding context.
- [ ] Confirm intended use: documentation, marketing, planning, insurance record, stakeholder update, or general reference.
- [ ] Confirm required orientation, aspect ratio, resolution, file format, and whether RAW files are included.
- [ ] Agree on privacy exclusions, neighboring properties, people, vehicles, signage, and sensitive infrastructure.
- [ ] Build a written shot list and identify the single must-have image.

## Standard capture sequence
1. Capture a high establishing view that locates the subject in its surroundings.
2. Capture four corner obliques when practical, keeping altitude and stand-off reasonably consistent.
3. Capture front, rear, left, and right context views when the subject has meaningful sides.
4. Capture a nadir overview when it adds useful layout information.
5. Capture medium views that isolate the primary subject without losing context.
6. Capture requested detail views from a safe stand-off; use aircraft position rather than digital zoom whenever practical.
7. Re-shoot the must-have view with at least one alternate altitude or angle.

## Camera and composition standard
- Use RAW+JPEG when supported. Keep ISO low, verify focus, and use a shutter fast enough to eliminate aircraft-motion blur.
- Lock white balance and exposure once lighting is stable so the delivered set looks consistent.
- Keep the horizon level unless a deliberate creative angle is part of the approved scope.
- Avoid clipping bright roofs, clouds, reflective surfaces, and deep shadows; use the histogram and highlight warnings.
- Leave useful space around the subject. Do not crop roofs, property edges, signs, towers, or equipment unintentionally.
- Remove weak duplicates. Deliver a coherent sequence, not every frame captured.

## Quality reference image
![Reference example: clear subject, level horizon, useful context, and controlled exposure.](/images/construction-aerial.jpg)

Study the reference for hierarchy: the client should immediately recognize the subject, understand the site, and still see enough detail to use the photograph. The exact angle changes by assignment; the clarity standard does not.

## Field acceptance test
- [ ] Review every required angle at full-screen zoom before leaving.
- [ ] Confirm no motion blur, missed focus, compression artifacts, propellers, landing gear, or severe haze.
- [ ] Confirm the image set covers the complete shot list and includes an alternate for every critical view.
- [ ] Confirm files exist on the primary card and one backup before clearing the site.

**Gate:** Do not close the mission because the aircraft landed successfully. Close it only after the image set is complete, technically clean, backed up, and ready for the client.

## Delivery standard
- Correct lens distortion, horizon, exposure, white balance, contrast, and color without making the scene misleading.
- Export full-resolution client-ready JPEGs in a logical order with descriptive filenames.
- Preserve original metadata and archive RAW/original files according to the client agreement.
- Include a short delivery note stating capture date, general conditions, limitations, and any shot-list item that could not be completed.
$sop$,
  true
)
on conflict (slug) do update set
  title = excluded.title,
  mission_type = excluded.mission_type,
  category = excluded.category,
  version = excluded.version,
  is_current = excluded.is_current,
  body_md = excluded.body_md,
  required = excluded.required,
  updated_at = now();

update public.sop_documents
set body_md = body_md || E'\n\n## Universal capture quality standard\n- Capture an establishing view, repeatable context views, and purposeful detail views. Every frame must answer a client question or satisfy the approved shot list.\n- Use consistent exposure and white balance, verify focus at full-screen magnification, and reject motion blur, accidental crops, obstructed views, and weak duplicates.\n- Preserve original files and metadata. Back up the mission media before leaving and verify the required deliverables against the approved scope.\n\n## Quality reference image\n' ||
  case mission_type
    when 'construction_progress' then '![Reference example: repeatable oblique site overview with clear boundaries and progress context.](/images/construction-aerial.jpg)'
    when 'ortho_survey' then '![Reference example: broad site coverage; an orthomosaic mission additionally requires systematic nadir overlap and processing validation.](/images/construction-aerial.jpg)'
    when 'thermal_inspection' then '![Reference example: RGB site context must accompany every thermal finding and preserve the location of each anomaly.](/images/solar-aerial.jpg)'
    when 'powerline_inspection' then '![Reference example: infrastructure context, safe stand-off, and enough surrounding detail to locate every finding.](/images/solar-aerial.jpg)'
    when 'real_estate_media' then '![Reference example: intentional light, strong subject hierarchy, clean horizon, and a polished client-facing composition.](/images/city-night-aerial.jpg)'
    when 'roof_inspection' then '![Reference example: combine whole-roof context with systematic detail views and preserve the location of every finding.](/images/solar-aerial.jpg)'
    else '![Reference example: clear subject, useful context, level horizon, and technically clean exposure.](/images/city-night-aerial.jpg)'
  end || E'\n\nUse the reference as a quality discussion tool, not a fixed flight path. The approved scope, site hazards, authorization, aircraft limits, lighting, and client purpose control the actual capture plan.\n\n## Reject and re-fly before leaving when\n- A required subject, side, angle, or detail is missing.\n- Focus or motion blur prevents confident review at full resolution.\n- Exposure clipping hides material detail, or inconsistent color makes the set difficult to compare.\n- The image cannot be tied to a location, asset, elevation, or shot-list item when traceability is required.\n\n**Gate:** A technically flyable image is not automatically a professional deliverable. It must be complete, understandable, repeatable, and useful to the client.'
where is_current = true
  and slug <> 'aerial-images-complete'
  and body_md not like '%## Universal capture quality standard%';

create or replace function public.pilot_update_owned_mission_definition(
  p_assignment_id uuid,
  p_actor_user_id uuid,
  p_title text,
  p_service_type text,
  p_scope text
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_contractor public.contractors%rowtype;
  v_assignment public.mission_assignments%rowtype;
  v_job public.jobs%rowtype;
  v_mission public.mission_requests%rowtype;
  v_title text := nullif(btrim(p_title), '');
  v_service_type text := nullif(btrim(p_service_type), '');
  v_scope text := nullif(btrim(p_scope), '');
begin
  select * into v_contractor from public.contractors where user_id = p_actor_user_id;
  if not found then raise exception 'Pilot profile not found'; end if;
  select * into v_assignment from public.mission_assignments
  where id = p_assignment_id and contractor_id = v_contractor.id for update;
  if not found then raise exception 'Mission assignment not found'; end if;
  if v_assignment.status not in ('accepted', 'scheduled', 'in_progress') then
    raise exception 'Mission scope can only be changed before submission';
  end if;
  select * into v_job from public.jobs where id = v_assignment.job_id for update;
  select * into v_mission from public.mission_requests where id = v_job.mission_request_id for update;
  if v_mission.created_by_contractor_id is distinct from v_contractor.id
     or v_job.delivery_responsibility is distinct from 'pilot' then
    raise exception 'Only the owner can change a pilot-created mission';
  end if;
  if v_title is null or char_length(v_title) > 160 then
    raise exception 'Mission name must be between 1 and 160 characters';
  end if;
  if v_service_type is null or v_service_type not in (
    'roof_inspection_residential', 'roof_inspection_commercial',
    'construction_progress', 'thermal_inspection', 'ortho_survey',
    'powerline_inspection', 'real_estate_media', 'aerial_images', 'custom'
  ) then raise exception 'Select a valid mission type'; end if;
  if v_scope is not null and char_length(v_scope) > 5000 then
    raise exception 'Mission scope cannot exceed 5000 characters';
  end if;
  update public.mission_requests set service_type = v_service_type, scope = v_scope where id = v_mission.id;
  update public.jobs set title = v_title, service_type = v_service_type where id = v_job.id;
  insert into public.mission_activity_events (
    mission_request_id, job_id, assignment_id, actor_user_id,
    actor_role, visibility, event_type, summary, details
  ) values (
    v_mission.id, v_job.id, v_assignment.id, p_actor_user_id,
    'pilot', 'shared', 'pilot_mission_definition_updated',
    'Pilot owner updated the mission name, type, or scope',
    jsonb_build_object(
      'before', jsonb_build_object('title', v_job.title, 'service_type', v_job.service_type, 'scope', v_mission.scope),
      'after', jsonb_build_object('title', v_title, 'service_type', v_service_type, 'scope', v_scope)
    )
  );
end;
$$;

revoke all on function public.pilot_update_owned_mission_definition(uuid, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.pilot_update_owned_mission_definition(uuid, uuid, text, text, text) to service_role;