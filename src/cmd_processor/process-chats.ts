import { BedRockChatBot, ImageAttachment } from '../helpers/BedrockChatBot';
import { ImageFormat } from '@aws-sdk/client-bedrock-runtime';
import { create } from 'axios';
import { Collection,  Message, ChannelType, Attachment, Snowflake, Client, TextChannel, PublicThreadChannel } from 'discord.js';
import { LogType, logConsole } from '../helpers/logger';

const DC_CLIENT = process.env['DC_CLIENT'] || '';

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
  const images = await findImages(message.attachments);
  const response = await chatbot.converse(message.content, images);
  thread.send(response);
}


// Start a new thread/chat with the user
async function startChat(message: Message) {
  const chatbot = new BedRockChatBot({ maxTokens: 1000, modelId: 'us.anthropic.claude-3-7-sonnet-20250219-v1:0' });
  const channel = message.channel as TextChannel;
  const thread = await channel.threads.create({
    type: ChannelType.PublicThread,
    name: `New thread with ${message.author.username} ${message.id}`,
    reason: 'Someone wants to chat!',
    autoArchiveDuration: 60
  }) as PublicThreadChannel;
  await thread.sendTyping();
  const images = await findImages(message.attachments)
  await thread.send(await chatbot.converse(`My name is ${message.author.username}. ${message.content.replace('@devbot', '')}`, images));

  const collector = await thread.createMessageCollector();
  collector.on('collect', (msg) => {
    if(msg.author.id === DC_CLIENT) return;
    newThreadMessage(thread, msg, chatbot).then(() => { return 0 }).catch((err) => {
      logConsole({ msg: `Error processing new thread message - ${err}`, type: LogType.Error });
    });
  });
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
      startChat(message).catch((err) => {
        logConsole({ msg: `Error starting chat - ${err}`, type: LogType.Error });
        message.reply({ content: 'Error starting chat! Please try again later.' });
      });
    }
  })
}
