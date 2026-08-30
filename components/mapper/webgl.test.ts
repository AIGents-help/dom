import type * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import { createWebGLRenderer, WEBGL_UNAVAILABLE_MESSAGE } from "./webgl";

describe("createWebGLRenderer", () => {
  it("returns the renderer when WebGL initialization succeeds", () => {
    class WebGLRendererSuccess {
      dispose = vi.fn();

      constructor(public options: THREE.WebGLRendererParameters) {
        void options;
      }
    }

    const result = createWebGLRenderer(WebGLRendererSuccess as unknown as typeof THREE.WebGLRenderer, { antialias: true });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.renderer).toBeInstanceOf(WebGLRendererSuccess);
      expect((result.renderer as unknown as WebGLRendererSuccess).options).toEqual({ antialias: true });
    }
  });

  it("returns a user-safe fallback when WebGL initialization throws", () => {
    class WebGLRendererFailure {
      constructor() {
        throw new Error("Error creating WebGL context");
      }
    }

    expect(createWebGLRenderer(WebGLRendererFailure as unknown as typeof THREE.WebGLRenderer)).toEqual({ ok: false, message: WEBGL_UNAVAILABLE_MESSAGE });
  });
});
