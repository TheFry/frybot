import loadCommands from '../helpers/load-commands';
import { Client, Collection, GatewayIntentBits, Interaction } from 'discord.js';
import { checkVars, DiscordClient } from '../helpers/common';
import { addInteraction } from '../helpers/interactions';
import * as redis from '../helpers/redis';

checkVars();
const DC_TOKEN = process.env['DC_TOKEN'] || '';
const DC_CLIENT = process.env['DC_CLIENT'] || '';
const G_ID = process.env['G_ID'] || '';

const client: DiscordClient = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates] }) as DiscordClient;


redis.connect()
  .then(() => { client.login(DC_TOKEN) })
  .catch((err) => { 
    console.log(err);
    process.exit(1);
  })


client.once('ready', async () => {
  console.log('Client logged in!');
  client.commands = new Collection();
  loadCommands(client, DC_TOKEN, DC_CLIENT, '../cmd_processor/commands', G_ID);
});


client.on('interactionCreate', async (interaction: Interaction) => {
  if (!interaction.isChatInputCommand()) return;
  await addInteraction(interaction);
  const interactionClient = interaction.client as DiscordClient;
  const command: any = interactionClient.commands.get(interaction.commandName);

  if (!command) {
    interaction.reply('Command not registered!');
    return;
  }

  try {
    await command.execute(interaction);
  } catch (error) {
    console.error(error);
    let errMsg = { content: 'There was an error while executing this command!', ephemeral: true };
    try {
      if(await interaction.replied) {
        await interaction.followUp(errMsg); 
      } else {
        await interaction.reply(errMsg);
      }
    } catch(err) {
      console.log(`Error trying to send error ??? - ${err}`)
    }
  }
})
