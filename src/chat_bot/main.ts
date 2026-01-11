import { ImageFormat } from '@aws-sdk/client-bedrock-runtime';
import { getVoiceConnection } from '@discordjs/voice';
import { create } from 'axios';
import { 
  Collection,
  Message,
  ChannelType,
  Attachment,
  Snowflake,
  Client,
  TextChannel,
  PublicThreadChannel,
  GuildMember 
} from 'discord.js';
import { LogType, logConsole } from '../helpers/logger';
import { listenAndProcessAudio } from './voice';
import { BedRockChatBot, ImageAttachment } from '../helpers/BedrockChatBot';


const DC_CLIENT = process.env['DC_CLIENT'] || '';

const allowedUsers = [
  '399424828634824704', //thefry
  '304442538020962304', //joe
  '188442885820121088', //poopmagoo
]

const allowedVoiceChatUsers = [
  '399424828634824704'
]

enum ChatType {
  None,
  TextChat,
  VoiceChat
}


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


async function newThreadMessage(thread: PublicThreadChannel, message: Message, chatbot: BedRockChatBot, chatType: ChatType) {
  thread.sendTyping();

  if(chatType === ChatType.VoiceChat) {
    if(message.content === 'stop-voice') {
      const voiceConnection = getVoiceConnection(thread.guildId);
      if(voiceConnection) {
        voiceConnection.disconnect();
        voiceConnection.destroy();
      }
      thread.send('Goodbye!');
      return false;
    }
    return;
  }

  if(message.content === 'stop-chat') {
    thread.send('Goodbye!');
    return false;
  }

  const images = await findImages(message.attachments);
  const response = await chatbot.converse(message.content, images) as string;
  thread.send(response);
  return true;
}


async function initThreadCollector(thread: PublicThreadChannel, chatbot: BedRockChatBot, chatType: ChatType) {
  const collector = await thread.createMessageCollector();
  collector.on('collect', async (msg) => {
    if(msg.author.id === DC_CLIENT) return;
    try {
      const continueChat = await newThreadMessage(thread, msg, chatbot, chatType);
      if(!continueChat) {
        collector.stop();
        return;
      }
    } catch (err) {
      logConsole({ msg: `Error processing new thread message - ${err}`, type: LogType.Error });
      collector.stop();
      return;
    }
  });
} 


async function startChat(message: Message, chatType: ChatType = ChatType.TextChat) {
  const chatbot = new BedRockChatBot({ maxTokens: 500, modelId: 'us.anthropic.claude-haiku-4-5-20251001-v1:0' });
  const channel = message.channel as TextChannel;
  const member = channel.members.get(message.author.id) as GuildMember;

  const thread = await channel.threads.create({
    type: ChannelType.PublicThread,
    name: `New thread with ${message.author.username} ${message.id}`,
    reason: 'Someone wants to chat!',
    autoArchiveDuration: 60
  }) as PublicThreadChannel;

  await thread.sendTyping();

  try {
    await initThreadCollector(thread, chatbot, chatType);
  } catch (err) {
    logConsole({ msg: `Error starting collector - ${err}`, type: LogType.Error });
    thread.send({ content: 'Error starting chat! Please try again later.' });
    return;
  }

  if(chatType === ChatType.VoiceChat) {
    if(!member.voice.channelId) {
      thread.send({ content: 'You must be in a voice channel to start a voice chat!' });
      return;
    } else {
      thread.send({ content: 'Starting voice chat! Say "stop voice", or type "stop-voice" in this thread to end the chat.' });
      listenAndProcessAudio(member, thread, chatbot);
    }
  } else {
    try {
      const images = await findImages(message.attachments);
      const cleanMsg = message.content.replace(`<@${DC_CLIENT}>`, '').replace('use-voice', '').trim();
      const reply = await chatbot.converse(`My name is ${message.author.username}. ${cleanMsg}`, images) as string;
      thread.send(reply);
    } catch(err) {

    }
  }
}


function getChatType(message: Message): ChatType {
  if(allowedUsers.includes(message.author.id)
    && ! message.hasThread
    && message.channel.type === ChannelType.GuildText 
    && message.mentions
    && message.mentions.users
    && message.mentions.users.get(DC_CLIENT)
    && message.mentions.users.size === 1) {
      const cleanMsg = message.content.replace(`<@${DC_CLIENT}>`, '').trim();
      const startType = cleanMsg === 'use-voice' && allowedVoiceChatUsers.includes(message.author.id) ? ChatType.VoiceChat : ChatType.TextChat;
      return startType;
    }
  return ChatType.None;
}


export function processChatMessages(client: Client) {
  client.on('messageCreate', async (message: Message) => {
    const chatType = getChatType(message);
    if(chatType === ChatType.None) {
      return;
    }

    try {
      await startChat(message, chatType);
    } catch (err) {
      logConsole({ msg: `Error starting chat - ${err}`, type: LogType.Error });
      message.reply({ content: 'Error starting chat! Please try again later.' });
    }
  });
}
