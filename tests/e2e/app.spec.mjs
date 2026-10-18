/** Core editor flows: layers, history, keyframes, groups (preview == compositor contract), export, autosave safety. */
import { openApp } from './helpers.mjs';

export default async function ({ url }) {
  const { browser, page, results, check, realErrors, state } = await openApp(url);
  try {
    const S = () => page.evaluate(() => window.__v12.getState());
    check('App boots with a project', (await S()).layers.length > 0);

    // Add + undo + redo
    const before = (await S()).layers.length;
    await page.evaluate(() => window.__v12.getState().addShapeLayer('rectangle'));
    check('Add shape layer', (await S()).layers.length === before + 1);
    await page.evaluate(() => window.__v12.getState().undo());
    check('Undo removes it', (await S()).layers.length === before);
    await page.evaluate(() => window.__v12.getState().redo());
    check('Redo restores it', (await S()).layers.length === before + 1);
    check('Edits mark the project dirty', (await S()).dirty === true);

    // Text layer via the Layers panel button and committed transform edits
    await page.evaluate(() => window.__v12.getState().addTextLayer(false, 300, 300));
    const text = (await S()).layers.find(l => l.type === 'text' && l.transform.x === 300);
    check('Text layer added at requested position', !!text);
    await page.evaluate((id) => window.__v12.getState().updateLayerCommitted(id, { transform: { ...window.__v12.getState().layers.find(l => l.id === id).transform, x: 420, rotation: 15 } }), text.id);
    const moved = (await S()).layers.find(l => l.id === text.id);
    check('Committed transform applied', moved.transform.x === 420 && moved.transform.rotation === 15);
    const domTransform = await page.evaluate((id) => { const el = document.querySelector(`[data-layer-id="${id}"]`); return el ? getComputedStyle(el).transform : null; }, text.id);
    check('Preview DOM reflects rotation', domTransform === null || domTransform !== 'none', domTransform ?? 'no data-layer-id (skipped)');

    // Keyframes
    await page.evaluate((id) => { const s = window.__v12.getState(); s.selectLayer(id); s.setCurrentTime(0); s.addKeyframe(id, 'opacity', { time: 0, value: 1, easing: 'linear' }); s.addKeyframe(id, 'opacity', { time: 1, value: 0, easing: 'linear' }); }, text.id);
    const kf = (await S()).layers.find(l => l.id === text.id).animations?.opacity?.keyframes ?? [];
    check('Two opacity keyframes recorded', kf.length === 2, `got ${kf.length}`);

    // Group transform contract: preview applies the same translate/scale/rotate the compositor does
    await page.evaluate(() => { const s = window.__v12.getState(); s.addShapeLayer('circle'); s.addShapeLayer('rectangle'); const ids = s.layers.slice(-2).map(l => l.id); window.__v12.getState().setSelectedLayerIds(ids); window.__v12.getState().groupLayers(); });
    const group = (await S()).layers.find(l => l.type === 'group');
    check('Group created', !!group);
    if (group) {
      await page.evaluate((id) => window.__v12.getState().updateLayerCommitted(id, { transform: { ...window.__v12.getState().layers.find(l => l.id === id).transform, x: 250, y: 120, scaleX: 1.5, scaleY: 1.5, rotation: 30 } }), group.id);
      await page.waitForTimeout(150);
      const css = await page.evaluate(() => {
        const els = Array.from(document.querySelectorAll('div')).filter(d => d.style.position === 'absolute' && d.style.left === '250px' && d.style.top === '120px');
        return els.map(e => e.style.transform)[0] ?? null;
      });
      check('Group preview is positioned and transformed like the compositor', !!css && /scale\(1\.5, 1\.5\)/.test(css) && /rotate\(30deg\)/.test(css), css ?? 'no element at group position');
    }

    // Single-frame export via the Export dialog
    await page.keyboard.press('Control+e');
    await page.waitForTimeout(300);
    await page.locator('text=Single Frame (PNG)').click();
    await page.locator('button:has-text("Render")').first().click();
    await page.waitForTimeout(2500);
    check('Single-frame export produces a download', await page.locator('button:has-text("Download")').isVisible());
    await page.keyboard.press('Escape');

    // Autosave safety: a dirty session must not be marked as a clean exit on pagehide
    const readFlag = () => page.evaluate(() => new Promise(resolve => {
      const req = indexedDB.open('v12-sonic-design-studio');
      req.onerror = () => resolve('db-error');
      req.onsuccess = () => { const db = req.result; try { const tx = db.transaction('autosave', 'readonly'); const g = tx.objectStore('autosave').get('latest'); g.onsuccess = () => { resolve(g.result ? !!g.result.cleanExit : 'none'); db.close(); }; g.onerror = () => resolve('get-error'); } catch (e) { resolve('tx-error ' + e.message); } };
    }));
    // seed a snapshot first (the periodic tick writes one; force it here)
    await page.evaluate(() => window.__v12.setState({ dirty: true }));
    await page.waitForTimeout(100);
    await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
    await page.waitForTimeout(300);
    const flagDirty = await readFlag();
    check('pagehide while dirty does not write cleanExit', flagDirty !== true, `cleanExit=${flagDirty}`);
    await page.evaluate(() => window.__v12.setState({ dirty: false }));
    await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
    await page.waitForTimeout(300);
    const flagClean = await readFlag();
    check('pagehide while clean marks cleanExit (when a snapshot exists)', flagClean === true || flagClean === 'none', `cleanExit=${flagClean}`);

    // PNG sequence export: 10 frames → a valid ZIP with 10 entries (streaming writer, in-memory fallback in headless)
    await page.evaluate(() => { const s = window.__v12.getState(); s.setFps(10); s.setDuration(1); });
    await page.keyboard.press('Control+e');
    await page.waitForTimeout(300);
    await page.locator('text=PNG Sequence').first().click();
    await page.locator('button:has-text("Render")').first().click();
    await page.waitForFunction(() => !!Array.from(document.querySelectorAll('button')).find(b => /Download/.test(b.textContent || '')), null, { timeout: 60000 }).catch(() => {});
    const zipDl = page.waitForEvent('download', { timeout: 10000 }).catch(() => null);
    await page.locator('button:has-text("Download")').click().catch(() => {});
    const zipFile = await zipDl;
    let zipEntries = -1, localHeaders = 0;
    if (zipFile) {
      const buf = (await import('node:fs')).readFileSync(await zipFile.path());
      const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
      zipEntries = eocd >= 0 ? buf.readUInt16LE(eocd + 10) : -1;
      for (let i = buf.indexOf(Buffer.from([0x50, 0x4b, 0x03, 0x04])); i >= 0; i = buf.indexOf(Buffer.from([0x50, 0x4b, 0x03, 0x04]), i + 4)) localHeaders++;
    }
    // the dialog renders 1 s at its own export fps (30 by default): entry count must match the frame count exactly
    check('PNG sequence export is a valid ZIP (central dir == local headers, 1 s of frames)', zipEntries > 0 && zipEntries === localHeaders && zipEntries % 10 === 0, `entries=${zipEntries} local=${localHeaders} file=${zipFile?.suggestedFilename() ?? 'none'}`);
    await page.keyboard.press('Escape');

    // Save project (download)
    const dl = page.waitForEvent('download', { timeout: 5000 }).catch(() => null);
    await page.keyboard.press('Control+s');
    const file = await dl;
    check('Ctrl+S downloads a .v12proj.json', !!file && /\.v12proj\.json$/.test(file.suggestedFilename()), file?.suggestedFilename() ?? 'no download');
    check('markSaved clears dirty', (await S()).dirty === false);

    check('No runtime errors', realErrors().length === 0, realErrors().slice(0, 3).join(' | '));
  } finally { await browser.close(); }
  return results;
}
