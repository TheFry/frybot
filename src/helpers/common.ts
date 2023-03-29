import { Client } from 'discord.js';

export class DiscordClient extends Client { commands: any };

function usage(missing: string): void {
  console.log(`
  Missing variable ${missing}
	Usage: DC_TOKEN=<bot token> \\
		  DC_CLIENT=<bot client id> \\
		  G_ID=<bot guild id> \\
		  YT_TOKEN=<youtube key> \\
		  MONGO_CONN_STRING=<mongodb conn string> \\
		  node ${__dirname}/main.js
	`);
}

export function checkVars(): void {
  process.env['DC_TOKEN'] || usage('DC_TOKEN'); 
  process.env['DC_CLIENT'] || usage('DC_CLIENT');
  process.env['YT_TOKEN'] || usage('YT_TOKEN');
  process.env['G_ID'] || usage('G_ID');
  // process.env['MONGO_CONN_STRING'] || usage();
}
