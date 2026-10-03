import assert from "node:assert/strict";
import { test } from "node:test";
import { assessDevelopmentAudit } from "./audit-development.mjs";

function fixture() {
  return {
    report: { metadata: { vulnerabilities: { total: 2 } }, vulnerabilities: {
      braces: { nodes: ["node_modules/braces"], via: [{ name: "braces", url: "https://github.com/advisories/GHSA-vfj7-8cjw-p6xm" }] },
      micromatch: { nodes: ["node_modules/micromatch"], via: ["braces"] },
    } },
    lockfile: { packages: {
      "node_modules/braces": { dev: true, version: "3.0.3" },
      "node_modules/micromatch": { dev: true, version: "4.0.8" },
    } },
  };
}

test("accepts only the documented advisory on development-only paths", () => {
  const { report, lockfile } = fixture();
  assert.deepEqual(assessDevelopmentAudit(report, lockfile), { exceptions: ["braces", "micromatch"], failures: [] });
});

test("blocks the advisory if braces becomes a production dependency", () => {
  const { report, lockfile } = fixture();
  lockfile.packages["node_modules/braces"].dev = false;
  assert.deepEqual(assessDevelopmentAudit(report, lockfile).failures, ["braces", "micromatch"]);
});

test("blocks a production ancestor and any additional advisory", () => {
  const { report, lockfile } = fixture();
  lockfile.packages["node_modules/micromatch"].dev = false;
  assert.deepEqual(assessDevelopmentAudit(report, lockfile).failures, ["micromatch"]);
  report.vulnerabilities.braces.via.push({ name: "braces", url: "https://github.com/advisories/another-advisory" });
  assert.deepEqual(assessDevelopmentAudit(report, lockfile).failures, ["braces", "micromatch"]);
});

test("does not extend the exception to other versions or unknown dependency paths", () => {
  const { report, lockfile } = fixture();
  lockfile.packages["node_modules/braces"].version = "3.0.4";
  assert.deepEqual(assessDevelopmentAudit(report, lockfile).failures, ["braces", "micromatch"]);
  delete lockfile.packages["node_modules/micromatch"];
  assert.ok(assessDevelopmentAudit(report, lockfile).failures.includes("micromatch"));
});

test("malformed reports and cyclic advisory paths fail closed", () => {
  assert.throws(() => assessDevelopmentAudit({}, {}), /valid vulnerability report/);
  const { report, lockfile } = fixture();
  report.vulnerabilities.braces.via = ["micromatch"];
  assert.deepEqual(assessDevelopmentAudit(report, lockfile).failures, ["braces", "micromatch"]);
});
