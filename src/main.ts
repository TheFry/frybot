import loadCommands from './helpers/load-commands';
import { Client, Collection, GatewayIntentBits, Interaction, InteractionEditReplyOptions } from 'discord.js';
import { checkVars, DiscordClient } from './helpers/common';

checkVars();
const DC_TOKEN = process.env['DC_TOKEN'] || '';
const DC_CLIENT = process.env['DC_CLIENT'] || '';
const G_ID = process.env['G_ID'] || '';

const client: DiscordClient = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates] }) as DiscordClient;
client.login(DC_TOKEN);

client.once('ready', () => {
	console.log('Client logged in!');
	client.commands = new Collection();
	console.log(client.commands);
	loadCommands(client, DC_TOKEN, DC_CLIENT, G_ID);
});

client.on('interactionCreate', async (interaction: Interaction) => {
	if (!interaction.isChatInputCommand()) return;
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
		await interaction.editReply({ content: 'There was an error while executing this command!', ephemeral: true } as InteractionEditReplyOptions);
	}
})