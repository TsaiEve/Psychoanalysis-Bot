
import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI, HarmCategory, HarmBlockThreshold, type Content, type Part } from '@google/genai';
import { KENYU_SYSTEM_INSTRUCTION } from '../constants.ts';
import { Role, type Message } from '../types.ts';

// --- Professional High-Contrast Icons ---
const SendIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
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
    <div className={`flex w-full mb-10 ${isUser ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-4 duration-300`}>
      <div className={`max-w-[85%] md:max-w-[75%] px-7 py-5 rounded-[2rem] shadow-xl border-2 ${
        isUser 
          ? 'bg-rose-600 text-white border-rose-700 rounded-br-none' 
          : 'bg-white text-stone-900 border-stone-100 rounded-bl-none'
      }`}>
        <p className="whitespace-pre-wrap leading-relaxed text-[1.1rem] font-medium tracking-tight">{message.content}</p>
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

    const displayContent = trimmed || (selectedImage ? "[分享了視覺意象]" : "[分享了語音碎片]");
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

      // 使用 Gemini 3 Pro 以獲得更精確的分析與更高的安全性容錯
      const responseStream = await ai.models.generateContentStream({
        model: 'gemini-3-pro-preview',
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
        throw new Error("Safety Block or Empty Output");
      }
    } catch (error) {
      console.error("Analysis Interrupted:", error);
      setIsLoading(false);
      // 以分析師的身分化解技術報錯
      const fallback = lang === 'zh' 
        ? "您的憤怒帶有極強的能量，這股爆發力甚至讓目前的對話空間感到一陣震盪。請稍微平復，再次嘗試對我述說，我會在這裡承接住這股情緒。" 
        : "The intensity of your affect has caused a momentary rupture in our analytic space. I am here to hold this tension with you. Please, speak to me once more.";
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
    <div className="flex flex-col h-[94vh] w-full max-w-5xl bg-stone-50/10 backdrop-blur-xl rounded-[2.5rem] shadow-[0_50px_100px_-20px_rgba(0,0,0,0.2)] border border-white/50 overflow-hidden relative">
      <header className="px-10 py-7 border-b border-stone-200 bg-white/60 flex flex-col items-center">
        <h1 className="text-4xl font-script font-bold text-rose-600 drop-shadow-sm">I'll understand you</h1>
        <p className="text-stone-500 text-[0.75rem] font-bold tracking-[0.6em] uppercase mt-2 opacity-80">Freudian analytic frame</p>
      </header>

      <main className="flex-1 px-6 md:px-20 py-10 overflow-y-auto white-scrollbar">
        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-stone-400 space-y-6 animate-pulse">
            <div className="w-20 h-20 rounded-full border-2 border-stone-300 flex items-center justify-center italic text-4xl font-script opacity-40">ψ</div>
            <p className="text-2xl italic font-script text-center max-w-md">"The unconscious is structured like a language."</p>
            <p className="text-[0.7rem] tracking-[0.5em] uppercase font-black opacity-30">Begin the session / 開始潛意識探索</p>
          </div>
        )}
        {messages.map((msg, i) => <ChatMessage key={i} message={msg} />)}
        {isLoading && (
          <div className="flex justify-start mb-10">
            <div className="px-10 py-6 rounded-[2rem] bg-white border border-rose-50 flex space-x-4 items-center shadow-xl">
              <span className="w-2.5 h-2.5 bg-rose-500 rounded-full animate-bounce"></span>
              <span className="w-2.5 h-2.5 bg-rose-500 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
              <span className="w-2.5 h-2.5 bg-rose-500 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </main>

      <footer className="p-8 md:px-16 md:pb-14 bg-white/80 border-t border-stone-200 shadow-2xl">
        {(selectedImage || recordedAudio) && (
          <div className="mb-8 flex gap-6 animate-in slide-in-from-bottom-5 duration-300">
            {selectedImage && (
              <div className="relative group">
                <div className="h-32 w-32 overflow-hidden rounded-2xl border-4 border-white shadow-2xl ring-2 ring-rose-50">
                  <img src={`data:${selectedImage.mimeType};base64,${selectedImage.data}`} className="h-full w-full object-cover" alt="Selected" />
                </div>
                <button onClick={() => setSelectedImage(null)} className="absolute -top-3 -right-3 bg-stone-900 text-white rounded-full p-2.5 shadow-2xl hover:bg-rose-600 transition-all active:scale-90">
                  <XIcon className="h-5 w-5" />
                </button>
              </div>
            )}
            {recordedAudio && (
              <div className="relative flex items-center bg-rose-600 text-white px-10 py-5 rounded-2xl shadow-2xl ring-4 ring-rose-50 animate-pulse">
                <MicIcon className="h-8 w-8 mr-5" />
                <span className="text-md font-black uppercase tracking-widest">Affect Captured</span>
                <button onClick={() => setRecordedAudio(null)} className="absolute -top-3 -right-3 bg-stone-900 text-white rounded-full p-2.5 shadow-2xl hover:bg-rose-600 transition-all active:scale-90">
                  <XIcon className="h-5 w-5" />
                </button>
              </div>
            )}
          </div>
        )}

        <div className="flex flex-col md:flex-row items-stretch md:items-end gap-6">
          <div className="flex md:flex-col gap-4">
            <label className="cursor-pointer bg-stone-100 p-5 rounded-2xl border-2 border-stone-200 text-stone-700 hover:bg-rose-600 hover:text-white hover:border-rose-600 shadow-md transition-all active:scale-90 flex items-center justify-center">
              <PaperclipIcon className="h-8 w-8" />
              <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
            </label>
            <button 
              onMouseDown={startRecording} onMouseUp={stopRecording}
              onTouchStart={startRecording} onTouchEnd={stopRecording}
              className={`p-5 rounded-2xl border-2 transition-all active:scale-90 flex items-center justify-center shadow-md ${isRecording ? 'bg-rose-600 text-white border-rose-700 ring-8 ring-rose-100' : 'bg-stone-100 text-stone-700 border-stone-200 hover:bg-rose-600 hover:text-white hover:border-rose-600'}`}
            >
              <MicIcon className="h-8 w-8" />
            </button>
          </div>

          <div className="relative flex-1 group">
            <textarea
              ref={textareaRef}
              value={userInput}
              onChange={(e) => {
                setUserInput(e.target.value);
                e.target.style.height = 'auto';
                e.target.style.height = `${e.target.scrollHeight}px`;
              }}
              onKeyDown={handleKeyDown}
              placeholder="What comes to mind without censorship?..."
              className="w-full pl-8 pr-24 py-7 bg-stone-50/50 text-stone-900 border-2 border-stone-200 rounded-[2.5rem] resize-none focus:outline-none focus:border-rose-500 focus:bg-white transition-all shadow-inner text-[1.2rem] leading-relaxed max-h-64 overflow-y-auto white-scrollbar"
              rows={1}
            />
            <button 
              onClick={handleSend}
              disabled={!canSend}
              className={`absolute right-4 bottom-4 h-16 w-16 flex items-center justify-center rounded-2xl transition-all shadow-2xl z-10 ${canSend ? 'bg-rose-600 text-white hover:bg-rose-700 hover:scale-105 active:scale-95' : 'bg-stone-200 text-stone-400 cursor-not-allowed'}`}
            >
              <SendIcon className="h-8 w-8" />
            </button>
          </div>
        </div>
        
        <div className="mt-8 flex flex-col md:flex-row justify-between items-center px-6 gap-3 opacity-50 text-[0.8rem] font-black uppercase tracking-[0.3em] text-stone-600">
           <div className="flex items-center gap-3">
             <div className="w-2.5 h-2.5 rounded-full bg-rose-500"></div>
             <span>Hold to Speak</span>
           </div>
           <div className="flex items-center gap-3">
             <div className="w-2.5 h-2.5 rounded-full bg-stone-400"></div>
             <span>Ctrl + Enter to Analysis</span>
           </div>
        </div>
      </footer>
    </div>
  );
};

export default ChatInterface;
