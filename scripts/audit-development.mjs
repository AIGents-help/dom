import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const KNOWN_ADVISORY = "https://github.com/advisories/GHSA-vfj7-8cjw-p6xm";

export function assessDevelopmentAudit(report, lockfile) {
  if (report?.error || !report?.vulnerabilities || !Number.isInteger(report?.metadata?.vulnerabilities?.total) ||
    report.metadata.vulnerabilities.total !== Object.keys(report.vulnerabilities).length) {
    throw new Error("npm audit did not return a valid vulnerability report");
  }
  const vulnerabilities = report.vulnerabilities;
  function accepted(name, seen = new Set()) {
    const entry = vulnerabilities[name];
    if (!entry || seen.has(name) || !entry.nodes?.length || !entry.via?.length) return false;
    if (!entry.nodes.every((path) => lockfile.packages?.[path]?.dev === true)) return false;
    const nextSeen = new Set([...seen, name]);
    return entry.via.every((source) => {
      if (typeof source === "string") return accepted(source, nextSeen);
      return name === "braces" && source.name === "braces" && source.url === KNOWN_ADVISORY &&
        entry.nodes.every((path) => lockfile.packages[path].version === "3.0.3");
    });
  }
  const exceptions = [];
  const failures = [];
  for (const name of Object.keys(vulnerabilities)) {
    (accepted(name) ? exceptions : failures).push(name);
  }
  return { exceptions, failures };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = spawnSync("npm", ["audit", "--json"], { encoding: "utf8", timeout: 120_000 });
    if (result.error) throw result.error;
    if (result.signal || ![0, 1].includes(result.status)) throw new Error("npm audit failed to complete");
    const assessment = assessDevelopmentAudit(JSON.parse(result.stdout), JSON.parse(readFileSync("package-lock.json", "utf8")));
    if (assessment.exceptions.length) {
      console.warn(`Known unpatched development-only advisory ${KNOWN_ADVISORY}: ${assessment.exceptions.join(", ")}. See docs/security-audit-exceptions.md. Production vulnerabilities and other advisories remain blocking.`);
    }
    if (assessment.failures.length) throw new Error(`Blocking dependency advisories: ${assessment.failures.join(", ")}`);
    console.log("Dependency audit gate passed.");
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
