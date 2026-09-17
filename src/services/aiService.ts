import { GoogleGenAI } from "@google/genai";
import { Keyframe } from "../core/types";

/**
 * API key resolution order:
 *  1. VITE_GEMINI_API_KEY from .env.local (standard Vite convention)
 *  2. GEMINI_API_KEY injected by vite.config.ts `define` (AI Studio convention)
 *
 * NOTE: any key bundled into a browser app is visible to end users. For public deployments,
 * proxy Gemini calls through a backend instead of shipping the key.
 */
function resolveApiKey(): string {
  const viteKey = (import.meta as any).env?.VITE_GEMINI_API_KEY as string | undefined;
  const definedKey = typeof process !== 'undefined' && process.env ? process.env.GEMINI_API_KEY : undefined;
  const key = viteKey || definedKey || '';
  return key === 'MY_GEMINI_API_KEY' ? '' : key;
}

let client: GoogleGenAI | null = null;
function getClient(): GoogleGenAI {
  const apiKey = resolveApiKey();
  if (!apiKey) {
    throw new Error('Gemini API key is not configured. Add VITE_GEMINI_API_KEY=... to .env.local and restart the dev server.');
  }
  if (!client) client = new GoogleGenAI({ apiKey });
  return client;
}

export function isAIConfigured(): boolean {
  return !!resolveApiKey();
}

const IMAGE_MODEL = "gemini-2.5-flash-image";
const TEXT_MODEL = "gemini-2.5-flash";

function stripDataUrl(dataUrl: string): string {
  const idx = dataUrl.indexOf(',');
  return idx >= 0 ? dataUrl.slice(idx + 1) : dataUrl;
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    const err = new Error('Aborted');
    err.name = 'AbortError';
    throw err;
  }
}

export async function generateImageEdit(
  base64Image: string,
  prompt: string,
  maskBase64?: string,
  signal?: AbortSignal
): Promise<string> {
  throwIfAborted(signal);
  const ai = getClient();

  const response = await ai.models.generateContent({
    model: IMAGE_MODEL,
    contents: {
      parts: [
        { inlineData: { data: stripDataUrl(base64Image), mimeType: "image/png" } },
        ...(maskBase64 ? [{ inlineData: { data: stripDataUrl(maskBase64), mimeType: "image/png" } }] : []),
        { text: maskBase64 ? `Edit only the area defined by the mask image. ${prompt}` : prompt },
      ],
    },
    config: { abortSignal: signal } as any,
  });

  throwIfAborted(signal);

  const parts = response.candidates?.[0]?.content?.parts || [];
  for (const part of parts) {
    if (part.inlineData?.data) {
      const mime = part.inlineData.mimeType || 'image/png';
      return `data:${mime};base64,${part.inlineData.data}`;
    }
  }

  const textPart = parts.find(p => p.text)?.text;
  throw new Error(textPart ? `Gemini returned no image: ${textPart.slice(0, 200)}` : "No image returned from Gemini");
}

export async function replaceSky(base64Image: string, prompt = "Replace the sky with a dramatic golden-hour sunset, keeping everything else identical", signal?: AbortSignal) {
  return generateImageEdit(base64Image, prompt, undefined, signal);
}

export async function enhanceImage(base64Image: string, signal?: AbortSignal) {
  return generateImageEdit(base64Image, "Enhance this image: improve sharpness, dynamic range, and color balance while keeping the composition identical", undefined, signal);
}

const VALID_EASINGS: Keyframe['easing'][] = ['linear', 'ease-in', 'ease-out', 'ease-in-out', 'bezier', 'snap', 'bounce'];

export interface GeneratedKeyframeTrack {
  property: 'x' | 'y' | 'scaleX' | 'scaleY' | 'rotation' | 'opacity';
  keyframes: Keyframe[];
}

/**
 * Ask Gemini for keyframes describing an animation. Returns tracks per property; each
 * keyframe is validated and clamped so bad model output can never corrupt the project.
 */
export async function generateKeyframes(prompt: string, context?: { durationSec?: number; startX?: number; startY?: number }): Promise<GeneratedKeyframeTrack[]> {
  const ai = getClient();
  const dur = Math.max(1, Math.min(context?.durationSec ?? 5, 30));
  const response = await ai.models.generateContent({
    model: TEXT_MODEL,
    contents: `You are a motion-design assistant. Produce keyframes for a 1920x1080 canvas layer based on this description: "${prompt}".
The layer currently sits at x=${Math.round(context?.startX ?? 400)}, y=${Math.round(context?.startY ?? 300)}.
Return ONLY a JSON object of the shape:
{"tracks":[{"property":"x"|"y"|"scaleX"|"scaleY"|"rotation"|"opacity","keyframes":[{"time":number,"value":number,"easing":"linear"|"ease-in"|"ease-out"|"ease-in-out"|"snap"|"bounce"}]}]}
Rules: time is seconds from 0 to ${dur}; x in 0-1920; y in 0-1080; scale 0.1-5; rotation -720..720; opacity 0-1. Use 3-8 keyframes per track and at least two tracks.`,
    config: { responseMimeType: "application/json" }
  });

  let parsed: any;
  try {
    parsed = JSON.parse(response.text || "{}");
  } catch {
    return [];
  }
  const rawTracks: any[] = Array.isArray(parsed) ? [{ property: 'x', keyframes: parsed }] : (parsed?.tracks || []);
  const tracks: GeneratedKeyframeTrack[] = [];
  for (const t of rawTracks) {
    const property = t?.property;
    if (!['x', 'y', 'scaleX', 'scaleY', 'rotation', 'opacity'].includes(property)) continue;
    const kfs: Keyframe[] = [];
    for (const k of (t.keyframes || [])) {
      const time = Number(k?.time), value = Number(k?.value);
      if (!Number.isFinite(time) || !Number.isFinite(value)) continue;
      kfs.push({
        time: Math.max(0, Math.min(dur, time)),
        value: property === 'opacity' ? Math.max(0, Math.min(1, value)) : value,
        easing: VALID_EASINGS.includes(k?.easing) ? k.easing : 'ease-in-out'
      });
    }
    if (kfs.length >= 2) tracks.push({ property, keyframes: kfs.sort((a, b) => a.time - b.time) });
  }
  return tracks;
}
