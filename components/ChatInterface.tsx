
import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI, type Content, type Part } from '@google/genai';
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
      } catch (err) {
        console.error("Image conversion error:", err);
      }
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
    } catch (err) { 
      console.error("Microphone error:", err); 
      alert("Please ensure microphone permissions are granted.");
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
    // 判斷是否有任何輸入內容
    const hasInput = trimmedInput.length > 0 || selectedImage !== null || recordedAudio !== null;
    if (isLoading || !hasInput) return;

    // 先鎖定載入狀態
    setIsLoading(true);

    // 準備要發送的零件
    const parts: Part[] = [];
    if (trimmedInput) parts.push({ text: trimmedInput });
    if (selectedImage) parts.push({ inlineData: { data: selectedImage.data, mimeType: selectedImage.mimeType } });
    if (recordedAudio) parts.push({ inlineData: { data: recordedAudio.data, mimeType: recordedAudio.mimeType } });

    // 介面顯示內容
    const displayContent = trimmedInput || (selectedImage ? "[Sent an image]" : "[Sent a voice reflection]");
    setMessages(prev => [...prev, { role: Role.USER, content: displayContent }]);
    
    // 清除輸入狀態（在 API 調用前清除以提供即時回饋）
    const tempInput = trimmedInput;
    const tempImage = selectedImage;
    const tempAudio = recordedAudio;
    
    setUserInput('');
    setSelectedImage(null);
    setRecordedAudio(null);
    if(textareaRef.current) textareaRef.current.style.height = 'auto';

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      
      // 構建包含歷史紀錄的 contents 數組
      const currentContents: Content[] = [
        ...historyRef.current,
        { role: 'user', parts }
      ];

      const responseStream = await ai.models.generateContentStream({
        model: 'gemini-3-flash-preview',
        contents: currentContents,
        config: {
          systemInstruction: KENYU_SYSTEM_INSTRUCTION
        }
      });

      let fullText = '';
      let isFirstChunk = true;

      for await (const chunk of responseStream) {
        const chunkText = chunk.text || "";
        fullText += chunkText;
        
        if (isFirstChunk) {
          setIsLoading(false); // 收到第一個塊後關閉 Loading 動畫
          isFirstChunk = false;
          setMessages(prev => [...prev, { role: Role.MODEL, content: fullText }]);
        } else {
          setMessages(prev => {
            const next = [...prev];
            next[next.length - 1] = { role: Role.MODEL, content: fullText };
            return next;
          });
        }
      }

      // 更新歷史紀錄
      historyRef.current = [
        ...currentContents,
        { role: 'model', parts: [{ text: fullText }] }
      ];

    } catch (error) {
      console.error("API Error:", error);
      setMessages(prev => [...prev, { role: Role.MODEL, content: "My insight was clouded by a technical shadow. Could you try sharing that again? / 我的思緒受到了技術層面的干擾，能請您再試一次嗎？" }]);
      // 發生錯誤時嘗試恢復用戶輸入（選擇性）
      setUserInput(tempInput);
      setSelectedImage(tempImage);
      setRecordedAudio(tempAudio);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // 支援 Ctrl + Enter 或 Cmd + Enter (Mac)
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSend();
    }
  };

  // 用於按鈕禁用的判斷條件
  const isButtonDisabled = isLoading || (!userInput.trim() && !selectedImage && !recordedAudio);

  return (
    <div className="flex flex-col h-[90vh] w-full max-w-4xl bg-white/40 backdrop-blur-2xl rounded-[2.5rem] shadow-[0_20px_50px_rgba(255,182,193,0.3)] border border-white/60 overflow-hidden">
      <header className="px-8 py-6 text-center border-b border-rose-100/30">
        <h1 className="text-3xl font-script font-bold text-rose-600 tracking-wide">I'll understand you</h1>
        <p className="text-stone-500 text-sm mt-1 font-medium">Psychoanalytic Space / 精神分析空間</p>
      </header>

      <main className="flex-1 px-4 lg:px-12 py-6 overflow-y-auto space-y-6 white-scrollbar">
        {messages.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center text-stone-400/60 space-y-4 animate-pulse">
                <p className="text-lg italic font-script">"The dream is the royal road to the unconscious."</p>
                <p className="text-xs tracking-[0.2em] uppercase font-bold">Speak your mind / 暢所欲言</p>
            </div>
        )}
        {messages.map((msg, i) => <ChatMessage key={i} message={msg} />)}
        {isLoading && (
          <div className="flex justify-start">
            <div className="px-6 py-4 rounded-[2rem] bg-white/80 border border-rose-100/50 flex space-x-2 shadow-sm">
              <span className="w-1.5 h-1.5 bg-rose-400 rounded-full animate-bounce"></span>
              <span className="w-1.5 h-1.5 bg-rose-400 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
              <span className="w-1.5 h-1.5 bg-rose-400 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
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
                <div className="h-20 w-20 overflow-hidden rounded-2xl border-2 border-rose-200 shadow-lg transition-transform hover:scale-105">
                    <img src={`data:${selectedImage.mimeType};base64,${selectedImage.data}`} className="h-full w-full object-cover" alt="Selected" />
                </div>
                <button onClick={() => setSelectedImage(null)} className="absolute -top-2 -right-2 bg-rose-500 text-white rounded-full p-1.5 shadow-xl hover:bg-rose-600 transition-colors">
                  <XIcon className="h-3 w-3" />
                </button>
              </div>
            )}
            {recordedAudio && (
              <div className="relative flex items-center bg-rose-50 px-5 py-3 rounded-2xl border border-rose-100 shadow-md">
                <MicIcon className="h-5 w-5 text-rose-500 mr-3" />
                <span className="text-sm text-rose-700 font-bold">Voice Captured</span>
                <button onClick={() => setRecordedAudio(null)} className="absolute -top-2 -right-2 bg-rose-500 text-white rounded-full p-1.5 shadow-xl hover:bg-rose-600 transition-colors">
                  <XIcon className="h-3 w-3" />
                </button>
              </div>
            )}
          </div>
        )}

        <div className="relative flex items-end gap-3">
          <div className="flex flex-col gap-3">
             <label className="cursor-pointer bg-white/70 p-3.5 rounded-full border border-rose-100/50 hover:bg-rose-50 shadow-sm transition-all active:scale-90">
                <PaperclipIcon className="h-5 w-5 text-rose-400" />
                <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
             </label>
             <button 
                type="button" 
                onMouseDown={startRecording} 
                onMouseUp={stopRecording} 
                onTouchStart={startRecording} 
                onTouchEnd={stopRecording} 
                className={`p-3.5 rounded-full border border-rose-100/50 shadow-sm transition-all active:scale-90 ${isRecording ? 'bg-rose-500 text-white ring-4 ring-rose-200' : 'bg-white/70 text-rose-400'}`}
                title="Hold to record"
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
              placeholder="What comes to mind? (Ctrl + Enter to send)"
              className="w-full pl-6 pr-16 py-4 bg-white/70 text-stone-800 border border-rose-100/50 rounded-[1.8rem] resize-none focus:outline-none focus:ring-2 focus:ring-rose-200 focus:border-rose-300 transition-all shadow-inner max-h-40 overflow-y-auto white-scrollbar leading-relaxed text-[1.05rem]"
              rows={1}
            />
            <button 
              onClick={handleSend}
              disabled={isButtonDisabled} 
              className={`absolute right-2.5 bottom-2.5 rounded-full h-11 w-11 flex items-center justify-center transition-all shadow-md z-10 ${isButtonDisabled ? 'bg-stone-200 text-stone-400 opacity-50 cursor-not-allowed' : 'bg-rose-500 text-white hover:bg-rose-600 hover:scale-105 active:scale-95'}`}
            >
              <SendIcon className="h-5 w-5" />
            </button>
          </div>
        </div>
        <div className="mt-4 text-[0.65rem] text-stone-400 text-center uppercase tracking-[0.25em] font-black opacity-40">
            Press Ctrl + Enter to communicate
        </div>
      </footer>
    </div>
  );
};

export default ChatInterface;
