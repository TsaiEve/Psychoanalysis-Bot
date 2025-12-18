
import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI, HarmCategory, HarmBlockThreshold, type Content, type Part } from '@google/genai';
import { KENYU_SYSTEM_INSTRUCTION } from '../constants.ts';
import { Role, type Message } from '../types.ts';

// --- Ultra High-Contrast Icons (Bold Stone-900) ---
const SendIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
  </svg>
);

const PaperclipIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
  </svg>
);

const MicIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
    <line x1="12" y1="19" x2="12" y2="23" />
    <line x1="8" y1="23" x2="16" y2="23" />
  </svg>
);

const XIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

const ChatMessage: React.FC<{ message: Message }> = ({ message }) => {
  const isUser = message.role === Role.USER;
  return (
    <div className={`flex w-full mb-12 ${isUser ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-6 duration-300`}>
      <div className={`max-w-[85%] md:max-w-[75%] px-8 py-6 rounded-[2.2rem] shadow-xl border-2 ${
        isUser 
          ? 'bg-rose-600 text-white border-rose-700 rounded-br-none' 
          : 'bg-white text-stone-900 border-stone-300 rounded-bl-none'
      }`}>
        <p className="whitespace-pre-wrap leading-relaxed text-[1.15rem] font-medium">{message.content}</p>
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

  const detectLanguage = (text: string) => /[\u4e00-\u9fa5]/.test(text) ? 'zh' : 'en';

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
    } catch (err) { alert("Mic required / 需麥克風權限"); }
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

    const lang = detectLanguage(trimmed || "");
    setIsLoading(true);

    const displayContent = trimmed || (selectedImage ? "[分享了視覺內容]" : "[分享了語音訊號]");
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
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const contents = [...historyRef.current, { role: 'user', parts: currentParts }];

      const responseStream = await ai.models.generateContentStream({
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

      let fullText = '';
      let isFirstChunk = true;

      for await (const chunk of responseStream) {
        const text = chunk.text || "";
        fullText += text;
        if (isFirstChunk) {
          setIsLoading(false);
          isFirstChunk = false;
          setMessages(prev => [...prev, { role: Role.MODEL, content: fullText }]);
        } else {
          setMessages(prev => {
            const next = [...prev];
            const last = next[next.length - 1];
            if (last && last.role === Role.MODEL) {
              next[next.length - 1] = { ...last, content: fullText };
            }
            return next;
          });
        }
      }

      if (fullText) {
        historyRef.current = [...contents, { role: 'model', parts: [{ text: fullText }] }];
      } else {
        throw new Error("No output");
      }
    } catch (error) {
      console.error("API Call Failed:", error);
      setIsLoading(false);
      const fallback = lang === 'zh' 
        ? "抱歉，分析連線出現了技術障礙。請您重新發送一次，讓我能完整接收您的話語。" 
        : "Apologies, the analytical connection encountered a technical rupture. Please try sending again.";
      setMessages(prev => [...prev, { role: Role.MODEL, content: fallback }]);
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
    <div className="flex flex-col h-[95vh] w-full max-w-6xl bg-white rounded-[3rem] shadow-[0_60px_120px_-30px_rgba(0,0,0,0.3)] border-4 border-stone-200 overflow-hidden relative">
      <header className="px-12 py-8 border-b-2 border-stone-100 bg-stone-50/50 flex flex-col items-center">
        <h1 className="text-5xl font-script font-bold text-rose-600">I'll understand you</h1>
        <p className="text-stone-700 text-[0.85rem] font-black tracking-[0.7em] uppercase mt-3">Depth Analytic Frame</p>
      </header>

      <main className="flex-1 px-8 md:px-24 py-12 overflow-y-auto white-scrollbar bg-[#fdfdfd]">
        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-stone-300 space-y-8">
            <div className="w-24 h-24 rounded-full border-4 border-stone-100 flex items-center justify-center italic text-5xl font-script">ψ</div>
            <p className="text-3xl italic font-script text-center max-w-lg">"Freedom of speech is the key to the unconscious."</p>
            <p className="text-[0.8rem] tracking-[0.6em] uppercase font-black opacity-40">Uncensored / 開始傾訴</p>
          </div>
        )}
        {messages.map((msg, i) => <ChatMessage key={i} message={msg} />)}
        {isLoading && (
          <div className="flex justify-start mb-12">
            <div className="px-12 py-7 rounded-[2.5rem] bg-white border-2 border-rose-50 flex space-x-5 items-center shadow-2xl">
              <span className="w-3 h-3 bg-rose-500 rounded-full animate-bounce"></span>
              <span className="w-3 h-3 bg-rose-500 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
              <span className="w-3 h-3 bg-rose-500 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </main>

      <footer className="p-10 md:px-24 md:pb-16 bg-white border-t-4 border-stone-100">
        {(selectedImage || recordedAudio) && (
          <div className="mb-10 flex gap-8 animate-in slide-in-from-bottom-8 duration-400">
            {selectedImage && (
              <div className="relative">
                <div className="h-40 w-40 overflow-hidden rounded-3xl border-4 border-stone-900 shadow-2xl">
                  <img src={`data:${selectedImage.mimeType};base64,${selectedImage.data}`} className="h-full w-full object-cover" alt="Selected" />
                </div>
                <button onClick={() => setSelectedImage(null)} className="absolute -top-4 -right-4 bg-stone-900 text-white rounded-full p-3 shadow-2xl hover:bg-rose-600 transition-all active:scale-90">
                  <XIcon className="h-6 w-6" />
                </button>
              </div>
            )}
            {recordedAudio && (
              <div className="relative flex items-center bg-stone-900 text-white px-12 py-7 rounded-3xl shadow-2xl border-4 border-stone-800">
                <MicIcon className="h-10 w-10 mr-6 text-rose-500" />
                <span className="text-lg font-black uppercase tracking-widest">DRIVE CAPTURED</span>
                <button onClick={() => setRecordedAudio(null)} className="absolute -top-4 -right-4 bg-white text-stone-900 rounded-full p-3 shadow-2xl border-2 border-stone-900 hover:bg-rose-600 hover:text-white transition-all active:scale-90">
                  <XIcon className="h-6 w-6" />
                </button>
              </div>
            )}
          </div>
        )}

        <div className="flex flex-col md:flex-row items-stretch md:items-end gap-8">
          <div className="flex md:flex-col gap-5">
            <label className="cursor-pointer bg-stone-900 p-6 rounded-3xl text-white hover:bg-rose-600 shadow-2xl transition-all active:scale-90 flex items-center justify-center border-4 border-stone-800">
              <PaperclipIcon className="h-10 w-10" />
              <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
            </label>
            <button 
              onMouseDown={startRecording} onMouseUp={stopRecording}
              onTouchStart={startRecording} onTouchEnd={stopRecording}
              className={`p-6 rounded-3xl transition-all active:scale-90 flex items-center justify-center shadow-2xl border-4 ${isRecording ? 'bg-rose-600 text-white border-rose-700 ring-[12px] ring-rose-100' : 'bg-stone-900 text-white border-stone-800 hover:bg-rose-600'}`}
            >
              <MicIcon className="h-10 w-10" />
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
              placeholder="Speak from the Id... (Ctrl+Enter)"
              className="w-full pl-10 pr-28 py-8 bg-stone-50 text-stone-900 border-4 border-stone-200 rounded-[3rem] resize-none focus:outline-none focus:border-rose-500 focus:bg-white transition-all shadow-inner text-[1.3rem] leading-relaxed max-h-80 overflow-y-auto white-scrollbar font-medium"
              rows={1}
            />
            <button 
              onClick={handleSend}
              disabled={!canSend}
              className={`absolute right-5 bottom-5 h-20 w-20 flex items-center justify-center rounded-[2rem] transition-all shadow-2xl z-10 ${canSend ? 'bg-stone-900 text-white hover:bg-rose-600 hover:scale-105 active:scale-95 border-4 border-stone-800' : 'bg-stone-200 text-stone-400 cursor-not-allowed'}`}
            >
              <SendIcon className="h-10 w-10" />
            </button>
          </div>
        </div>
        
        <div className="mt-10 flex flex-col md:flex-row justify-between items-center px-10 gap-4 opacity-70 text-[0.9rem] font-black uppercase tracking-[0.4em] text-stone-900">
           <div className="flex items-center gap-4">
             <div className="w-3 h-3 rounded-full bg-rose-500"></div>
             <span>Hold to Speak</span>
           </div>
           <div className="flex items-center gap-4">
             <div className="w-3 h-3 rounded-full bg-stone-900"></div>
             <span>Ctrl + Enter to Analysis</span>
           </div>
        </div>
      </footer>
    </div>
  );
};

export default ChatInterface;
