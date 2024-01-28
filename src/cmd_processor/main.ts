import loadCommands from '../helpers/load-commands';
import { ChannelType, Client, Collection, DMChannel, GatewayIntentBits, Interaction, Message, Partials } from 'discord.js';
import { checkVars, DiscordClient, INTERACTION_QUEUE_KEY, KOBOLD_QUEUE_KEY, KoboldJob } from '../helpers/common';
import { addInteraction, DiscordResponse, interactions } from '../helpers/interactions';
import { newClient as newRedisClient } from '../helpers/redis';
import { dequeue, enqueue } from '../helpers/message_queue';
import { rmSync } from 'fs';
import { LogType, logConsole } from '../helpers/logger';
import { processChats } from '../chat_bot/chat';

checkVars();
const DC_TOKEN = process.env['DC_TOKEN'] || '';
const DC_CLIENT = process.env['DC_CLIENT'] || '';
const G_ID = process.env['G_ID'] || '';

const client: DiscordClient = new Client({ partials: [Partials.Channel], intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates, GatewayIntentBits.DirectMessages] }) as DiscordClient;


client.login(DC_TOKEN)
  .catch((err) => { 
    logConsole({ msg: `${err}`, type: LogType.Error });
    process.exit(1);
  })

client.once('ready', async () => {
  logConsole({ msg: 'Client logged in!' });
  await newRedisClient();
  client.commands = new Collection();
  processChats(client);
  loadCommands(client, DC_TOKEN, DC_CLIENT, '../cmd_processor/commands', G_ID);
  respond();
});


client.on('messageCreate', async (message: Message) => {
  if(message.channel.type !== ChannelType.DM || message.author.id === client.application?.id) {
    return;
  }
  const channel = message.channel as DMChannel;
  let job: KoboldJob = {
    channelId: channel.id,
    prompt: message.content,
    userId: message.author.id,
    username: message.author.displayName  
  }
  await enqueue(KOBOLD_QUEUE_KEY, [job]);
})


client.on('interactionCreate', async (interaction: Interaction) => {
  if (!interaction.isChatInputCommand()) return;
  await addInteraction(interaction);
  const interactionClient = interaction.client as DiscordClient;
  const command = interactionClient.commands.get(interaction.commandName);

  if (!command) {
    interaction.reply('Command not registered!');
    return;
  }

  try {
    await command.execute(interaction);
  } catch (error) {
    logConsole({ msg: `${error}`, type: LogType.Error });
    const errMsg = { content: 'There was an error while executing this command!', ephemeral: true };
    try {
      if(interaction.replied) {
        await interaction.editReply(errMsg); 
      } else {
        await interaction.reply(errMsg);
      }
    } catch(err) {
      logConsole({ msg: `Error trying to send error ??? - ${err}`, type: LogType.Error });
    }
  }
})


async function respond() {
  const watch = true;

  while(watch) {
    const res = (await dequeue(INTERACTION_QUEUE_KEY, 1, 0))[0];
    if(res && res.error) {
      logConsole({ msg: `Error dequeueing from interaction queue - ${res.error}`, type: LogType.Error });
      continue;
    }

    if(!res.message) {
      logConsole({ msg: `Error dequeueing from interaction queue - no message object`, type: LogType.Error });
      continue;
    }

    const { content, files, interactionId } = res.message as DiscordResponse;
    if(!content || !interactionId) {
      logConsole({ msg: `Error dequeueing from interaction queue - invalid message object\n${res}`, type: LogType.Error });
      continue;
    }
    const interaction = interactions[interactionId];
    if(interactions) {
      if(interaction.isChatInputCommand() || interaction.isModalSubmit()) {
        try {
          if(interaction.replied) {
            await interaction.editReply({ content: content ? content : '', files: files ? files : [] });
          } else {
            await interaction.editReply({ content: content ? content : '', files: files ? files : [] });
          }
        } catch(err) {
          logConsole({ msg: `Interaction Reply error - ${err}`, type: LogType.Error })
          continue;
        }
        
        // For now just delete files after sending
        if(files !== undefined) {
          files.forEach(file => {
            try {
              rmSync(file)
            } catch { 
              // TODO: handle failed file deletion
            }
          })
        }
      } else {
        logConsole({ msg: `Didn't handle interaction type ${interaction.type}`, type: LogType.Warn });
      }
    }

  }
}