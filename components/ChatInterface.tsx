
import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI } from '@google/genai';
import { KENYU_SYSTEM_INSTRUCTION } from '../constants.ts';
import { Role, type Message } from '../types.ts';

// --- Icons ---
const SendIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="22" y1="2" x2="11" y2="13"></line>
    <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
  </svg>
);

const PaperclipIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path>
  </svg>
);

const MicIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
    <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
    <line x1="12" y1="19" x2="12" y2="23"></line>
    <line x1="8" y1="23" x2="16" y2="23"></line>
  </svg>
);

const XIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18"></line>
    <line x1="6" y1="6" x2="18" y2="18"></line>
  </svg>
);

// --- Components ---
const ChatMessage: React.FC<{ message: Message }> = ({ message }) => {
  const isUser = message.role === Role.USER;
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-2 duration-500`}>
      <div className={`max-w-[85%] lg:max-w-lg px-6 py-4 rounded-[2rem] shadow-sm ${isUser ? 'bg-rose-500 text-white rounded-br-none' : 'bg-white/95 text-stone-800 rounded-bl-none border border-rose-100/50 backdrop-blur-sm'}`}>
        <p className="whitespace-pre-wrap leading-relaxed text-[1.05rem]">{message.content}</p>
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
  
  const historyRef = useRef<any[]>([]);
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
      } catch (err) {
        console.error("Image error:", err);
      }
    }
    e.target.value = ''; // Reset for re-selection
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
      console.error("Mic access error:", err);
      alert("無法啟動麥克風，請檢查權限設定。");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const handleSend = async () => {
    const trimmedInput = userInput.trim();
    const hasImage = !!selectedImage;
    const hasAudio = !!recordedAudio;

    if (isLoading || (!trimmedInput && !hasImage && !hasAudio)) return;

    setIsLoading(true);

    // 介面立即顯示用戶訊息
    const displayMsg = trimmedInput || (hasImage ? "[Image shared]" : "[Voice note shared]");
    setMessages(prev => [...prev, { role: Role.USER, content: displayMsg }]);

    // 準備發送給 Gemini 的零件
    const parts: any[] = [];
    if (trimmedInput) parts.push({ text: trimmedInput });
    if (selectedImage) parts.push({ inlineData: { data: selectedImage.data, mimeType: selectedImage.mimeType } });
    if (recordedAudio) parts.push({ inlineData: { data: recordedAudio.data, mimeType: recordedAudio.mimeType } });

    // 暫存並清空輸入狀態
    const currentParts = [...parts];
    setUserInput('');
    setSelectedImage(null);
    setRecordedAudio(null);
    if (textareaRef.current) textareaRef.current.style.height = 'auto';

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
      
      const contents = [
        ...historyRef.current,
        { role: 'user', parts: currentParts }
      ];

      const responseStream = await ai.models.generateContentStream({
        model: 'gemini-3-flash-preview',
        contents: contents,
        config: {
          systemInstruction: KENYU_SYSTEM_INSTRUCTION
        }
      });

      let fullText = '';
      let isFirst = true;

      for await (const chunk of responseStream) {
        const chunkText = chunk.text || "";
        fullText += chunkText;
        
        if (isFirst) {
          setIsLoading(false);
          isFirst = false;
          setMessages(prev => [...prev, { role: Role.MODEL, content: fullText }]);
        } else {
          setMessages(prev => {
            const next = [...prev];
            const lastMsg = next[next.length - 1];
            if (lastMsg && lastMsg.role === Role.MODEL) {
              next[next.length - 1] = { ...lastMsg, content: fullText };
            }
            return next;
          });
        }
      }

      // 更新歷史紀錄
      historyRef.current = [
        ...contents,
        { role: 'model', parts: [{ text: fullText }] }
      ];

    } catch (error) {
      console.error("API Call Error:", error);
      setIsLoading(false);
      setMessages(prev => [...prev, { 
        role: Role.MODEL, 
        content: "I'm sorry, I couldn't process that insight right now. Could you share your thoughts again? / 抱歉，我現在無法解析您的思緒。能請您再試一次嗎？" 
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

  const isButtonActive = (userInput.trim().length > 0 || !!selectedImage || !!recordedAudio) && !isLoading;

  return (
    <div className="flex flex-col h-[90vh] w-full max-w-4xl bg-white/40 backdrop-blur-3xl rounded-[2.5rem] shadow-[0_30px_70px_-15px_rgba(251,113,133,0.3)] border border-white/60 overflow-hidden relative">
      <header className="px-8 py-7 text-center border-b border-rose-100/30 bg-white/20 backdrop-blur-md">
        <h1 className="text-3xl font-script font-bold text-rose-600/90 tracking-wide">I'll understand you</h1>
        <p className="text-stone-500 text-[0.65rem] mt-2 font-bold tracking-[0.35em] uppercase opacity-70">Deep Psychoanalytic Reflection</p>
      </header>

      <main className="flex-1 px-6 lg:px-14 py-8 overflow-y-auto space-y-7 white-scrollbar">
        {messages.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center text-stone-400/40 space-y-5 animate-pulse">
                <div className="w-14 h-14 rounded-full border border-stone-200/40 flex items-center justify-center italic text-xl font-script">ψ</div>
                <p className="text-lg italic font-script text-center max-w-xs">"Thoughts are but seeds of the unspoken."</p>
                <p className="text-[0.6rem] tracking-[0.4em] uppercase font-black">Begin your story / 開始傾訴</p>
            </div>
        )}
        {messages.map((msg, i) => <ChatMessage key={i} message={msg} />)}
        {isLoading && messages[messages.length - 1]?.role !== Role.MODEL && (
          <div className="flex justify-start">
            <div className="px-7 py-4 rounded-[2rem] bg-white/70 border border-rose-100/50 flex space-x-2.5 items-center shadow-sm">
              <span className="w-1.5 h-1.5 bg-rose-300 rounded-full animate-bounce"></span>
              <span className="w-1.5 h-1.5 bg-rose-300 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
              <span className="w-1.5 h-1.5 bg-rose-300 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </main>

      <footer className="p-7 lg:px-14 lg:pb-10 bg-white/10 border-t border-rose-100/10">
         {(selectedImage || recordedAudio) && (
          <div className="mb-5 flex gap-4 animate-in slide-in-from-bottom-3 duration-300">
            {selectedImage && (
              <div className="relative group">
                <div className="h-20 w-20 overflow-hidden rounded-2xl border-2 border-white shadow-lg transition-transform hover:scale-105">
                    <img src={`data:${selectedImage.mimeType};base64,${selectedImage.data}`} className="h-full w-full object-cover" alt="Selected" />
                </div>
                <button onClick={() => setSelectedImage(null)} className="absolute -top-2.5 -right-2.5 bg-rose-500 text-white rounded-full p-1.5 shadow-xl hover:bg-rose-600 active:scale-90 transition-all">
                  <XIcon className="h-3 w-3" />
                </button>
              </div>
            )}
            {recordedAudio && (
              <div className="relative flex items-center bg-white/80 px-5 py-3 rounded-2xl border border-rose-50 shadow-lg animate-pulse">
                <MicIcon className="h-4 w-4 text-rose-500 mr-2.5" />
                <span className="text-xs text-rose-700 font-bold uppercase tracking-widest">Audio Loaded</span>
                <button onClick={() => setRecordedAudio(null)} className="absolute -top-2.5 -right-2.5 bg-rose-500 text-white rounded-full p-1.5 shadow-xl hover:bg-rose-600 active:scale-90 transition-all">
                  <XIcon className="h-3 w-3" />
                </button>
              </div>
            )}
          </div>
        )}

        <div className="relative flex items-end gap-3.5">
          <div className="flex flex-col gap-3.5">
             <label className="cursor-pointer bg-white/70 p-3.5 rounded-full border border-rose-100/40 hover:bg-white shadow-sm transition-all active:scale-90">
                <PaperclipIcon className="h-5 w-5 text-rose-400" />
                <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
             </label>
             <button 
                type="button" 
                onMouseDown={startRecording} 
                onMouseUp={stopRecording} 
                onTouchStart={startRecording} 
                onTouchEnd={stopRecording} 
                className={`p-3.5 rounded-full border border-rose-100/40 shadow-sm transition-all active:scale-90 ${isRecording ? 'bg-rose-500 text-white ring-4 ring-rose-100' : 'bg-white/70 text-rose-400 hover:bg-white'}`}
             >
                <MicIcon className="h-5 w-5" />
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
              placeholder="Speak your mind... (Ctrl+Enter to send)"
              className="w-full pl-6 pr-16 py-4.5 bg-white/80 text-stone-800 border border-rose-100/20 rounded-[1.8rem] resize-none focus:outline-none focus:ring-4 focus:ring-rose-100/30 focus:border-rose-200 transition-all shadow-inner max-h-44 overflow-y-auto white-scrollbar leading-relaxed text-[1.05rem]"
              rows={1}
            />
            <button 
              onClick={handleSend}
              disabled={!isButtonActive} 
              className={`absolute right-2.5 bottom-2.5 rounded-full h-11 w-11 flex items-center justify-center transition-all shadow-lg z-10 ${isButtonActive ? 'bg-rose-500 text-white hover:bg-rose-600 hover:scale-105 active:scale-90' : 'bg-stone-100 text-stone-300 cursor-not-allowed opacity-50'}`}
            >
              <SendIcon className="h-5.5 w-5.5" />
            </button>
          </div>
        </div>
        <div className="mt-4 flex justify-between items-center px-4 opacity-40">
           <div className="text-[0.6rem] text-stone-400 uppercase tracking-[0.3em] font-black">
              Hold to record voice
           </div>
           <div className="text-[0.6rem] text-stone-400 uppercase tracking-[0.3em] font-black">
              Ctrl + Enter to send
           </div>
        </div>
      </footer>
    </div>
  );
};

export default ChatInterface;
