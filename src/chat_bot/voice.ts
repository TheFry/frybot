import { Readable } from 'stream';
import { setTimeout } from 'timers/promises';
import { 
  createAudioResource,
  AudioPlayer,
  AudioPlayerStatus,
  entersState ,
  VoiceReceiver,
  EndBehaviorType,
  VoiceConnection,
  getVoiceConnection 
} from '@discordjs/voice';

import { OpusEncoder } from "@discordjs/opus";
import { ConverseStreamOutput } from '@aws-sdk/client-bedrock-runtime';
import { GuildMember, PublicThreadChannel } from 'discord.js';
import { RealtimeEvents } from '@elevenlabs/elevenlabs-js';
import { PersistentSTTConnection } from '../helpers/eleven';
import { ffmpeg } from '../helpers/ffmpeg-wrapper';
import { logConsole, LogType } from '../helpers/logger';
import { BedRockChatBot } from '../helpers/BedrockChatBot';
import { VoiceBot } from '../voice_bot/VoiceBot';
import { getClient as getElevenClient, getRealTimeSTT, textToSpeechSocket } from '../helpers/eleven';


export async function decodeVoiceStream(voiceReceiver: VoiceReceiver, sttStream: PersistentSTTConnection, member: GuildMember, i: number): Promise<string> {
  const voiceSub = voiceReceiver.subscribe(member.id, { end: { behavior: EndBehaviorType.AfterInactivity, duration: 1500 } });
  const decodedStream = new Readable({ read(){} });
  const decodedRate = 48000;
  const decodedChannels = 2;
  const decoder = new OpusEncoder(decodedRate, decodedChannels);
  const ffmpegInputOptions = ['-f', 's16le', '-ar', decodedRate.toString(), '-ac', decodedChannels.toString()];
  const ffmpegOutputOptions = ['-f', 's16le', '-ar', '16k', '-ac', '1'];

  let response = "";
  let completed = false;

  const outputStream = await ffmpeg({
    input: decodedStream,
    inputArgs: ffmpegInputOptions,
    outputArgs: ffmpegOutputOptions
  }) as Readable;

  await new Promise<void>(async (resolve, reject) => {
    const transcriptListener = (transcript: any) => {
      console.log("Committed transcript", transcript);
      logConsole({ msg: `Committed transcript: ${transcript.text}` });
      response += transcript.text + " "; // Append text correctly
      // Only resolve if we have already committed (stream ended)
      if(completed) {
        sttStream.off(RealtimeEvents.COMMITTED_TRANSCRIPT, transcriptListener);
        resolve();
      }
    };

    sttStream.on(RealtimeEvents.COMMITTED_TRANSCRIPT, transcriptListener);

    outputStream.on('data', (chunk: Buffer) => {
      sttStream.send({
        audioBase64: chunk.toString('base64'),
        sampleRate: 16000
      });
    });

    outputStream.on('end', async () => {
      await setTimeout(500); // Wait a bit to ensure all audio is processed
      logConsole({ msg: `FFMPEG finished` });
      completed = true;
      await sttStream.commit(); // Await the commit
    })
  
    voiceSub.on('data', (chunk) => {;
      decodedStream.push(decoder.decode(chunk));
    });

    voiceSub.on('end', () => {
      logConsole({ msg: `Voice stream ended for user ${member.user.username} (${member.id})` });
      decodedStream.push(null);
    });
  });
  
  voiceSub.destroy();
  decodedStream.destroy();
  return response.trim();
}


export async function websocketTTS(chatbot: BedRockChatBot, text: string, voicePlayer: AudioPlayer, websocket: WebSocket) {
  const responseStream = await chatbot.converse(text, undefined, true) as AsyncIterable<ConverseStreamOutput>;
  const audioStream = new Readable({ read() {}});
  let firstChunk = true;

  let processedAudio = '';
  websocket.addEventListener('message', (event) => {
    const audio = JSON.parse(event.data)['audio'];
    const alignment = JSON.parse(event.data)['normalizedAlignment'];
    if(alignment && alignment['chars']) {
      processedAudio += alignment['chars'].join('').replace(/[^a-zA-Z0-9]/g, '');
    }
    if(audio) {
      audioStream.push(Buffer.from(audio, 'base64'));
    }
    if (firstChunk) {
      firstChunk = false;
      const resource = createAudioResource(audioStream);
      voicePlayer.play(resource);
    }
    if(llmDone) {
      // Compare the llm output with the processed audio
      // If they match, end the audio stream so discordjs can stop playing
      if(processedAudio === bedrockResponseText.replace(/[^a-zA-Z0-9]/g, '')) {
        audioStream.push(null);
      }
    }
  });

  let bedrockResponseText = '';
  let llmDone = false;
  for await (const chunk of responseStream) {
    if(chunk.contentBlockStop || chunk.messageStop) {
      llmDone = true;
      websocket.send(JSON.stringify({
        text: ' ',
        flush: true
      }));
      break;
    }
    if(chunk.contentBlockDelta && chunk.contentBlockDelta.delta && chunk.contentBlockDelta.delta.text) {
      bedrockResponseText += chunk.contentBlockDelta.delta.text;
      if(chunk.contentBlockDelta.delta.text != '') {
        websocket.send(JSON.stringify({
          text: chunk.contentBlockDelta.delta.text
        }))
      }
    }
  }
  await entersState(voicePlayer, AudioPlayerStatus.Idle, 300_000);
  chatbot.addMessages([{
    role: 'assistant',
    content: [{
      text: bedrockResponseText
    }]
  }]);
}


export async function listenAndProcessAudio(member: GuildMember, thread: PublicThreadChannel, chatbot: BedRockChatBot) {
  const voicePlayer = (await VoiceBot.connect({
    channelId: member.voice.channelId as string,
    guildId: member.guild.id,
    voiceAdapter: member.guild.voiceAdapterCreator,
    deafened: false
  })).player;


  const voiceConnection = getVoiceConnection(thread.guildId) as VoiceConnection;
  const voiceReceiver = voiceConnection.receiver;
  const elevenClient = await getElevenClient(process.env['ELEVEN_LABS_KEY'] || '');
  const sttStream = await getRealTimeSTT(elevenClient);

  voicePlayer.on('error', (err) => {
    logConsole({ msg: `Voice player error - ${err}`, type: LogType.Error });
  });

  sttStream.on(RealtimeEvents.ERROR, (err) => {
    logConsole({ msg: `Speech-to-text stream error - ${err}`, type: LogType.Error });
  });

  // Loop through messages and chat
  let i = 0;
  const websocket = await textToSpeechSocket(process.env['ELEVEN_LABS_KEY'] || '');
  while (true) {
    const text = await decodeVoiceStream(voiceReceiver, sttStream, member, i);
    logConsole({ msg: `Transcribed text: ${text}` });
    i++;

    await websocketTTS(chatbot, text, voicePlayer, websocket);
  }
}