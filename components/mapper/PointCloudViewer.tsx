"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { Potree, PointSizeType, type PointCloudOctree } from "potree-core";
import { V, panelStyle, btnGhost } from "./theme";
import { createWebGLRenderer } from "./webgl";

// Real Potree 2.x point cloud viewer. The master LAZ (see "Download Master
// LAZ" below) is never loaded in the browser directly -- the worker's
// convertPointCloud.ts step (PotreeConverter 2.x) produces a compact
// 3-file octree (metadata.json/octree.bin/hierarchy.bin), and this viewer
// streams that instead via potree-core, which is what actually gives real
// orbit/pan/zoom/point-budget LOD behavior for a cloud with millions of
// points (the real Toledo LAZ converts to ~10.78M points).
//
// The three octree files live in a private Supabase Storage bucket
// (mapper-potree, see that migration's comment) specifically because the
// viewer issues many small, repeated, Range-requested reads while panning/
// loading LOD nodes -- real signed URLs support HTTP Range natively; a
// per-request Vercel proxy (like the Drive download route) would not scale
// to that access pattern. See app/api/pilot/mapping/projects/[id]/
// deliverables/[deliverableId]/potree/route.ts for how those URLs are
// minted (short-lived, pilot-authorized, never public).
//
// potree-core's OctreeLoader always resolves octree.bin/hierarchy.bin by
// string-replacing "/metadata.json" in the metadata URL it was given
// (verified by reading node_modules/potree-core/dist/index.js directly) --
// since our three files are signed independently (different query-string
// tokens per object, not a shared "folder" token), that naive replace
// would carry the WRONG signature for octree.bin/hierarchy.bin. This
// custom RequestManager intercepts those specific fetches and substitutes
// the correct signed URL while preserving the Range header potree-core
// sets, which is what actually makes LOD streaming work.
class SignedUrlRequestManager {
  constructor(private urls: { metadataUrl: string; octreeUrl: string; hierarchyUrl: string }) {}

  async getUrl(_url: string): Promise<string> {
    return this.urls.metadataUrl;
  }

  async fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const target = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (target.includes("/octree.bin")) return fetch(this.urls.octreeUrl, init);
    if (target.includes("/hierarchy.bin")) return fetch(this.urls.hierarchyUrl, init);
    return fetch(input, init);
  }
}

const POINT_BUDGET_OPTIONS = [500_000, 1_000_000, 2_000_000, 5_000_000, 10_000_000];
const DEFAULT_POINT_BUDGET = 2_000_000;
const DEFAULT_POINT_SIZE = 1.5;

type ViewerState = "idle" | "loading" | "ready" | "error";

export default function PointCloudViewer({
  signedUrl,
  name,
  projectId,
  deliverableId,
  accessToken,
  hasPotree,
}: {
  signedUrl: string | null;
  name: string;
  projectId: string;
  deliverableId: string;
  accessToken: string;
  hasPotree: boolean;
}) {
  const [viewing, setViewing] = useState(false);
  const [state, setState] = useState<ViewerState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [pointBudget, setPointBudget] = useState(DEFAULT_POINT_BUDGET);
  const [pointSize, setPointSize] = useState(DEFAULT_POINT_SIZE);
  const [fullscreen, setFullscreen] = useState(false);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasHostRef = useRef<HTMLDivElement | null>(null);
  const potreeRef = useRef<Potree | null>(null);
  const pcoRef = useRef<PointCloudOctree | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const frameRef = useRef<number | null>(null);

  function fitToCloud() {
    const pco = pcoRef.current;
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!pco || !camera || !controls) return;
    const box = pco.getBoundingBoxWorld();
    const sphere = new THREE.Sphere();
    box.getBoundingSphere(sphere);
    const distance = Math.max(sphere.radius * 2.2, 1);
    camera.position.set(sphere.center.x + distance, sphere.center.y + distance * 0.6, sphere.center.z + distance);
    camera.near = Math.max(distance / 1000, 0.01);
    camera.far = distance * 100;
    camera.updateProjectionMatrix();
    controls.target.copy(sphere.center);
    controls.update();
  }

  async function startViewing() {
    setViewing(true);
    setState("loading");
    setError(null);

    try {
      const res = await fetch(`/api/pilot/mapping/projects/${projectId}/deliverables/${deliverableId}/potree`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Could not load the point cloud viewer data.");

      const requestManager = new SignedUrlRequestManager({
        metadataUrl: body.metadataUrl,
        octreeUrl: body.octreeUrl,
        hierarchyUrl: body.hierarchyUrl,
      });

      const host = canvasHostRef.current;
      if (!host) throw new Error("Viewer container not ready.");

      const rendererResult = createWebGLRenderer(THREE.WebGLRenderer, { antialias: true });
      if (!rendererResult.ok) throw new Error(rendererResult.message);

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(60, host.clientWidth / host.clientHeight, 0.1, 100_000);
      const renderer = rendererResult.renderer;
      renderer.setSize(host.clientWidth, host.clientHeight);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      host.innerHTML = "";
      host.appendChild(renderer.domElement);

      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;

      const potree = new Potree();
      potree.pointBudget = pointBudget;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pco = await potree.loadPointCloud("metadata.json", requestManager as any);
      pco.material.size = pointSize;
      pco.material.pointSizeType = PointSizeType.FIXED;
      scene.add(pco);

      potreeRef.current = potree;
      pcoRef.current = pco;
      rendererRef.current = renderer;
      sceneRef.current = scene;
      cameraRef.current = camera;
      controlsRef.current = controls;

      fitToCloud();

      const animate = () => {
        frameRef.current = requestAnimationFrame(animate);
        potree.updatePointClouds([pco], camera, renderer);
        controls.update();
        renderer.render(scene, camera);
      };
      animate();

      setState("ready");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load the point cloud.");
      setState("error");
    }
  }

  // Resize handling — keeps the renderer/camera matched to the container,
  // including when entering/exiting fullscreen.
  useEffect(() => {
    if (state !== "ready") return;
    const host = canvasHostRef.current;
    const renderer = rendererRef.current;
    const camera = cameraRef.current;
    if (!host || !renderer || !camera) return;
    const observer = new ResizeObserver(() => {
      const { clientWidth, clientHeight } = host;
      if (clientWidth === 0 || clientHeight === 0) return;
      renderer.setSize(clientWidth, clientHeight);
      camera.aspect = clientWidth / clientHeight;
      camera.updateProjectionMatrix();
    });
    observer.observe(host);
    return () => observer.disconnect();
  }, [state]);

  useEffect(() => {
    if (potreeRef.current) potreeRef.current.pointBudget = pointBudget;
  }, [pointBudget]);

  useEffect(() => {
    if (pcoRef.current) pcoRef.current.material.size = pointSize;
  }, [pointSize]);

  useEffect(() => {
    function onFullscreenChange() {
      setFullscreen(document.fullscreenElement === containerRef.current);
    }
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  // Full teardown on unmount only — leaving the viewer mounted while
  // adjusting point budget/size would otherwise tear down and reload the
  // whole octree on every slider tick.
  useEffect(
    () => () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
      rendererRef.current?.dispose();
      pcoRef.current?.dispose();
    },
    []
  );

  function toggleFullscreen() {
    if (!containerRef.current) return;
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      containerRef.current.requestFullscreen();
    }
  }

  if (!hasPotree) {
    return (
      <div style={{ ...panelStyle, padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "10px 14px", borderBottom: `1px solid ${V.line}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span className="font-mono-ibm" style={{ fontSize: 11, color: V.inkFaint, textTransform: "uppercase", letterSpacing: ".06em" }}>Point Cloud</span>
          {signedUrl && <a href={signedUrl} target="_blank" rel="noreferrer" style={{ ...btnGhost, padding: "5px 10px", fontSize: 11 }}>Download Master LAZ →</a>}
        </div>
        <div style={{ aspectRatio: "16 / 9", background: V.ground, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <p style={{ color: V.inkFaint, fontSize: 13, textAlign: "center", padding: 20 }}>
            {signedUrl
              ? `${name} ready — the interactive viewer needs PotreeConverter to process this cloud first (see services/mapper-worker/README.md). The master LAZ is downloadable now.`
              : "Point cloud not ready yet."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} style={{ ...panelStyle, padding: 0, overflow: "hidden", background: fullscreen ? "#000" : undefined }}>
      <div style={{ padding: "10px 14px", borderBottom: `1px solid ${V.line}`, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <span className="font-mono-ibm" style={{ fontSize: 11, color: V.inkFaint, textTransform: "uppercase", letterSpacing: ".06em" }}>Point Cloud</span>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {viewing && state === "ready" && (
            <>
              <label style={{ fontSize: 11, color: V.inkFaint }}>
                Points:{" "}
                <select
                  value={pointBudget}
                  onChange={(e) => setPointBudget(Number(e.target.value))}
                  style={{ fontSize: 11, padding: "3px 6px", borderRadius: 6, border: `1px solid ${V.line}` }}
                >
                  {POINT_BUDGET_OPTIONS.map((v) => (
                    <option key={v} value={v}>{v >= 1_000_000 ? `${v / 1_000_000}M` : `${v / 1000}K`}</option>
                  ))}
                </select>
              </label>
              <label style={{ fontSize: 11, color: V.inkFaint }}>
                Size:{" "}
                <input
                  type="range"
                  min={0.5}
                  max={5}
                  step={0.1}
                  value={pointSize}
                  onChange={(e) => setPointSize(Number(e.target.value))}
                  style={{ verticalAlign: "middle" }}
                />
              </label>
              <button onClick={fitToCloud} style={{ ...btnGhost, padding: "5px 10px", fontSize: 11 }}>Fit / Reset</button>
              <button onClick={toggleFullscreen} style={{ ...btnGhost, padding: "5px 10px", fontSize: 11 }}>{fullscreen ? "Exit Fullscreen" : "Fullscreen"}</button>
            </>
          )}
          {signedUrl && <a href={signedUrl} target="_blank" rel="noreferrer" style={{ ...btnGhost, padding: "5px 10px", fontSize: 11 }}>Download Master LAZ →</a>}
        </div>
      </div>

      <div style={{ position: "relative", aspectRatio: fullscreen ? undefined : "16 / 9", height: fullscreen ? "calc(100% - 45px)" : undefined, background: "#0B0F16" }}>
        {!viewing && (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <button onClick={startViewing} style={{ ...btnGhost, padding: "10px 20px", fontSize: 13, background: V.surface }}>View Point Cloud →</button>
          </div>
        )}
        {viewing && state === "loading" && (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <p style={{ color: "#AEB7C4", fontSize: 13 }}>Loading point cloud…</p>
          </div>
        )}
        {viewing && state === "error" && (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, textAlign: "center" }}>
            <p style={{ color: V.danger, fontSize: 13 }}>{error}</p>
          </div>
        )}
        <div ref={canvasHostRef} style={{ position: "absolute", inset: 0, visibility: viewing && state === "ready" ? "visible" : "hidden" }} />
      </div>
    </div>
  );
}
