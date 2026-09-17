import { LayerFactory } from '../core/layers/LayerFactory';
import { Layer, MotionPath } from '../core/types';
import { DOC_WIDTH, DOC_HEIGHT } from '../core/layers/layerUtils';

export const PROJECT_FILE_VERSION = 2;

export interface SerializedLayer extends Omit<Layer, 'bitmap'> {
  bitmap: null;
  /** PNG data URL of the raster content (if any). */
  bitmapData?: string;
}

export interface ProjectFile {
  version: number;
  app: 'V12SonicDesign Studio';
  projectName: string;
  savedAt: string;
  duration: number;
  fps: number;
  layers: SerializedLayer[];
  motionPaths: MotionPath[];
  colorSwatches?: string[];
  globalColorVariables?: { id: string; name: string; value: string }[];
  brushColor?: string;
}

/** Open a native file picker and resolve with the chosen files (empty array on cancel). */
export function pickFiles(accept: string, multiple = false): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.multiple = multiple;
    input.style.display = 'none';
    document.body.appendChild(input);
    const cleanup = () => { input.remove(); window.removeEventListener('focus', onFocus); };
    const onFocus = () => setTimeout(() => { if (!input.files?.length) { cleanup(); resolve([]); } }, 400);
    input.onchange = () => { const files = Array.from(input.files || []); cleanup(); resolve(files); };
    window.addEventListener('focus', onFocus);
    input.click();
  });
}

/** Decode an image file into an ImageBitmap (falls back to <img> decoding for formats createImageBitmap rejects). */
export async function fileToBitmap(file: Blob): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(file);
  } catch {
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = () => rej(new Error('Image decode failed')); img.src = url; });
      return await createImageBitmap(img);
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

/** Fit an oversized bitmap into the document bounds while preserving aspect ratio. */
export async function fitBitmapToDocument(bitmap: ImageBitmap): Promise<ImageBitmap> {
  if (bitmap.width <= DOC_WIDTH && bitmap.height <= DOC_HEIGHT) return bitmap;
  const scale = Math.min(DOC_WIDTH / bitmap.width, DOC_HEIGHT / bitmap.height);
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const resized = await createImageBitmap(bitmap, { resizeWidth: w, resizeHeight: h, resizeQuality: 'high' });
  bitmap.close?.();
  return resized;
}

export async function importImageFiles(files: File[]): Promise<Layer[]> {
  const layers: Layer[] = [];
  for (const file of files) {
    if (!file.type.startsWith('image/')) continue;
    try {
      const raw = await fileToBitmap(file);
      const bitmap = await fitBitmapToDocument(raw);
      layers.push(LayerFactory.createRasterLayer(file.name.replace(/\.[^/.]+$/, ''), bitmap));
    } catch (err) {
      console.error(`Failed to import ${file.name}`, err);
    }
  }
  return layers;
}

/** Legacy callback API kept for compatibility. */
export const importAsset = (onSuccess: (layer: Layer) => void) => {
  pickFiles('image/*', true).then(async (files) => {
    const layers = await importImageFiles(files);
    layers.forEach(onSuccess);
  });
};

export const downloadDataUrl = (dataUrl: string, filename: string) => {
  const link = document.createElement('a');
  link.download = filename;
  link.href = dataUrl;
  document.body.appendChild(link);
  link.click();
  link.remove();
};

export const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  downloadDataUrl(url, filename);
  setTimeout(() => URL.revokeObjectURL(url), 10000);
};

export const exportCanvas = (canvas: HTMLCanvasElement | null, format: 'png' | 'jpg' = 'png', filename = 'v12-export') => {
  if (!canvas) return;
  const dataUrl = format === 'jpg' ? canvas.toDataURL('image/jpeg', 0.92) : canvas.toDataURL('image/png');
  downloadDataUrl(dataUrl, `${filename}.${format}`);
};

export function bitmapToDataUrl(bitmap: ImageBitmap): string {
  const c = document.createElement('canvas');
  c.width = bitmap.width;
  c.height = bitmap.height;
  c.getContext('2d')?.drawImage(bitmap, 0, 0);
  return c.toDataURL('image/png');
}

export async function dataUrlToBitmap(dataUrl: string): Promise<ImageBitmap> {
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  return fileToBitmap(blob);
}

export function serializeLayers(layers: Layer[]): SerializedLayer[] {
  return layers.map((l) => {
    const { bitmap, calculatedMotionBlur, ...rest } = l as Layer & { calculatedMotionBlur?: unknown };
    const serialized: SerializedLayer = { ...(rest as Omit<Layer, 'bitmap'>), bitmap: null };
    if (bitmap) serialized.bitmapData = bitmapToDataUrl(bitmap);
    if (l.type === 'audio' && l.audioSettings?.src.startsWith('blob:')) {
      // Blob URLs do not survive reloads; keep the metadata so the track can be re-linked.
      serialized.audioSettings = { ...l.audioSettings, src: '' };
    }
    return serialized;
  });
}

export async function deserializeLayers(layers: SerializedLayer[]): Promise<Layer[]> {
  const out: Layer[] = [];
  for (const sl of layers) {
    const { bitmapData, ...rest } = sl;
    let bitmap: ImageBitmap | null = null;
    if (bitmapData) {
      try { bitmap = await dataUrlToBitmap(bitmapData); } catch (e) { console.warn('Could not restore bitmap for', sl.name, e); }
    }
    out.push({ ...(rest as Layer), bitmap, adjustments: rest.adjustments || LayerFactory.createDefaultAdjustments(), transform: rest.transform || LayerFactory.createDefaultTransform() });
  }
  return out;
}

export function buildProjectFile(data: Omit<ProjectFile, 'version' | 'app' | 'savedAt' | 'layers'> & { layers: Layer[] }): ProjectFile {
  return {
    version: PROJECT_FILE_VERSION,
    app: 'V12SonicDesign Studio',
    savedAt: new Date().toISOString(),
    projectName: data.projectName,
    duration: data.duration,
    fps: data.fps,
    layers: serializeLayers(data.layers),
    motionPaths: data.motionPaths,
    colorSwatches: data.colorSwatches,
    globalColorVariables: data.globalColorVariables,
    brushColor: data.brushColor
  };
}

export function saveProjectFile(project: ProjectFile) {
  const blob = new Blob([JSON.stringify(project)], { type: 'application/json' });
  const safeName = (project.projectName || 'project').replace(/[^a-z0-9_-]+/gi, '_');
  downloadBlob(blob, `${safeName}.v12proj.json`);
}

export async function openProjectFile(): Promise<(Omit<ProjectFile, 'layers'> & { layers: Layer[] }) | null> {
  const [file] = await pickFiles('.json,application/json');
  if (!file) return null;
  const text = await file.text();
  const parsed = JSON.parse(text) as ProjectFile;
  if (!parsed || !Array.isArray(parsed.layers)) throw new Error('Not a valid V12SonicDesign project file');
  const layers = await deserializeLayers(parsed.layers);
  return { ...parsed, layers, projectName: parsed.projectName || file.name.replace(/\.v12proj\.json$|\.json$/i, '') };
}
