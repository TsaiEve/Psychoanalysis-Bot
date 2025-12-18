
import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI, type Content, type Part } from '@google/genai';
import { KENYU_SYSTEM_INSTRUCTION } from '../constants.ts';
import { Role, type Message } from '../types.ts';

// --- Icons (Enhanced Contrast) ---
const SendIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="22" y1="2" x2="11" y2="13"></line>
    <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
  </svg>
);

const PaperclipIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path>
  </svg>
);

const MicIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
    <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
    <line x1="12" y1="19" x2="12" y2="23"></line>
    <line x1="8" y1="23" x2="16" y2="23"></line>
  </svg>
);

const XIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18"></line>
    <line x1="6" y1="6" x2="18" y2="18"></line>
  </svg>
);

const ChatMessage: React.FC<{ message: Message }> = ({ message }) => {
  const isUser = message.role === Role.USER;
  return (
    <div className={`flex w-full mb-4 ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[85%] lg:max-w-[75%] px-6 py-4 rounded-[1.8rem] shadow-md transition-all duration-300 animate-in fade-in slide-in-from-bottom-2 ${
        isUser 
          ? 'bg-rose-500 text-white rounded-br-none' 
          : 'bg-white text-stone-800 rounded-bl-none border border-rose-100'
      }`}>
        <p className="whitespace-pre-wrap leading-relaxed text-[1rem] md:text-[1.05rem]">{message.content}</p>
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
  const [lastInputLang, setLastInputLang] = useState<'zh' | 'en'>('zh');
  
  const historyRef = useRef<Content[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  const detectLanguage = (text: string) => {
    return /[\u4e00-\u9fa5]/.test(text) ? 'zh' : 'en';
  };

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
      } catch (err) {
        console.error("Image upload error:", err);
      }
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
    } catch (err) { 
      console.error("Mic error:", err);
      alert("Microphone permission denied.");
    }
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
    const lang = detectLanguage(trimmed || "");
    if (trimmed) setLastInputLang(lang);

    const displayContent = trimmed || (selectedImage ? "[分享了影像]" : "[分享了語音]");
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
        config: { systemInstruction: KENYU_SYSTEM_INSTRUCTION }
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

      historyRef.current = [...contents, { role: 'model', parts: [{ text: fullText }] }];
    } catch (error) {
      console.error("API error:", error);
      setIsLoading(false);
      const errorMsg = (trimmed ? lang : lastInputLang) === 'zh' 
        ? "抱歉，我的思緒目前受到了干擾，請再對我說一次。" 
        : "I apologize, my stream of thought was interrupted. Please tell me that again.";
      setMessages(prev => [...prev, { role: Role.MODEL, content: errorMsg }]);
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
    <div className="flex flex-col h-[92vh] w-full max-w-4xl bg-white/70 backdrop-blur-3xl rounded-[2.5rem] shadow-2xl border border-white/80 overflow-hidden relative">
      <header className="px-8 py-6 text-center border-b border-rose-100/50 bg-white/40">
        <h1 className="text-3xl font-script font-bold text-rose-600 tracking-wide">I'll understand you</h1>
        <p className="text-stone-500 text-[0.65rem] mt-1 font-black tracking-[0.4em] uppercase opacity-70">Psychoanalytic Space</p>
      </header>

      <main className="flex-1 px-4 md:px-12 py-6 overflow-y-auto white-scrollbar">
        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-stone-400 space-y-4">
            <div className="w-12 h-12 rounded-full border-2 border-stone-200 flex items-center justify-center italic text-xl font-script opacity-60">ψ</div>
            <p className="text-lg italic font-script text-center max-w-xs">"Thoughts seek a path to be heard."</p>
            <p className="text-[0.65rem] tracking-[0.3em] uppercase font-bold opacity-50">Speak freely / 開始傾訴</p>
          </div>
        )}
        {messages.map((msg, i) => <ChatMessage key={i} message={msg} />)}
        {isLoading && (
          <div className="flex justify-start mb-4">
            <div className="px-6 py-4 rounded-[1.8rem] bg-white border border-rose-50 flex space-x-2 items-center shadow-sm">
              <span className="w-1.5 h-1.5 bg-rose-400 rounded-full animate-bounce"></span>
              <span className="w-1.5 h-1.5 bg-rose-400 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
              <span className="w-1.5 h-1.5 bg-rose-400 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </main>

      <footer className="p-6 md:px-12 md:pb-10 bg-white/50 border-t border-rose-50">
        {(selectedImage || recordedAudio) && (
          <div className="mb-4 flex gap-4 animate-in slide-in-from-bottom-2">
            {selectedImage && (
              <div className="relative">
                <div className="h-20 w-20 overflow-hidden rounded-xl border-2 border-white shadow-lg">
                  <img src={`data:${selectedImage.mimeType};base64,${selectedImage.data}`} className="h-full w-full object-cover" alt="Selected" />
                </div>
                <button onClick={() => setSelectedImage(null)} className="absolute -top-2 -right-2 bg-rose-600 text-white rounded-full p-1 shadow-md hover:bg-rose-700">
                  <XIcon className="h-3 w-3" />
                </button>
              </div>
            )}
            {recordedAudio && (
              <div className="relative flex items-center bg-rose-50 px-5 py-3 rounded-xl border border-rose-100 shadow-md">
                <MicIcon className="h-4 w-4 text-rose-600 mr-3" />
                <span className="text-xs text-rose-800 font-bold uppercase tracking-wider">Audio Captured</span>
                <button onClick={() => setRecordedAudio(null)} className="absolute -top-2 -right-2 bg-rose-600 text-white rounded-full p-1 shadow-md hover:bg-rose-700">
                  <XIcon className="h-3 w-3" />
                </button>
              </div>
            )}
          </div>
        )}

        <div className="flex items-end gap-3 md:gap-4">
          <div className="flex flex-col gap-3">
            <label className="cursor-pointer bg-white p-3.5 rounded-full border border-rose-200 text-rose-500 hover:bg-rose-50 hover:text-rose-600 shadow-sm transition-all active:scale-90" title="Attach image">
              <PaperclipIcon className="h-5 w-5" />
              <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
            </label>
            <button 
              onMouseDown={startRecording} onMouseUp={stopRecording}
              onTouchStart={startRecording} onTouchEnd={stopRecording}
              className={`p-3.5 rounded-full border shadow-sm transition-all active:scale-90 ${isRecording ? 'bg-rose-600 text-white ring-4 ring-rose-100 border-rose-600' : 'bg-white text-rose-500 border-rose-200 hover:bg-rose-50'}`}
              title="Hold to record"
            >
              <MicIcon className="h-5 w-5" />
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
              placeholder="What comes to mind? (Ctrl+Enter to send)"
              className="w-full pl-6 pr-14 py-4 bg-white text-stone-800 border-2 border-rose-100 rounded-[2rem] resize-none focus:outline-none focus:border-rose-300 transition-all shadow-sm max-h-40 overflow-y-auto white-scrollbar text-[1rem]"
              rows={1}
            />
            <button 
              onClick={handleSend}
              disabled={!canSend}
              className={`absolute right-2 bottom-2 h-11 w-11 flex items-center justify-center rounded-full transition-all ${canSend ? 'bg-rose-500 text-white shadow-lg hover:bg-rose-600 active:scale-90' : 'bg-stone-100 text-stone-300 cursor-not-allowed opacity-50'}`}
            >
              <SendIcon className="h-5 w-5" />
            </button>
          </div>
        </div>
        
        <div className="mt-4 flex justify-between items-center px-4 opacity-40 text-[0.65rem] font-bold uppercase tracking-widest text-stone-500">
           <span>Hold mic to record</span>
           <span>Ctrl + Enter to send</span>
        </div>
      </footer>
    </div>
  );
};

export default ChatInterface;
