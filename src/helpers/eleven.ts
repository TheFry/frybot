import { ElevenLabsClient, RealtimeEvents, AudioFormat, RealtimeConnection } from '@elevenlabs/elevenlabs-js';
import { OutputFormat } from '@elevenlabs/elevenlabs-js/api';
import { ReadStream } from 'fs';
import { connect } from 'http2';

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


export async function getRealTimeSTT(client: ElevenLabsClient, model_id: string = 'scribe_v2_realtime') {
  const connection = await client.speechToText.realtime.connect({
    modelId: model_id,
    audioFormat: AudioFormat.PCM_16000,
    sampleRate: 16000,
    includeTimestamps: false,
  });

  return new Promise<RealtimeConnection>((resolve, reject) => {
    const onError = (err: any) => {
      console.error('Speech-to-text realtime error:', err);
      cleanup();
      reject(err);
    };

    const onStart = () => {
      console.log('Speech-to-text session started');
      cleanup();
      resolve(connection);
    };

    const cleanup = () => {
      connection.off(RealtimeEvents.ERROR, onError);
      connection.off(RealtimeEvents.SESSION_STARTED, onStart);
    };

    connection.on(RealtimeEvents.ERROR, onError);
    connection.on(RealtimeEvents.SESSION_STARTED, onStart);
    connection.on(RealtimeEvents.CLOSE, () => {
      console.log('Speech-to-text session closed');
    });
  });
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


// export async function textToSpeech(client: ElevenLabsClient, text: string, voiceId: string = 'cmudN4ihcI42n48urXgc', modelId: string = 'eleven_flash_v2_5') {
//   return await client.textToSpeech.convertAsStream(voiceId, { text: text, model_id: modelId });
// }

