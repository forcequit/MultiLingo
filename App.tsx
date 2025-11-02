



import React, { useState, useRef, useCallback, useEffect } from 'react';
import { blobToBase64, decode, decodeAudioData } from './utils/audio';
import { GoogleGenAI, HarmCategory, HarmBlockThreshold, Modality, Content } from "@google/genai";

// Initialize Gemini client-side. The API_KEY is available in the preview environment from the build process.
if (!process.env.API_KEY) {
  // This provides a clear error for developers if the API key isn't configured.
  const errorMessage = "API_KEY environment variable not set. Please ensure it's configured in your environment.";
  // Display the error in the UI for visibility in the preview environment.
  const root = document.getElementById('root');
  if (root) {
    root.innerHTML = `<div style="color: red; padding: 20px; font-family: sans-serif;">${errorMessage}</div>`;
  }
  throw new Error(errorMessage);
}
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
const ttsModel = "gemini-2.5-flash-preview-tts";
const multiModalModel = 'gemini-2.5-flash';
const SAFETY_SETTINGS = [
    { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
    { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
    { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
    { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
];

// --- UI Icon Components (defined outside App to prevent re-renders) ---

const MicrophoneIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-10 h-10">
    <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.49 6-3.31 6-6.72h-1.7z" />
  </svg>
);


const StopIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-10 h-10">
    <path fillRule="evenodd" d="M4.5 7.5a3 3 0 0 1 3-3h9a3 3 0 0 1 3 3v9a3 3 0 0 1-3 3h-9a3 3 0 0 1-3-3v-9Z" clipRule="evenodd" />
  </svg>
);

const LoadingSpinner = () => (
    <svg className="animate-spin h-10 w-10 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
    </svg>
);

const ButtonSpinner = () => (
    <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
    </svg>
);


const PlayIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
    <path fillRule="evenodd" d="M4.5 5.653c0-1.426 1.529-2.33 2.779-1.643l11.54 6.647c1.295.742 1.295 2.545 0 3.286L7.279 20.99c-1.25.72-2.779-.217-2.779-1.643V5.653Z" clipRule="evenodd" />
  </svg>
);

const PauseIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
    <path fillRule="evenodd" d="M6.75 5.25a.75.75 0 0 1 .75.75v12a.75.75 0 0 1-1.5 0V6a.75.75 0 0 1 .75-.75Zm9 0a.75.75 0 0 1 .75.75v12a.75.75 0 0 1-1.5 0V6a.75.75 0 0 1 .75-.75Z" clipRule="evenodd" />
  </svg>
);

const CloseIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
  </svg>
);


const SendIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
        <path d="M3.478 2.404a.75.75 0 0 0-.926.941l2.432 7.905H13.5a.75.75 0 0 1 0 1.5H4.984l-2.432 7.905a.75.75 0 0 0 .926.94 60.519 60.519 0 0 0 18.445-8.986.75.75 0 0 0 0-1.218A60.517 60.517 0 0 0 3.478 2.404Z" />
    </svg>
);

// --- Type Definitions ---

interface DisplayMessage {
  role: 'user' | 'model';
  text: string;
}

type Status = 'idle' | 'recording' | 'transcribing' | 'translating' | 'chatting';

// --- Main App Component ---

const LANGUAGES = ['Irish Gaelic', 'Swedish', 'German', 'Spanish', 'Portuguese'];

const getFlagForLanguage = (lang: string): string => {
    switch (lang) {
        case 'Swedish': return '🇸🇪';
        case 'Irish Gaelic': return '🇮🇪';
        case 'German': return '🇩🇪';
        case 'Spanish': return '🇪🇸';
        case 'Portuguese': return '🇵🇹';
        default: return '🌐'; // Fallback globe icon
    }
};

export default function App() {
  const [status, setStatus] = useState<Status>('idle');
  const [isChatLoading, setIsChatLoading] = useState<boolean>(false);
  const [isFetchingAudio, setIsFetchingAudio] = useState<boolean>(false);
  const [isAudioPlaying, setIsAudioPlaying] = useState<boolean>(false);
  const [language, setLanguage] = useState<string>(LANGUAGES[0]);
  const [displayConversation, setDisplayConversation] = useState<DisplayMessage[]>([]);
  const [chatInput, setChatInput] = useState<string>('');
  const [audioData, setAudioData] = useState<Uint8Array | null>(null);
  const [audioDataForText, setAudioDataForText] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [audioError, setAudioError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const conversationEndRef = useRef<HTMLDivElement | null>(null);
  const silenceTimerRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const playbackAudioContextRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);


  useEffect(() => {
    conversationEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [displayConversation]);

  const cleanupAudioAnalysis = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    if (sourceNodeRef.current) {
      sourceNodeRef.current.disconnect();
      sourceNodeRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close().catch(console.error);
      audioContextRef.current = null;
    }
  }, []);

  const handleClear = useCallback(() => {
    if (isAudioPlaying && audioSourceRef.current) {
      audioSourceRef.current.stop();
    }
    if (playbackAudioContextRef.current && playbackAudioContextRef.current.state !== 'closed') {
        playbackAudioContextRef.current.close().catch(console.error);
        playbackAudioContextRef.current = null;
    }
    cleanupAudioAnalysis();
    setDisplayConversation([]);
    setAudioData(null);
    setAudioDataForText('');
    setError(null);
    setAudioError(null);
    setChatInput('');
    setStatus('idle');
  }, [isAudioPlaying, cleanupAudioAnalysis]);
  
  const handleLanguageChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setLanguage(e.target.value);
    // If conversation is active, changing language should clear it to reflect the new context
    if (displayConversation.length > 0) {
        handleClear();
    }
  };

  const processStream = async (streamResult: AsyncGenerator<any>, onDone: () => void) => {
    let fullResponse = "";
    for await (const chunk of streamResult) {
      const text = chunk.text;
      if (text) {
          fullResponse += text;
          setDisplayConversation(current => {
            const newConversation = [...current];
            const lastMessage = newConversation[newConversation.length - 1];
            if (lastMessage) {
                lastMessage.text = fullResponse;
            }
            return newConversation;
          });
      }
    }
    onDone();
  };

  const processRecordedAudio = async (audioBlob: Blob) => {
    setStatus('transcribing');
    setError(null);
    let userTranscriptMessage: DisplayMessage | null = null;
    try {
      const mimeType = audioBlob.type;
      const base64Audio = await blobToBase64(audioBlob);

      // 1. Transcribe audio client-side
      const transcribeResponse = await ai.models.generateContent({
        model: multiModalModel,
        contents: [{
          parts: [
            { text: "Please transcribe the following audio:" },
            { inlineData: { mimeType: mimeType, data: base64Audio } }
          ]
        }]
      });

      const transcript = transcribeResponse.text.trim();
      if (!transcript) throw new Error("Transcription returned empty. Please try speaking more clearly.");

      userTranscriptMessage = { role: 'user', text: transcript };
      setDisplayConversation([userTranscriptMessage, { role: 'model', text: '' }]);

      // 2. Translate transcript via streaming chat client-side
      setStatus('translating');
      const systemInstruction = `You are a direct translator. Translate the user's text to ${language}. Your response should contain ONLY the translated text, without any additional commentary, greetings, or explanations.`;
      
      const chat = ai.chats.create({
          model: multiModalModel,
          config: {
              systemInstruction,
              safetySettings: SAFETY_SETTINGS,
          }
      });

      const streamResult = await chat.sendMessageStream({ message: transcript });
      
      await processStream(streamResult, () => {
        setStatus('chatting');
        setAudioData(null);
        setAudioDataForText('');
        setAudioError(null);
      });

    } catch (err: any) {
      console.error("Processing Error:", err);
      setError(err.message || "An unknown error occurred during processing.");
      // Rollback UI state on error
      if (userTranscriptMessage) {
        setDisplayConversation([userTranscriptMessage]);
      } else {
        setDisplayConversation([]);
      }
      setStatus('idle');
    }
  };

  const handleStopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      cleanupAudioAnalysis();
      mediaRecorderRef.current.stop();
    }
  }, [cleanupAudioAnalysis]);

  const handleStartRecording = async () => {
    handleClear();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      audioContextRef.current = audioContext;
      const source = audioContext.createMediaStreamSource(stream);
      sourceNodeRef.current = source;
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.1;
      source.connect(analyser);

      const SILENCE_THRESHOLD = 2.0; 
      const SILENCE_DURATION_MS = 3000;
      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      const checkSilence = () => {
        animationFrameRef.current = requestAnimationFrame(checkSilence);
        analyser.getByteTimeDomainData(dataArray);
        let sumOfSquares = 0;
        for (const value of dataArray) {
          const deviation = value - 128;
          sumOfSquares += deviation * deviation;
        }
        const rms = Math.sqrt(sumOfSquares / dataArray.length);

        if (rms < SILENCE_THRESHOLD) {
          if (!silenceTimerRef.current) {
            silenceTimerRef.current = window.setTimeout(() => {
              if (mediaRecorderRef.current?.state === 'recording') {
                handleStopRecording();
              }
            }, SILENCE_DURATION_MS);
          }
        } else {
          if (silenceTimerRef.current) {
            clearTimeout(silenceTimerRef.current);
            silenceTimerRef.current = null;
          }
        }
      };
      animationFrameRef.current = requestAnimationFrame(checkSilence);

      const mimeType = ['audio/ogg; codecs=opus', 'audio/webm; codecs=opus', 'audio/webm'].find(
        (type) => MediaRecorder.isTypeSupported(type)
      );
      if (!mimeType) throw new Error("Your browser doesn't support a suitable audio recording format.");

      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];
      mediaRecorder.ondataavailable = (event) => audioChunksRef.current.push(event.data);
      mediaRecorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        if (audioChunksRef.current.length > 0) {
            const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
            processRecordedAudio(audioBlob);
        }
      };
      mediaRecorder.start();
      setStatus('recording');
    } catch (err: any) {
      console.error("Error starting recording:", err);
      cleanupAudioAnalysis();
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setError("Microphone access was denied. Please grant microphone permissions in your browser settings.");
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        setError("No microphone found. Please ensure a microphone is connected.");
      } else {
        setError(err.message || "Could not start recording due to an unexpected error.");
      }
      setStatus('idle');
    }
  };
  
  const handleToggleRecording = () => {
    if (status === 'recording') handleStopRecording();
    else handleStartRecording();
  };

  const handlePlayAudio = async () => {
    if (isAudioPlaying && audioSourceRef.current) {
      audioSourceRef.current.stop();
      return;
    }
    if (isFetchingAudio) return;
    
    setAudioError(null);

    const lastModelMessage = [...displayConversation].filter(m => m.role === 'model').pop();
    if (!lastModelMessage || !lastModelMessage.text) return;

    const playBuffer = async (bufferData: Uint8Array) => {
      try {
        if (!playbackAudioContextRef.current || playbackAudioContextRef.current.state === 'closed') {
            playbackAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
        }
        const audioContext = playbackAudioContextRef.current;
        const audioBuffer = await decodeAudioData(bufferData, audioContext, 24000, 1);
        const source = audioContext.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(audioContext.destination);
        audioSourceRef.current = source;
        source.onended = () => {
          setIsAudioPlaying(false);
          audioSourceRef.current = null;
        };
        source.start(0);
        setIsAudioPlaying(true);
      } catch (err) {
        console.error("Error playing audio:", err);
        setAudioError("Failed to play audio. The data may be corrupted.");
        setIsAudioPlaying(false);
      }
    };

    if (audioData && audioDataForText === lastModelMessage.text) {
      await playBuffer(audioData);
      return;
    }

    setIsFetchingAudio(true);
    
    const MAX_RETRIES = 3;
    const RETRY_DELAY_MS = 500;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        try {
            const response = await ai.models.generateContent({
                model: ttsModel,
                contents: [{ parts: [{ text: lastModelMessage.text }] }],
                config: {
                responseModalities: [Modality.AUDIO],
                speechConfig: {
                    voiceConfig: {
                    prebuiltVoiceConfig: { voiceName: 'Kore' },
                    },
                },
                },
            });

            const audioDataB64 = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
            if (!audioDataB64) {
                throw new Error("API did not return audio data.");
            }
            const speechData = decode(audioDataB64);

            setAudioData(speechData);
            setAudioDataForText(lastModelMessage.text);
            await playBuffer(speechData);
            lastError = null; // Success
            break; // Exit retry loop
        } catch (err: any) {
            console.error(`TTS Error (Attempt ${attempt + 1}/${MAX_RETRIES}):`, err);
            lastError = err;
            if (attempt < MAX_RETRIES - 1) {
                await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
            }
        }
    }

    if (lastError) {
        setAudioError("Audio not available, try again momentarily.");
        setAudioData(null);
    }
    
    setIsFetchingAudio(false);
  };
  
  const handleSendChatMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || isChatLoading) return;

    const userMessage: DisplayMessage = { role: 'user', text: chatInput };
    const historyBeforeRequest = displayConversation;
    
    setChatInput('');
    setDisplayConversation(current => [...current, userMessage, { role: 'model', text: '' }]);
    setIsChatLoading(true);

    try {
      const chatHistory: Content[] = historyBeforeRequest.map((msg: { role: 'user' | 'model', text: string }) => ({
          role: msg.role,
          parts: [{ text: msg.text }]
      }));
      const systemInstruction = `You are a helpful and concise language assistant. The user is asking a follow-up question about a previous translation to ${language}. The conversation history is provided. Keep your answers brief and to the point.`;
      
      const chat = ai.chats.create({
          model: multiModalModel,
          history: chatHistory,
          config: {
            systemInstruction: systemInstruction,
            safetySettings: SAFETY_SETTINGS,
          }
      });
      
      const streamResult = await chat.sendMessageStream({ message: userMessage.text });
      
      await processStream(streamResult, () => {
        setAudioData(null);
        setAudioDataForText('');
        setAudioError(null);
      });
    } catch (err: any) {
      console.error("Chat Error:", err);
      setError(err.message || "Sorry, I couldn't get a response.");
      setDisplayConversation(historyBeforeRequest); // Rollback
    } finally {
        setIsChatLoading(false);
    }
  };
  
  const isProcessing = status === 'transcribing' || status === 'translating';
  const statusText = {
    idle: "Ready",
    recording: "Recording...",
    transcribing: "Transcribing your speech...",
    translating: "Translating to " + language + "...",
    chatting: "Conversation active"
  }[status];

  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col items-center justify-center p-4 font-sans">
      <div className="w-full max-w-2xl mx-auto flex flex-col items-center text-center">
        
        <h1 className="text-4xl md:text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-teal-400 to-teal-300">
          Cupla
        </h1>
        <p className="mt-2 text-lg text-gray-400">
            Record your voice, get the translation, and ask follow-up questions.
        </p>

        <div className="mt-8 w-full max-w-xs">
          <label htmlFor="language-select" className="block text-sm font-medium text-gray-400 mb-2">
          </label>
          <select
            id="language-select"
            value={language}
            onChange={handleLanguageChange}
            disabled={status !== 'idle' && status !== 'chatting'}
            className="bg-gray-800 border border-gray-600 text-white text-lg rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 disabled:opacity-50"
          >
            {LANGUAGES.map(lang => (
              <option key={lang} value={lang}>{lang}</option>
            ))}
          </select>
        </div>

        <div className="mt-8 flex flex-col items-center justify-center space-y-8 w-full">
          <button
            onClick={handleToggleRecording}
            disabled={isProcessing || status === 'chatting'}
            className={`relative rounded-full w-32 h-32 flex items-center justify-center transition-all duration-300 ease-in-out
              ${status === 'recording' ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'}
              ${(isProcessing || status === 'chatting') ? 'bg-gray-700 cursor-not-allowed opacity-50' : ''}
              focus:outline-none focus:ring-4 focus:ring-offset-2 focus:ring-offset-gray-900 focus:ring-blue-500
              shadow-lg transform hover:scale-105`}
            aria-label={status === 'recording' ? 'Stop recording' : 'Start recording'}
          >
            {isProcessing ? <LoadingSpinner /> : (status === 'recording' ? <StopIcon /> : <MicrophoneIcon />)}
            {status === 'recording' && !isProcessing && <span className="absolute w-full h-full rounded-full bg-red-600 animate-ping opacity-75"></span>}
          </button>
          <p className="h-6 text-gray-300">{statusText}</p>
        </div>

        {error && (
            <div className="mt-8 p-4 bg-red-900/50 border border-red-700 rounded-lg text-red-300 w-full">
                <p><strong>Error:</strong> {error}</p>
            </div>
        )}

        {displayConversation.length > 0 && (
            <div className="mt-4 p-4 bg-gray-800/50 border border-gray-700 rounded-2xl w-full text-left shadow-2xl animate-fade-in flex flex-col">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-sm font-semibold text-blue-400 uppercase tracking-wider">Conversation ({language})</h2>
                    <button 
                      onClick={handleClear}
                      className="text-gray-500 hover:text-gray-300 transition-colors"
                      aria-label="Clear conversation"
                    >
                      <CloseIcon />
                    </button>
                </div>
                
                <div className="flex-grow space-y-4 pr-2 overflow-y-auto max-h-[40vh]">
                    {displayConversation.map((msg, index) => (
                        <div key={index} className={`flex items-end gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                            {msg.role === 'model' && <span className="text-2xl">{getFlagForLanguage(language)}</span>}
                            <p className={`max-w-[85%] rounded-2xl px-4 py-3 text-lg ${msg.role === 'user' ? 'bg-blue-600 rounded-br-none' : 'bg-gray-700 rounded-bl-none'}`}>
                                {msg.text || <span className="animate-pulse">...</span>}
                            </p>
                            {msg.role === 'user' && <span className="text-2xl">👤</span>}
                        </div>
                    ))}
                    <div ref={conversationEndRef} />
                </div>
                
                 <div className="mt-4 pt-4 border-t border-gray-700 flex items-center gap-4">
                    <button
                        onClick={handlePlayAudio}
                        disabled={isFetchingAudio || isChatLoading || displayConversation.filter(m => m.role === 'model' && m.text).length === 0}
                        className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-white font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800
                            ${isAudioPlaying ? 'bg-amber-500 hover:bg-amber-600 focus:ring-amber-400 animate-pulse' : 'bg-teal-600 hover:bg-teal-700 focus:ring-teal-500'}
                            disabled:bg-gray-600 disabled:cursor-not-allowed`}
                        aria-label={isAudioPlaying ? 'Stop audio playback' : 'Play latest response'}
                    >
                        {isFetchingAudio ? <><ButtonSpinner /> Generating...</> : isAudioPlaying ? <><PauseIcon /> Playing</> : <><PlayIcon /> Listen</>}
                    </button>
                    {audioError && <p className="text-sm text-amber-400">{audioError}</p>}
                 </div>

                <form onSubmit={handleSendChatMessage} className="mt-4 flex items-center gap-2">
                    <input
                        type="text"
                        value={chatInput}
                        onChange={(e) => setChatInput(e.target.value)}
                        placeholder="How to pronounce that or show regional dialect"
                        className="flex-grow bg-gray-700 border border-gray-600 text-white text-lg rounded-full focus:ring-blue-500 focus:border-blue-500 block w-full p-3 px-5"
                        disabled={isChatLoading || status !== 'chatting'}
                    />
                    <button type="submit" disabled={!chatInput.trim() || isChatLoading || status !== 'chatting'} className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed p-3 rounded-full text-white focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 focus:ring-blue-500 transition-colors">
                        <SendIcon />
                    </button>
                </form>
            </div>
        )}
      </div>
      <style>{`
        @keyframes fade-in {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in {
          animation: fade-in 0.5s ease-out forwards;
        }
      `}</style>
    </div>
  );
}