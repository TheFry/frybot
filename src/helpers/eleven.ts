import { ElevenLabsClient, RealtimeEvents, AudioFormat, RealtimeConnection, CommitStrategy } from '@elevenlabs/elevenlabs-js';
import { OutputFormat } from '@elevenlabs/elevenlabs-js/api';
import { EventEmitter } from 'events';

let elevenClient: ElevenLabsClient | null = null;

export async function getClient(apiKey: string) {
  if (elevenClient) {
    return elevenClient;
  } else {
    elevenClient = new ElevenLabsClient({
      apiKey: apiKey
    });
    return elevenClient;
  }
}

interface STTSendOptions {
  audioBase64: string;
  commit?: boolean | undefined;
  sampleRate?: number | undefined;
  previousText?: string | undefined;
}

export class PersistentSTTConnection extends EventEmitter {
  private client: ElevenLabsClient;
  private modelId: string;
  private connection: RealtimeConnection | null = null;
  private isConnecting = false;
  private lastTranscript = "";
  private needsContextUpdate = false;

  constructor(client: ElevenLabsClient, modelId: string) {
    super();
    this.client = client;
    this.modelId = modelId;
  }

  async connect() {
    this.isConnecting = true;
    await this.establishConnection();
    this.isConnecting = false;
    this.emit('reconnected');
    return this;
  }

  private async establishConnection() {
    try {
      this.connection = await this.client.speechToText.realtime.connect({
        modelId: this.modelId,
        audioFormat: AudioFormat.PCM_16000,
        sampleRate: 16000,
        includeTimestamps: false,
        commitStrategy: CommitStrategy.MANUAL
      });

      this.connection.on(RealtimeEvents.COMMITTED_TRANSCRIPT, (data) => {
        this.lastTranscript += data.text + " ";
        this.emit(RealtimeEvents.COMMITTED_TRANSCRIPT, data);
      });

      this.connection.on(RealtimeEvents.ERROR, (err) => {
        console.error('STT Error:', err);
        this.handleReconnect();
      });

      this.connection.on(RealtimeEvents.CLOSE, () => {
        console.log('STT Closed');
        this.handleReconnect();
      });
      
      this.connection.on(RealtimeEvents.SESSION_STARTED, (data) => {
        this.emit(RealtimeEvents.SESSION_STARTED, data);
      });

    } catch (err) {
      console.error("Failed to connect", err);
      throw err;
    } finally {
      this.isConnecting = false;
    }
  }

  private async handleReconnect() {
    if (this.isConnecting) return;
    this.isConnecting = true;
    console.log('Reconnecting STT...');

    for (let i = 0; i < 3; i++) {
      try {
        await new Promise(r => setTimeout(r, 1000 * Math.pow(2, i)));
        await this.establishConnection();
        this.isConnecting = false;
        this.needsContextUpdate = true;
        console.log('Reconnected STT');
        this.emit('reconnected');
        return;
      } catch (e) {
        console.error(`Reconnect attempt ${i + 1} failed`, e);
      }
    }
    this.isConnecting = false;
    this.emit('reconnect-error', new Error('Failed to reconnect'));
  }

  private async waitForConnection(): Promise<void> {
    if (!this.isConnecting && this.connection) return;

    return new Promise((resolve, reject) => {
      const cleanup = (err?: Error) => {
        this.off('reconnected', cleanup);
        this.off('reconnect-error', cleanup);
        if(err) reject(err);
        resolve();
      };

      this.once('reconnected', cleanup);
      this.once('reconnect-error', cleanup);
    });
  }

  async send(data: STTSendOptions) {
    try {
      await this.waitForConnection();
    } catch (err) {
      console.error('Failed to send data due to connection error:', err);
      return;
    }

    if (this.needsContextUpdate && data.audioBase64) {
      data.previousText = this.lastTranscript.slice(-500); // Keep last 500 chars context
      this.needsContextUpdate = false;
    }
    this.connection?.send(data);
  }

  async commit() {
    try {
      await this.waitForConnection();
    } catch (err) {
      console.error('Failed to send data due to connection error:', err);
      return;
    }
    this.connection?.commit();
  }
}

export async function getRealTimeSTT(client: ElevenLabsClient, model_id: string = 'scribe_v2_realtime') {
  const persistent = new PersistentSTTConnection(client, model_id);
  await persistent.connect();
  return persistent;
}


export async function textToSpeechSocket(apiKey: string, voiceId: string = 'cmudN4ihcI42n48urXgc', modelId: string = 'eleven_flash_v2_5') {
  const websocketUri = `wss://api.elevenlabs.io/v1/text-to-speech/${voiceId}/multi-stream-input?model_id=${modelId}`;
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

