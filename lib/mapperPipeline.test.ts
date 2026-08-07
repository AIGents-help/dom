import { describe, it, expect } from "vitest";
import {
  canUploadImages, canQueueProcessing, isStaleProcessingJob, formatBytes, formatProgress,
  DEFAULT_STALE_THRESHOLD_MS, MAPPING_PROJECT_STATUS_OPTIONS, PROCESSING_JOB_STATUS_OPTIONS,
  type MappingProjectStatus,
} from "./mapperPipeline";

describe("status vocab", () => {
  it("has exactly the 8 project statuses and 6 processing job statuses from the spec", () => {
    expect(MAPPING_PROJECT_STATUS_OPTIONS.map((s) => s.value)).toEqual([
      "draft", "uploading", "uploaded", "queued", "processing", "completed", "failed", "cancelled",
    ]);
    expect(PROCESSING_JOB_STATUS_OPTIONS.map((s) => s.value)).toEqual([
      "queued", "claimed", "processing", "completed", "failed", "cancelled",
    ]);
  });
});

describe("canUploadImages", () => {
  it("allows draft/uploading/uploaded, blocks everything else", () => {
    expect(canUploadImages({ status: "draft" })).toBe(true);
    expect(canUploadImages({ status: "uploading" })).toBe(true);
    expect(canUploadImages({ status: "uploaded" })).toBe(true);
    expect(canUploadImages({ status: "queued" })).toBe(false);
    expect(canUploadImages({ status: "processing" })).toBe(false);
    expect(canUploadImages({ status: "completed" })).toBe(false);
  });
});

describe("canQueueProcessing", () => {
  it("requires a queueable status and at least 2 images", () => {
    expect(canQueueProcessing({ status: "uploaded", image_count: 10 }).ok).toBe(true);
    expect(canQueueProcessing({ status: "uploaded", image_count: 1 }).ok).toBe(false);
    expect(canQueueProcessing({ status: "processing", image_count: 10 }).ok).toBe(false);
    expect(canQueueProcessing({ status: "completed", image_count: 10 }).ok).toBe(false);
  });

  it("allows re-queuing a failed project", () => {
    expect(canQueueProcessing({ status: "failed", image_count: 5 }).ok).toBe(true);
  });

  it("gives a human reason when blocked", () => {
    const result = canQueueProcessing({ status: "uploaded" as MappingProjectStatus, image_count: 0 });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/at least 2 images/);
  });
});

describe("isStaleProcessingJob", () => {
  const now = new Date("2026-08-07T12:00:00Z").getTime();

  it("is never stale for non-active statuses", () => {
    expect(isStaleProcessingJob({ status: "queued", heartbeat_at: null, claimed_at: null }, now)).toBe(false);
    expect(isStaleProcessingJob({ status: "completed", heartbeat_at: null, claimed_at: null }, now)).toBe(false);
  });

  it("is stale if claimed/processing with no heartbeat at all", () => {
    expect(isStaleProcessingJob({ status: "claimed", heartbeat_at: null, claimed_at: null }, now)).toBe(true);
  });

  it("is stale only once the heartbeat is older than the threshold", () => {
    const recent = new Date(now - 60 * 1000).toISOString(); // 1 minute ago
    const old = new Date(now - DEFAULT_STALE_THRESHOLD_MS - 1000).toISOString(); // just over 10 minutes ago
    expect(isStaleProcessingJob({ status: "processing", heartbeat_at: recent, claimed_at: null }, now)).toBe(false);
    expect(isStaleProcessingJob({ status: "processing", heartbeat_at: old, claimed_at: null }, now)).toBe(true);
  });

  it("falls back to claimed_at when heartbeat_at is null", () => {
    const old = new Date(now - DEFAULT_STALE_THRESHOLD_MS - 1000).toISOString();
    expect(isStaleProcessingJob({ status: "claimed", heartbeat_at: null, claimed_at: old }, now)).toBe(true);
  });
});

describe("formatBytes", () => {
  it("formats across units", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5.0 MB");
    expect(formatBytes(2.5 * 1024 * 1024 * 1024)).toBe("2.5 GB");
  });
});

describe("formatProgress", () => {
  it("rounds and clamps to 0-100", () => {
    expect(formatProgress(0)).toBe("0%");
    expect(formatProgress(45.6)).toBe("46%");
    expect(formatProgress(150)).toBe("100%");
    expect(formatProgress(-10)).toBe("0%");
  });
});
