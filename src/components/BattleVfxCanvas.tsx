import { useEffect, useRef } from 'react';
import type { VfxKind } from '@/game/types';

export interface VfxPoint {
  readonly x: number; // normalized 0..1 of arena width
  readonly y: number; // normalized 0..1 of arena height
}

export interface VfxBurstCommand {
  readonly id: number;
  readonly kind: VfxKind;
  readonly from: VfxPoint;
  readonly targets: readonly VfxPoint[];
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  alpha: number;
}

interface ShockRing {
  x: number;
  y: number;
  r: number;
  maxR: number;
  life: number;
  maxLife: number;
  color: string;
  width: number;
}

interface SlashArc {
  x: number;
  y: number;
  angle: number;
  radius: number;
  life: number;
  maxLife: number;
  color: string;
}

interface BeamPillar {
  x: number;
  y: number;
  width: number;
  life: number;
  maxLife: number;
  color: string;
}

interface ProjectileBolt {
  sx: number;
  sy: number;
  tx: number;
  ty: number;
  progress: number;
  speed: number;
  color: string;
}

const VFX_PALETTE: Record<VfxKind, { core: string; outer: string }> = {
  slash_fire: { core: '#fef08a', outer: '#ff5733' },
  slash_wind: { core: '#ecfdf5', outer: '#34d399' },
  slash_shadow: { core: '#fae8ff', outer: '#c084fc' },
  slash_frost: { core: '#f0f9ff', outer: '#38bdf8' },
  proj_fire: { core: '#fef08a', outer: '#f97316' },
  proj_frost: { core: '#e0f2fe', outer: '#38bdf8' },
  proj_nature: { core: '#fef9c3', outer: '#10b981' },
  proj_arrow: { core: '#ffffff', outer: '#2dd4bf' },
  proj_star: { core: '#fef08a', outer: '#a855f7' },
  ult_meteor: { core: '#fde047', outer: '#ef4444' },
  ult_blizzard: { core: '#ffffff', outer: '#38bdf8' },
  ult_bloom: { core: '#fef08a', outer: '#34d399' },
  ult_judgment: { core: '#ffffff', outer: '#f59e0b' },
  ult_abyss: { core: '#f5d0fe', outer: '#db2777' },
  ult_supernova: { core: '#fef08a', outer: '#818cf8' },
};

export interface BattleVfxCanvasProps {
  readonly command: VfxBurstCommand | null;
  readonly ambientKind: 'embers' | 'fireflies' | 'snow' | 'void' | 'stars';
}

export function BattleVfxCanvas({ command, ambientKind }: BattleVfxCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const particlesRef = useRef<Particle[]>([]);
  const ringsRef = useRef<ShockRing[]>([]);
  const slashesRef = useRef<SlashArc[]>([]);
  const beamsRef = useRef<BeamPillar[]>([]);
  const boltsRef = useRef<ProjectileBolt[]>([]);
  const lastCmdId = useRef<number>(0);

  useEffect(() => {
    if (!command || command.id === lastCmdId.current) return;
    lastCmdId.current = command.id;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const w = canvas.clientWidth || 380;
    const h = canvas.clientHeight || 280;
    const colors = VFX_PALETTE[command.kind];

    const spawnSparks = (cx: number, cy: number, count: number, speedScale = 1) => {
      for (let i = 0; i < count; i += 1) {
        const ang = Math.random() * Math.PI * 2;
        const spd = (45 + Math.random() * 145) * speedScale;
        particlesRef.current.push({
          x: cx,
          y: cy,
          vx: Math.cos(ang) * spd,
          vy: Math.sin(ang) * spd - 20,
          life: 0,
          maxLife: 0.35 + Math.random() * 0.35,
          size: 2.2 + Math.random() * 3.8,
          color: i % 3 === 0 ? colors.core : colors.outer,
          alpha: 1,
        });
      }
    };

    const sx = command.from.x * w;
    const sy = command.from.y * h;

    for (const target of command.targets) {
      const tx = target.x * w;
      const ty = target.y * h;

      if (command.kind.startsWith('slash_')) {
        slashesRef.current.push({
          x: tx,
          y: ty,
          angle: Math.random() * 1.4 - 0.7,
          radius: 38,
          life: 0,
          maxLife: 0.26,
          color: colors.outer,
        });
        ringsRef.current.push({
          x: tx,
          y: ty,
          r: 8,
          maxR: 42,
          life: 0,
          maxLife: 0.28,
          color: colors.outer,
          width: 3,
        });
        spawnSparks(tx, ty, 14);
      } else if (command.kind.startsWith('proj_')) {
        boltsRef.current.push({
          sx,
          sy,
          tx,
          ty,
          progress: 0,
          speed: 4.4,
          color: colors.outer,
        });
        spawnSparks(sx, sy, 6, 0.5);
      } else if (command.kind === 'ult_meteor') {
        boltsRef.current.push({
          sx: tx - 90,
          sy: -30,
          tx,
          ty,
          progress: 0,
          speed: 3.4,
          color: colors.outer,
        });
        ringsRef.current.push({
          x: tx,
          y: ty,
          r: 10,
          maxR: 68,
          life: 0,
          maxLife: 0.45,
          color: colors.outer,
          width: 4.5,
        });
        spawnSparks(tx, ty, 24, 1.35);
      } else if (command.kind === 'ult_judgment' || command.kind === 'ult_blizzard') {
        beamsRef.current.push({
          x: tx,
          y: ty,
          width: command.kind === 'ult_judgment' ? 38 : 30,
          life: 0,
          maxLife: 0.44,
          color: colors.outer,
        });
        ringsRef.current.push({
          x: tx,
          y: ty,
          r: 8,
          maxR: 60,
          life: 0,
          maxLife: 0.42,
          color: colors.core,
          width: 3.5,
        });
        spawnSparks(tx, ty, 20, 1.2);
      } else if (command.kind === 'ult_bloom') {
        ringsRef.current.push({
          x: tx,
          y: ty + 14,
          r: 6,
          maxR: 52,
          life: 0,
          maxLife: 0.55,
          color: colors.outer,
          width: 3.5,
        });
        for (let i = 0; i < 14; i += 1) {
          particlesRef.current.push({
            x: tx + (Math.random() - 0.5) * 44,
            y: ty + 20,
            vx: (Math.random() - 0.5) * 28,
            vy: -55 - Math.random() * 65,
            life: 0,
            maxLife: 0.65 + Math.random() * 0.3,
            size: 2.5 + Math.random() * 3,
            color: i % 2 === 0 ? '#6ee7b7' : '#fde047',
            alpha: 1,
          });
        }
      } else {
        // ult_abyss & ult_supernova cross slashes + implosion rings
        slashesRef.current.push({
          x: tx,
          y: ty,
          angle: -0.65,
          radius: 52,
          life: 0,
          maxLife: 0.34,
          color: colors.outer,
        });
        slashesRef.current.push({
          x: tx,
          y: ty,
          angle: 0.65,
          radius: 52,
          life: 0,
          maxLife: 0.34,
          color: colors.core,
        });
        ringsRef.current.push({
          x: tx,
          y: ty,
          r: 10,
          maxR: 74,
          life: 0,
          maxLife: 0.45,
          color: colors.outer,
          width: 4,
        });
        spawnSparks(tx, ty, 24, 1.4);
      }
    }
  }, [command]);

  useEffect(() => {
    let rafId = 0;
    let prev = performance.now();
    let ambientTimer = 0;

    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - prev) / 1000);
      prev = now;

      const canvas = canvasRef.current;
      if (!canvas) {
        rafId = requestAnimationFrame(frame);
        return;
      }

      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const cw = canvas.clientWidth;
      const ch = canvas.clientHeight;
      if (cw > 0 && ch > 0 && (canvas.width !== Math.round(cw * dpr) || canvas.height !== Math.round(ch * dpr))) {
        canvas.width = Math.round(cw * dpr);
        canvas.height = Math.round(ch * dpr);
      }

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        rafId = requestAnimationFrame(frame);
        return;
      }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cw, ch);
      ctx.globalCompositeOperation = 'lighter';

      // Ambient drifting biome particles
      ambientTimer += dt;
      if (ambientTimer > 0.14 && particlesRef.current.length < 130 && cw > 0) {
        ambientTimer = 0;
        const ambientColor =
          ambientKind === 'embers'
            ? '#fb923c'
            : ambientKind === 'fireflies'
              ? '#6ee7b7'
              : ambientKind === 'snow'
                ? '#e0f2fe'
                : ambientKind === 'void'
                  ? '#d946ef'
                  : '#fde047';
        particlesRef.current.push({
          x: Math.random() * cw,
          y: ambientKind === 'snow' ? -6 : ch + 6,
          vx: (Math.random() - 0.5) * 18,
          vy: ambientKind === 'snow' ? 28 + Math.random() * 20 : -22 - Math.random() * 24,
          life: 0,
          maxLife: 2.6 + Math.random() * 1.5,
          size: 1.5 + Math.random() * 2.2,
          color: ambientColor,
          alpha: 0.55,
        });
      }

      // Draw Beams / Pillars
      const nextBeams: BeamPillar[] = [];
      for (const b of beamsRef.current) {
        b.life += dt;
        if (b.life < b.maxLife) {
          const p = 1 - b.life / b.maxLife;
          const grad = ctx.createLinearGradient(b.x - b.width * p * 0.5, 0, b.x + b.width * p * 0.5, 0);
          grad.addColorStop(0, 'transparent');
          grad.addColorStop(0.5, b.color);
          grad.addColorStop(1, 'transparent');
          ctx.globalAlpha = p * 0.9;
          ctx.fillStyle = grad;
          ctx.fillRect(b.x - b.width * p * 0.6, 0, b.width * p * 1.2, b.y + 18);
          nextBeams.push(b);
        }
      }
      beamsRef.current = nextBeams;

      // Draw Projectiles
      const nextBolts: ProjectileBolt[] = [];
      for (const bolt of boltsRef.current) {
        bolt.progress += dt * bolt.speed;
        const t = Math.min(1, bolt.progress);
        const cx = bolt.sx + (bolt.tx - bolt.sx) * t;
        const cy = bolt.sy + (bolt.ty - bolt.sy) * t - Math.sin(t * Math.PI) * 26;

        ctx.globalAlpha = 0.95;
        ctx.beginPath();
        ctx.arc(cx, cy, 7.5, 0, Math.PI * 2);
        ctx.fillStyle = bolt.color;
        ctx.fill();

        ctx.beginPath();
        ctx.arc(cx, cy, 3.8, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();

        particlesRef.current.push({
          x: cx,
          y: cy,
          vx: (Math.random() - 0.5) * 22,
          vy: (Math.random() - 0.5) * 22,
          life: 0,
          maxLife: 0.2,
          size: 3.2,
          color: bolt.color,
          alpha: 0.85,
        });

        if (bolt.progress < 1) {
          nextBolts.push(bolt);
        } else {
          ringsRef.current.push({
            x: bolt.tx,
            y: bolt.ty,
            r: 6,
            maxR: 38,
            life: 0,
            maxLife: 0.25,
            color: bolt.color,
            width: 3,
          });
          for (let i = 0; i < 10; i += 1) {
            const a = Math.random() * Math.PI * 2;
            particlesRef.current.push({
              x: bolt.tx,
              y: bolt.ty,
              vx: Math.cos(a) * 110,
              vy: Math.sin(a) * 110,
              life: 0,
              maxLife: 0.28,
              size: 2.8,
              color: bolt.color,
              alpha: 1,
            });
          }
        }
      }
      boltsRef.current = nextBolts;

      // Draw Slash Arcs
      const nextSlashes: SlashArc[] = [];
      for (const s of slashesRef.current) {
        s.life += dt;
        if (s.life < s.maxLife) {
          const p = s.life / s.maxLife;
          ctx.save();
          ctx.translate(s.x, s.y);
          ctx.rotate(s.angle);
          ctx.globalAlpha = 1 - p;
          ctx.beginPath();
          ctx.arc(0, 0, s.radius * (0.8 + p * 0.35), -1.15, 1.15);
          ctx.strokeStyle = s.color;
          ctx.lineWidth = 7 * (1 - p);
          ctx.lineCap = 'round';
          ctx.stroke();

          ctx.beginPath();
          ctx.arc(0, 0, s.radius * (0.8 + p * 0.35), -0.95, 0.95);
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 2.6 * (1 - p);
          ctx.stroke();
          ctx.restore();
          nextSlashes.push(s);
        }
      }
      slashesRef.current = nextSlashes;

      // Draw Shockwave Rings
      const nextRings: ShockRing[] = [];
      for (const ring of ringsRef.current) {
        ring.life += dt;
        if (ring.life < ring.maxLife) {
          const p = ring.life / ring.maxLife;
          const curR = ring.r + (ring.maxR - ring.r) * (1 - Math.pow(1 - p, 2));
          ctx.globalAlpha = (1 - p) * 0.85;
          ctx.beginPath();
          ctx.ellipse(ring.x, ring.y, curR, curR * 0.62, 0, 0, Math.PI * 2);
          ctx.strokeStyle = ring.color;
          ctx.lineWidth = ring.width * (1 - p);
          ctx.stroke();
          nextRings.push(ring);
        }
      }
      ringsRef.current = nextRings;

      // Draw Particles
      const nextParticles: Particle[] = [];
      for (const pt of particlesRef.current) {
        pt.life += dt;
        if (pt.life < pt.maxLife) {
          pt.x += pt.vx * dt;
          pt.y += pt.vy * dt;
          const p = pt.life / pt.maxLife;
          ctx.globalAlpha = (1 - p) * pt.alpha;
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, Math.max(0.6, pt.size * (1 - p * 0.5)), 0, Math.PI * 2);
          ctx.fillStyle = pt.color;
          ctx.fill();
          nextParticles.push(pt);
        }
      }
      particlesRef.current = nextParticles;

      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      rafId = requestAnimationFrame(frame);
    };

    rafId = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(rafId);
    };
  }, [ambientKind]);

  return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none z-20" />;
}
