# Project home and navigation

Continues the inspection-list and photo-review redesign in the existing application.
The project library has light-gray surfaces, readable cards, search, map-processing
filters, nine-card pages and direct Plans / Inspections / Exports shortcuts.
The shared navigation groups personal work, the selected project and field tools;
all existing destinations, accessible names and demo labels remain available.

Shortcuts pass the project ID and destination to the existing MappingTab parent.
They are only offered when that parent supplies workspace navigation. Embedded
pilot MappingTab without that callback retains its existing Open project behavior.
The underlying authenticated project API, owner/entitlement checks and inspection
and report routes are unchanged. No database migrations or aircraft commands.

Project map-processing status is not inspection completion or safety approval.
The page does not invent thumbnails, defects or inspection counts. Pagination and
search cover the rows returned by the existing project-list API; that API's server
row limit is unchanged. This is not a complete multi-thousand-project server-side
search implementation. The local 1005-row helper test only proves client paging.

Failed, malformed and timed-out reads become a retryable error, not an empty
library. Obsolete requests are cancelled; account/token changes hide old records.
No project data or credentials are written to browser persistence by this change.

Local verification: 17 Node presentation/read tests, helper checkJs/noEmit and TSX
syntax checks. Full application typecheck/build and browser acceptance must be
reported separately in the PR. No local complete checkout/build is claimed.

The disposable-local-database browser test opens saved projects and their correct
inspections, switches between projects, follows Plans and Exports, checks errors
and recovery, and captures desktop and phone layouts. Existing photo-review and
mission-lifecycle tests remain unchanged. Test records are not customer data or
physical drone inspection evidence.
