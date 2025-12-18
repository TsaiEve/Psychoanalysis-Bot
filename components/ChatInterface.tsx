
import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI, HarmCategory, HarmBlockThreshold, type Content, type Part } from '@google/genai';
import { KENYU_SYSTEM_INSTRUCTION } from '../constants.ts';
import { Role, type Message } from '../types.ts';

// --- Professional High-Contrast Thin Icons ---
const SendIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="black" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
  </svg>
);

const PaperclipIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="black" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
  </svg>
);

const MicIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="black" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
    <line x1="12" y1="19" x2="12" y2="23" />
    <line x1="8" y1="23" x2="16" y2="23" />
  </svg>
);

const XIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="black" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

const ChatMessage: React.FC<{ message: Message }> = ({ message }) => {
  const isUser = message.role === Role.USER;
  return (
    <div className={`flex w-full mb-6 ${isUser ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-2 duration-300`}>
      <div className={`max-w-[85%] md:max-w-[75%] px-6 py-4 rounded-2xl shadow-sm border ${
        isUser 
          ? 'bg-rose-500 text-white border-rose-600 rounded-br-none' 
          : 'bg-white text-stone-800 border-stone-100 rounded-bl-none'
      }`}>
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

    setIsLoading(true);
    const displayContent = trimmed || (selectedImage ? "[分享意象]" : "[音訊內容]");
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
      // 每次發送都重新初始化，確保 API Key 在環境中正確讀取
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const contents = [...historyRef.current, { role: 'user', parts: currentParts }];

      // 使用 Pro 模型以提升對「攻擊性內容」的處理彈性與穩定性
      const result = await ai.models.generateContentStream({
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

      for await (const chunk of result) {
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
        throw new Error("Empty Response from Gemini");
      }
    } catch (error: any) {
      console.error("ANALYSIS_STALL:", error);
      setIsLoading(false);
      
      const errorDetail = error?.message || "unknown";
      const isSafety = errorDetail.toLowerCase().includes("safety");
      
      // 提供更具意義的回應，而非僅僅是「連線中斷」
      let msg = "分析空間似乎發生了技術性的斷裂。請再次嘗試發送，我會在這裡承接住您的語句。";
      if (isSafety) {
        msg = "剛才的內容似乎觸發了系統的內部防線。請嘗試用更直接、未經審查的方式重新描述您的感受。";
      }

      setMessages(prev => [...prev, { role: Role.MODEL, content: msg }]);
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
    <div className="flex flex-col h-[92vh] w-full max-w-4xl bg-white rounded-3xl shadow-xl border border-stone-200 overflow-hidden relative transition-all">
      <header className="px-8 py-6 border-b border-stone-100 bg-white flex flex-col items-center">
        <h1 className="text-3xl font-script font-bold text-rose-500">I'll understand you</h1>
        <p className="text-stone-400 text-[0.6rem] font-bold tracking-[0.4em] uppercase mt-1">Psychoanalytic Encounter</p>
      </header>

      <main className="flex-1 px-6 md:px-12 py-8 overflow-y-auto white-scrollbar bg-[#fdfdfd]">
        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-stone-300 space-y-4 opacity-40">
            <div className="w-12 h-12 rounded-full border border-stone-200 flex items-center justify-center italic text-2xl font-script">ψ</div>
            <p className="text-lg italic font-script">"Speak freely. No censorship."</p>
          </div>
        )}
        {messages.map((msg, i) => <ChatMessage key={i} message={msg} />)}
        {isLoading && (
          <div className="flex justify-start mb-6">
            <div className="px-5 py-3 rounded-2xl bg-stone-50 border border-stone-100 flex space-x-2 items-center">
              <span className="w-1.5 h-1.5 bg-rose-400 rounded-full animate-bounce"></span>
              <span className="w-1.5 h-1.5 bg-rose-400 rounded-full animate-bounce [animation-delay:-0.2s]"></span>
              <span className="w-1.5 h-1.5 bg-rose-400 rounded-full animate-bounce [animation-delay:-0.4s]"></span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </main>

      <footer className="p-6 md:px-12 bg-white border-t border-stone-100">
        {(selectedImage || recordedAudio) && (
          <div className="mb-4 flex gap-4 animate-in slide-in-from-bottom-2">
            {selectedImage && (
              <div className="relative">
                <div className="h-20 w-20 overflow-hidden rounded-xl border border-stone-200 shadow-sm">
                  <img src={`data:${selectedImage.mimeType};base64,${selectedImage.data}`} className="h-full w-full object-cover" />
                </div>
                <button onClick={() => setSelectedImage(null)} className="absolute -top-2 -right-2 bg-stone-800 text-white rounded-full p-1 hover:bg-rose-500 transition-colors">
                  <XIcon className="h-3 w-3" />
                </button>
              </div>
            )}
            {recordedAudio && (
              <div className="relative flex items-center bg-stone-50 border border-stone-200 px-5 py-2 rounded-xl">
                <MicIcon className="h-4 w-4 mr-2 text-rose-500" />
                <span className="text-[0.65rem] font-bold text-stone-500 uppercase tracking-widest">Recorded</span>
                <button onClick={() => setRecordedAudio(null)} className="absolute -top-2 -right-2 bg-stone-800 text-white rounded-full p-1 hover:bg-rose-500 transition-colors">
                  <XIcon className="h-3 w-3" />
                </button>
              </div>
            )}
          </div>
        )}

        <div className="flex items-end gap-3">
          <div className="flex gap-2">
            <label className="cursor-pointer bg-white p-3 rounded-xl border border-stone-200 hover:bg-stone-50 transition-all flex items-center justify-center">
              <PaperclipIcon className="h-5 w-5" />
              <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
            </label>
            <button 
              onMouseDown={startRecording} onMouseUp={stopRecording}
              onTouchStart={startRecording} onTouchEnd={stopRecording}
              className={`p-3 rounded-xl border transition-all flex items-center justify-center ${isRecording ? 'bg-rose-500 text-white border-rose-600 animate-pulse' : 'bg-white border-stone-200 hover:bg-stone-50'}`}
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
              placeholder="What comes to mind?..."
              className="w-full pl-5 pr-14 py-3 bg-[#fdfdfd] text-stone-800 border border-stone-200 rounded-xl resize-none focus:outline-none focus:border-rose-300 focus:bg-white transition-all text-[1rem] max-h-32 overflow-y-auto white-scrollbar"
              rows={1}
            />
            <button 
              onClick={handleSend}
              disabled={!canSend}
              className={`absolute right-2 bottom-2 h-9 w-9 flex items-center justify-center rounded-lg transition-all ${canSend ? 'bg-stone-800 text-white hover:bg-rose-500' : 'bg-stone-100 text-stone-300 cursor-not-allowed'}`}
            >
              <SendIcon className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div className="mt-4 flex justify-between px-2 opacity-30 text-[0.55rem] font-bold uppercase tracking-widest text-stone-500">
           <span>Hold mic to record</span>
           <span>Ctrl+Enter to send</span>
        </div>
      </footer>
    </div>
  );
};

export default ChatInterface;
