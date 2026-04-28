import { GoogleGenAI, Type, Modality } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function generateUrduAudio(text: string): Promise<string | null> {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3.1-flash-tts-preview",
      contents: [{ parts: [{ text: text }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: 'Charon' }, // Calm male voice
          },
        },
      },
    });

    return response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data || null;
  } catch (err: any) {
    console.error("Failed to generate TTS", err);
    return null;
  }
}

export interface IntentResult {
  intent: 'provide_surah_ayah' | 'ask_question' | 'next_ayah' | 'unknown';
  surahNumber?: number;
  ayahNumber?: number;
  responseForUserUrdu: string;
}

export async function parseUserIntentAudio(audioBase64: string, mimeType: string, context?: { lastSurah?: number, lastAyah?: number }): Promise<IntentResult> {
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: [
      {
        role: "user",
        parts: [
          {
            inlineData: {
              data: audioBase64,
              mimeType: mimeType
            }
          },
          {
            text: `Analyze the user's spoken audio (usually in Urdu or mixed Urdu/English).
    Context: They might be following up on Surah ${context?.lastSurah}, Ayah ${context?.lastAyah}.
    
    Extract the intent:
    1. 'provide_surah_ayah': If they are stating a Surah name and Ayah number to listen to. Mapped to surahNumber (1-114) and ayahNumber.
    2. 'next_ayah': If they say "yes", "next", "aagay", "agayat", etc. wanting to proceed to the next ayah.
    3. 'ask_question': If they ask a general question about Islam, the verse, Tafsir, etc.
    4. 'unknown': If it's unclear.
    
    If intent is 'ask_question', the 'responseForUserUrdu' MUST contain the answer to their question in a calm, clear conversational reply in Urdu script.
    Otherwise, provide an acknowledgment in Urdu script (e.g. "Main Surah Baqarah ki ayat number do suna raha hoon." or "Agli ayat sunatay hain.").`
          }
        ]
      }
    ],
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          intent: {
            type: Type.STRING,
            description: "provide_surah_ayah, ask_question, next_ayah, or unknown",
          },
          surahNumber: { type: Type.NUMBER, description: "1-114" },
          ayahNumber: { type: Type.NUMBER },
          responseForUserUrdu: { 
            type: Type.STRING, 
            description: "A calm, clear conversational reply in Urdu script. If ask_question, answer the question here."
           }
        },
        required: ["intent", "responseForUserUrdu"]
      }
    }
  });

  return JSON.parse(response.text!);
}

export async function parseUserIntent(transcript: string, context?: { lastSurah?: number, lastAyah?: number }): Promise<IntentResult> {
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: `Analyze the following user input (spoken by an elderly person, usually in Urdu or mixed Urdu/English): "${transcript}"
    Context: They might be following up on Surah ${context?.lastSurah}, Ayah ${context?.lastAyah}.
    
    Extract the intent:
    1. 'provide_surah_ayah': If they are stating a Surah name and Ayah number to listen to. Mapped to surahNumber (1-114) and ayahNumber.
    2. 'next_ayah': If they say "yes", "next", "aagay", "agayat", etc. wanting to proceed to the next ayah.
    3. 'ask_question': If they ask a question about Islam, the verse, Tafsir, etc.
    4. 'unknown': If it's unclear.
    
    Always provide a 'responseForUserUrdu' which is a calm conversational reply in Urdu. E.g., "Main Surah Baqarah ki ayat number do suna raha hoon." or "Agli ayat sunatay hain."`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          intent: {
            type: Type.STRING,
            description: "provide_surah_ayah, ask_question, next_ayah, or unknown",
          },
          surahNumber: { type: Type.NUMBER, description: "1-114" },
          ayahNumber: { type: Type.NUMBER },
          responseForUserUrdu: { 
            type: Type.STRING, 
            description: "A calm, clear conversational reply in Urdu script."
           }
        },
        required: ["intent", "responseForUserUrdu"]
      }
    }
  });

  return JSON.parse(response.text!);
}

export async function getTafsir(surah: number, ayah: number): Promise<string> {
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: `Please provide:
1. The translation of Surah ${surah}, Ayah ${ayah} in Urdu.
2. A brief, calm Tafsir (combining insights from Tafseer Ibn Kathir and Dr. Israr Ahmed) for this Ayah in Urdu.
3. Keep the tone very respectful, clear, and easy to understand for elderly people. Make it reasonably brief, don't overwhelm them with huge text.
4. At the very end, ask them: "Kya aap agli ayat sunna chahenge, ya iske baray mein mazeed kuch poochna chahenge?" (in Urdu script).`,
    config: {
       systemInstruction: "You are a calm, respectful Quran Copilot for elderly users. All your responses must be strictly in clear Urdu script. No English text in the final output."
    }
  });
  return response.text!;
}

export async function handleGeneralQuestion(transcript: string): Promise<string> {
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: `The user asked: "${transcript}". Please answer briefly and calmly in Urdu.`,
    config: {
       systemInstruction: "You are a calm, respectful Quran Copilot for elderly users. Answer in Urdu script only. Keep it short and easy to understand."
    }
  });
  return response.text!;
}
