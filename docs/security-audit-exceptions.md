# Development dependency audit exception

Reviewed October 3, 2026: [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) affects `braces` through 3.0.3. No patched npm release is available at this review date. The issue exhausts the build process stack with deeply nested brace patterns.

DOM's affected dependency paths are development-only Tailwind and ESLint tooling. These tools consume repository-controlled file patterns. Customer data and inspection inputs do not enter these glob patterns. `npm audit --omit=dev` remains a required zero-exception production dependency check.

The full dependency audit permits this exact advisory only on lockfile paths marked `dev: true`, with `braces` pinned to 3.0.3 in the lockfile. Ancestor alerts are permitted only if every advisory path leads exclusively to this same accepted development dependency. Any other advisory, production dependency path, unknown path, or malformed audit response fails verification. The exception remains visible in verification output; the full audit is not represented as vulnerability-free.

Remove this exception when a compatible patched release becomes available. Do not apply `npm audit fix --force`: its suggested Tailwind major upgrade and ESLint downgrade require separate compatibility work and do not currently provide a compatible `braces` patch.
