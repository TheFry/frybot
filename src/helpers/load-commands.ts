import path from 'path';
import fs from 'fs';
import { Client, REST, Routes  } from 'discord.js';
import { LogType, logConsole } from './logger';
import { hasProperties } from './common';

// This workaround is suggested by discordjs docs for typescript support
// eslint-disable-next-line @typescript-eslint/no-explicit-any
class DiscordClient extends Client { commands: any }

const DEPLOY = process.env['DEPLOY'] ? true : false;
const DELETE = process.env['DELETE'] ? true : false;
const GLOBAL = process.env['GLOBAL'] ? true : false;


// Load commands in src/commands
export default async function load(client: DiscordClient, token: string, clientID: string, commandsDir: string, guildID?: string): Promise<void> {
  const commandsPath = path.join(__dirname, commandsDir);
  const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
  const rest = new REST({ version: '10' }).setToken(token);
  const commands = [];

  logConsole({ msg: `Loading commands${DEPLOY ? " and re-deploying!" : "!"}`, type: LogType.Debug });

  for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = await import(filePath);
    commands.push(command.data.toJSON());
    client.commands.set(command.data.name, command);
  }
  
  if(!guildID) return
  if(DELETE) {
    await rest.put(Routes.applicationGuildCommands(clientID, guildID), { body: {} });
    logConsole({ msg: `Deleted commands from guild ${guildID}` });
    await rest.put(Routes.applicationCommands(clientID), { body: {} });
    logConsole({ msg: `Deleted commands globally` })
  }

  if(DEPLOY) {
    let data;
    if(GLOBAL) {
      data = await rest.put(Routes.applicationCommands(clientID), { body: commands });
    } else {
      data = await rest.put(Routes.applicationGuildCommands(clientID, guildID), { body: commands });
    }
    let checked;
    if(hasProperties(data, ['length'])) {
      checked = data as { [length: string]: number }
      logConsole({ msg: `Successfully registered ${checked.length} application commands${GLOBAL ? " globally." : " ."}` });
    }
  }
}