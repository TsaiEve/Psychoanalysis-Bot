
import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI, type Chat } from '@google/genai';
import { KENYU_SYSTEM_INSTRUCTION } from '../constants.ts';
import { Role, type Message } from '../types.ts';

// 圖標組件
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

const ChatMessage: React.FC<{ message: Message }> = ({ message }) => {
  const isUser = message.role === Role.USER;
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-2 duration-500`}>
      <div className={`max-w-[85%] lg:max-w-lg px-6 py-4 rounded-[2rem] shadow-sm ${isUser ? 'bg-rose-500 text-white rounded-br-none' : 'bg-white/80 text-stone-800 rounded-bl-none border border-rose-100/50 backdrop-blur-sm'}`}>
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
  
  // 使用 Ref 保持 chat 實例，避免重複創建與 state 更新競爭
  const chatRef = useRef<Chat | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // 滾動到底部
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
      const base64 = await fileToBase64(file);
      setSelectedImage({ data: base64, mimeType: file.type });
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];
      mediaRecorder.ondataavailable = (e) => e.data.size > 0 && audioChunksRef.current.push(e.data);
      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const base64 = await fileToBase64(new File([audioBlob], "audio.webm"));
        setRecordedAudio({ data: base64, mimeType: 'audio/webm' });
        stream.getTracks().forEach(t => t.stop());
      };
      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) { console.error(err); }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const handleSend = async () => {
    const trimmedInput = userInput.trim();
    if (isLoading || (!trimmedInput && !selectedImage && !recordedAudio)) return;

    // 確保 Chat 實例存在
    if (!chatRef.current) {
      try {
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        chatRef.current = ai.chats.create({
          model: 'gemini-3-flash-preview',
          config: { systemInstruction: KENYU_SYSTEM_INSTRUCTION },
        });
      } catch (e) {
        console.error("Failed to init chat:", e);
        return;
      }
    }

    const currentChat = chatRef.current;
    if (!currentChat) return;

    // 更新介面
    const content = trimmedInput || (selectedImage ? "[Sent an image]" : "[Sent a voice note]");
    setMessages(prev => [...prev, { role: Role.USER, content }]);
    setIsLoading(true);
    
    // 清空輸入框
    const messageToSend = trimmedInput || "User shared a visual or auditory reflection. Provide insight.";
    setUserInput('');
    setSelectedImage(null);
    setRecordedAudio(null);
    if(textareaRef.current) textareaRef.current.style.height = 'auto';

    try {
      const responseStream = await currentChat.sendMessageStream({ message: messageToSend });
      let fullText = '';
      let isFirst = true;

      for await (const chunk of responseStream) {
        if (isFirst) {
          setIsLoading(false);
          isFirst = false;
          setMessages(prev => [...prev, { role: Role.MODEL, content: chunk.text }]);
          fullText = chunk.text;
        } else {
          fullText += chunk.text;
          setMessages(prev => {
            const next = [...prev];
            next[next.length - 1] = { role: Role.MODEL, content: fullText };
            return next;
          });
        }
      }
    } catch (error) {
      console.error(error);
      setMessages(prev => [...prev, { role: Role.MODEL, content: "My insight was clouded. Try again? / 我的思緒有些模糊，請再說一次？" }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // 支援 Ctrl + Enter 或 Cmd + Enter
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSend();
    }
    // 單獨 Enter 會正常換行
  };

  return (
    <div className="flex flex-col h-[90vh] w-full max-w-4xl bg-white/40 backdrop-blur-2xl rounded-[2.5rem] shadow-[0_20px_50px_rgba(255,182,193,0.3)] border border-white/60 overflow-hidden">
      <header className="px-8 py-6 text-center border-b border-rose-100/30">
        <h1 className="text-3xl font-script font-bold text-rose-600 tracking-wide">I'll understand you</h1>
        <p className="text-stone-500 text-sm mt-1 font-medium">Psychoanalytic Insight / 精神分析與解析</p>
      </header>

      <main className="flex-1 px-4 lg:px-12 py-6 overflow-y-auto space-y-6 white-scrollbar">
        {messages.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center text-stone-400/60 space-y-4">
                <p className="text-lg italic font-script">"Everything is but a dream, if not analyzed."</p>
                <p className="text-sm tracking-widest uppercase font-bold">Speak freely / 隨意傾訴</p>
            </div>
        )}
        {messages.map((msg, i) => <ChatMessage key={i} message={msg} />)}
        {isLoading && (
          <div className="flex justify-start">
            <div className="px-6 py-4 rounded-[2rem] bg-white/80 border border-rose-100/50 flex space-x-2 shadow-sm">
              <span className="w-1.5 h-1.5 bg-rose-300 rounded-full animate-bounce"></span>
              <span className="w-1.5 h-1.5 bg-rose-300 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
              <span className="w-1.5 h-1.5 bg-rose-300 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </main>

      <footer className="p-6 lg:px-12 lg:pb-10 bg-white/20">
         {(selectedImage || recordedAudio) && (
          <div className="mb-4 flex gap-4 animate-in slide-in-from-bottom-2">
            {selectedImage && (
              <div className="relative group">
                <div className="h-16 w-16 overflow-hidden rounded-xl border-2 border-rose-200 shadow-md transition-transform group-hover:scale-105">
                    <img src={`data:${selectedImage.mimeType};base64,${selectedImage.data}`} className="h-full w-full object-cover" alt="Preview" />
                </div>
                <button onClick={() => setSelectedImage(null)} className="absolute -top-2 -right-2 bg-rose-500 text-white rounded-full p-1 shadow-lg hover:bg-rose-600 transition-colors">
                  <XIcon className="h-3 w-3" />
                </button>
              </div>
            )}
            {recordedAudio && (
              <div className="relative flex items-center bg-rose-50 px-4 py-2 rounded-xl border border-rose-100 shadow-sm animate-pulse">
                <MicIcon className="h-4 w-4 text-rose-500 mr-2" />
                <span className="text-xs text-rose-700 font-medium">Voice Captured</span>
                <button onClick={() => setRecordedAudio(null)} className="absolute -top-2 -right-2 bg-rose-500 text-white rounded-full p-1 shadow-lg hover:bg-rose-600 transition-colors">
                  <XIcon className="h-3 w-3" />
                </button>
              </div>
            )}
          </div>
        )}

        <div className="relative flex items-end gap-2">
          <div className="flex flex-col gap-2">
             <label className="cursor-pointer bg-white/60 p-3 rounded-full border border-rose-100/50 hover:bg-rose-50 shadow-sm transition-all active:scale-95">
                <PaperclipIcon className="h-5 w-5 text-rose-400" />
                <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
             </label>
             <button 
                type="button" 
                onMouseDown={startRecording} 
                onMouseUp={stopRecording} 
                onTouchStart={startRecording} 
                onTouchEnd={stopRecording} 
                className={`p-3 rounded-full border border-rose-100/50 shadow-sm transition-all active:scale-95 ${isRecording ? 'bg-rose-500 text-white' : 'bg-white/60 text-rose-400'}`}
             >
                <MicIcon className="h-5 w-5" />
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
              placeholder="Tell me more... (Ctrl + Enter to send)"
              className="w-full pl-6 pr-14 py-4 bg-white/60 text-stone-800 border border-rose-100/50 rounded-[1.5rem] resize-none focus:outline-none focus:border-rose-300 transition-all shadow-inner max-h-40 overflow-y-auto white-scrollbar leading-relaxed"
              rows={1}
            />
            <button 
              onClick={handleSend}
              disabled={isLoading || (!userInput.trim() && !selectedImage && !recordedAudio)} 
              className="absolute right-2 bottom-2 bg-rose-500 text-white rounded-full h-11 w-11 flex items-center justify-center hover:bg-rose-600 disabled:opacity-20 disabled:scale-100 active:scale-90 transition-all shadow-md z-10"
            >
              <SendIcon className="h-5 w-5" />
            </button>
          </div>
        </div>
        <div className="mt-3 text-[0.6rem] text-stone-400 text-center uppercase tracking-widest font-bold opacity-60">
            Hold to record • Ctrl + Enter to send
        </div>
      </footer>
    </div>
  );
};

export default ChatInterface;
