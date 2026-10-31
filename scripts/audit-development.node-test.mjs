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


test("accepts precisely documented development-only glob and minimatch advisories", () => {
  const report = { metadata: { vulnerabilities: { total: 4 } }, vulnerabilities: {
    minimatch: { nodes: ["node_modules/minimatch"], via: [{ name: "minimatch", url: "https://github.com/advisories/GHSA-g3hv-75wg-m249" }] },
    glob: { nodes: ["node_modules/glob"], via: [{ name: "glob", url: "https://github.com/advisories/GHSA-3g3m-2fjr-6pw4" }, "minimatch"] },
    eslint: { nodes: ["node_modules/eslint"], via: ["minimatch"] },
    archiver: { nodes: ["node_modules/archiver"], via: ["glob"] },
  } };
  const lockfile = { packages: {
    "node_modules/minimatch": { dev: true, version: "10.0.0" },
    "node_modules/glob": { dev: true, version: "13.0.0" },
    "node_modules/eslint": { dev: true, version: "9.0.0" },
    "node_modules/archiver": { dev: true, version: "7.0.0" },
  } };
  assert.deepEqual(assessDevelopmentAudit(report, lockfile).failures, []);

  lockfile.packages["node_modules/archiver"].dev = false;
  assert.deepEqual(assessDevelopmentAudit(report, lockfile).failures, ["archiver"]);
  lockfile.packages["node_modules/archiver"].dev = true;
  report.vulnerabilities.minimatch.via.push({ name: "minimatch", url: "https://github.com/advisories/undocumented" });
  assert.deepEqual(assessDevelopmentAudit(report, lockfile).failures, ["minimatch", "glob", "eslint", "archiver"]);
});

test("glob-related advisories never allow production paths or unlisted advisories", () => {
  const report = { metadata: { vulnerabilities: { total: 1 } }, vulnerabilities: {
    minimatch: { nodes: ["node_modules/minimatch"], via: [{ name: "minimatch", url: "https://github.com/advisories/GHSA-g3hv-75wg-m249" }] },
  } };
  const lockfile = { packages: { "node_modules/minimatch": { dev: false, version: "10.0.0" } } };
  assert.deepEqual(assessDevelopmentAudit(report, lockfile).failures, ["minimatch"]);
});
