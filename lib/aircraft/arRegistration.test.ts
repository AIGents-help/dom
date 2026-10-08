import { describe, expect, it } from "vitest";
import { isArRegistration, projectArRegistration, type ArRegistration } from "./arRegistration";
const frame = { aircraftId: "bench-aircraft", width: 960, height: 640, capturedAtMs: 10000, cameraSource: "wide", zoomRatio: 1 };
const registration: ArRegistration = {
  coordinateFrameId: "survey-1",
  calibration: { id: "bench-calibration", aircraftId: "bench-aircraft", model: "rectified-pinhole", width: 960, height: 640, cameraSource: "wide", zoomRatio: 1, fx: 500, fy: 500, cx: 480, cy: 320, maxReprojectionErrorPx: 0.5 },
  pose: { timestampMs: 10000, cameraPositionM: [0, 0, 0], worldToCameraRotation: [1, 0, 0, 0, 1, 0, 0, 0, 1], positionErrorM: 0.01, orientationErrorDeg: 0.01 },
  anchors: [{ id: "tank", label: "Tank inspection target", coordinateFrameId: "survey-1", positionM: [0, 0, 10], positionErrorM: 0.01 }],
};
const project = (value: unknown = registration, overrides = {}) => projectArRegistration(value, { ...frame, ...overrides }, 10000);
describe("calibrated AR registration", () => {
  it("projects the optical axis and bounds uncertainty", () => {
    expect(project().markers[0]).toMatchObject({ x: 0.5, y: 0.5 });
    expect(project().markers[0].errorPx).toBeGreaterThan(0.5);
  });
  it("handles translated cameras and right/down camera coordinates", () => {
    const data = structuredClone(registration); data.pose.cameraPositionM = [1, 2, 0]; data.anchors[0].positionM = [2, 3, 10];
    expect(project(data).markers[0].x).toBeCloseTo(530 / 960);
    expect(project(data).markers[0].y).toBeCloseTo(370 / 640);
  });
  it("uses world-to-camera rotation rather than assuming aircraft yaw", () => {
    const data = structuredClone(registration); data.pose.worldToCameraRotation = [0, 0, -1, 0, 1, 0, 1, 0, 0]; data.anchors[0].positionM = [10, 0, 0];
    expect(project(data).markers[0]).toMatchObject({ x: 0.5, y: 0.5 });
  });
  it("rejects raw distortion, malformed matrices, strings and duplicate anchors", () => {
    for (const change of [ { calibration: { ...registration.calibration, model: "raw" } }, { pose: { ...registration.pose, worldToCameraRotation: [-1, 0, 0, 0, 1, 0, 0, 0, 1] } }, { pose: { ...registration.pose, positionErrorM: "0" } }, { anchors: [registration.anchors[0], registration.anchors[0]] } ]) expect(isArRegistration({ ...registration, ...change })).toBe(false);
  });
  it("hides missing, stale and future pose data", () => {
    expect(project(null).markers).toHaveLength(0);
    expect(project({ ...registration, pose: { ...registration.pose, timestampMs: 9700 } }).markers).toHaveLength(0);
    expect(project(registration, { capturedAtMs: 16000 }).markers).toHaveLength(0);
    expect(project(registration, { capturedAtMs: 4000 }).markers).toHaveLength(0);
  });
  it("rejects source, zoom, resolution and reprojection mismatches", () => {
    for (const change of [{ aircraftId: "different-aircraft" }, { cameraSource: "zoom" }, { zoomRatio: 2 }, { width: 480 }, { zoomRatio: undefined }]) expect(project(registration, change).markers).toHaveLength(0);
    expect(project({ ...registration, calibration: { ...registration.calibration, maxReprojectionErrorPx: 3 } }).markers).toHaveLength(0);
  });
  it("hides behind-camera, offscreen and foreign-coordinate anchors", () => {
    for (const change of [{ positionM: [0, 0, -10] }, { positionM: [100, 0, 10] }, { coordinateFrameId: "different-survey" }]) expect(project({ ...registration, anchors: [{ ...registration.anchors[0], ...change }] }).markers).toHaveLength(0);
  });
  it("hides uncertain positions and orientation instead of inventing confidence", () => {
    for (const change of [{ positionErrorM: 3 }, { orientationErrorDeg: 5 }]) expect(project({ ...registration, pose: { ...registration.pose, ...change } }).markers).toHaveLength(0);
  });
});
