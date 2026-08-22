import React, { useRef, useEffect } from 'react';
import { ParticleSystemSettings } from '../core/types';

interface ParticleCanvasProps {
  settings: ParticleSystemSettings;
  currentTime: number;
  width?: number;
  height?: number;
  className?: string;
  style?: React.CSSProperties;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  life: number;
  maxLife: number;
  color: string;
  secondaryColor: string;
  alpha: number;
  rotation: number;
}

export const ParticleCanvas: React.FC<ParticleCanvasProps> = ({
  settings,
  currentTime,
  width = 1920,
  height = 1080,
  className = '',
  style
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Reset canvas
    ctx.clearRect(0, 0, width, height);

    if (!settings || !settings.enabled) return;

    const count = settings.count || 100;
    const lifeBase = settings.life || 2;
    const speedBase = settings.speed || 3;
    const sizeBase = settings.size || 5;
    const color1 = settings.color || '#f59e0b';
    const color2 = settings.secondaryColor || '#ef4444';
    const gravity = settings.gravity ?? 1;
    const spreadRad = ((settings.spread ?? 180) * Math.PI) / 180;
    const preset = settings.preset || 'sparks';
    const turbulence = settings.turbulence ?? 5;
    const emitterX = (settings.emitterX ?? 0) + width / 2;
    const emitterY = (settings.emitterY ?? 0) + height / 2;

    ctx.save();

    // Blend mode setup
    if (preset === 'sparks' || preset === 'light' || preset === 'magic') {
      ctx.globalCompositeOperation = 'lighter';
    } else {
      ctx.globalCompositeOperation = 'source-over';
    }

    // Deterministic simulation based on currentTime
    for (let i = 0; i < count; i++) {
      // Pseudo-random seeds based on particle index
      const seed1 = Math.sin(i * 12.9898) * 43758.5453;
      const rand1 = seed1 - Math.floor(seed1);

      const seed2 = Math.cos(i * 78.233) * 43758.5453;
      const rand2 = seed2 - Math.floor(seed2);

      const seed3 = Math.sin(i * 39.346) * 43758.5453;
      const rand3 = seed3 - Math.floor(seed3);

      const particleMaxLife = lifeBase * (0.6 + rand1 * 0.8);
      // Stagger emission time
      const timeOffset = rand2 * particleMaxLife;
      const particleAge = (currentTime * 1.5 + timeOffset) % particleMaxLife;
      const progress = particleAge / particleMaxLife; // 0 to 1

      // Emission Angle
      const angle = (rand3 - 0.5) * spreadRad - Math.PI / 2; // Upward biased
      const velocity = speedBase * 30 * (0.6 + rand1 * 0.8);

      let px = emitterX;
      let py = emitterY;
      let size = sizeBase;
      let alpha = 1;

      // Calculate trajectory based on preset
      if (preset === 'sparks') {
        const vx = Math.cos(angle) * velocity;
        const vy = Math.sin(angle) * velocity;
        
        px += vx * particleAge + Math.sin(particleAge * turbulence) * 4;
        py += vy * particleAge + 0.5 * gravity * 150 * particleAge * particleAge;
        
        // Fades out near end of life
        alpha = Math.max(0, 1 - progress * 1.2);
        size = sizeBase * (1 - progress * 0.5);

        // Draw spark streak
        ctx.strokeStyle = progress < 0.5 ? color1 : color2;
        ctx.globalAlpha = alpha;
        ctx.lineWidth = size;
        ctx.lineCap = 'round';

        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(px - vx * 0.08, py - vy * 0.08);
        ctx.stroke();

        // Spark core glow
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(px, py, Math.max(1, size * 0.4), 0, Math.PI * 2);
        ctx.fill();

      } else if (preset === 'smoke') {
        const vx = Math.cos(angle) * velocity * 0.4;
        const vy = Math.sin(angle) * velocity * 0.4 - 20; // Upward drift
        
        px += vx * particleAge + Math.sin(particleAge * 2 + i) * (turbulence * 3);
        py += vy * particleAge - 0.1 * gravity * 50 * particleAge * particleAge;
        
        // Smoke expands over life
        size = sizeBase * (1 + progress * 4);
        alpha = Math.sin(progress * Math.PI) * 0.4; // Soft fade in and out

        const grad = ctx.createRadialGradient(px, py, 0, px, py, size);
        grad.addColorStop(0, color1);
        grad.addColorStop(0.6, color2);
        grad.addColorStop(1, 'rgba(0,0,0,0)');

        ctx.fillStyle = grad;
        ctx.globalAlpha = alpha;
        ctx.beginPath();
        ctx.arc(px, py, size, 0, Math.PI * 2);
        ctx.fill();

      } else if (preset === 'light' || preset === 'magic') {
        // Spiral orbital motion
        const orbitRadius = (rand1 * 120 + 20) * progress;
        const orbitAngle = particleAge * speedBase * 2 + rand2 * Math.PI * 2;

        px += Math.cos(orbitAngle) * orbitRadius;
        py += Math.sin(orbitAngle) * orbitRadius - particleAge * 40;

        alpha = Math.sin(progress * Math.PI);
        size = sizeBase * (1 + Math.sin(progress * Math.PI * 2) * 0.3);

        const grad = ctx.createRadialGradient(px, py, 0, px, py, size * 2.5);
        grad.addColorStop(0, '#ffffff');
        grad.addColorStop(0.3, color1);
        grad.addColorStop(0.7, color2);
        grad.addColorStop(1, 'rgba(0,0,0,0)');

        ctx.fillStyle = grad;
        ctx.globalAlpha = alpha;
        ctx.beginPath();
        ctx.arc(px, py, size * 2.5, 0, Math.PI * 2);
        ctx.fill();

      } else if (preset === 'fireflies') {
        // Soft floating sinusoidal motion
        px += Math.sin(currentTime * speedBase * 0.5 + rand1 * 10) * (spreadRad * 80);
        py += Math.cos(currentTime * speedBase * 0.4 + rand2 * 10) * 60 - rand3 * 100;

        alpha = (Math.sin(currentTime * 3 + rand1 * 20) + 1) / 2 * 0.8 + 0.2;
        size = sizeBase * (0.8 + Math.sin(currentTime * 2 + rand2) * 0.2);

        const grad = ctx.createRadialGradient(px, py, 0, px, py, size * 3);
        grad.addColorStop(0, color1);
        grad.addColorStop(0.5, color2);
        grad.addColorStop(1, 'rgba(0,0,0,0)');

        ctx.fillStyle = grad;
        ctx.globalAlpha = alpha;
        ctx.beginPath();
        ctx.arc(px, py, size * 3, 0, Math.PI * 2);
        ctx.fill();

      } else if (preset === 'snow') {
        // Downward gentle fall
        const fallSpeed = speedBase * 20 + rand1 * 15;
        px = (emitterX + (rand2 - 0.5) * width) + Math.sin(currentTime + rand3 * 10) * 20;
        py = ((emitterY - height / 2 + currentTime * fallSpeed + rand1 * height) % height);

        alpha = Math.min(1, Math.sin(progress * Math.PI) * 1.5);
        size = sizeBase * (0.5 + rand1 * 0.8);

        ctx.fillStyle = '#ffffff';
        ctx.globalAlpha = alpha * 0.85;
        ctx.beginPath();
        ctx.arc(px, py, size, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.restore();
  }, [settings, currentTime, width, height]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      className={`pointer-events-none w-full h-full ${className}`}
      style={style}
    />
  );
};
