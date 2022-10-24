const { REST, Routes } = require('discord.js');
const path = require('path');
const fs = require('fs');

const DEPLOY = process.env['DEPLOY'] ? true : false;
const DELETE = process.env['DELETE'] ? true : false;

// Load commands in src/commands
exports.load = async function(client, token, clientID, guildID) {
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
    rest.put(Routes.applicationGuildCommands(clientID, guildID), { body: {} })
      .then((data) => console.log(`Successfully registered ${data.length} application commands.`))
      .catch(console.error.rawError);
    rest.put(Routes.applicationCommands(clientID), { body: {} })
      .then((data) => console.log(`Successfully registered ${data.length} application commands.`))
      .catch(console.error.rawError);  
  }

  if(DEPLOY) {
    rest.put(Routes.applicationGuildCommands(clientID, guildID), { body: commands })
      .then((data) => console.log(`Successfully registered ${data.length} application commands.`))
      .catch(console.error.rawError);
  }
}