import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI, HarmCategory, HarmBlockThreshold, type Content, type Part } from '@google/genai';
import { KENYU_SYSTEM_INSTRUCTION } from '../constants.ts';
import { Role, type Message } from '../types.ts';

// --- Sharp, High-Contrast Icons ---
const SendIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
  </svg>
);

const PaperclipIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
  </svg>
);

const MicIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
    <line x1="12" y1="19" x2="12" y2="23" />
    <line x1="8" y1="23" x2="16" y2="23" />
  </svg>
);

const XIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

const ChatMessage: React.FC<{ message: Message }> = ({ message }) => {
  const isUser = message.role === Role.USER;
  return (
    <div className={`flex w-full mb-8 ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[90%] md:max-w-[80%] px-6 py-4 rounded-3xl shadow-lg border ${
        isUser 
          ? 'bg-rose-600 text-white border-rose-700 rounded-br-none' 
          : 'bg-white text-stone-900 border-stone-200 rounded-bl-none'
      }`}>
        <p className="whitespace-pre-wrap leading-relaxed text-[1.1rem] font-medium">{message.content}</p>
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
    } catch (err) { alert("Mic required / 需要麥克風權限"); }
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

    const displayContent = trimmed || (selectedImage ? "[Image provided]" : "[Voice shared]");
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
      // Fix: Created a new instance here to ensure it uses the latest configured API key.
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const contents = [...historyRef.current, { role: 'user', parts: currentParts }];

      // Fix: Used HarmCategory and HarmBlockThreshold enums to resolve TypeScript literal errors.
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
        // Fix: Use property access for .text as per guidelines.
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
        throw new Error("No response content");
      }
    } catch (error) {
      console.error(error);
      setIsLoading(false);
      // Therapeutic error handling - make it part of the session
      const fallbackMsg = lang === 'zh' 
        ? "我在您的言論中感受到了巨大的衝擊，這股力量似乎暫時遮蔽了我的視線。請再對我傾訴一次，讓我們一起看清這股憤怒或防衛。" 
        : "I feel a profound intensity in your words, a force that momentarily clouded my interpretation. Please, speak to me again so we can explore this depth together.";
      setMessages(prev => [...prev, { role: Role.MODEL, content: fallbackMsg }]);
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
    <div className="flex flex-col h-[95vh] w-full max-w-5xl bg-white rounded-3xl shadow-2xl border border-stone-200 overflow-hidden">
      <header className="px-8 py-6 border-b-2 border-rose-50 bg-stone-50 flex flex-col items-center">
        <h1 className="text-4xl font-script font-bold text-rose-600">I'll understand you</h1>
        <p className="text-stone-500 text-[0.8rem] font-bold tracking-[0.4em] uppercase mt-1">Psychoanalytic Encounter</p>
      </header>

      <main className="flex-1 px-4 md:px-12 py-10 overflow-y-auto white-scrollbar bg-stone-50/20">
        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-stone-400 space-y-4">
            <div className="w-20 h-20 rounded-full border-4 border-stone-200 flex items-center justify-center italic text-4xl font-script">ψ</div>
            <p className="text-2xl italic font-script">"Every silence tells a story."</p>
            <p className="text-[0.7rem] tracking-widest font-black uppercase opacity-60">Speak your mind / 開始傾訴</p>
          </div>
        )}
        {messages.map((msg, i) => <ChatMessage key={i} message={msg} />)}
        {isLoading && (
          <div className="flex justify-start mb-6">
            <div className="px-8 py-5 rounded-3xl bg-white border border-stone-200 flex space-x-3 items-center shadow-md">
              <span className="w-2.5 h-2.5 bg-rose-500 rounded-full animate-bounce"></span>
              <span className="w-2.5 h-2.5 bg-rose-500 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
              <span className="w-2.5 h-2.5 bg-rose-500 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </main>

      <footer className="p-6 md:px-12 md:pb-12 bg-white border-t-2 border-stone-100 shadow-[0_-10px_40px_rgba(0,0,0,0.03)]">
        {(selectedImage || recordedAudio) && (
          <div className="mb-6 flex gap-6 animate-in slide-in-from-bottom-2">
            {selectedImage && (
              <div className="relative">
                <div className="h-28 w-28 overflow-hidden rounded-2xl border-4 border-rose-100 shadow-xl">
                  <img src={`data:${selectedImage.mimeType};base64,${selectedImage.data}`} className="h-full w-full object-cover" alt="Selected" />
                </div>
                <button onClick={() => setSelectedImage(null)} className="absolute -top-3 -right-3 bg-stone-900 text-white rounded-full p-2 shadow-2xl hover:bg-rose-600 transition-colors">
                  <XIcon className="h-4 w-4" />
                </button>
              </div>
            )}
            {recordedAudio && (
              <div className="relative flex items-center bg-rose-600 text-white px-8 py-4 rounded-2xl shadow-xl animate-pulse">
                <MicIcon className="h-6 w-6 mr-4" />
                <span className="text-sm font-black uppercase tracking-tighter">Audio Captured</span>
                <button onClick={() => setRecordedAudio(null)} className="absolute -top-3 -right-3 bg-stone-900 text-white rounded-full p-2 shadow-2xl hover:bg-rose-600 transition-colors">
                  <XIcon className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>
        )}

        <div className="flex flex-col md:flex-row items-stretch md:items-end gap-6">
          <div className="flex md:flex-col gap-4">
            <label className="flex-1 md:flex-none cursor-pointer bg-stone-100 p-5 rounded-2xl border-2 border-stone-200 text-stone-800 hover:bg-stone-200 transition-all active:scale-95 flex items-center justify-center">
              <PaperclipIcon className="h-7 w-7" />
              <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
            </label>
            <button 
              onMouseDown={startRecording} onMouseUp={stopRecording}
              onTouchStart={startRecording} onTouchEnd={stopRecording}
              className={`flex-1 md:flex-none p-5 rounded-2xl border-2 transition-all active:scale-95 flex items-center justify-center ${isRecording ? 'bg-rose-600 text-white border-rose-700 ring-8 ring-rose-100' : 'bg-stone-100 text-stone-800 border-stone-200 hover:bg-stone-200'}`}
            >
              <MicIcon className="h-7 w-7" />
            </button>
          </div>

          <div className="relative flex-1 flex items-center">
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
              className="w-full pl-8 pr-20 py-6 bg-stone-50 text-stone-900 border-2 border-stone-200 rounded-3xl resize-none focus:outline-none focus:border-rose-400 focus:bg-white transition-all shadow-inner text-[1.15rem] leading-relaxed max-h-60 overflow-y-auto white-scrollbar"
              rows={1}
            />
            <button 
              onClick={handleSend}
              disabled={!canSend}
              className={`absolute right-4 bottom-4 h-14 w-14 flex items-center justify-center rounded-2xl transition-all shadow-xl z-10 ${canSend ? 'bg-rose-600 text-white hover:bg-rose-700 hover:scale-105 active:scale-95' : 'bg-stone-200 text-stone-400 cursor-not-allowed'}`}
            >
              <SendIcon className="h-7 w-7" />
            </button>
          </div>
        </div>
        
        <div className="mt-6 flex flex-col md:flex-row justify-between items-center px-4 gap-2 opacity-60 text-[0.75rem] font-black uppercase tracking-[0.2em] text-stone-500">
           <div className="flex items-center gap-2">
             <div className="w-2 h-2 rounded-full bg-rose-500"></div>
             <span>Hold Mic to record</span>
           </div>
           <div className="flex items-center gap-2">
             <div className="w-2 h-2 rounded-full bg-stone-400"></div>
             <span>Ctrl + Enter to send</span>
           </div>
        </div>
      </footer>
    </div>
  );
};

export default ChatInterface;