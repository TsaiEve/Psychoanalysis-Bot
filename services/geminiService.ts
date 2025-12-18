
import { GoogleGenAI, Chat } from "@google/genai";
import { KENYU_SYSTEM_INSTRUCTION } from '../constants';

if (!process.env.API_KEY) {
  throw new Error("API_KEY environment variable is not set");
}

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export function createTherapyChat(): Chat {
  return ai.chats.create({
    model: 'gemini-3-flash-preview',
    config: {
      systemInstruction: KENYU_SYSTEM_INSTRUCTION,
    },
  });
}

export const aiClient = ai;
