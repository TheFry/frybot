import { ElevenLabsClient, stream } from 'elevenlabs';
import { OutputFormat } from 'elevenlabs/api';
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


export async function textToSpeechSocket(apiKey: string, voiceId: string = 'cmudN4ihcI42n48urXgc', modelId: string = 'eleven_flash_v2_5') {
  const websocketUri = `wss://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream-input?model_id=${modelId}&inactivity_timeout=180`;
  const websocket = new WebSocket(websocketUri, { headers: { 'xi-api-key': apiKey } });
  
  return await new Promise<WebSocket>((resolve, reject) => {
    const rejectError = (err: Event) => {
      console.error('WebSocket error:', err);
      reject(err);
    }
    websocket.addEventListener('error', rejectError);
    websocket.addEventListener('open', (event) => {
      console.log('WebSocket connection opened:', event);
      websocket.removeEventListener('error', rejectError);
      websocket.send(JSON.stringify({ text: ' ' }));
      resolve(websocket);
    });
  });
}


export async function textToSpeech(client: ElevenLabsClient, text: string, voiceId: string = 'cmudN4ihcI42n48urXgc', modelId: string = 'eleven_flash_v2_5') {
  return await client.textToSpeech.convertAsStream(voiceId, { text: text, model_id: modelId });
}

export async function speechToText(client: ElevenLabsClient, audio: ReadStream, model_id: string = 'scribe_v1') {
  const textData =  await client.speechToText.convert({
    file: audio,
    model_id: model_id,
    language_code: 'eng',
    tag_audio_events: true,
    // file_format: 'pcm_s16le_16'
  })

  // console.log(JSON.stringify(textData, null, 2));
  return textData.text;
}
