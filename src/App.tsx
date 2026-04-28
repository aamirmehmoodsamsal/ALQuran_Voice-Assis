import { Mic, Loader2, Volume2, Squircle, Pause, Play, Square } from 'lucide-react';
import React, { useState, useRef, useEffect } from 'react';
import { parseUserIntentAudio, getTafsir, generateUrduAudio } from './lib/gemini';
import { getAyahAudio } from './lib/quran';
import { playPcmAudio, stopPcmAudio, pausePcmAudio, resumePcmAudio } from './lib/audio';

export default function App() {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isPlayingQuran, setIsPlayingQuran] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [statusText, setStatusText] = useState('آواز سے بات کرنے کے لئے مائک دبائیں');

  // Track the context of the user (where they are in the Quran)
  const contextRef = useRef<{ lastSurah?: number; lastAyah?: number }>({});

  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const audioChunks = useRef<Blob[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    return () => {
      stopAnyAudio();
    };
  }, []);

  const stopAnyAudio = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setIsPlayingQuran(false);
    stopPcmAudio();
    setIsSpeaking(false);
    setIsPaused(false);
    window.speechSynthesis.cancel();
  };

  const speakUrdu = async (text: string): Promise<void> => {
    stopPcmAudio(); // Stop anything current
    setIsSpeaking(true);
    setStatusText('جواب دے رہا ہوں...');

    const base64Audio = await generateUrduAudio(text);
    if (base64Audio) {
      try {
        await playPcmAudio(base64Audio);
      } catch (err) {
        console.error('Error playing TTS audio', err);
      }
    } else {
      console.warn('Failed to generate audio for TTS, falling back to browser TTS');
      await new Promise<void>((resolve) => {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'ur-PK';
        utterance.rate = 0.85;
        utterance.onend = () => resolve();
        utterance.onerror = () => resolve();
        window.speechSynthesis.speak(utterance);
      });
    }

    setIsSpeaking(false);
    setStatusText('آواز سے بات کرنے کے لئے مائک دبائیں');
  };

  const playAyahAudio = (url: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      stopAnyAudio();
      setIsPlayingQuran(true);
      setStatusText('تلاوت ہو رہی ہے...');
      
      const audio = new Audio(url);
      audioRef.current = audio;
      
      audio.onended = () => {
        setIsPlayingQuran(false);
        resolve();
      };
      
      audio.onerror = (e) => {
        setIsPlayingQuran(false);
        reject(e);
      };

      audio.play().catch(reject);
    });
  };

  const processUserAudio = async (audioBase64: string, mimeType: string) => {
    // 1. Get structured intent
    const result = await parseUserIntentAudio(audioBase64, mimeType, contextRef.current);
    console.log('Intent parsed:', result);

    // Speak the immediate acknowledgment or answer
    if (result.responseForUserUrdu) {
      await speakUrdu(result.responseForUserUrdu);
    }

    let targetSurah = result.surahNumber;
    let targetAyah = result.ayahNumber;

    if (result.intent === 'next_ayah' && contextRef.current.lastSurah) {
      targetSurah = contextRef.current.lastSurah;
      targetAyah = (contextRef.current.lastAyah || 0) + 1;
    } else if (result.intent === 'ask_question') {
      // Handled entirely by the prompt returning the answer in responseForUserUrdu
      return;
    } else if (result.intent === 'unknown' && !targetSurah) {
       // if we didn't understand, prompt again
       return;
    }

    if (targetSurah && targetAyah) {
      // Fetch audio
      const audioUrl = await getAyahAudio(targetSurah, targetAyah);
      if (audioUrl) {
        // Play Quran and fetch tafsir concurrently to eliminate loading time
        const tafsirPromise = getTafsir(targetSurah, targetAyah);
        await playAyahAudio(audioUrl);
        
        // Save Context
        contextRef.current = { lastSurah: targetSurah, lastAyah: targetAyah };

        setStatusText('تفسیر تیار ہو رہی ہے...'); // preparing tafsir in case it's still loading
        
        // Wait for the translation + tafsir
        const tafsirResponse = await tafsirPromise;
        
        // Read out the tafsir
        await speakUrdu(tafsirResponse);

      } else {
        await speakUrdu('معاف کیجئے گا، مجھے اس آیت کی آڈیو نہیں ملی۔');
      }
    } else if (targetSurah) {
       // they provided surah but no ayah
       await speakUrdu('کس آیت نمبر سے شروع کروں؟');
    }
  };

  const togglePauseResume = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (isPlayingQuran) {
      if (audioRef.current) {
        if (isPaused) {
          audioRef.current.play();
          setIsPaused(false);
          setStatusText('تلاوت ہو رہی ہے...');
        } else {
          audioRef.current.pause();
          setIsPaused(true);
          setStatusText('تلاوت روکی گئی ہے (Paused)');
        }
      }
    } else if (isSpeaking) {
      if (isPaused) {
        resumePcmAudio();
        window.speechSynthesis.resume();
        setIsPaused(false);
        setStatusText('جواب دے رہا ہوں...');
      } else {
        pausePcmAudio();
        window.speechSynthesis.pause();
        setIsPaused(true);
        setStatusText('جواب روکا گیا ہے (Paused)');
      }
    }
  };

  const stopAndReset = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    stopAnyAudio();
    setStatusText('آواز سے بات کرنے کے لئے مائک دبائیں');
  };

  const toggleMic = async () => {
    if (isPlayingQuran || isSpeaking) {
      stopAnyAudio();
      setStatusText('آواز سے بات کرنے کے لئے مائک دبائیں');
      return;
    }

    if (isRecording) {
      if (mediaRecorder) {
        mediaRecorder.stop();
      }
    } else {
      // Clean start
      stopAnyAudio();
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        let recorder: MediaRecorder;
        try {
          recorder = new MediaRecorder(stream, { audioBitsPerSecond: 16000 });
        } catch (e) {
          recorder = new MediaRecorder(stream);
        }
        audioChunks.current = [];
        
        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) {
            audioChunks.current.push(e.data);
          }
        };
        
        recorder.onstop = async () => {
          setIsRecording(false);
          setIsProcessing(true);
          setStatusText('سوچ رہا ہوں...'); // Thinking...
          
          const audioBlob = new Blob(audioChunks.current, { type: recorder.mimeType });
          const reader = new FileReader();
          reader.readAsDataURL(audioBlob);
          reader.onloadend = async () => {
            const base64data = (reader.result as string).split(',')[1];
            try {
              await processUserAudio(base64data, recorder.mimeType);
            } catch (err: any) {
              console.error(err);
              const errMsg = err?.message || (typeof err === 'string' ? err : JSON.stringify(err));
              if (errMsg.includes('429') || errMsg.includes('RESOURCE_EXHAUSTED')) {
                setStatusText('استعمال کی حد پوری ہو گئی ہے۔ کچھ دیر بعد کوشش کریں۔');
                speakUrdu('استعمال کی حد پوری ہو گئی ہے۔ براہ کرم کچھ دیر بعد دوبارہ کوشش کریں۔');
              } else {
                setStatusText('کچھ غلط ہو گیا، دوبارہ کوشش کریں۔');
                speakUrdu('معاف کیجئے گا، کچھ غلط ہو گیا۔ براہ کرم دوبارہ کوشش کریں۔');
              }
            } finally {
              setIsProcessing(false);
            }
          };
          
          // Stop all audio tracks
          stream.getTracks().forEach(track => track.stop());
        };
        
        recorder.start();
        setMediaRecorder(recorder);
        setIsRecording(true);
        setStatusText('سن رہا ہوں... (روکنے کے لیے دوبارہ دبائیں)');
      } catch (err) {
        console.error('Microphone access denied or error', err);
        setStatusText('براہ کرم مائیکروفون کی اجازت دیں۔');
      }
    }
  };

  return (
    <div className="min-h-screen bg-[#121212] text-[#F5F5DC] flex flex-col items-center justify-between p-6 md:p-16 font-serif overflow-hidden relative">
      {/* Decorative Background Element */}
      <div className="absolute inset-0 opacity-5 pointer-events-none">
        <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
          <pattern id="pattern" x="0" y="0" width="100" height="100" patternUnits="userSpaceOnUse">
            <path d="M50 0L60 40L100 50L60 60L50 100L40 60L0 50L40 40Z" fill="currentColor"/>
          </pattern>
          <rect width="100%" height="100%" fill="url(#pattern)" />
        </svg>
      </div>

      {/* Visual Balance Accents */}
      <div className="absolute top-0 left-0 w-24 h-24 md:w-32 md:h-32 border-l-4 border-t-4 border-[#D4AF37] m-4 md:m-8 opacity-40 pointer-events-none"></div>
      <div className="absolute bottom-0 right-0 w-24 h-24 md:w-32 md:h-32 border-r-4 border-b-4 border-[#D4AF37] m-4 md:m-8 opacity-40 pointer-events-none"></div>

      {/* App Header */}
      <header className="z-10 text-center w-full mt-8 md:mt-0">
        <h1 className="text-5xl md:text-7xl font-bold mb-4 text-[#D4AF37] tracking-tight">قرآن صوتی معاون</h1>
        <p className="text-xl md:text-3xl opacity-80 font-sans">Al-Quran Voice Assistant</p>
      </header>

      {/* Main Interaction Area */}
      <main className="z-10 flex flex-col items-center flex-1 justify-center w-full py-8 gap-10 md:gap-12">
        {/* Massive Microphone Button */}
        <div className="relative flex items-center justify-center">
          <div className="absolute w-72 h-72 md:w-96 md:h-96 bg-[#D4AF37] opacity-10 rounded-full blur-3xl pointer-events-none"></div>
          
          { (isPlayingQuran || isSpeaking) ? (
            <div className="relative z-10 flex rounded-[4rem] shadow-[0_20px_50px_rgba(212,175,55,0.3)] overflow-hidden border-8 border-[#2A2A2A] h-64 md:h-80 w-[24rem] md:w-[32rem] transition-all duration-300 ease-out focus:outline-none">
              <button onClick={togglePauseResume} className="flex-1 flex justify-center items-center bg-[#D4AF37] hover:bg-[#B3932F] transition-colors border-r-4 border-[#2A2A2A] group" aria-label={isPaused ? "Resume" : "Pause"}>
                {isPaused ? <Play className="w-24 h-24 md:w-32 md:h-32 text-[#121212] group-hover:scale-110 transition-transform" fill="currentColor" /> : <Pause className="w-24 h-24 md:w-32 md:h-32 text-[#121212] group-hover:scale-110 transition-transform" fill="currentColor" />}
              </button>
              <button onClick={stopAndReset} className="flex-1 flex justify-center items-center bg-[#991B1B] hover:bg-[#7f1d1d] transition-colors border-l-4 border-[#2A2A2A] group" aria-label="Stop">
                <Square className="w-24 h-24 md:w-32 md:h-32 text-[#F5F5DC] group-hover:scale-110 transition-all" fill="currentColor" />
              </button>
            </div>
          ) : (
            <button
              onClick={toggleMic}
              disabled={isProcessing}
              aria-label="Toggle Microphone"
              className={`
                relative w-64 h-64 md:w-80 md:h-80 rounded-full shadow-[0_20px_50px_rgba(212,175,55,0.3)] flex items-center justify-center group border-8 transition-all duration-300 ease-out focus:outline-none
                ${isRecording ? 'bg-[#991B1B] border-[#450a0a] scale-105 shadow-[0_20px_50px_rgba(153,27,27,0.5)]' : 'bg-[#D4AF37] border-[#2A2A2A] active:scale-95 hover:brightness-110'}
                ${isProcessing ? 'opacity-80 scale-95 pointer-events-none' : ''}
              `}
            >
              {isRecording && (
                <div className="absolute inset-0 rounded-full border-4 border-[#991B1B] animate-ping opacity-75"></div>
              )}

              {isProcessing ? (
                <Loader2 className={`w-28 h-28 md:w-40 md:h-40 animate-spin absolute ${isRecording ? 'text-[#F5F5DC]' : 'text-[#121212]'}`} />
              ) : (
                <Mic className={`w-28 h-28 md:w-40 md:h-40 relative z-10 transition-transform group-hover:scale-110 ${isRecording ? 'text-[#F5F5DC]' : 'text-[#121212]'}`} />
              )}
            </button>
          )}
        </div>

        {/* Feedback State */}
        <div className="text-center px-4 max-w-xl">
          <p className="text-3xl md:text-5xl font-medium leading-relaxed mb-4 min-h-[4rem] text-[#F5F5DC]">
            {statusText}
          </p>
          {!isRecording && !isProcessing && !isPlayingQuran && !isSpeaking && (
            <p className="text-xl md:text-2xl mt-4 opacity-60 font-sans">
              Press to ask about Surah, Ayah, or Tafsir
            </p>
          )}
        </div>
      </main>

      {/* Helper / Footer */}
      <footer className="z-10 w-full flex flex-wrap justify-center gap-6 md:gap-12 border-t border-[#D4AF37]/20 pt-8 mt-4">
        <div className="flex items-center gap-3">
          <div className="w-3 h-3 md:w-4 md:h-4 bg-[#D4AF37] rounded-full"></div>
          <span className="text-xl md:text-2xl">تفسیر ابن کثیر</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-3 h-3 md:w-4 md:h-4 bg-[#D4AF37] rounded-full"></div>
          <span className="text-xl md:text-2xl">ڈاکٹر اسرار احمد</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-3 h-3 md:w-4 md:h-4 bg-[#D4AF37] rounded-full"></div>
          <span className="text-xl md:text-2xl">شیخ الحصری</span>
        </div>
      </footer>
    </div>
  );
}
