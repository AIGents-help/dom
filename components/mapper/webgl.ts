import type * as THREE from "three";

export const WEBGL_UNAVAILABLE_MESSAGE =
  "Interactive 3D viewing isn't available in this browser. Enable hardware acceleration or use a WebGL-capable browser; downloads and the rest of Mapping still work.";

export type WebGLRendererResult =
  | { ok: true; renderer: THREE.WebGLRenderer }
  | { ok: false; message: string };

// THREE.WebGLRenderer throws synchronously when WebGL is disabled, blocked by
// a browser sandbox, or the GPU context cannot be created. Viewer components
// must turn that expected capability failure into local UI instead of letting
// it escape a React effect and crash the entire Mapping page.
export function createWebGLRenderer(
  Renderer: typeof THREE.WebGLRenderer,
  options: THREE.WebGLRendererParameters = {}
): WebGLRendererResult {
  try {
    return { ok: true, renderer: new Renderer(options) };
  } catch {
    return { ok: false, message: WEBGL_UNAVAILABLE_MESSAGE };
  }
}
