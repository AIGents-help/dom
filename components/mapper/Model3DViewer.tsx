"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { OBJLoader } from "three/addons/loaders/OBJLoader.js";
import { V, panelStyle, btnGhost } from "./theme";
import { Box, LoaderCircle, TriangleAlert } from "lucide-react";
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
  const [diagnostic, setDiagnostic] = useState<string | null>(null);

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
    if (box.isEmpty()) return;
    const sphere = new THREE.Sphere();
    box.getBoundingSphere(sphere);
    if (!Number.isFinite(sphere.radius) || sphere.radius <= 0) return;
    const distance = Math.max(sphere.radius * 2.6, 1);
    camera.position.set(sphere.center.x + distance, sphere.center.y + distance * 0.7, sphere.center.z + distance);
    camera.near = Math.max(distance / 5000, 0.01);
    camera.far = Math.max(distance * 200, 10_000);
    camera.updateProjectionMatrix();
    controls.target.copy(sphere.center);
    controls.maxDistance = distance * 20;
    controls.update();
  }

  function prepareModel(model: THREE.Object3D) {
    model.updateMatrixWorld(true);
    const initialBox = new THREE.Box3().setFromObject(model);
    if (initialBox.isEmpty()) throw new Error("The 3D model contains no visible geometry.");

    const size = initialBox.getSize(new THREE.Vector3());
    const center = initialBox.getCenter(new THREE.Vector3());
    if (![size.x, size.y, size.z, center.x, center.y, center.z].every(Number.isFinite)) {
      throw new Error("The 3D model has invalid bounds and cannot be framed.");
    }

    // ODM georeferenced models can carry very large world coordinates.
    // Rendering those directly in WebGL causes precision loss that often
    // presents as a completely black/empty viewport. Recenter only the
    // viewer copy; the downloadable source file remains untouched.
    model.position.sub(center);
    model.updateMatrixWorld(true);

    let meshCount = 0;
    model.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      meshCount += 1;
      const geometry = object.geometry;
      if (geometry && !geometry.getAttribute("normal")) geometry.computeVertexNormals();
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) {
        if (!material) continue;
        material.side = THREE.DoubleSide;
        if ("map" in material && !material.map && "color" in material) {
          const color = material.color as THREE.Color;
          if (color.r < 0.04 && color.g < 0.04 && color.b < 0.04) color.setHex(0x9aa7b3);
        }
        material.needsUpdate = true;
      }
    });
    if (meshCount === 0) throw new Error("The 3D model loaded, but it contains no renderable meshes.");

    const normalizedBox = new THREE.Box3().setFromObject(model);
    const normalizedSize = normalizedBox.getSize(new THREE.Vector3());
    setDiagnostic(
      `${meshCount} mesh${meshCount === 1 ? "" : "es"} · ${normalizedSize.x.toFixed(1)} × ${normalizedSize.y.toFixed(1)} × ${normalizedSize.z.toFixed(1)} model units`
    );
    return model;
  }

  useEffect(() => {
    if (!signedUrl) return;
    const host = canvasHostRef.current;
    if (!host) return;

    setState("loading");
    setError(null);
    setDiagnostic(null);

    const rendererResult = createWebGLRenderer(THREE.WebGLRenderer, { antialias: true });
    if (!rendererResult.ok) {
      setError(rendererResult.message);
      setState("error");
      return;
    }

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x111820);
    const camera = new THREE.PerspectiveCamera(60, host.clientWidth / host.clientHeight, 0.01, 10_000);
    const renderer = rendererResult.renderer;
    renderer.setSize(host.clientWidth, host.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    host.innerHTML = "";
    host.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0xffffff, 1.15));
    scene.add(new THREE.HemisphereLight(0xddeeff, 0x334455, 2.25));
    const directional = new THREE.DirectionalLight(0xffffff, 2.2);
    directional.position.set(2, 3, 4);
    scene.add(directional);
    const fill = new THREE.DirectionalLight(0xbcd7ff, 1.25);
    fill.position.set(-3, 1.5, -2);
    scene.add(fill);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;

    rendererRef.current = renderer;
    sceneRef.current = scene;
    cameraRef.current = camera;
    controlsRef.current = controls;

    let cancelled = false;
    const sourcePath = signedUrl.split("?")[0].toLowerCase();
    const loadError = (err: unknown) => {
      if (cancelled) return;
      setError(err instanceof Error ? err.message : "Could not load the 3D model.");
      setState("error");
    };
    const commitModel = (object: THREE.Object3D) => {
      if (cancelled) return;
      try {
        const prepared = prepareModel(object);
        modelRef.current = prepared;
        scene.add(prepared);
        fitToModel();
        setState("ready");
      } catch (err) {
        loadError(err);
      }
    };

    let dracoLoader: DRACOLoader | null = null;

    if (sourcePath.endsWith(".obj")) {
      fetch(signedUrl)
        .then((response) => {
          if (!response.ok) throw new Error(`3D model download failed (${response.status}).`);
          return response.text();
        })
        .then((text) => commitModel(new OBJLoader().parse(text)))
        .catch(loadError);
    } else {
      // ODM can emit Draco-compressed GLB geometry. GLTFLoader requires a
      // DRACOLoader instance before it can decode KHR_draco_mesh_compression.
      dracoLoader = new DRACOLoader();
      dracoLoader.setDecoderPath("https://www.gstatic.com/draco/versioned/decoders/1.5.7/");
      dracoLoader.setDecoderConfig({ type: "wasm" });

      const gltfLoader = new GLTFLoader();
      gltfLoader.setDRACOLoader(dracoLoader);
      gltfLoader.load(
        signedUrl,
        (gltf) => commitModel(gltf.scene),
        undefined,
        loadError
      );
    }

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
      dracoLoader?.dispose();
      renderer.dispose();
      host.innerHTML = "";
    };
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
            <div style={{ textAlign: "center", maxWidth: 320 }}><Box size={34} color={V.signal} style={{ margin: "0 auto 10px" }} /><div style={{ color: V.ink, fontSize: 13, fontWeight: 800 }}>3D model is not ready</div><p style={{ color: V.inkFaint, fontSize: 11, lineHeight: 1.5, marginTop: 5 }}>DOMINIC will activate this workspace when a textured model is available for the project.</p></div>
          </div>
        )}
        {signedUrl && state === "loading" && (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ textAlign: "center" }}><LoaderCircle size={28} color={V.signal} style={{ margin: "0 auto 9px" }} /><div style={{ color: "#AEB7C4", fontSize: 12, fontWeight: 700 }}>Preparing 3D workspace</div><p style={{ color: V.inkFaint, fontSize: 10, marginTop: 4 }}>Loading {name}…</p></div>
          </div>
        )}
        {signedUrl && state === "ready" && diagnostic && (
          <div style={{ position: "absolute", left: 10, bottom: 10, zIndex: 5, padding: "5px 7px", borderRadius: 6, background: "rgba(8,12,16,.72)", color: V.inkFaint, fontSize: 9 }}>{diagnostic}</div>
        )}
        {signedUrl && state === "error" && (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, textAlign: "center" }}>
            <div style={{ maxWidth: 380 }}><TriangleAlert size={30} color={V.danger} style={{ margin: "0 auto 9px" }} /><div style={{ color: V.ink, fontSize: 13, fontWeight: 800 }}>3D preview could not be opened</div><p style={{ color: V.danger, fontSize: 11, lineHeight: 1.5, marginTop: 5 }}>{error}</p><p style={{ color: V.inkFaint, fontSize: 10, marginTop: 6 }}>The source deliverable remains available from the project outputs.</p></div>
          </div>
        )}
        <div ref={canvasHostRef} style={{ position: "absolute", inset: 0, visibility: signedUrl && state === "ready" ? "visible" : "hidden" }} />
      </div>
    </div>
  );
}
