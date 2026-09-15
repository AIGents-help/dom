import { describe, expect, it } from "vitest";
import {
  canPilotUpload,
  isPathWithinRoot,
  sanitizeStorageFileName,
  validatePilotUpload,
} from "./pilotMissionFiles";

describe("pilot mission file boundaries", () => {
  it("allows active and correction states, not closed states", () => {
    expect(canPilotUpload("scheduled")).toBe(true);
    expect(canPilotUpload("qc_rejected")).toBe(true);
    expect(canPilotUpload("submitted")).toBe(false);
    expect(canPilotUpload("qc_passed")).toBe(false);
    expect(canPilotUpload("cancelled")).toBe(false);
  });

  it("sanitizes browser-provided file names", () => {
    expect(sanitizeStorageFileName("../Site photos (final).zip")).toBe("Site-photos-final.zip");
    expect(sanitizeStorageFileName("///")).toBe("file");
  });

  it("keeps finalized paths inside the mission root", () => {
    expect(isPathWithinRoot("mission-1/id-report.pdf", "mission-1")).toBe(true);
    expect(isPathWithinRoot("mission-1/../other/file", "mission-1")).toBe(false);
    expect(isPathWithinRoot("mission-10/file", "mission-1")).toBe(false);
  });

  it("rejects incomplete and oversized upload requests", () => {
    expect(validatePilotUpload({ kind: "document", name: "", category: "permit", fileName: "x.pdf", fileSize: 5 })).toMatch(/name/i);
    expect(validatePilotUpload({ kind: "deliverable", name: "Report", category: "permit", fileName: "x.pdf", fileSize: 5 })).toMatch(/category/i);
    expect(validatePilotUpload({ kind: "document", name: "Permit", category: "permit", fileName: "x.pdf", fileSize: 251 * 1024 * 1024 })).toMatch(/250 MB/i);
  });
});
