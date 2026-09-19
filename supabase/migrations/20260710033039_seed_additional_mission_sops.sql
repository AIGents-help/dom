insert into sop_documents (slug, title, mission_type, category, version, is_current, required, body_md) values

('construction-progress-complete', 'Construction Progress Mapping — Complete SOP', 'construction_progress', 'complete', 1, true, true,
'# Construction Progress Mapping — Complete SOP

Recurring site documentation only has value if every flight is shot the same way. Follow this exactly so week-over-week comparisons actually compare.

## Equipment Checklist
- [ ] Aircraft with RTK/PPK module if the client requires survey-grade accuracy; otherwise standard GPS is acceptable — confirm which tier was quoted.
- [ ] Ground control points (GCPs) and target markers if this site uses them — check the site log for existing GCP coordinates before placing new ones.
- [ ] Spare batteries sized for the full site (large sites often need 3-6 batteries per flight).
- [ ] Hi-vis vest and hard hat — active construction sites require PPE for ground personnel, not just pilots in the air.
- [ ] Site safety orientation badge/credential if this is a return site with an established badging process.

## Preflight & Airspace
- [ ] Confirm this week''s flight boundary matches the client''s site plan — footprint often changes as construction phases progress.
- [ ] Check for cranes, tower cranes, or temporary structures added since the last flight; note their height for deconfliction.
- [ ] Coordinate with the site superintendent for a launch window that avoids active crane operations.
- [ ] Pull current airspace class and any temporary authorizations (construction sites near airports sometimes have standing coordination).
- [ ] Confirm GCP/target positions are undisturbed since the last flight, or re-survey if moved.

## Flight Operations
1. Fly the same grid pattern and altitude as the baseline flight for this site — consistency matters more than optimizing each individual flight.
2. Capture nadir (straight-down) imagery for the orthomosaic, plus oblique passes on any elevation changes worth documenting (foundations, framing progress, roofing).
3. Log GPS coordinates of any safety concerns observed (unsecured materials, open trenches, missing guardrails) — report separately to the site super, not just in the deliverable.
4. Photograph GCP targets clearly if used, for post-processing tie-in.

## Deliverable Specification
- Orthomosaic (GeoTIFF) covering the full site boundary, geo-referenced.
- Progress comparison set: current flight overlaid or paired against the prior flight''s equivalent frame.
- Volumetric/stockpile measurements if included in scope — flag which stockpiles were measured.
- Raw image set retained for 90 days in case reprocessing is needed.

**Gate:** if GCP positions can''t be confirmed or the site boundary has changed without client notice, flag it before flying — don''t guess.'),

('thermal-inspection-complete', 'Thermal + Visual Inspection — Complete SOP', 'thermal_inspection', 'complete', 1, true, true,
'# Thermal + Visual Inspection — Complete SOP

Thermal data is only as good as the conditions it was captured in. Bad timing produces imagery that looks fine but is scientifically useless.

## Equipment Checklist
- [ ] Radiometric thermal sensor (not just a visual-spectrum "night mode" camera) — confirm the aircraft has a true radiometric payload before departure.
- [ ] Visual camera for the paired reference imagery.
- [ ] Calibrated reference source if the client requires absolute temperature accuracy (not just relative hot-spot detection).
- [ ] Spare batteries — thermal payloads draw more power than visual-only missions.

## Preflight & Airspace
- [ ] Check the delta-T requirement for the inspection type: solar panel thermal wants direct sun exposure beforehand; building envelope thermal wants a meaningful indoor/outdoor temperature differential (typically 18°F+/10°C+).
- [ ] Confirm timing: solar panel thermal is best shot near solar noon under full irradiance; building envelope thermal is often best at dawn or dusk to avoid solar loading skewing the readings.
- [ ] No standing water, frost, or recent rain on the target surface — moisture radically distorts thermal readings.
- [ ] Pull airspace class and required authorization same as any other mission.
- [ ] Confirm with client whether this is a relative (hot-spot flagging) or absolute (calibrated temperature) inspection — changes what you need to bring and how you fly.

## Flight Operations
1. Capture a paired visual + thermal image at every station — thermal alone without visual context is hard for anyone to interpret later.
2. Fly consistent altitude and angle across the full array/structure so thermal contrast is comparable panel-to-panel or section-to-section.
3. For solar arrays: fly perpendicular passes across each row; note row/module numbering scheme used on site so hot spots can be located later.
4. For building envelope: capture all exterior faces plus roofline; note any HVAC equipment running (skews readings near vents/exhausts).

## Deliverable Specification
- Paired visual + thermal image set, geo-tagged.
- Hot-spot/anomaly report flagging any readings outside expected range, with location references.
- Raw radiometric data retained if absolute-temperature analysis was in scope.
- Summary flagging weather/timing conditions at capture, since these affect how the client should interpret results.

**Gate:** if conditions don''t meet the delta-T or moisture requirements above, do not fly the thermal pass — reschedule. Bad thermal data is worse than no data because it looks legitimate.'),

('ortho-survey-complete', 'Orthomosaic Survey — Complete SOP', 'ortho_survey', 'complete', 1, true, true,
'# Orthomosaic Survey — Complete SOP

This is DOM''s highest-accuracy product. Survey-grade output requires survey-grade discipline in the field.

## Equipment Checklist
- [ ] RTK/PPK-enabled aircraft, or standard GPS aircraft plus ground control points — confirm which accuracy tier was quoted to the client.
- [ ] GCP targets (minimum 5, more for large/irregular sites) and a survey-grade GPS unit to record their coordinates if not using RTK.
- [ ] Batteries sized for full site coverage at the required overlap — large ortho surveys often need multiple flights.
- [ ] Reflective/high-contrast GCP markers sized appropriately for the planned flight altitude (must be visible in imagery).

## Preflight & Airspace
- [ ] Confirm required accuracy tier with the client (relative vs. absolute; survey-grade vs. mapping-grade) — this determines GCP density and RTK requirement.
- [ ] Plan flight lines for minimum 75% front overlap / 65% side overlap (increase for complex terrain or vegetation).
- [ ] Place GCPs before flying, distributed across the site including the perimeter, not just the center.
- [ ] Record GCP coordinates with survey-grade accuracy matching or exceeding the deliverable requirement.
- [ ] Pull airspace class and authorization as with any mission; large sites may cross multiple airspace boundaries — check the whole flight area, not just the launch point.

## Flight Operations
1. Fly a consistent altitude across the whole site for uniform ground sample distance (GSD) — don''t vary altitude to "get a better angle," it breaks the ortho stitch.
2. Maintain planned overlap throughout — wind drift can reduce effective overlap on turns; verify on the tablet during flight if the system reports it.
3. Photograph each GCP clearly and confirm it''s visible in at least 2 overlapping frames.
4. Note any areas of the flight where overlap or image quality was compromised (glare, obstruction, aircraft avoidance) for reshoot before leaving site.

## Deliverable Specification
- Orthomosaic (GeoTIFF), geo-referenced to the accuracy tier quoted.
- Digital Elevation Model (DEM) if included in scope.
- GCP coordinate log delivered alongside the ortho for the client''s own QA.
- Processing report noting achieved GSD and any areas of reduced confidence.

**Gate:** do not leave site until every GCP has been confirmed visible in the captured imagery. A missed GCP found in the office means a return trip.'),

('powerline-inspection-complete', 'Powerline / Utility Inspection — Complete SOP', 'powerline_inspection', 'complete', 1, true, true,
'# Powerline / Utility Inspection — Complete SOP

Utility infrastructure missions carry real electrical hazard and usually BVLOS/extended-range considerations. This is not a standard mission profile — treat it with the extra rigor it requires.

## Equipment Checklist
- [ ] Aircraft rated for the standoff distance required near energized equipment (client/utility safety standard governs minimum distance — confirm before departure, do not assume).
- [ ] Zoom or high-resolution payload — most powerline inspection is shot from a safe standoff distance, not close-up.
- [ ] Extended battery set for corridor-length missions; range/endurance plan for the full corridor segment assigned.
- [ ] Visual observer if required by the operating authorization for this corridor (common for BVLOS or extended-range utility work).

## Preflight & Airspace
- [ ] Confirm the exact corridor segment and structure numbers assigned for this mission — utility corridors are long, scope creep in either direction wastes time and can cross into another crew''s segment.
- [ ] Coordinate with the utility''s own safety/operations contact per the mission briefing — many utility clients require a call-in before and after flight.
- [ ] Confirm minimum standoff distance from energized conductors and equipment per the client''s safety standard.
- [ ] Pull airspace class for the full corridor length, not just the starting point — long corridors can cross multiple airspace classes.
- [ ] Check weather for the full corridor; utility inspections often can''t be rescheduled easily, but never fly into unsafe wind/visibility to keep a corridor on schedule.

## Flight Operations
1. Maintain the required standoff distance from all energized equipment at all times — this is a hard safety limit, not a guideline.
2. Photograph each structure per the client''s numbering/tagging convention; log structure number against each image set.
3. Focus imagery on known failure points: insulators, connectors, cross-arms, vegetation encroachment, and any visible corrosion or damage.
4. Note and photograph any urgent safety hazard (broken insulator, visible arcing damage, vegetation contact) and escalate immediately per DOM ops protocol — do not wait for the standard deliverable timeline to report an active hazard.

## Deliverable Specification
- Structure-by-structure image set, tagged to the client''s asset numbering.
- Anomaly/defect report flagging any structure requiring follow-up, with severity noted.
- Corridor map showing flight coverage against the assigned segment.
- Immediate-escalation items called out separately from the standard report.

**Gate:** any observed active hazard (arcing, structural failure, fire risk) is reported to DOM ops immediately by phone, not just noted in the deliverable. Standoff distance is never compromised for a better shot.'),

('real-estate-media-complete', 'Real Estate Aerial Media — Complete SOP', 'real_estate_media', 'complete', 1, true, true,
'# Real Estate Aerial Media — Complete SOP

This is a marketing product. Technical correctness matters less here than it does elsewhere — but composition, light, and a clean edit matter a lot.

## Equipment Checklist
- [ ] Aircraft with a stabilized gimbal capable of smooth cinematic movement, not just static photo capture.
- [ ] ND filters if shooting midday in bright conditions (prevents overexposure and rolling-shutter artifacts on fast movements).
- [ ] Fully charged batteries with margin for re-shoots — light and property staging can change mid-session, budget extra flight time.

## Preflight & Airspace
- [ ] Confirm shoot list with the client beforehand: exterior orbit, approach/reveal shot, neighborhood context, specific features (pool, view, lot lines) they want highlighted.
- [ ] Golden hour (first/last ~1 hour of daylight) is strongly preferred for real estate — confirm the scheduled window accounts for this if the client wants premium results.
- [ ] Confirm property boundaries so neighboring properties aren''t inadvertently the focus of the shoot.
- [ ] Pull airspace class and authorization as with any mission — residential areas are often near small airports; don''t assume Class G.
- [ ] Check for privacy-sensitive elements nearby (neighboring yards, pools, windows) and plan flight paths to avoid lingering over them.

## Flight Operations
1. Shoot the "reveal" sequence first while light and energy are freshest — a slow reverse or rise revealing the property is the highest-value shot.
2. Capture a full orbit at a height that shows the property in its lot context, then a closer orbit highlighting architectural features.
3. Get static high-resolution stills at 2-3 key angles for use in listing photos, separate from the video footage.
4. Capture any specifically requested features (pool, view corridor, driveway approach) as their own discrete clips.

## Deliverable Specification
- Edited video (client-specified length, typically 60-90 seconds) with music/branding per client preference if editing is in scope.
- Raw, unedited clips delivered alongside if the client wants their own editor to use the footage.
- 5-10 high-resolution still images suitable for MLS/listing use.
- Delivered in both a web-optimized format and a full-resolution archival format.

**Gate:** if scheduled light conditions turn out poor (overcast when golden-hour was planned, etc.), flag it to the client before editing — don''t silently deliver a flat result.'),

('general-mission-complete', 'General Mission SOP — Baseline Checklist', 'general', 'complete', 1, true, true,
'# General Mission SOP — Baseline Checklist

Use this for any custom or one-off mission type without a dedicated SOP yet. It covers the non-negotiable baseline every DOM mission follows regardless of service type — confirm mission-specific scope directly with DOM ops before flying anything unfamiliar.

## Equipment Checklist
- [ ] Aircraft and payload appropriate to the scope discussed with DOM ops for this specific mission.
- [ ] Batteries charged with margin for the planned flight time plus a reasonable safety buffer.
- [ ] Aircraft registration current and legible on the airframe.
- [ ] microSD/storage formatted with sufficient free space; firmware current.

## Preflight & Airspace
- [ ] Confirm exact scope with DOM ops if anything about this mission is unclear — do not guess on an unfamiliar job type.
- [ ] Confirm property access / client authorization is in place in writing.
- [ ] Pull airspace class for the site and secure any required authorization (LAANC or otherwise).
- [ ] Check weather against Part 107 minimums and against any mission-specific tolerance (e.g. wind-sensitive payloads).
- [ ] Review the mission briefing (if one exists) for site-specific hazards, contacts, and special instructions.

## Flight Operations
1. Brief any ground personnel and establish a clear launch/recovery zone before takeoff.
2. Fly the scope as briefed by DOM ops; if conditions on-site differ meaningfully from what was briefed, pause and confirm before improvising.
3. Log flight time, conditions, and any incidents per standard DOM flight-log practice.
4. Capture more than the minimum if time and battery allow — it''s cheaper to have extra footage than to need a reshoot.

## Deliverable Specification
- Confirm the expected deliverable format with DOM ops before the mission if it isn''t already specified in the briefing.
- Deliver raw files plus any processed output agreed with ops.
- Flag anything unusual encountered on-site in the submission notes, even if it didn''t affect the flight.

**Gate:** if scope, access, or safety requirements aren''t clear, contact DOM ops before flying. An unfamiliar mission type is exactly when skipping this step causes problems.');
