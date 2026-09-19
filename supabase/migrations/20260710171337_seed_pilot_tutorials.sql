
insert into pilot_tutorials (slug, title, category, is_premium, body_md) values
('getting-your-first-mission', 'Getting Your First Mission', 'Getting Started', false,
'# Getting Your First Mission

Once you''re cleared (Part 107 + insurance both verified), missions reach you two ways: DOM offers one directly, or — once approved for self-service — you build your own. Here''s what happens after you accept.

## Accepting an Offer

- [ ] Review the job details on the Missions tab: service type, location, and scheduled date.
- [ ] Check the payout figure before accepting — this is fixed at quote time, not negotiable after the fact.
- [ ] Accept or decline. There''s no penalty for declining a mission that doesn''t fit your schedule or equipment.

## Using the Mission Log

Once accepted, open **Mission Log** from the Missions tab. This is where you:

- [ ] Upload Mission Briefing documents (permits, waivers, site access forms) if you''re the one collecting them.
- [ ] Upload the final deliverable when the flight and processing are done.
- [ ] Mark a deliverable QC-passed once you''ve reviewed it yourself — this is what makes it visible to the client.

## Checking for a Relevant SOP

Before flying a mission type you haven''t done before, check the SOPs tab — every service type has a reference checklist covering equipment, preflight, flight operations, and deliverable spec. Each mission card also links directly to its matching SOP.

**Gate:** if you''re not confident in the deliverable spec for a mission type, read the SOP before you fly, not after — reshoots cost you the second flight, not DOM.'),

('understanding-commission-and-subscription', 'Understanding Commission & the Self-Service Subscription', 'Business', false,
'# Understanding Commission & the Self-Service Subscription

DOM takes a commission on every mission to cover client sourcing, quoting, payment collection, and the operations platform itself. Here''s exactly how it works and when subscribing makes sense.

## Standard Missions (DOM-Sourced)

- [ ] DOM finds the client, prices the job, and collects payment up front.
- [ ] You keep 80% of the quoted total — DOM''s 20% commission is already factored into the payout shown before you accept.
- [ ] No subscription required for this — it applies to every pilot by default.

## Self-Service Missions (You Build Your Own)

Once approved for self-service (ask DOM after a completed mission, or once your credentials are verified), you can build and quote missions for your own clients directly in your portal.

- [ ] Without a subscription: standard 20% commission still applies, same as DOM-sourced missions.
- [ ] With the $99/mo subscription: 0% commission — you keep 100% of what you quote.

## Is Subscribing Worth It?

The breakeven is simple: if you''ll self-source more than roughly $500/mo in mission value, the subscription pays for itself (20% of $500 = $100, more than the $99 fee). Below that, the standard rate costs you less.

**Gate:** subscription status is checked at mission-creation time, not retroactively — subscribing after you''ve already quoted a mission won''t change that mission''s commission.'),

('advanced-orthomosaic-capture', 'Advanced Orthomosaic Capture Technique', 'Flight Technique', true,
'# Advanced Orthomosaic Capture Technique

Survey-grade orthomosaics live or die on capture discipline, not post-processing software. This covers the technique differences between a passable ortho and a survey-grade one.

## Overlap & Altitude

- [ ] 75% front overlap / 65% side overlap minimum for standard mapping; push to 80%/70% for sites with tall vertical features (towers, silos, dense tree lines) that cause parallax gaps.
- [ ] Hold altitude within ±5ft across the whole flight — inconsistent altitude is the single biggest cause of visible seams in the stitched output.
- [ ] Fly a cross-hatch pattern (two perpendicular passes) instead of a single grid on any site with significant elevation change — a single-direction grid can''t resolve terrain-driven parallax on its own.

## Ground Control Points (GCPs)

- [ ] Place a minimum of 5 GCPs for sites under 10 acres, scaling up for larger sites — one in each corner plus one center, more if the site isn''t roughly rectangular.
- [ ] Survey GCP coordinates with RTK/PPK correction if the deliverable requires survey-grade accuracy — GPS-only positioning isn''t sufficient for engineering-grade output.
- [ ] Photograph each GCP target clearly and directly overhead during the flight for post-processing tie-in — a blurry or oblique GCP shot is often unusable.

## Timing & Light

- [ ] Fly within 2 hours of solar noon when possible — long shadows distort feature edges in the stitched output and confuse automated feature-matching.
- [ ] Avoid flying immediately after rain on unpaved sites — wet, reflective ground reduces feature contrast and produces more stitching artifacts.

**Gate:** if you can''t hit ±5ft altitude consistency due to wind, reschedule rather than fly and hope processing software compensates — it usually can''t, and the client sees the seams.'),

('client-communication-and-site-access', 'Client Communication & Site Access', 'Business', true,
'# Client Communication & Site Access

Most mission problems that end up as bad reviews trace back to a communication gap before the flight, not a flying mistake. This covers the scripts and habits that prevent that.

## Before the Flight

- [ ] Confirm the site contact and access instructions at least 24 hours ahead — don''t rely on details from the original mission request alone, site conditions and contacts change.
- [ ] If the site requires a signed access waiver, send it ahead of arrival using the Property Access & Site Authorization Waiver template (Resources tab) — getting this signed on-site delays the flight and puts you in an awkward position if the contact isn''t available.
- [ ] Set a realistic arrival window and communicate it — "sometime Tuesday" creates more friction than a 2-hour window, even if the exact time shifts slightly.

## On Arrival

- [ ] Check in with the site contact before flying, even if you have standing authorization — conditions change (active work, unexpected people on site, new obstacles).
- [ ] If imagery will include identifiable people (staff, visitors, workers), get a Model & Image Release Form signed before you fly, not after.

## After the Flight

- [ ] Give a realistic deliverable timeline on-site, not an optimistic one — "3-5 business days" that arrives in 2 reads as great service; "next day" that slips to day 3 reads as unreliable, even though the second is objectively faster.
- [ ] If you find a site issue worth flagging (safety hazard, access problem, damage visible in imagery), report it directly to the site contact, not just in the deliverable notes — some things need faster attention than a report review cycle allows.

**Gate:** if a client or site contact requests something outside the original mission scope (extra flights, different deliverable format, rush turnaround), route it through DOM rather than agreeing on the spot — scope changes affect pricing and DOM''s agreement with the client.'),

('post-processing-workflow', 'Faster Turnaround: Post-Processing Workflow', 'Workflow', true,
'# Faster Turnaround: Post-Processing Workflow

The gap between "flight done" and "deliverable submitted" is where most missions lose time. A consistent workflow closes that gap without cutting corners on quality.

## Organize Before You Process

- [ ] Copy raw files off the aircraft/SD card the same day, before you process anything — don''t process directly from the card.
- [ ] Use a consistent folder naming convention per mission (e.g. `{date}_{client}_{service-type}`) so you can find any job''s raw files again without searching.
- [ ] Cull obviously bad frames (motion blur, lens flare, wrong exposure) before running any stitching or analysis software — feeding bad frames in slows processing and can degrade the output.

## Process With the Deliverable Spec Open

- [ ] Check the mission''s SOP deliverable spec *before* you start processing, not after — reprocessing to fix a format or coverage gap costs more time than getting it right the first pass.
- [ ] Export at the resolution/format actually specified, not your software''s default — over-delivering a huge raw export nobody asked for isn''t a bonus, it''s wasted time and an unwieldy file for the client.

## Self-QC Before Submission

- [ ] Open the finished deliverable yourself before uploading — check for obvious stitching seams, missing coverage areas, or corrupted exports.
- [ ] Compare against the mission''s scope notes one more time — did you cover everything requested, not just what you remembered flying.

**Gate:** don''t mark a deliverable QC-passed until you''ve actually opened and reviewed the final export yourself — that flag is what makes it visible to the client, and a bad deliverable that reaches the client is far more costly than a few extra minutes of review.');
