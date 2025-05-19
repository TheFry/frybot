import { ElevenLabsClient } from 'elevenlabs';
import { ReadStream } from 'fs';

const client: ElevenLabsClient | null = null;


export async function getClient(apiKey: string) {
  if (client) {
    return client;
  } else {
    const elevenlabs = new ElevenLabsClient({
      apiKey: apiKey
    });
    return elevenlabs;
  }
}

export async function textToSpeech(client: ElevenLabsClient, text: string, voiceId: string = 'cmudN4ihcI42n48urXgc', modelId: string = 'eleven_turbo_v2_5') {
  return await client.textToSpeech.convert(voiceId, { text: text, model_id: modelId });
}

export async function speechToText(client: ElevenLabsClient, audio: ReadStream, model_id: string = 'scribe_v1') {
  const textData =  await client.speechToText.convert({
    file: audio,
    model_id: model_id,
    language_code: 'eng',
    tag_audio_events: true
  })

  console.log(JSON.stringify(textData, null, 2));
  return textData.text;
}