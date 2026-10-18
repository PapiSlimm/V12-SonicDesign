#!/usr/bin/env node
/**
 * End-to-end smoke suite for Sonic Design Studio.
 *   npm run build && npm test            (serves dist/ on 127.0.0.1:4173 and runs every tests/e2e/*.spec.mjs)
 * One-time on a fresh machine: npx playwright install chromium
 * Env: E2E_URL (use an already running server), E2E_CHROMIUM (explicit browser binary), E2E_HEADED=1.
 */
import { spawn } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const PORT = 4173;
let server = null;
let url = process.env.E2E_URL;

async function waitFor(u, ms = 30000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { try { if ((await fetch(u)).ok) return; } catch { /* not yet */ } await new Promise(r => setTimeout(r, 300)); }
  throw new Error(`server at ${u} did not start`);
}

if (!url) {
  server = spawn(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['vite', 'preview', '--port', String(PORT), '--host', '127.0.0.1', '--strictPort'], { cwd: root, stdio: 'ignore', shell: process.platform === 'win32' });
  url = `http://127.0.0.1:${PORT}/`;
  await waitFor(url);
}

const specs = (await readdir(here)).filter(f => f.endsWith('.spec.mjs')).sort();
let passed = 0, failed = 0;
for (const spec of specs) {
  const mod = await import(pathToFileURL(path.join(here, spec)).href);
  const results = await mod.default({ url });
  for (const r of results) { if (r.ok) passed++; else failed++; console.log(`${r.ok ? 'PASS' : 'FAIL'} [${spec}] ${r.name}${r.detail ? ' — ' + r.detail : ''}`); }
}
console.log(`\n${passed}/${passed + failed} checks passed`);
if (server) server.kill();
process.exit(failed ? 1 : 0);
