
import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI, HarmCategory, HarmBlockThreshold, type Content, type Part } from '@google/genai';
import { KENYU_SYSTEM_INSTRUCTION } from '../constants.ts';
import { Role, type Message } from '../types.ts';

// --- Elegant Clinical Icons (Muted Charcoal) ---
const SendIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
  </svg>
);

const PaperclipIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
  </svg>
);

const MicIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
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

const ChatMessage: React.FC<{ message: Message }> = ({ message }) => {
  const isUser = message.role === Role.USER;
  return (
    <div className={`flex w-full mb-8 ${isUser ? 'justify-end' : 'justify-start'} animate-in fade-in duration-500`}>
      <div className={`max-w-[85%] md:max-w-[75%] px-7 py-5 rounded-3xl shadow-sm border ${
        isUser 
          ? 'bg-rose-500 text-white border-rose-600 rounded-br-none' 
          : 'bg-white text-stone-800 border-stone-100 rounded-bl-none'
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
    } catch (err) { alert("Microphone access denied / 需麥克風權限"); }
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

    const displayContent = trimmed || (selectedImage ? "[分享了意象]" : "[分享了語音]");
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

      // 使用穩定性更高的 Pro 模型並降低過濾門檻
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
        throw new Error("No usable output");
      }
    } catch (error) {
      console.error("Critical Failure:", error);
      setIsLoading(false);
      // 誠實的錯誤提示，不再假設用戶情緒
      const errorMsg = lang === 'zh' 
        ? "連線中斷，對話內容未能成功傳輸。請再次嘗試發送，讓我們重新連結。" 
        : "The analytical bridge was cut off due to a technical failure. Please try sending again.";
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
    <div className="flex flex-col h-[92vh] w-full max-w-5xl bg-white/80 backdrop-blur-lg rounded-3xl shadow-2xl border border-stone-200 overflow-hidden relative transition-all duration-700">
      <header className="px-10 py-6 border-b border-stone-100 bg-white/40 flex flex-col items-center">
        <h1 className="text-4xl font-script font-bold text-rose-500">I'll understand you</h1>
        <p className="text-stone-400 text-[0.7rem] font-bold tracking-[0.5em] uppercase mt-1">Freudian Frame</p>
      </header>

      <main className="flex-1 px-6 md:px-16 py-10 overflow-y-auto white-scrollbar">
        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-stone-300 space-y-4">
            <div className="w-16 h-16 rounded-full border border-stone-200 flex items-center justify-center italic text-3xl font-script opacity-60">ψ</div>
            <p className="text-xl italic font-script text-center max-w-sm">"Whatever enters your mind is a key."</p>
            <p className="text-[0.6rem] tracking-[0.4em] uppercase font-black opacity-30">Begin Session</p>
          </div>
        )}
        {messages.map((msg, i) => <ChatMessage key={i} message={msg} />)}
        {isLoading && (
          <div className="flex justify-start mb-8">
            <div className="px-6 py-4 rounded-3xl bg-white border border-rose-50 flex space-x-2 items-center shadow-sm">
              <span className="w-2 h-2 bg-rose-400 rounded-full animate-pulse"></span>
              <span className="w-2 h-2 bg-rose-400 rounded-full animate-pulse [animation-delay:-0.3s]"></span>
              <span className="w-2 h-2 bg-rose-400 rounded-full animate-pulse [animation-delay:-0.6s]"></span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </main>

      <footer className="p-6 md:px-16 md:pb-10 bg-white border-t border-stone-100">
        {(selectedImage || recordedAudio) && (
          <div className="mb-6 flex gap-4 animate-in slide-in-from-bottom-4">
            {selectedImage && (
              <div className="relative">
                <div className="h-24 w-24 overflow-hidden rounded-xl border border-stone-200 shadow-md">
                  <img src={`data:${selectedImage.mimeType};base64,${selectedImage.data}`} className="h-full w-full object-cover" alt="Selected" />
                </div>
                <button onClick={() => setSelectedImage(null)} className="absolute -top-2 -right-2 bg-stone-800 text-white rounded-full p-1.5 shadow-lg hover:bg-rose-500 transition-colors">
                  <XIcon className="h-4 w-4" />
                </button>
              </div>
            )}
            {recordedAudio && (
              <div className="relative flex items-center bg-stone-50 border border-stone-200 px-6 py-3 rounded-xl shadow-sm">
                <MicIcon className="h-5 w-5 mr-3 text-rose-500" />
                <span className="text-xs font-bold text-stone-600 uppercase tracking-widest">Recorded</span>
                <button onClick={() => setRecordedAudio(null)} className="absolute -top-2 -right-2 bg-stone-800 text-white rounded-full p-1.5 shadow-lg hover:bg-rose-500 transition-colors">
                  <XIcon className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>
        )}

        <div className="flex flex-col md:flex-row items-stretch md:items-end gap-4">
          <div className="flex md:flex-row gap-3">
            <label className="cursor-pointer bg-stone-50 p-4 rounded-2xl text-stone-500 border border-stone-200 hover:bg-stone-100 transition-all flex items-center justify-center">
              <PaperclipIcon className="h-6 w-6" />
              <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
            </label>
            <button 
              onMouseDown={startRecording} onMouseUp={stopRecording}
              onTouchStart={startRecording} onTouchEnd={stopRecording}
              className={`p-4 rounded-2xl border transition-all flex items-center justify-center ${isRecording ? 'bg-rose-500 text-white border-rose-600' : 'bg-stone-50 text-stone-500 border-stone-200'}`}
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
              className="w-full pl-6 pr-16 py-4 bg-stone-50/50 text-stone-800 border border-stone-200 rounded-2xl resize-none focus:outline-none focus:border-rose-300 focus:bg-white transition-all text-[1.05rem] max-h-48 overflow-y-auto white-scrollbar"
              rows={1}
            />
            <button 
              onClick={handleSend}
              disabled={!canSend}
              className={`absolute right-2 bottom-2 h-12 w-12 flex items-center justify-center rounded-xl transition-all ${canSend ? 'bg-stone-800 text-white hover:bg-rose-500' : 'bg-stone-100 text-stone-300 cursor-not-allowed'}`}
            >
              <SendIcon className="h-5 w-5" />
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default ChatInterface;
