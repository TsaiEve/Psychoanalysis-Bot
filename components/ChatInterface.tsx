
import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI, HarmCategory, HarmBlockThreshold, type Content, type Part } from '@google/genai';
import { KENYU_SYSTEM_INSTRUCTION } from '../constants.ts';
import { Role, type Message } from '../types.ts';

// --- Clean Professional Icons ---
const SendIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
  </svg>
);

const PaperclipIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
  </svg>
);

const MicIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
    <div className={`flex w-full mb-6 ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[80%] px-6 py-4 rounded-2xl shadow-sm border ${
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
    } catch (err) { alert("Mic error / 請檢查麥克風權限"); }
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
    const displayContent = trimmed || (selectedImage ? "[影像]" : "[語音]");
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

      // 切換為更穩定的 Flash 模型，確保在 Vercel 部署環境下更可靠
      const response = await ai.models.generateContent({
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

      const fullText = response.text || "";
      if (fullText) {
        setMessages(prev => [...prev, { role: Role.MODEL, content: fullText }]);
        historyRef.current = [...contents, { role: 'model', parts: [{ text: fullText }] }];
      } else {
        throw new Error("Empty response");
      }
    } catch (error) {
      console.error("Analysis Error Details:", error);
      // 專業且中立的錯誤回饋
      setMessages(prev => [...prev, { 
        role: Role.MODEL, 
        content: "對話連線出現了斷裂。這可能是技術性的中斷，也可能是我們觸及了某些難以言說的阻抗。請您再試一次。" 
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

  const canSend = (userInput.trim() || selectedImage || recordedAudio) && !isLoading;

  return (
    <div className="flex flex-col h-[90vh] w-full max-w-4xl bg-white rounded-3xl shadow-xl border border-stone-200 overflow-hidden relative">
      <header className="px-8 py-6 border-b border-stone-100 bg-stone-50/30 flex flex-col items-center">
        <h1 className="text-3xl font-script font-bold text-rose-500">I'll understand you</h1>
        <p className="text-stone-400 text-[0.65rem] font-bold tracking-[0.4em] uppercase mt-1">Psychoanalytic Encounter</p>
      </header>

      <main className="flex-1 px-6 md:px-12 py-8 overflow-y-auto white-scrollbar">
        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-stone-300 space-y-4 opacity-50">
            <div className="w-12 h-12 rounded-full border border-stone-200 flex items-center justify-center italic text-2xl font-script">ψ</div>
            <p className="text-lg italic font-script">"Say whatever comes to mind."</p>
          </div>
        )}
        {messages.map((msg, i) => <ChatMessage key={i} message={msg} />)}
        {isLoading && (
          <div className="flex justify-start mb-6 animate-pulse">
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
          <div className="mb-4 flex gap-3">
            {selectedImage && (
              <div className="relative group">
                <div className="h-20 w-20 overflow-hidden rounded-lg border border-stone-200 shadow-sm">
                  <img src={`data:${selectedImage.mimeType};base64,${selectedImage.data}`} className="h-full w-full object-cover" alt="Selected" />
                </div>
                <button onClick={() => setSelectedImage(null)} className="absolute -top-1.5 -right-1.5 bg-stone-800 text-white rounded-full p-1 shadow-lg hover:bg-rose-500 transition-colors">
                  <XIcon className="h-3 w-3" />
                </button>
              </div>
            )}
            {recordedAudio && (
              <div className="relative flex items-center bg-stone-50 px-4 py-2 rounded-lg border border-stone-100 shadow-sm">
                <MicIcon className="h-4 w-4 mr-2 text-rose-500" />
                <span className="text-[0.7rem] font-bold text-stone-500 uppercase tracking-widest">Audio Recorded</span>
                <button onClick={() => setRecordedAudio(null)} className="absolute -top-1.5 -right-1.5 bg-stone-800 text-white rounded-full p-1 shadow-lg hover:bg-rose-500 transition-colors">
                  <XIcon className="h-3 w-3" />
                </button>
              </div>
            )}
          </div>
        )}

        <div className="flex items-end gap-3">
          <div className="flex gap-2 pb-1">
            <label className="cursor-pointer bg-stone-50 p-3 rounded-xl text-stone-400 border border-stone-100 hover:text-stone-600 hover:bg-stone-100 transition-all flex items-center justify-center">
              <PaperclipIcon className="h-5 w-5" />
              <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
            </label>
            <button 
              onMouseDown={startRecording} onMouseUp={stopRecording}
              onTouchStart={startRecording} onTouchEnd={stopRecording}
              className={`p-3 rounded-xl border transition-all flex items-center justify-center ${isRecording ? 'bg-rose-500 text-white border-rose-600 animate-pulse' : 'bg-stone-50 text-stone-400 border-stone-100'}`}
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
              className="w-full pl-5 pr-12 py-3 bg-stone-50 text-stone-800 border border-stone-100 rounded-xl resize-none focus:outline-none focus:border-rose-200 focus:bg-white transition-all text-[1rem] max-h-32 overflow-y-auto white-scrollbar"
              rows={1}
            />
            <button 
              onClick={handleSend}
              disabled={!canSend}
              className={`absolute right-2 bottom-2 h-9 w-9 flex items-center justify-center rounded-lg transition-all ${canSend ? 'bg-stone-800 text-white hover:bg-rose-500 shadow-md' : 'bg-stone-100 text-stone-300 cursor-not-allowed'}`}
            >
              <SendIcon className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div className="mt-4 flex justify-between px-2 opacity-30 text-[0.6rem] font-bold uppercase tracking-widest text-stone-500">
           <span>Hold mic to record</span>
           <span>Ctrl+Enter to send</span>
        </div>
      </footer>
    </div>
  );
};

export default ChatInterface;
