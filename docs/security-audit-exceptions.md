# Development dependency audit exception

Reviewed October 3, 2026: [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) affects `braces` through 3.0.3. No patched npm release is available at this review date. The issue exhausts the build process stack with deeply nested brace patterns.

DOM's affected dependency paths are development-only Tailwind and ESLint tooling. These tools consume repository-controlled file patterns. Customer data and inspection inputs do not enter these glob patterns. `npm audit --omit=dev` remains a required zero-exception production dependency check.

The full dependency audit permits this exact advisory only on lockfile paths marked `dev: true`, with `braces` pinned to 3.0.3 in the lockfile. Ancestor alerts are permitted only if every advisory path leads exclusively to this same accepted development dependency. Any other advisory, production dependency path, unknown path, or malformed audit response fails verification. The exception remains visible in verification output; the full audit is not represented as vulnerability-free.

Remove this exception when a compatible patched release becomes available. Do not apply `npm audit fix --force`: its suggested Tailwind major upgrade and ESLint downgrade require separate compatibility work and do not currently provide a compatible `braces` patch.


## October 30, 2026: development-only globbing advisories

After updating Next.js, Resend, and production dependencies, the production audit is clean. A separate development-tool audit still reports **[GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249)** (`minimatch` globparts amplification) and **[GHSA-3g3m-2fjr-6pw4](https://github.com/advisories/GHSA-3g3m-2fjr-6pw4)** (`glob` AbortSignal cancellation bypass). Their affected paths in the current lockfile are development-only tooling, including ESLint and ExcelJS export/build support.

The gate permits only these exact advisory URLs, when **every** affected package and advisory ancestor is marked `dev: true` in the lockfile. Any production dependency, different advisory, changed source URL, missing package path, or malformed npm audit report **fails** verification. No production audit exception has been introduced, and no finding is hidden from the output.

These are time-limited technical debt exceptions, not assurances of safety. CI uses controlled repository inputs; never run vulnerable development utilities on untrusted file patterns or arbitrary customer archives. Reassess when a compatible patched dependency chain exists and remove these exceptions after verification. Do not use `npm audit fix --force` without validating major-version compatibility.
