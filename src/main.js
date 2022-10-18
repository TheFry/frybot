const loadCommands = require('./load-commands');
const { Client, Collection, GatewayIntentBits } = require('discord.js');


const DC_TOKEN = process.env['DC_TOKEN'] ? process.env['DC_TOKEN'] : usage(); 
const DC_CLIENT = process.env['DC_CLIENT'] ? process.env['DC_CLIENT'] : usage();
const YT_TOKEN = process.env['YT_TOKEN'] ? process.env['YT_TOKEN'] : usage();
const G_ID = process.env['G_ID'] ? process.env['G_ID'] : usage();


function usage() {
  console.log(`Usage: DC_TOKEN=<bot token> YT_TOKEN=<youtube key> ${__dirname}/main.js`);
  process.exit(1);
}

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates] });
client.commands = new Collection();
client.login(DC_TOKEN);

client.once('ready', () => {
	console.log('Client logged in!');
  loadCommands.load(client, DC_TOKEN, DC_CLIENT, G_ID);
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;
	const command = interaction.client.commands.get(interaction.commandName);

	if (!command) {
    interaction.reply('Command not registered!');
    return;
  }

	try {
		await command.execute(interaction);
	} catch (error) {
		console.error(error);
		await interaction.editReply({ content: 'There was an error while executing this command!', ephemeral: true });
	}
})
