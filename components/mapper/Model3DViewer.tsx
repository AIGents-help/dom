"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { V, panelStyle, btnGhost } from "./theme";
import { createWebGLRenderer } from "./webgl";

// Real three.js glTF/GLB viewer for the worker's odm_textured_model_geo.glb
// output. Works from any signed URL (Supabase or the Drive download proxy —
// this component doesn't know or care which; see MappingResults.tsx, which
// resolves that once, generically, for every viewer) so it's private-
// storage compatible without any extra plumbing here.

type ViewerState = "loading" | "ready" | "error";

export default function Model3DViewer({ signedUrl, name }: { signedUrl: string | null; name: string }) {
  const [state, setState] = useState<ViewerState>("loading");
  const [error, setError] = useState<string | null>(null);
  const [fullscreen, setFullscreen] = useState(false);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasHostRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const modelRef = useRef<THREE.Object3D | null>(null);
  const frameRef = useRef<number | null>(null);

  function fitToModel() {
    const model = modelRef.current;
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!model || !camera || !controls) return;
    const box = new THREE.Box3().setFromObject(model);
    const sphere = new THREE.Sphere();
    box.getBoundingSphere(sphere);
    const distance = Math.max(sphere.radius * 2.2, 0.1);
    camera.position.set(sphere.center.x + distance, sphere.center.y + distance * 0.6, sphere.center.z + distance);
    camera.near = Math.max(distance / 1000, 0.001);
    camera.far = distance * 100;
    camera.updateProjectionMatrix();
    controls.target.copy(sphere.center);
    controls.update();
  }

  useEffect(() => {
    if (!signedUrl) return;
    const host = canvasHostRef.current;
    if (!host) return;

    setState("loading");
    setError(null);

    const rendererResult = createWebGLRenderer(THREE.WebGLRenderer, { antialias: true });
    if (!rendererResult.ok) {
      setError(rendererResult.message);
      setState("error");
      return;
    }

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(60, host.clientWidth / host.clientHeight, 0.01, 10_000);
    const renderer = rendererResult.renderer;
    renderer.setSize(host.clientWidth, host.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    host.innerHTML = "";
    host.appendChild(renderer.domElement);

    scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 2));
    const directional = new THREE.DirectionalLight(0xffffff, 1.5);
    directional.position.set(1, 1, 1);
    scene.add(directional);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;

    rendererRef.current = renderer;
    sceneRef.current = scene;
    cameraRef.current = camera;
    controlsRef.current = controls;

    let cancelled = false;
    const loader = new GLTFLoader();
    loader.load(
      signedUrl,
      (gltf) => {
        if (cancelled) return;
        modelRef.current = gltf.scene;
        scene.add(gltf.scene);
        fitToModel();
        setState("ready");
      },
      undefined,
      (err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Could not load the 3D model.");
        setState("error");
      }
    );

    const animate = () => {
      frameRef.current = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    const observer = new ResizeObserver(() => {
      const { clientWidth, clientHeight } = host;
      if (clientWidth === 0 || clientHeight === 0) return;
      renderer.setSize(clientWidth, clientHeight);
      camera.aspect = clientWidth / clientHeight;
      camera.updateProjectionMatrix();
    });
    observer.observe(host);

    return () => {
      cancelled = true;
      observer.disconnect();
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
      renderer.dispose();
      host.innerHTML = "";
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedUrl]);

  useEffect(() => {
    function onFullscreenChange() {
      setFullscreen(document.fullscreenElement === containerRef.current);
    }
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  function toggleFullscreen() {
    if (!containerRef.current) return;
    if (document.fullscreenElement) document.exitFullscreen();
    else containerRef.current.requestFullscreen();
  }

  return (
    <div ref={containerRef} style={{ ...panelStyle, padding: 0, overflow: "hidden", background: fullscreen ? "#000" : undefined }}>
      <div style={{ padding: "10px 14px", borderBottom: `1px solid ${V.line}`, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <span className="font-mono-ibm" style={{ fontSize: 11, color: V.inkFaint, textTransform: "uppercase", letterSpacing: ".06em" }}>3D Model</span>
        <div style={{ display: "flex", gap: 8 }}>
          {state === "ready" && (
            <>
              <button onClick={fitToModel} style={{ ...btnGhost, padding: "5px 10px", fontSize: 11 }}>Reset</button>
              <button onClick={toggleFullscreen} style={{ ...btnGhost, padding: "5px 10px", fontSize: 11 }}>{fullscreen ? "Exit Fullscreen" : "Fullscreen"}</button>
            </>
          )}
          {signedUrl && <a href={signedUrl} target="_blank" rel="noreferrer" style={{ ...btnGhost, padding: "5px 10px", fontSize: 11 }}>Download →</a>}
        </div>
      </div>
      <div style={{ position: "relative", aspectRatio: fullscreen ? undefined : "16 / 9", height: fullscreen ? "calc(100% - 45px)" : undefined, background: "#0B0F16" }}>
        {!signedUrl && (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <p style={{ color: V.inkFaint, fontSize: 13 }}>3D model not ready yet.</p>
          </div>
        )}
        {signedUrl && state === "loading" && (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <p style={{ color: "#AEB7C4", fontSize: 13 }}>Loading {name}…</p>
          </div>
        )}
        {signedUrl && state === "error" && (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, textAlign: "center" }}>
            <p style={{ color: V.danger, fontSize: 13 }}>{error}</p>
          </div>
        )}
        <div ref={canvasHostRef} style={{ position: "absolute", inset: 0, visibility: signedUrl && state === "ready" ? "visible" : "hidden" }} />
      </div>
    </div>
  );
}
