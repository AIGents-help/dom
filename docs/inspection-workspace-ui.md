# Inspection workspace: visible delivery increment

This changes the existing Intelligent Inspection / AI Inspection Copilot component,
not a new testing page. It uses the existing project API and owner-scoped inspection
and asset reads. No schema, detector, aircraft, authorization or provider change.

The project inspection list now has light-gray surfaces, readable cards, a search,
status filters, nine-card pages, and actions based on saved status. Starting an
inspection or setting up capture opens the existing assets/capture workflow. Opening
an inspection shows its actual evidence review, and report links use the existing
report route. Incomplete inspections say Preview report, not final report.

The selected inspection's owner is still checked before evidence is mounted. Late
requests cannot replace a newer selection. Errors are not presented as an empty
inspection list. This is presentation work, not proof of aircraft readiness,
industrial detection accuracy or a full-product visual redesign. The underlying
evidence editor, map/planner and home project screen retain their current design.

The browser acceptance test uses a disposable local database, real saved test jobs,
12 test inspections, real sign-in and the production-built app. It checks search,
filters, pagination, selected inspection/report identity, capture-setup navigation,
failed-load recovery, and desktop/phone layout. Only synthetic test screenshots are
retained. Run it only against loopback hosts with E2E_ISOLATED_SUPABASE=true.

Local Node checks cover display labels and filtering. Full application and browser
results must be recorded in the pull request after CI; no local full build is claimed.
