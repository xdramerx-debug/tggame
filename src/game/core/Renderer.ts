import { ACESFilmicToneMapping, PCFSoftShadowMap, SRGBColorSpace, WebGLRenderer } from 'three';
import type { QualityPreset } from '@/types/engine';
import { computeRenderSize } from './Quality';

export interface RendererBundle {
  readonly renderer: WebGLRenderer;
  dispose(): void;
}

/**
 * Creates the only WebGL context the game will ever have.
 *
 * - `powerPreference: 'high-performance'` asks mobile GPUs for the big core.
 * - MSAA is off: we resolve edges with FXAA in the composer, saving bandwidth.
 * - Shadow map type is PCFSoft at every tier; the tier only changes resolution.
 */
export function createRenderer(canvas: HTMLCanvasElement): RendererBundle {
  const renderer = new WebGLRenderer({
    canvas,
    antialias: false,
    alpha: false,
    stencil: false,
    depth: true,
    powerPreference: 'high-performance',
    preserveDrawingBuffer: false,
    failIfMajorPerformanceCaveat: false,
  });

  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = true;
  renderer.setClearColor(0x0b0e14, 1);
  renderer.info.autoReset = false;

  const onContextLost = (event: Event): void => {
    // Prevent the default handler so the browser may restore the context.
    event.preventDefault();
    console.warn('[renderer] WebGL context lost — pausing until restore');
  };
  const onContextRestored = (): void => {
    console.info('[renderer] WebGL context restored');
  };
  canvas.addEventListener('webglcontextlost', onContextLost, { passive: false });
  canvas.addEventListener('webglcontextrestored', onContextRestored);

  return {
    renderer,
    dispose(): void {
      canvas.removeEventListener('webglcontextlost', onContextLost);
      canvas.removeEventListener('webglcontextrestored', onContextRestored);
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}

/** Applies shadow-related knobs of a preset. Requires `renderer.shadowMap.needsUpdate`. */
export function applyShadowPreset(renderer: WebGLRenderer, preset: QualityPreset): void {
  const shadowsEnabled = preset.shadowMapSize > 0;
  // Toggling the shadowMap flag rebuilds programs once, which is acceptable on
  // a tier switch (rare event) and avoids paying for a shadow pass on low tier.
  if (renderer.shadowMap.enabled !== shadowsEnabled) {
    renderer.shadowMap.enabled = shadowsEnabled;
    renderer.shadowMap.needsUpdate = true;
  }
}

/**
 * Sizes the drawing buffer to CSS pixels × preset pixel ratio.
 * Returns the final size so post-processing can match it.
 */
export function resizeRenderer(
  renderer: WebGLRenderer,
  preset: QualityPreset,
  cssWidth: number,
  cssHeight: number,
  devicePixelRatio: number,
): { width: number; height: number; pixelRatio: number } {
  const size = computeRenderSize(cssWidth, cssHeight, devicePixelRatio, preset);
  renderer.setPixelRatio(size.pixelRatio);
  renderer.setSize(cssWidth, cssHeight, false);
  return size;
}
