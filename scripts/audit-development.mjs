import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const KNOWN_ADVISORIES = {
  braces: "https://github.com/advisories/GHSA-vfj7-8cjw-p6xm",
  glob: "https://github.com/advisories/GHSA-3g3m-2fjr-6pw4",
  minimatch: "https://github.com/advisories/GHSA-g3hv-75wg-m249",
};

export function assessDevelopmentAudit(report, lockfile) {
  if (report?.error || !report?.vulnerabilities || !Number.isInteger(report?.metadata?.vulnerabilities?.total) ||
    report.metadata.vulnerabilities.total !== Object.keys(report.vulnerabilities).length) {
    throw new Error("npm audit did not return a valid vulnerability report");
  }
  const vulnerabilities = report.vulnerabilities;
  function accepted(name) {
    const seen = new Set();
    let matchedDocumentedAdvisory = false;
    // Audit reports contain dependency cycles (ESLint -> eslint-utils -> ESLint).
    // Validate every reachable node rather than treating any cycle as a blocker
    // or, worse, accepting cycles that lack a documented direct advisory.
    function visit(currentName) {
      const entry = vulnerabilities[currentName];
      if (!entry || !entry.nodes?.length || !entry.via?.length) return false;
      if (!entry.nodes.every((path) => lockfile.packages?.[path]?.dev === true)) return false;
      if (seen.has(currentName)) return true;
      seen.add(currentName);
      return entry.via.every((source) => {
        if (typeof source === "string") return visit(source);
        const approved = Object.hasOwn(KNOWN_ADVISORIES, currentName) &&
          source.name === currentName &&
          source.url === KNOWN_ADVISORIES[currentName] &&
          (currentName !== "braces" || entry.nodes.every((path) => lockfile.packages[path].version === "3.0.3"));
        if (approved) matchedDocumentedAdvisory = true;
        return approved;
      });
    }
    return visit(name) && matchedDocumentedAdvisory;
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
      console.warn(`Documented development-only advisories: ${assessment.exceptions.join(", ")}. See docs/security-audit-exceptions.md. Production vulnerabilities, unknown paths and other advisories remain blocking.`);
    }
    if (assessment.failures.length) {
      const audit = JSON.parse(result.stdout);
      for (const name of assessment.failures) {
        const item = audit.vulnerabilities[name];
        console.error(`Audit detail ${name}: ${JSON.stringify(item?.via?.map((v) => typeof v === "string" ? v : { name: v.name, url: v.url, range: v.range }))}`);
      }
      throw new Error(`Blocking dependency advisories: ${assessment.failures.join(", ")}`);
    }
    console.log("Dependency audit gate passed.");
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
