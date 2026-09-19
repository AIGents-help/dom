
insert into sop_documents (slug, title, mission_type, category, version, is_current, required, body_md) values
(
 'roof-inspection-prep',
 'Roof Inspection — Mission Prep & Airspace Checklist',
 'roof_inspection',
 'prep',
 1, true, true,
$md$# Roof Inspection — Mission Prep & Airspace Checklist

Complete every item BEFORE leaving for the site. A mission that skips prep is not a DOM mission.

## 1. Authorization & airspace
- [ ] Confirm property address and exact structure(s) to be inspected.
- [ ] Pull the airspace class for the site (sectional / B4UFLY / Aloft).
- [ ] If in controlled airspace: secure LAANC authorization for the window. Screenshot the approval.
- [ ] Check for TFRs, stadiums, or special-use airspace active that day.
- [ ] Confirm you are >5 miles from any airport, or have the appropriate authorization.

## 2. Legal & client
- [ ] Verify property owner / authorized contact has granted site access in writing.
- [ ] Confirm scope: number of structures, slopes, and whether interior attic/thermal is included.
- [ ] Note any no-fly constraints from the client (neighboring privacy, livestock, schools nearby).

## 3. Weather window
- [ ] Wind sustained <20 mph and gusts within aircraft limits.
- [ ] No precipitation; surface dry (wet roofs misread and are a slip hazard for ground crew).
- [ ] Cloud ceiling and visibility meet Part 107 minimums.
- [ ] Sun angle planned to avoid blown-out highlights on the slope being shot.

## 4. Aircraft & equipment
- [ ] Batteries charged (aircraft + controller + tablet); spares packed.
- [ ] Props inspected, no nicks; gimbal free; lens clean.
- [ ] microSD formatted with >32GB free; firmware current.
- [ ] Aircraft registered; registration number legible on airframe.

## 5. Documentation set staged
- [ ] Pre-flight checklist ready to log on-site.
- [ ] Capture plan matches the Deliverable Specification for roof inspections.
- [ ] Incident/abort criteria reviewed.

**Gate:** if any authorization, legal-access, or weather item fails, the mission does not launch. Reschedule and notify DOM ops.$md$
),
(
 'roof-inspection-flight-ops',
 'Roof Inspection — Flight Operations Standard',
 'roof_inspection',
 'flight_ops',
 1, true, true,
$md$# Roof Inspection — Flight Operations Standard

How a DOM roof inspection is flown so any pilot produces the same result.

## On-site setup
1. Brief any ground personnel; establish a launch/recovery zone clear of the structure and people.
2. Walk the perimeter; note antennas, wires, trees, and the tallest obstacle.
3. Log pre-flight: location, aircraft, battery IDs, weather, airspace authorization reference.

## Capture sequence (fly in this order every time)
1. **Context orbit** — one 360° orbit at ~80–100 ft showing the full structure in its surroundings.
2. **Nadir overview** — straight-down shot of the entire roof from sufficient altitude to frame all slopes.
3. **Per-slope obliques** — each slope captured at a consistent 30–45° angle, overlapping by ~70%.
4. **Detail / damage passes** — close (but safe) captures of: ridges, valleys, flashing, penetrations (vents, chimneys, skylights), gutters, and any visible damage.
5. **Anomaly close-ups** — for each suspected issue, a wide locator shot AND a tight detail shot so location is unambiguous.

## Standards that make it DOM-grade
- Maintain visual line of sight at all times. No flying over uninvolved people.
- Keep consistent altitude and angle within each slope set — buyers compare images side by side.
- Every suspected defect gets two frames: one that locates it, one that shows it.
- Minimum safe standoff from the structure; never trade safety for a tighter shot.

## Abort criteria
Wind exceeds limits, signal degraded, a person enters the area, or aircraft anomaly → land immediately, log the abort, notify DOM ops before any re-launch.

## Close-out
- Log flight end: duration, battery state, anything notable.
- Confirm on-card image count meets the capture sequence before leaving the site.$md$
),
(
 'roof-inspection-deliverable-spec',
 'Roof Inspection — Deliverable Specification',
 'roof_inspection',
 'deliverable_spec',
 1, true, true,
$md$# Roof Inspection — Deliverable Specification

What the client receives. A mission is not "submitted" until it meets this spec. DOM QC checks against this list before the client sees anything.

## Required image set
- 1× context orbit set (full structure in surroundings)
- 1× nadir overview of the complete roof
- Oblique set covering every slope at consistent angle, ~70% overlap
- Detail captures of all ridges, valleys, flashing, penetrations, and gutters
- For each anomaly: a locator frame + a detail frame

## Image standards
- In focus, correctly exposed, no motion blur.
- Original resolution; no cropping that loses location context.
- Consistent orientation per slope set.

## Inspection report (PDF)
- Property address, date, weather, pilot, aircraft + registration.
- Airspace authorization reference (LAANC screenshot if applicable).
- Annotated findings: each issue numbered, located on the nadir overview, with detail image and a plain-language note.
- Overall condition summary.
- Part 107 compliance statement.

## File delivery
- Images organized by slope/section, named consistently.
- Report as PDF.
- Uploaded to the job's deliverable location; mark deliverable `qc_passed = false` until DOM review.

## QC gate (DOM, before client delivery)
- [ ] Full capture set present per spec
- [ ] All anomalies have locator + detail frames
- [ ] Report complete and accurate
- [ ] Compliance documentation attached
Only after QC passes does the deliverable go to the client and the assignment move toward payout.$md$
);
