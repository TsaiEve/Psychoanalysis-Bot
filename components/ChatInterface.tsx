
import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI, HarmCategory, HarmBlockThreshold, type Content, type Part } from '@google/genai';
import { KENYU_SYSTEM_INSTRUCTION } from '../constants.ts';
import { Role, type Message } from '../types.ts';

// --- Ultra High-Contrast Bold Icons (Pure Black) ---
const SendIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="#000000" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
  </svg>
);

const PaperclipIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="#000000" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
  </svg>
);

const MicIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="#000000" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
    <line x1="12" y1="19" x2="12" y2="23" />
    <line x1="8" y1="23" x2="16" y2="23" />
  </svg>
);

const XIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="#000000" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

const ChatMessage: React.FC<{ message: Message }> = ({ message }) => {
  const isUser = message.role === Role.USER;
  return (
    <div className={`flex w-full mb-10 ${isUser ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-4 duration-200`}>
      <div className={`max-w-[85%] md:max-w-[70%] px-8 py-6 rounded-[2.5rem] shadow-2xl border-2 ${
        isUser 
          ? 'bg-[#e11d48] text-white border-[#be123c] rounded-br-none' 
          : 'bg-white text-black border-stone-200 rounded-bl-none'
      }`}>
        <p className="whitespace-pre-wrap leading-relaxed text-[1.2rem] font-bold">{message.content}</p>
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

    const displayContent = trimmed || (selectedImage ? "[Image]" : "[Voice]");
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
        throw new Error("Empty AI Response");
      }
    } catch (error) {
      console.error("Critical Analysis Error:", error);
      setIsLoading(false);
      // 修復：不再「通靈」說用戶生氣，改為誠實的連線錯誤訊息
      const errorText = lang === 'zh' 
        ? "抱歉，連線發生了技術故障。這可能阻礙了我們對潛意識的深入觀察，請您再試一次。" 
        : "The analytical channel has been interrupted by a technical error. Please try repeating yourself.";
      setMessages(prev => [...prev, { role: Role.MODEL, content: errorText }]);
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
    <div className="flex flex-col h-[94vh] w-full max-w-6xl bg-white rounded-[2rem] shadow-[0_80px_160px_-40px_rgba(0,0,0,0.4)] border-[6px] border-stone-100 overflow-hidden relative">
      <header className="px-12 py-8 border-b-4 border-stone-50 bg-[#fffafa] flex flex-col items-center">
        <h1 className="text-6xl font-script font-bold text-[#e11d48]">I'll understand you</h1>
        <p className="text-black text-[0.9rem] font-black tracking-[0.8em] uppercase mt-4">Psychotherapy Frame</p>
      </header>

      <main className="flex-1 px-8 md:px-24 py-14 overflow-y-auto white-scrollbar bg-[#fafafa]">
        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-stone-300 space-y-10">
            <div className="w-32 h-32 rounded-full border-8 border-stone-100 flex items-center justify-center italic text-7xl font-script">ψ</div>
            <p className="text-4xl italic font-script text-center max-w-xl text-black">"What comes to your mind?"</p>
            <p className="text-[1rem] tracking-[1em] uppercase font-black text-stone-400">Speak everything / 開始傾訴</p>
          </div>
        )}
        {messages.map((msg, i) => <ChatMessage key={i} message={msg} />)}
        {isLoading && (
          <div className="flex justify-start mb-14">
            <div className="px-14 py-8 rounded-[3rem] bg-white border-4 border-[#fff1f2] flex space-x-6 items-center shadow-2xl">
              <span className="w-4 h-4 bg-[#e11d48] rounded-full animate-bounce"></span>
              <span className="w-4 h-4 bg-[#e11d48] rounded-full animate-bounce [animation-delay:-0.15s]"></span>
              <span className="w-4 h-4 bg-[#e11d48] rounded-full animate-bounce [animation-delay:-0.3s]"></span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </main>

      <footer className="p-12 md:px-24 md:pb-20 bg-white border-t-[6px] border-stone-50">
        {(selectedImage || recordedAudio) && (
          <div className="mb-12 flex gap-10 animate-in slide-in-from-bottom-10 duration-500">
            {selectedImage && (
              <div className="relative">
                <div className="h-48 w-48 overflow-hidden rounded-[2rem] border-8 border-black shadow-2xl">
                  <img src={`data:${selectedImage.mimeType};base64,${selectedImage.data}`} className="h-full w-full object-cover" alt="Selected" />
                </div>
                <button onClick={() => setSelectedImage(null)} className="absolute -top-6 -right-6 bg-black text-white rounded-full p-4 shadow-2xl hover:bg-rose-600 transition-all active:scale-90">
                  <XIcon className="h-8 w-8" />
                </button>
              </div>
            )}
            {recordedAudio && (
              <div className="relative flex items-center bg-black text-white px-14 py-8 rounded-[2rem] shadow-2xl border-4 border-stone-800 animate-pulse">
                <MicIcon className="h-12 w-12 mr-8 text-rose-500" />
                <span className="text-xl font-black uppercase tracking-[0.2em]">VOICE CAPTURED</span>
                <button onClick={() => setRecordedAudio(null)} className="absolute -top-6 -right-6 bg-white text-black rounded-full p-4 shadow-2xl border-4 border-black hover:bg-rose-600 hover:text-white transition-all active:scale-90">
                  <XIcon className="h-8 w-8" />
                </button>
              </div>
            )}
          </div>
        )}

        <div className="flex flex-col md:flex-row items-stretch md:items-end gap-10">
          <div className="flex md:flex-col gap-6">
            <label className="cursor-pointer bg-white p-7 rounded-[2rem] text-black border-4 border-black hover:bg-black hover:text-white shadow-xl transition-all active:scale-90 flex items-center justify-center">
              <PaperclipIcon className="h-12 w-12" />
              <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
            </label>
            <button 
              onMouseDown={startRecording} onMouseUp={stopRecording}
              onTouchStart={startRecording} onTouchEnd={stopRecording}
              className={`p-7 rounded-[2rem] transition-all active:scale-90 flex items-center justify-center shadow-xl border-4 ${isRecording ? 'bg-rose-600 text-white border-rose-900 ring-[16px] ring-rose-100' : 'bg-white text-black border-black hover:bg-black hover:text-white'}`}
            >
              <MicIcon className="h-12 w-12" />
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
              placeholder="Speak from the unconscious..."
              className="w-full pl-12 pr-32 py-10 bg-stone-50 text-black border-4 border-stone-200 rounded-[3.5rem] resize-none focus:outline-none focus:border-black focus:bg-white transition-all shadow-inner text-[1.5rem] leading-relaxed max-h-[400px] overflow-y-auto white-scrollbar font-bold"
              rows={1}
            />
            <button 
              onClick={handleSend}
              disabled={!canSend}
              className={`absolute right-6 bottom-6 h-24 w-24 flex items-center justify-center rounded-[2.5rem] transition-all shadow-2xl z-10 ${canSend ? 'bg-black text-white hover:bg-rose-600 hover:scale-105 active:scale-95 border-4 border-stone-800' : 'bg-stone-100 text-stone-300 cursor-not-allowed border-4 border-stone-200'}`}
            >
              <SendIcon className="h-12 w-12" />
            </button>
          </div>
        </div>
        
        <div className="mt-12 flex flex-col md:flex-row justify-between items-center px-12 gap-6 opacity-100 text-[1rem] font-black uppercase tracking-[0.5em] text-black">
           <div className="flex items-center gap-6">
             <div className="w-4 h-4 rounded-full bg-rose-600"></div>
             <span>Hold Mic to Record</span>
           </div>
           <div className="flex items-center gap-6">
             <div className="w-4 h-4 rounded-full bg-black"></div>
             <span>Ctrl + Enter to Send</span>
           </div>
        </div>
      </footer>
    </div>
  );
};

export default ChatInterface;
