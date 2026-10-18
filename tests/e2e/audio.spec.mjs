/** Audio-reactive pipeline: import → analysis → visualizer → keyframe baking → export; preview/export determinism. */
import os from 'node:os';
import path from 'node:path';
import { openApp, makeBeatWav } from './helpers.mjs';

export default async function ({ url }) {
  const { browser, page, results, check, realErrors } = await openApp(url, { gl: true });
  const wav = makeBeatWav(path.join(os.tmpdir(), 'v12-e2e-beat.wav'));
  try {
    check('WebGL2 available in test browser', await page.evaluate(() => !!document.createElement('canvas').getContext('webgl2')));

    await page.setInputFiles('input[type=file][accept="audio/*"]', wav);
    await page.waitForTimeout(1500);
    check('Audio track imported', (await page.locator('text=/🎵 .*beat/').count()) > 0);

    await page.locator('button[title="Add Audio-Reactive Visualizer Layer"]').click();
    await page.waitForTimeout(300);
    check('Audio Visualizer layer added', (await page.locator('text=/Audio Visualizer/').count()) > 0);

    await page.locator('button:has-text("Properties")').first().click();
    await page.waitForTimeout(2500);
    const sourceVal = await page.locator('select').filter({ hasText: 'beat' }).first().inputValue().catch(() => '');
    check('Visualizer auto-selected the audio source', !!sourceVal && sourceVal !== '__mic', sourceVal);
    const beatsText = await page.locator('text=/beats · /').first().innerText().catch(() => '');
    check('Analysis finished (beats/BPM shown)', !!beatsText, beatsText);
    const bpm = Number((/(\d+)\s*BPM/i.exec(beatsText) || [])[1] || 0);
    check('Detected tempo ≈ 120 BPM', bpm >= 110 && bpm <= 130, `bpm=${bpm}`);

    await page.locator('button:has-text("Ring")').first().click();
    await page.waitForTimeout(300);
    const pix = await page.evaluate(() => {
      const c = Array.from(document.querySelectorAll('canvas')).find(c => c.getContext('webgl2'));
      if (!c) return -1;
      const gl = c.getContext('webgl2');
      const px = new Uint8Array(c.width * c.height * 4);
      gl.readPixels(0, 0, c.width, c.height, gl.RGBA, gl.UNSIGNED_BYTE, px);
      let lit = 0; for (let i = 3; i < px.length; i += 4) if (px[i] > 10) lit++;
      return lit / (c.width * c.height);
    });
    check('Visualizer draws pixels', pix > 0.001, `lit fraction ${pix.toFixed(4)}`);

    await page.locator('button:has-text("Bake Keyframes")').first().click();
    await page.waitForTimeout(400);
    const baked = await page.locator('text=/Baked \\d+ .* keyframes/').first().innerText().catch(() => '');
    check('Bake created keyframes', !!baked, baked);

    await page.keyboard.press('Home');
    await page.mouse.click(400, 400);
    await page.keyboard.press('Space');
    await page.waitForTimeout(1200);
    await page.keyboard.press('Space');

    await page.keyboard.press('Control+e');
    await page.waitForTimeout(300);
    await page.locator('text=Single Frame (PNG)').click();
    await page.locator('button:has-text("Render")').first().click();
    await page.waitForTimeout(2500);
    check('Single-frame export with visualizer completes', await page.locator('button:has-text("Download")').isVisible());
    check('MP4 option present (disabled without media service URL)', (await page.locator('text=MP4 Video (H.264)').count()) > 0);
    await page.keyboard.press('Escape');

    // Project files are self-contained: the audio track is embedded and restored on load
    const hasBlobAudio = await page.evaluate(() => { const a = window.__v12.getState().layers.find(l => l.type === 'audio'); return !!a && a.audioSettings?.src.startsWith('blob:'); });
    let roundTrip = hasBlobAudio ? 'no-save' : 'no-blob-audio';
    if (hasBlobAudio) {
      const dl = page.waitForEvent('download', { timeout: 10000 }).catch(() => null);
      await page.mouse.click(400, 400);
      await page.keyboard.press('Control+s');
      const file = await dl;
      if (file) {
        const json = JSON.parse((await import('node:fs')).readFileSync(await file.path(), 'utf8'));
        const a = json.layers.find(l => l.type === 'audio');
        roundTrip = json.version === 3 && a && typeof a.audioData === 'string' && a.audioData.startsWith('data:audio') && a.audioData.length > 100000 ? 'embedded' : 'missing:' + (a ? Object.keys(a).join(',') : 'no-audio-layer');
      }
    }
    check('Saved project embeds the audio track (self-contained .v12proj.json)', roundTrip === 'embedded', roundTrip);

    check('No runtime errors', realErrors().length === 0, realErrors().slice(0, 3).join(' | '));
  } finally { await browser.close(); }
  return results;
}
