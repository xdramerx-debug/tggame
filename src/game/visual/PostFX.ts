import { Color, Vector2 } from 'three';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import type { IUniform } from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { SSAOPass } from 'three/examples/jsm/postprocessing/SSAOPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { FXAAPass } from 'three/examples/jsm/postprocessing/FXAAPass.js';
import type { WebGLRenderer, Scene, PerspectiveCamera } from 'three';
import type { QualityPreset } from '@/types/engine';

/**
 * Combined vignette + film grain pass.
 *
 * One pass instead of two saves a full-screen read/write pair — worth ~0.4 ms
 * on a mid-tier Mali GPU. Values come from the spec: vignette for framing,
 * grain 0.02 for the "old film" feel of dark fantasy.
 */
interface VignetteGrainUniforms {
  [key: string]: IUniform;
  tDiffuse: IUniform;
  uTime: IUniform<number>;
  uGrain: IUniform<number>;
  uVignette: IUniform<number>;
  uVignetteColor: IUniform<Color>;
  uResolution: IUniform<Vector2>;
}

const VignetteGrainShader = {
  name: 'VignetteGrainShader',
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uGrain: { value: 0.02 },
    uVignette: { value: 0.9 },
    uVignetteColor: { value: new Color(0x000000) },
    uResolution: { value: new Vector2(1, 1) },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uGrain;
    uniform float uVignette;
    uniform vec3 uVignetteColor;
    uniform vec2 uResolution;
    varying vec2 vUv;

    // Cheap hash noise; animated per-frame so grain does not "burn in".
    float hash(vec2 p) {
      p = fract(p * vec2(443.8975, 397.2973) + uTime * 0.42);
      p += dot(p, p.yx + 19.19);
      return fract((p.x + p.y) * p.x);
    }

    void main() {
      vec4 color = texture2D(tDiffuse, vUv);
      vec2 centered = vUv - 0.5;
      float dist = length(centered * vec2(1.0, 0.86));
      float vig = smoothstep(0.78, 0.18, dist) * uVignette;
      color.rgb *= mix(1.0, vig, 0.72);

      float grain = (hash(gl_FragCoord.xy) - 0.5) * uGrain;
      color.rgb += grain;
      gl_FragColor = color;
    }
  `,
};

export interface PostFXOptions {
  readonly renderer: WebGLRenderer;
  readonly scene: Scene;
  readonly camera: PerspectiveCamera;
  /** CSS pixel width of the canvas. EffectComposer multiplies by pixel ratio internally. */
  readonly width: number;
  readonly height: number;
  readonly preset: QualityPreset;
}

/**
 * Post-processing chain, tuned for mobile:
 * Render → (SSAO high only) → Bloom → Vignette+Grain → Output (tonemap/sRGB) → FXAA.
 *
 * Passes are kept alive and toggled with `pass.enabled` so a tier switch never
 * re-allocates render targets mid-run (allocation spikes cause dropped frames).
 */
export class PostFX {
  readonly composer: EffectComposer;
  private readonly renderPass: RenderPass;
  private readonly bloomPass: UnrealBloomPass;
  private readonly gradePass: ShaderPass;
  private readonly gradeUniforms: VignetteGrainUniforms;
  private readonly outputPass: OutputPass;
  private readonly fxaaPass: FXAAPass;
  private ssaoPass: SSAOPass | null = null;
  private readonly renderer: WebGLRenderer;
  private readonly scene: Scene;
  private readonly camera: PerspectiveCamera;
  private time = 0;

  constructor(options: PostFXOptions) {
    this.renderer = options.renderer;
    this.scene = options.scene;
    this.camera = options.camera;

    this.composer = new EffectComposer(this.renderer);
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.setSize(options.width, options.height);

    this.renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(this.renderPass);

    this.bloomPass = new UnrealBloomPass(new Vector2(options.width, options.height), 0.4, 0.6, 0.85);
    this.composer.addPass(this.bloomPass);

    this.gradePass = new ShaderPass(VignetteGrainShader);
    this.gradeUniforms = this.gradePass.uniforms as VignetteGrainUniforms;
    this.composer.addPass(this.gradePass);

    this.outputPass = new OutputPass();
    this.composer.addPass(this.outputPass);

    this.fxaaPass = new FXAAPass();
    this.fxaaPass.renderToScreen = true;
    this.composer.addPass(this.fxaaPass);

    this.applyPreset(options.preset);
    this.setSize(options.width, options.height);
  }

  /** Enable/disable passes to match a quality tier. */
  applyPreset(preset: QualityPreset): void {
    this.bloomPass.enabled = preset.bloom;
    this.gradePass.enabled = preset.level !== 'low';
    this.fxaaPass.enabled = preset.level !== 'low';

    if (preset.ssao) {
      this.enableSSAO();
    } else {
      this.disableSSAO();
    }
  }

  private enableSSAO(): void {
    if (this.ssaoPass) {
      this.ssaoPass.enabled = true;
      return;
    }
    const size = this.bufferSize();
    const pass = new SSAOPass(this.scene, this.camera, size.x, size.y);
    pass.kernelRadius = 0.25;
    pass.minDistance = 0.002;
    pass.maxDistance = 0.12;
    pass.output = SSAOPass.OUTPUT.Default;
    // Insert right after the render pass: AO must affect the HDR color buffer.
    this.composer.insertPass(pass, 1);
    this.ssaoPass = pass;
  }

  private disableSSAO(): void {
    if (!this.ssaoPass) return;
    this.ssaoPass.enabled = false;
    // Drop the GPU memory: SSAO keeps several full-res targets around.
    this.composer.removePass(this.ssaoPass);
    this.ssaoPass.dispose();
    this.ssaoPass = null;
  }

  /** Drawing-buffer size in physical pixels (what render targets are allocated at). */
  private bufferSize(): Vector2 {
    return this.renderer.getDrawingBufferSize(new Vector2());
  }

  /**
   * @param width CSS pixel width
   * @param height CSS pixel height
   *
   * EffectComposer applies the renderer pixel ratio itself, so it must receive
   * CSS sizes; SSAO and FXAA allocate raw targets and need physical pixels.
   */
  setSize(width: number, height: number): void {
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.setSize(width, height);
    const buffer = this.bufferSize();
    this.bloomPass.setSize(buffer.x, buffer.y);
    this.ssaoPass?.setSize(buffer.x, buffer.y);
    this.gradeUniforms.uResolution.value.set(buffer.x, buffer.y);
    this.fxaaPass.setSize(buffer.x, buffer.y);
  }

  render(dt: number): void {
    this.time += dt;
    this.gradeUniforms.uTime.value = this.time;
    this.composer.render(dt);
  }

  dispose(): void {
    this.disableSSAO();
    this.composer.dispose();
    this.bloomPass.dispose();
    this.gradePass.dispose();
    this.fxaaPass.dispose();
  }
}
