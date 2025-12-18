
import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI, HarmCategory, HarmBlockThreshold, type Content, type Part } from '@google/genai';
import { KENYU_SYSTEM_INSTRUCTION } from '../constants.ts';
import { Role, type Message } from '../types.ts';

// --- Icons ---
const SendIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
  </svg>
);

const PaperclipIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
  </svg>
);

const MicIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
    <line x1="12" y1="19" x2="12" y2="23" />
    <line x1="8" y1="23" x2="16" y2="23" />
  </svg>
);

const XIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

// 小黑貓圖標
const TherapistAvatar = () => (
  <div className="mb-1 ml-4 animate-bounce">
    <svg width="24" height="24" viewBox="0 0 24 24" fill="black">
      <path d="M12 2C9.5 2 7 4 7 7c0 1.5.5 3 1.5 4-1.5 1-2.5 2.5-2.5 4.5 0 3 2.5 5.5 5.5 5.5s5.5-2.5 5.5-5.5c0-2-1-3.5-2.5-4.5 1-1 1.5-2.5 1.5-4 0-3-2.5-5-5-5zm-3 5c0-1.7 1.3-3 3-3s3 1.3 3 3c0 .8-.3 1.5-.8 2-.5.5-1.2.8-2 .8H11.8c-.8 0-1.5-.3-2-.8-.5-.5-.8-1.2-.8-2zm3 12.5c-1.9 0-3.5-1.6-3.5-3.5 0-1.4.8-2.6 2-3.2v.7c0 .8.7 1.5 1.5 1.5s1.5-.7 1.5-1.5v-.7c1.2.6 2 1.8 2 3.2 0 1.9-1.6 3.5-3.5 3.5z"/>
      <circle cx="10" cy="7" r="1" fill="white"/>
      <circle cx="14" cy="7" r="1" fill="white"/>
      <path d="M8 2L6 5M16 2L18 5" stroke="black" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  </div>
);

const ChatMessage: React.FC<{ message: Message }> = ({ message }) => {
  const isUser = message.role === Role.USER;
  return (
    <div className={`flex flex-col w-full mb-8 ${isUser ? 'items-end' : 'items-start'} animate-in fade-in duration-500`}>
      {!isUser && <TherapistAvatar />}
      <div className={`max-w-[85%] md:max-w-[75%] px-7 py-5 rounded-3xl shadow-md border ${
        isUser 
          ? 'bg-rose-500 text-white border-rose-600 rounded-br-none font-bold' 
          : 'bg-white text-stone-900 border-stone-200 rounded-bl-none font-medium'
      }`}>
        <p className="whitespace-pre-wrap leading-relaxed text-[1.1rem]">{message.content}</p>
      </div>
    </div>
  );
};

const ChatInterface: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [userInput, setUserInput] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [selectedImage, setSelectedImage] = useState<{data: string, mimeType: string} | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordedAudio, setRecordedAudio] = useState<{data: string, mimeType: string} | null>(null);
  
  const historyRef = useRef<Content[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve((reader.result as string).split(',')[1]);
      reader.onerror = reject;
    });
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        const base64 = await fileToBase64(file);
        setSelectedImage({ data: base64, mimeType: file.type });
      } catch (err) { console.error(err); }
    }
    e.target.value = '';
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };
      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const base64 = await fileToBase64(new File([audioBlob], "audio.webm"));
        setRecordedAudio({ data: base64, mimeType: 'audio/webm' });
        stream.getTracks().forEach(t => t.stop());
      };
      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) { alert("Mic Access Error"); }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const handleSend = async () => {
    const trimmed = userInput.trim();
    if (isLoading || (!trimmed && !selectedImage && !recordedAudio)) return;

    setIsLoading(true);
    const displayContent = trimmed || (selectedImage ? "[分享意象]" : "[語音分享]");
    setMessages(prev => [...prev, { role: Role.USER, content: displayContent }]);

    const parts: Part[] = [];
    if (trimmed) parts.push({ text: trimmed });
    if (selectedImage) parts.push({ inlineData: { data: selectedImage.data, mimeType: selectedImage.mimeType } });
    if (recordedAudio) parts.push({ inlineData: { data: recordedAudio.data, mimeType: recordedAudio.mimeType } });

    const currentParts = [...parts];
    setUserInput('');
    setSelectedImage(null);
    setRecordedAudio(null);
    if (textareaRef.current) textareaRef.current.style.height = 'auto';

    try {
      // 確保 API KEY 存在
      if (!process.env.API_KEY) {
        throw new Error("MISSING_API_KEY: 請在 Vercel 環境變數中設置 API_KEY");
      }

      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const contents = [...historyRef.current, { role: 'user', parts: currentParts }];

      // 使用 Flash 模型，穩定性與連線成功率最高
      const result = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents,
        config: { 
          systemInstruction: KENYU_SYSTEM_INSTRUCTION,
          safetySettings: [
            { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
            { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
            { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
            { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE }
          ]
        }
      });

      const responseText = result.text;
      if (responseText) {
        setMessages(prev => [...prev, { role: Role.MODEL, content: responseText }]);
        historyRef.current = [...contents, { role: 'model', parts: [{ text: responseText }] }];
      } else {
        throw new Error("EMPTY_RESPONSE");
      }
    } catch (error: any) {
      // 核心診斷：在控制台打印詳細錯誤
      console.error("DEBUG_GEMINI_ERROR:", error);
      console.error("ERROR_MESSAGE:", error?.message);
      
      setIsLoading(false);
      const errorHint = error?.message?.includes("API_KEY") ? "(API KEY 錯誤)" : "";
      setMessages(prev => [...prev, { 
        role: Role.MODEL, 
        content: `連線出現了技術性的斷裂 ${errorHint}。請嘗試再發送一次。如果問題持續，請檢查 F12 控制台報錯資訊。` 
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSend();
    }
  };

  const canSend = (userInput.trim() || selectedImage || recordedAudio) && !isLoading;

  return (
    <div className="flex flex-col h-[94vh] w-full max-w-5xl bg-white rounded-3xl shadow-2xl border border-stone-100 overflow-hidden relative">
      <header className="px-10 py-6 border-b border-stone-50 bg-stone-50/20 flex flex-col items-center">
        <h1 className="text-4xl font-script font-bold text-rose-500">I'll understand you</h1>
        <p className="text-stone-400 text-[0.7rem] font-bold tracking-[0.6em] uppercase mt-1">Psychoanalytic Encounter</p>
      </header>

      <main className="flex-1 px-6 md:px-20 py-10 overflow-y-auto white-scrollbar bg-[#fdfdfd]">
        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-stone-300 space-y-4 opacity-40">
            <div className="w-14 h-14 rounded-full border border-stone-200 flex items-center justify-center italic text-3xl font-script">ψ</div>
            <p className="text-xl italic font-script">"Speak whatever comes to mind."</p>
          </div>
        )}
        {messages.map((msg, i) => <ChatMessage key={i} message={msg} />)}
        {isLoading && (
          <div className="flex flex-col items-start mb-8">
            <TherapistAvatar />
            <div className="px-6 py-4 rounded-3xl bg-stone-50 border border-stone-100 flex space-x-2 items-center">
              <span className="w-2 h-2 bg-rose-400 rounded-full animate-bounce"></span>
              <span className="w-2 h-2 bg-rose-400 rounded-full animate-bounce [animation-delay:-0.2s]"></span>
              <span className="w-2 h-2 bg-rose-400 rounded-full animate-bounce [animation-delay:-0.4s]"></span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </main>

      <footer className="p-8 md:px-20 bg-white border-t border-stone-50">
        {(selectedImage || recordedAudio) && (
          <div className="mb-6 flex gap-4 animate-in slide-in-from-bottom-2">
            {selectedImage && (
              <div className="relative">
                <div className="h-24 w-24 overflow-hidden rounded-xl border border-stone-200 shadow-sm">
                  <img src={`data:${selectedImage.mimeType};base64,${selectedImage.data}`} className="h-full w-full object-cover" />
                </div>
                <button onClick={() => setSelectedImage(null)} className="absolute -top-2 -right-2 bg-stone-800 text-white rounded-full p-1.5 shadow-lg hover:bg-rose-500 transition-colors">
                  <XIcon className="h-4 w-4" />
                </button>
              </div>
            )}
            {recordedAudio && (
              <div className="relative flex items-center bg-stone-50 border border-stone-200 px-6 py-3 rounded-xl shadow-sm">
                <MicIcon className="h-5 w-5 mr-3 text-rose-500" />
                <span className="text-xs font-bold text-stone-500 uppercase tracking-widest">Voice Captured</span>
                <button onClick={() => setRecordedAudio(null)} className="absolute -top-2 -right-2 bg-stone-800 text-white rounded-full p-1.5 shadow-lg hover:bg-rose-500 transition-colors">
                  <XIcon className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>
        )}

        <div className="flex items-end gap-4">
          <div className="flex gap-2">
            <label className="cursor-pointer bg-stone-50 p-4 rounded-2xl text-stone-400 border border-stone-100 hover:text-stone-600 transition-all flex items-center justify-center">
              <PaperclipIcon className="h-6 w-6" />
              <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
            </label>
            <button 
              onMouseDown={startRecording} onMouseUp={stopRecording}
              onTouchStart={startRecording} onTouchEnd={stopRecording}
              className={`p-4 rounded-2xl border transition-all flex items-center justify-center ${isRecording ? 'bg-rose-500 text-white border-rose-600 animate-pulse' : 'bg-stone-50 text-stone-400 border-stone-100'}`}
            >
              <MicIcon className="h-6 w-6" />
            </button>
          </div>

          <div className="relative flex-1">
            <textarea
              ref={textareaRef}
              value={userInput}
              onChange={(e) => {
                setUserInput(e.target.value);
                e.target.style.height = 'auto';
                e.target.style.height = `${e.target.scrollHeight}px`;
              }}
              onKeyDown={handleKeyDown}
              placeholder="What comes to mind?..."
              className="w-full pl-6 pr-16 py-4 bg-[#fdfdfd] text-stone-900 border border-stone-200 rounded-2xl resize-none focus:outline-none focus:border-rose-200 focus:bg-white transition-all text-[1.1rem] max-h-48 overflow-y-auto white-scrollbar font-medium"
              rows={1}
            />
            <button 
              onClick={handleSend}
              disabled={!canSend}
              className={`absolute right-3 bottom-3 h-11 w-11 flex items-center justify-center rounded-xl transition-all ${canSend ? 'bg-stone-800 text-white hover:bg-rose-500 shadow-lg' : 'bg-stone-100 text-stone-300 cursor-not-allowed'}`}
            >
              <SendIcon className="h-5 w-5" />
            </button>
          </div>
        </div>
        <div className="mt-4 flex justify-between px-2 opacity-30 text-[0.65rem] font-bold uppercase tracking-widest text-stone-500">
           <span>Hold mic to record</span>
           <span>Ctrl+Enter to send</span>
        </div>
      </footer>
    </div>
  );
};

export default ChatInterface;
