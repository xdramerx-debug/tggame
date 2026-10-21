import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from 'three';
import { fbm2D, mulberry32, valueNoise2D } from './noise';
import { heightToNormalData } from './normalMap';

export interface ProceduralTextureSet {
  readonly map: CanvasTexture;
  readonly normalMap: CanvasTexture;
  readonly roughnessMap: CanvasTexture;
  dispose(): void;
}

interface TextureOptions {
  readonly size?: number;
  readonly seed?: number;
  readonly repeat?: number;
}

function createCanvas(size: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d', { alpha: false, willReadFrequently: false });
  if (!ctx) throw new Error('2D canvas context is unavailable');
  return { canvas, ctx };
}

function paint(ctx: CanvasRenderingContext2D, size: number, data: Uint8ClampedArray): void {
  const image = ctx.createImageData(size, size);
  image.data.set(data);
  ctx.putImageData(image, 0, 0);
}

/**
 * Procedural cracked-stone texture set (512² by default).
 *
 * Stage 1 uses it for the test scene; the same generator feeds the offline
 * texture pipeline in `scripts/textures/` so the look stays identical between
 * runtime placeholders and baked KTX2 assets.
 */
export function createStoneTextures(options: TextureOptions = {}): ProceduralTextureSet {
  const size = options.size ?? 256;
  const seed = options.seed ?? 1337;
  const repeat = options.repeat ?? 3;

  const albedo = new Uint8ClampedArray(size * size * 4);
  const rough = new Uint8ClampedArray(size * size * 4);
  const height = new Float32Array(size * size);

  // Palette anchors from the spec: slate blue stone, warm bark undertone.
  const base = { r: 30, g: 42, b: 58 };
  const warm = { r: 107, g: 78, b: 46 };

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const u = (x / size) * 8;
      const v = (y / size) * 8;
      const broad = fbm2D(u, v, { seed, octaves: 4, basePeriod: 8 });
      const detail = valueNoise2D(u * 6, v * 6, seed + 77, 48);
      const crackField = Math.abs(fbm2D(u * 1.6, v * 1.6, { seed: seed + 21, octaves: 3, basePeriod: 8 }) - 0.5);
      const crack = crackField < 0.028 ? 1 - crackField / 0.028 : 0;

      const h = 0.55 + broad * 0.35 + detail * 0.1 - crack * 0.5;
      const i = y * size + x;
      height[i] = Math.max(0, Math.min(1, h));

      const warmth = Math.max(0, Math.min(1, broad * 1.4 - 0.35));
      const shade = 0.72 + broad * 0.5 - crack * 0.55;
      const p = i * 4;
      albedo[p] = Math.round(Math.min(255, (base.r + (warm.r - base.r) * warmth) * shade));
      albedo[p + 1] = Math.round(Math.min(255, (base.g + (warm.g - base.g) * warmth) * shade));
      albedo[p + 2] = Math.round(Math.min(255, (base.b + (warm.b - base.b) * warmth) * shade));
      albedo[p + 3] = 255;

      const roughness = 0.72 + detail * 0.2 + crack * 0.08;
      const rp = i * 4;
      rough[rp] = Math.round(Math.min(1, roughness) * 255);
      rough[rp + 1] = Math.round(0.06 * 255); // metalness stays near zero
      rough[rp + 2] = 255; // AO channel unused (packed ORM arrives with KTX2)
      rough[rp + 3] = 255;
    }
  }

  const albedoSrc = createCanvas(size);
  paint(albedoSrc.ctx, size, albedo);
  const roughSrc = createCanvas(size);
  paint(roughSrc.ctx, size, rough);
  const normalSrc = createCanvas(size);
  paint(normalSrc.ctx, size, heightToNormalData(height, size, 2.4));

  const map = new CanvasTexture(albedoSrc.canvas);
  map.colorSpace = SRGBColorSpace;
  map.wrapS = RepeatWrapping;
  map.wrapT = RepeatWrapping;
  map.repeat.set(repeat, repeat);
  map.anisotropy = 2;

  const normalMap = new CanvasTexture(normalSrc.canvas);
  normalMap.wrapS = RepeatWrapping;
  normalMap.wrapT = RepeatWrapping;
  normalMap.repeat.set(repeat, repeat);
  normalMap.anisotropy = 2;

  const roughnessMap = new CanvasTexture(roughSrc.canvas);
  roughnessMap.wrapS = RepeatWrapping;
  roughnessMap.wrapT = RepeatWrapping;
  roughnessMap.repeat.set(repeat, repeat);

  return {
    map,
    normalMap,
    roughnessMap,
    dispose(): void {
      map.dispose();
      normalMap.dispose();
      roughnessMap.dispose();
    },
  };
}

/** Simple emissive crystal gradient used for gold/arcane props. */
export function createCrystalTexture(options: TextureOptions = {}): CanvasTexture {
  const size = options.size ?? 128;
  const seed = options.seed ?? 7;
  const { canvas, ctx } = createCanvas(size);
  const data = new Uint8ClampedArray(size * size * 4);
  const random = mulberry32(seed);
  const phase = random() * Math.PI * 2;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const u = x / size;
      const v = y / size;
      const vein = Math.abs(Math.sin((u * 3.1 + v * 5.7) * Math.PI + phase * 2));
      const glow = Math.pow(1 - vein, 6);
      const gradient = 0.35 + v * 0.65;
      const p = (y * size + x) * 4;
      data[p] = Math.round(201 * gradient + 40 * glow);
      data[p + 1] = Math.round(162 * gradient + 30 * glow);
      data[p + 2] = Math.round(39 * gradient + 60 * glow);
      data[p + 3] = 255;
    }
  }
  paint(ctx, size, data);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}
