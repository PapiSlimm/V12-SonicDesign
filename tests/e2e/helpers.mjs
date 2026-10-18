import { chromium } from 'playwright';
import fs from 'node:fs';

export async function openApp(url, { gl = false } = {}) {
  const launch = { headless: process.env.E2E_HEADED !== '1', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required', ...(gl ? ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] : [])] };
  if (process.env.E2E_CHROMIUM) launch.executablePath = process.env.E2E_CHROMIUM;
  const browser = await chromium.launch(launch);
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => !!window.__v12, null, { timeout: 15000 });
  const results = [];
  const check = (name, ok, detail = '') => results.push({ name, ok: !!ok, detail });
  const realErrors = () => errors.filter(e => !/favicon|fonts\.g|net::ERR|Failed to load resource|DevTools|WebGL|GPU|swiftshader/i.test(e));
  /** Read store state in the page. */
  const state = (fn) => page.evaluate(fn, undefined);
  return { browser, page, results, check, realErrors, state };
}

/** 4-second mono WAV: 120 BPM kick + tone, so analysis finds beats. */
export function makeBeatWav(file) {
  const sr = 22050, secs = 4, n = sr * secs;
  const data = new Int16Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const beat = (t % 0.5) < 0.08 ? Math.sin(2 * Math.PI * 55 * t) * Math.exp(-((t % 0.5)) * 30) : 0;
    const tone = 0.15 * Math.sin(2 * Math.PI * 440 * t) * (0.5 + 0.5 * Math.sin(2 * Math.PI * 0.5 * t));
    data[i] = Math.max(-1, Math.min(1, beat * 0.9 + tone)) * 32767;
  }
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVE', 8); buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22); buf.writeUInt32LE(sr, 24);
  buf.writeUInt32LE(sr * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
  Buffer.from(data.buffer).copy(buf, 44);
  fs.writeFileSync(file, buf);
  return file;
}
