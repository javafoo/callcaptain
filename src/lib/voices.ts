/**
 * Voices the owner can pick on the Agent setup page: Cartesia voices, all multilingual on
 * Sonic 2, so any of them can switch languages mid-call. Preview clips live in /public/voices.
 */
export type VoiceOption = { id: string; name: string; gender: "female" | "male"; accent: string; description: string };

export const VOICES: VoiceOption[] = [
  {
    "id": "3ccc4544-84f7-45e3-ae57-5c52b5a1fac6",
    "name": "Aiden",
    "gender": "male",
    "accent": "American",
    "description": "Soothing, calm depth and gentle pacing. Suits spas, wellness and relaxation."
  },
  {
    "id": "9a0894a9-28f0-436e-9a1d-e92bccbce4dd",
    "name": "Albert",
    "gender": "male",
    "accent": "American",
    "description": "Firm and authoritative, for clear instructions and guidance."
  },
  {
    "id": "9287676d-f0cc-423f-ac03-3b3c7242f091",
    "name": "Allen",
    "gender": "male",
    "accent": "American",
    "description": "Confident young adult with a neutral American accent, for everyday conversations."
  },
  {
    "id": "2747b6cf-fa34-460c-97db-267566918881",
    "name": "Allie",
    "gender": "female",
    "accent": "American",
    "description": "Confident, approachable young woman for natural conversational support."
  },
  {
    "id": "a7a59115-2425-4192-844c-1e98ec7d6877",
    "name": "Amber",
    "gender": "female",
    "accent": "American",
    "description": "Cheerful yet deeper tone, balancing warmth and authority for customer service."
  },
  {
    "id": "2948c301-9211-4112-8f36-4c3fc836ef12",
    "name": "Bryce",
    "gender": "male",
    "accent": "American",
    "description": "Clear enunciation and strong delivery for professional and instructional calls."
  },
  {
    "id": "47c38ca4-5f35-497b-b1a3-415245fb35e1",
    "name": "Daniel",
    "gender": "male",
    "accent": "American",
    "description": "Clear, crisp male voice for digital assistants."
  },
  {
    "id": "cc00e582-ed66-4004-8336-0175b85c85f6",
    "name": "Dana",
    "gender": "female",
    "accent": "American",
    "description": "Clear articulation and a calm tone, versatile for conversational or professional use."
  },
  {
    "id": "db69127a-dbaf-4fa9-b425-2fe67680c348",
    "name": "Clint",
    "gender": "male",
    "accent": "American",
    "description": "Raspy and rugged. A distinctive character voice."
  },
  {
    "id": "c0f43c66-9f21-4034-b485-8f1d3340d759",
    "name": "Clarkson",
    "gender": "male",
    "accent": "American",
    "description": "Businesslike and confident, for corporate and formal settings."
  },
  {
    "id": "356f4a89-d056-4e2e-8c73-865fa4d3af0a",
    "name": "Chandler",
    "gender": "male",
    "accent": "American",
    "description": "Casual and warm, friendly and effortlessly relatable."
  },
  {
    "id": "e8e5fffb-252c-436d-b842-8879b84445b6",
    "name": "Cathy",
    "gender": "female",
    "accent": "American",
    "description": "Nice young adult woman for casual conversations."
  },
  {
    "id": "3c7dfd17-3fa8-47aa-aacc-6313fe025442",
    "name": "Evelyn",
    "gender": "female",
    "accent": "American",
    "description": "Clear, neutral and precise with a smooth polish, made for virtual-assistant responses."
  },
  {
    "id": "d1d9c946-7cfc-4378-85a4-07d09827cb7e",
    "name": "Jolene",
    "gender": "female",
    "accent": "Southern",
    "description": "Rich, honeyed Southern storyteller."
  },
  {
    "id": "87bc56aa-ab01-4baa-9071-77d497064686",
    "name": "Jordan",
    "gender": "male",
    "accent": "American",
    "description": "Welcoming, chill adult male for engaging conversations."
  },
  {
    "id": "e4d5f4c4-6601-4779-bee1-b3c14d629dc6",
    "name": "Jillian",
    "gender": "female",
    "accent": "American",
    "description": "Cheerful, lively and friendly, for upbeat conversations."
  },
  {
    "id": "c5d00dfb-501f-43f3-8e79-c810d24f5acd",
    "name": "Harper",
    "gender": "female",
    "accent": "American",
    "description": "Adult female conversationalist for highly structured communication."
  },
  {
    "id": "cec7cae1-ac8b-4a59-9eac-ec48366f37ae",
    "name": "Haley",
    "gender": "female",
    "accent": "American",
    "description": "Relaxed and friendly, natural and easy to engage with."
  },
  {
    "id": "9fa83ce3-c3a8-4523-accc-173904582ced",
    "name": "Keith",
    "gender": "male",
    "accent": "American",
    "description": "Chill, easygoing young adult for casual conversations."
  },
  {
    "id": "63927f41-9616-4ac2-89cf-f3afa346e0ef",
    "name": "Selene",
    "gender": "female",
    "accent": "American",
    "description": "Relaxing, calm and serene, with a gentle flow."
  },
  {
    "id": "d6c52d6f-6478-47a2-ad54-dbc8f3335a2b",
    "name": "Pearl",
    "gender": "female",
    "accent": "Southern",
    "description": "Soft-spoken, poised Southern voice for attentive client support."
  },
  {
    "id": "86600680-b836-41e1-9916-8475728dcc14",
    "name": "Tiffany",
    "gender": "female",
    "accent": "American",
    "description": "Lively clarity and confident warmth that keeps listeners engaged."
  },
  {
    "id": "b134c304-d095-4d2b-a77a-914f5e8e84e7",
    "name": "Sterling",
    "gender": "male",
    "accent": "American",
    "description": "Deep, commanding and dignified."
  },
  {
    "id": "6a73e45f-3fa6-427c-97da-0fc6a7a1bc0d",
    "name": "Stephanie",
    "gender": "female",
    "accent": "American",
    "description": "Steady, even pacing with a grounding, professional presence."
  }
];

export const DEFAULT_VOICE_ID = "2747b6cf-fa34-460c-97db-267566918881";

/** SWML voice string: cartesia.<voice id>:sonic-2 (signalwire.com/docs/platform/voice/tts/cartesia). */
export function voiceString(id: string): string {
  const known = VOICES.some((v) => v.id === id) ? id : DEFAULT_VOICE_ID;
  return `cartesia.${known}:sonic-2`;
}
