const loadCommands = require('./helpers/load-commands');
const { Client, Collection, GatewayIntentBits } = require('discord.js');

// Check that all required env vars exist. We don't necessarily use them
// in this file (like YT_TOKEN and mongo credentials), but we don't start if they don't exist
const DC_TOKEN = process.env['DC_TOKEN'] || usage(); 
const DC_CLIENT = process.env['DC_CLIENT'] || usage();
const YT_TOKEN = process.env['YT_TOKEN'] || usage();
const G_ID = process.env['G_ID'] || usage();
// const MONGO_CONN_STRING = process.env['MONGO_CONN_STRING'] || usage();


function usage() {
  console.log(`
	Usage: DC_TOKEN=<bot token> \\
		  DC_CLIENT=<bot client id> \\
		  G_ID=<bot guild id> \\
		  YT_TOKEN=<youtube key> \\
		  MONGO_CONN_STRING=<mongodb conn string> \\
		  node ${__dirname}/main.js
	`);
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
