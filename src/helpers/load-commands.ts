import path from 'path';
import fs from 'fs';
import { Client, REST, Routes  } from 'discord.js';
class DiscordClient extends Client { commands: any }

const DEPLOY = process.env['DEPLOY'] ? true : false;
const DELETE = process.env['DELETE'] ? true : false;


// Load commands in src/commands
export default async function load(client: DiscordClient, token: string, clientID: string, guildID: string) {
  const commandsPath = path.join(__dirname, '../commands');
  const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
  const rest = new REST({ version: '10' }).setToken(token);
  const commands = [];

  console.log(`Loading commands${DEPLOY ? " and re-deploying!" : "!"}`)

  for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);
    commands.push(command.data.toJSON());
    client.commands.set(command.data.name, command);
  }
  
  if(DELETE) {
    await rest.put(Routes.applicationGuildCommands(clientID, guildID), { body: {} });
    console.log(`Deleted commands from guild ${guildID}`);
    await rest.put(Routes.applicationCommands(clientID), { body: {} });
    console.log(`Deleted commands globally`)
  }

  if(DEPLOY) {
    const data: any = await rest.put(Routes.applicationGuildCommands(clientID, guildID), { body: commands })
    console.log(`Successfully registered ${data.length} application commands.`)
  }
}