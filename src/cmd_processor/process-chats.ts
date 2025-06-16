import { BedRockChatBot, ImageAttachment } from '../helpers/BedrockChatBot';
import { ImageFormat } from '@aws-sdk/client-bedrock-runtime';
import { create } from 'axios';
import { Collection,  Message, ChannelType, Attachment, Snowflake, Client, TextChannel, PublicThreadChannel, GuildMember } from 'discord.js';
import { LogType, logConsole } from '../helpers/logger';
import { VoiceBot } from '../voice_bot/VoiceBot';
import { AudioPlayer, AudioPlayerStatus, createAudioResource, EndBehaviorType, entersState, getVoiceConnection, VoiceConnection, VoiceReceiver } from '@discordjs/voice';
import { Readable } from 'stream';
import { OpusEncoder } from "@discordjs/opus";
import ffmpeg from 'fluent-ffmpeg';
import { getClient, textToSpeech, speechToText, textToSpeechSocket } from '../helpers/eleven';
import { createReadStream } from 'fs';
import { ConverseStreamOutput } from '@aws-sdk/client-bedrock-runtime';
const DC_CLIENT = process.env['DC_CLIENT'] || '';
import { ElevenLabsClient } from 'elevenlabs';

const allowedUsers = [
  '399424828634824704', //thefry
  '304442538020962304', //joe
  '188442885820121088', //poopmagoo
]


// Find images in the message attachments, download them, and return them as ImageAttachment
async function findImages(attachments: Collection<Snowflake, Attachment>) : Promise<ImageAttachment[]> {
  const maxSizeBytes = 3750000
  const maxHeight = 8000
  const maxWidth = 8000 
  const images: ImageAttachment[] = [];
  const axios = create();
  for (const [id, attachment] of attachments) {
    if(
      ! attachment.contentType
      || ! Object.values(ImageFormat).includes(attachment.contentType.split("/")[1] as ImageFormat)
      || attachment.size > maxSizeBytes
      || attachment.height as number > maxHeight
      || attachment.width as number > maxWidth
    ) continue;
    try {
      const res = await axios.get(attachment.url, { responseType: 'arraybuffer' }); 
      images.push({ data: new Uint8Array(res.data), type: attachment.contentType.split("/")[1] as ImageFormat });
    } catch (err) {
      logConsole({ msg: `Error downloading image ${attachment.url} - ${err}`, type: LogType.Error });
    }
  }
  return images;
}


// Process new message in a thread
async function newThreadMessage(thread: PublicThreadChannel, message: Message, chatbot: BedRockChatBot) {
  thread.sendTyping();
  if(message.content === 'stop-chat') {
    thread.send('Goodbye!');
    return false;
  }

  const images = await findImages(message.attachments);
  const response = await chatbot.converse(message.content, images) as string
  thread.send(response);
  return true;
}


async function websocketTTS(chatbot: BedRockChatBot, text: string, voicePlayer: AudioPlayer, websocket: WebSocket) {
  const responseStream = await chatbot.converse(text, undefined, true) as AsyncIterable<ConverseStreamOutput>;
  const audioStream = new Readable({ read() {}});
  let firstChunk = true;

  let said = '';
  websocket.addEventListener('message', (event) => {
    const audio = JSON.parse(event.data)['audio'];
    const alignment = JSON.parse(event.data)['normalizedAlignment'];
    if(alignment && alignment['chars']) {
      said += alignment['chars'].join('').replace(/[^a-zA-Z0-9]/g, '');
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
      if(said === bedrockResponseText.replace(/[^a-zA-Z0-9]/g, '')) {
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

async function restTTS(chatbot: BedRockChatBot, elevenClient: ElevenLabsClient, text: string, voicePlayer: AudioPlayer) {
  const response = await chatbot.converse(text) as string;
  const audioStream = await textToSpeech(elevenClient, response);
  const resource = createAudioResource(audioStream);
  voicePlayer.play(resource);
  await entersState(voicePlayer, AudioPlayerStatus.Idle, 300_000);
}


async function processUserAudio(voiceReceiver: VoiceReceiver, member: GuildMember, i: number) {
  const voiceSub = voiceReceiver.subscribe(member.id, { end: { behavior: EndBehaviorType.AfterInactivity, duration: 1500 } });
  const ffmpegOptions = ['-f s16le', '-ar 48k', '-ac 2'];
  const decodedStream = new Readable({ read(){} });
  const decoder = new OpusEncoder(48000, 2);

  await new Promise<void>((resolve, reject) => {
    ffmpeg(decodedStream)
      .inputOptions(ffmpegOptions)
      .output(`test${i}.mp3`)
      .on('error', (err: any) => {
        logConsole({ msg: `Error processing audio - ${err}`, type: LogType.Error });
        reject(err);
      })
      .on('end', async () => {
        try {
          console.log('Finished processing audio')
          resolve();
        } catch (e) {
          reject(e);
        }
      })
      .run();

    voiceSub.on('data', (chunk) => {
      const decodedData = decoder.decode(chunk);
      decodedStream.push(decodedData);
    });

    voiceSub.on('end', () => {
      decodedStream.push(null);
    });
  });
  voiceSub.destroy();
  decodedStream.destroy();
}


async function listenAndProcessAudio(member: GuildMember, thread: PublicThreadChannel, chatbot: BedRockChatBot) {
  const voicePlayer = (await VoiceBot.connect({
    channelId: member.voice.channelId as string,
    guildId: member.guild.id,
    voiceAdapter: member.guild.voiceAdapterCreator,
    deafened: false
  })).player;

  const voiceConnection = getVoiceConnection(thread.guildId) as VoiceConnection;
  const voiceReceiver = voiceConnection.receiver;
  const elevenClient = await getClient(process.env['ELEVEN_LABS_KEY'] || '');

  voicePlayer.on('error', (err) => {
    logConsole({ msg: `Voice player error - ${err}`, type: LogType.Error });
  });

  // Loop through messages and chat
  let i = 0;
  const websocket = await textToSpeechSocket(process.env['ELEVEN_LABS_KEY'] || '');
  while (true) {
    await processUserAudio(voiceReceiver, member, i);
    const text = await speechToText(elevenClient, createReadStream(`test${i}.mp3`));
    if(text === '') {
      continue;
    } else if(text.toLowerCase().includes('stop voice')) {
      voicePlayer.stop();
      const connection = getVoiceConnection(thread.guildId);
      if(connection) {
        connection.disconnect();
        connection.destroy();
      }
      thread.send('Goodbye!');
      break;
    }
    await websocketTTS(chatbot, text, voicePlayer, websocket);
    // await restTTS(chatbot, elevenClient, text, voicePlayer);
  }
}


// Start a new thread/chat with the user
async function startChat(message: Message, voice = false) {
  const chatbot = new BedRockChatBot({ maxTokens: 500, modelId: 'us.anthropic.claude-3-7-sonnet-20250219-v1:0' });
  const channel = message.channel as TextChannel;
  const member = channel.members.get(message.author.id) as GuildMember;

  const thread = await channel.threads.create({
    type: ChannelType.PublicThread,
    name: `New thread with ${message.author.username} ${message.id}`,
    reason: 'Someone wants to chat!',
    autoArchiveDuration: 60
  }) as PublicThreadChannel;

  await thread.sendTyping();

  const initCollector = async () => {
    const collector = await thread.createMessageCollector();
    collector.on('collect', async (msg) => {
      if(msg.author.id === DC_CLIENT) return;
      newThreadMessage(thread, msg, chatbot)
        .then((continueChat) => { 
          if(!continueChat) {
            collector.stop();
          } 
        })
        .catch((err) => {
          logConsole({ msg: `Error processing new thread message - ${err}`, type: LogType.Error });
          collector.stop();
          return false;
        });
    });
  }

  if(voice) {
    if(!member.voice.channelId) {
      thread.send({ content: 'You must be in a voice channel to start a voice chat!' });
      return;
    } else {
      listenAndProcessAudio(member, thread, chatbot);
    }
  } else {
    const images = await findImages(message.attachments);
    const cleanMsg = message.content.replace(`<@${DC_CLIENT}>`, '').replace('use-voice', '').trim();
    const reply = await chatbot.converse(`My name is ${message.author.username}. ${cleanMsg}`, images) as string;
    thread.send(reply);
    initCollector().catch((err) => {
      logConsole({ msg: `Error starting collector - ${err}`, type: LogType.Error });
    });
  }
}


// Process new messages. Start a new thread if needed
export function startProcessing(client: Client) {
  client.on('messageCreate', async (message: Message) => {
    if(allowedUsers.includes(message.author.id)
      && ! message.hasThread
      && message.channel.type === ChannelType.GuildText 
      && message.mentions
      && message.mentions.users
      && message.mentions.users.get(DC_CLIENT)
      && message.mentions.users.size === 1) {
      const cleanMsg = message.content.replace(`<@${DC_CLIENT}>`, '').trim();
      console.log(cleanMsg)
      const useVoice = cleanMsg === 'use-voice' && message.author.id === '399424828634824704' ? true : false;
      startChat(message, useVoice).catch((err) => {
        logConsole({ msg: `Error starting chat - ${err}`, type: LogType.Error });
        message.reply({ content: 'Error starting chat! Please try again later.' });
      });
    }
  })
}
