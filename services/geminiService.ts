
import { GoogleGenAI, Chat } from "@google/genai";
import { KENYU_SYSTEM_INSTRUCTION } from '../constants.ts';

// 按照指南，直接使用 process.env.API_KEY 初始化，不進行頂層拋錯檢查
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export function createTherapyChat(): Chat {
  return ai.chats.create({
    model: 'gemini-3-flash-preview',
    config: {
      systemInstruction: KENYU_SYSTEM_INSTRUCTION,
    },
  });
}
