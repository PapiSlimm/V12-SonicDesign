import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export async function generateImageEdit(
  base64Image: string,
  prompt: string,
  maskBase64?: string,
  signal?: AbortSignal
) {
  try {
    if (signal?.aborted) throw new Error("Aborted");

    const model = ai.models.generateContent({
      model: "gemini-2.5-flash-image",
      contents: {
        parts: [
          {
            inlineData: {
              data: base64Image.split(',')[1],
              mimeType: "image/png",
            },
          },
          ...(maskBase64 ? [{
            inlineData: {
              data: maskBase64.split(',')[1],
              mimeType: "image/png",
            },
          }] : []),
          {
            text: maskBase64 
              ? `Edit the area defined by the mask. ${prompt}`
              : prompt,
          },
        ],
      },
    });

    const response = await model;
    
    for (const part of response.candidates[0].content.parts) {
      if (part.inlineData) {
        return `data:image/png;base64,${part.inlineData.data}`;
      }
    }
    
    throw new Error("No image returned from Gemini");
  } catch (error) {
    console.error("Gemini Image Edit Error:", error);
    throw error;
  }
}

export async function replaceSky(base64Image: string, prompt: string = "Replace the sky with a beautiful sunset") {
  return generateImageEdit(base64Image, prompt);
}

export async function generateKeyframes(prompt: string) {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Generate a JSON object representing keyframes for a motion design layer based on this prompt: "${prompt}". 
      The JSON should be an array of keyframes, each with:
      - time: number (0 to 10 seconds)
      - value: number (appropriate for the property, e.g., x: 0-1920, y: 0-1080, scale: 0-5, rotation: 0-360)
      - easing: "linear" | "ease-in" | "ease-out" | "ease-in-out" | "snap" | "bounce"
      
      Return ONLY the JSON array.`,
      config: {
        responseMimeType: "application/json"
      }
    });

    return JSON.parse(response.text || "[]");
  } catch (error) {
    console.error("Gemini Keyframe Generation Error:", error);
    return [];
  }
}
