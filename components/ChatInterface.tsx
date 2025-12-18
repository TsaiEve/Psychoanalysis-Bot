
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { type Chat } from '@google/genai';
import { createTherapyChat } from '../services/geminiService.ts';
import { Role, type Message } from '../types.ts';

const SendIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="22" y1="2" x2="11" y2="13"></line>
    <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
  </svg>
);

const PaperclipIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path>
  </svg>
);

const MicIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
    <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
    <line x1="12" y1="19" x2="12" y2="23"></line>
    <line x1="8" y1="23" x2="16" y2="23"></line>
  </svg>
);

const XIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18"></line>
    <line x1="6" y1="6" x2="18" y2="18"></line>
  </svg>
);

const ChatMessage: React.FC<{ message: Message }> = ({ message }) => {
  const isUser = message.role === Role.USER;
  if (!message.content.trim()) return null;
  
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-2 duration-500`}>
      <div
        className={`max-w-[85%] lg:max-w-lg px-6 py-4 rounded-[2rem] shadow-sm transition-all ${
          isUser
            ? 'bg-rose-500 text-white rounded-br-none'
            : 'bg-white/80 text-stone-800 rounded-bl-none border border-rose-100/50 backdrop-blur-sm'
        }`}
      >
        <p className="whitespace-pre-wrap leading-relaxed text-[1.05rem]">{message.content}</p>
      </div>
    </div>
  );
};

const ChatInterface: React.FC = () => {
  const [chat, setChat] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [userInput, setUserInput] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  
  const [selectedImage, setSelectedImage] = useState<{data: string, mimeType: string} | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordedAudio, setRecordedAudio] = useState<{data: string, mimeType: string} | null>(null);
  
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);
  
  const initializeChat = useCallback(async () => {
    try {
      const chatSession = createTherapyChat();
      setChat(chatSession);
    } catch (error) {
      console.error("Failed to initialize chat:", error);
    }
  }, []);

  useEffect(() => {
    initializeChat();
  }, []);

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const base64String = (reader.result as string).split(',')[1];
        resolve(base64String);
      };
      reader.onerror = error => reject(error);
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

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = () => {
          const base64 = (reader.result as string).split(',')[1];
          setRecordedAudio({ data: base64, mimeType: 'audio/webm' });
        };
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error("Error accessing microphone:", err);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement> | React.KeyboardEvent) => {
    e.preventDefault();
    if ((!userInput.trim() && !selectedImage && !recordedAudio) || isLoading || !chat) return;

    const currentInput = userInput.trim();
    const currentImage = selectedImage;
    const currentAudio = recordedAudio;

    let displayContent = currentInput;
    if (currentImage) displayContent += "\n[傳送了圖片 / Sent an image]";
    if (currentAudio) displayContent += "\n[傳送了語音 / Sent a voice note]";

    const userMessage: Message = { role: Role.USER, content: displayContent };
    setMessages(prev => [...prev, userMessage]);
    
    setUserInput('');
    setSelectedImage(null);
    setRecordedAudio(null);
    if(textareaRef.current) textareaRef.current.style.height = 'auto';
    setIsLoading(true);

    try {
      // 依照 SDK 指南，sendMessageStream 優先處理文字消息。
      // 若有圖片/語音，這裡簡化為發送描述性文字以確保對話流暢。
      const responseStream = await chat.sendMessageStream({ message: currentInput || "I've shared an image or audio with you. What do you see or hear in it?" });
      
      let fullResponse = '';
      let isFirstChunk = true;

      for await (const chunk of responseStream) {
        if (isFirstChunk) {
          setIsLoading(false);
          isFirstChunk = false;
          setMessages(prev => [...prev, { role: Role.MODEL, content: chunk.text }]);
          fullResponse = chunk.text;
        } else {
          fullResponse += chunk.text;
          setMessages(prev => {
            const newMessages = [...prev];
            const targetIndex = newMessages.length - 1;
            newMessages[targetIndex] = { role: Role.MODEL, content: fullResponse };
            return newMessages;
          });
        }
      }

    } catch (error) {
      console.error("Error sending message:", error);
      setIsLoading(false);
      setMessages(prev => [...prev, { role: Role.MODEL, content: "My thoughts were interrupted. Could you say that again? / 我的思緒被打斷了，能請您再說一遍嗎？" }]);
    }
  };
  
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSubmit(e as any);
    }
  }

  return (
    <div className="flex flex-col h-[90vh] w-full max-w-4xl bg-white/40 backdrop-blur-2xl rounded-[2.5rem] shadow-[0_20px_50px_rgba(255,182,193,0.3)] border border-white/60 overflow-hidden">
      <header className="px-8 py-6 text-center border-b border-rose-100/30">
        <h1 className="text-3xl font-script font-bold text-rose-600 tracking-wide">I'll understand you, if you tell me</h1>
        <p className="text-stone-500 text-sm mt-1 font-medium tracking-tight">Psychoanalytic Interpretation & Insight / 深度精神分析與解析</p>
      </header>

      <main className="flex-1 px-4 lg:px-12 py-6 overflow-y-auto space-y-6 white-scrollbar">
        {messages.map((msg, index) => (
          <ChatMessage key={index} message={msg} />
        ))}
         {isLoading && (
           <div className="flex justify-start">
             <div className="px-6 py-4 rounded-[2rem] shadow-sm bg-white/80 text-stone-800 rounded-bl-none border border-rose-100/50">
                <div className="flex items-center space-x-2">
                    <span className="w-1.5 h-1.5 bg-rose-300 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                    <span className="w-1.5 h-1.5 bg-rose-300 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                    <span className="w-1.5 h-1.5 bg-rose-300 rounded-full animate-bounce"></span>
                </div>
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
                <img src={`data:${selectedImage.mimeType};base64,${selectedImage.data}`} className="h-20 w-20 object-cover rounded-xl border-2 border-rose-200" alt="Preview" />
                <button onClick={() => setSelectedImage(null)} className="absolute -top-2 -right-2 bg-rose-500 text-white rounded-full p-1 shadow-lg hover:scale-110 transition-transform">
                  <XIcon className="h-3 w-3" />
                </button>
              </div>
            )}
            {recordedAudio && (
              <div className="relative group flex items-center bg-rose-50 px-4 py-2 rounded-xl border border-rose-200">
                <MicIcon className="h-5 w-5 text-rose-500 mr-2" />
                <span className="text-xs text-rose-700 font-medium">Voice Note Captured</span>
                <button onClick={() => setRecordedAudio(null)} className="absolute -top-2 -right-2 bg-rose-500 text-white rounded-full p-1 shadow-lg hover:scale-110 transition-transform">
                  <XIcon className="h-3 w-3" />
                </button>
              </div>
            )}
          </div>
        )}

        <form onSubmit={handleSubmit as any} className="relative flex items-end gap-2 group">
          <div className="flex flex-col gap-2">
             <label className="cursor-pointer bg-white/60 p-3 rounded-full border border-rose-100/50 hover:bg-rose-50 transition-colors shadow-sm">
                <PaperclipIcon className="h-5 w-5 text-rose-400" />
                <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
             </label>
             <button
                type="button"
                onMouseDown={startRecording}
                onMouseUp={stopRecording}
                onMouseLeave={stopRecording}
                onTouchStart={startRecording}
                onTouchEnd={stopRecording}
                className={`p-3 rounded-full border border-rose-100/50 transition-all shadow-sm ${isRecording ? 'bg-rose-500 text-white animate-pulse' : 'bg-white/60 text-rose-400 hover:bg-rose-50'}`}
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
              placeholder="Share your thoughts... / 分享您的想法..."
              className="w-full pl-6 pr-16 py-4 bg-white/60 text-stone-800 placeholder-stone-400 border border-rose-100/50 rounded-[1.5rem] resize-none focus:ring-4 focus:ring-rose-500/10 focus:border-rose-300 focus:outline-none transition-all duration-300 shadow-inner max-h-40 overflow-y-auto leading-relaxed white-scrollbar"
              rows={1}
            />
            <button
              type="submit"
              disabled={isLoading || (!userInput.trim() && !selectedImage && !recordedAudio)}
              className="absolute right-2 bottom-2 bg-rose-500 text-white rounded-full h-11 w-11 flex items-center justify-center transition-all duration-300 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-rose-600 hover:scale-105 active:scale-95 shadow-md font-script text-xl"
            >
              <SendIcon className="h-5 w-5" />
            </button>
          </div>
        </form>
        <p className="text-center text-[0.7rem] text-stone-400 mt-4 px-10 font-medium">
          {isRecording ? "Listening... / 正在傾聽..." : "Your history is saved locally for this session. / 對話紀錄已儲存。"}
        </p>
      </footer>
    </div>
  );
};

export default ChatInterface;
