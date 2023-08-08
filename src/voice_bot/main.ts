import { Client, GatewayIntentBits, Snowflake } from 'discord.js';
import { checkVars, DiscordClient } from '../helpers/common';
import { redisClient } from '../helpers/redis';
import { setTimeout } from 'timers/promises';
import { VoiceBot, voicebotList, connectedGuilds } from './VoiceBot';

const DC_TOKEN = process.env['DC_TOKEN'] || '';
export const client: DiscordClient = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates] }) as DiscordClient;
let watchQueues = true;


redisClient.connect()
	.then(() => { client.login(DC_TOKEN) })
	.catch(() => { process.exit(1) })


client.once('ready', async () => {
	console.log('Client logged in!');
	reserveChannels();
});


// Watch redis for open queues. Try to reserve one
async function reserveChannels() {
	const redis_watchedKey = 'frybot:reserved-channels';
  const redis_freeKey = 'frybot:free-channels';
	const coolDown = 5000; // How long to wait before looking for a new queue after failure
	let watched_guilds: any = {};

	const releaseChannel = async(channelId: Snowflake) => {
		await redisClient.multi()
			.sRem(redis_watchedKey, channelId)
			.rPush(redis_freeKey, channelId)
			.exec()
	}

	console.log(`Looking for open channels...`);
	while(watchQueues) {
		const response = await redisClient.brPop(redis_freeKey, 0);
		if(!response) continue;  // Make typescript happy. This should always return something
		const channelId = response.element;
		const wasAdded = await redisClient.sAdd(redis_watchedKey, channelId);

		// Handle race condition where free-channels contains 2 entries for channelId
		// Another bot may simultaneously try to add channelId to the watched-queues set. 
		// If that's the case, only one of them will return 1 here, and the other
		// should just ignore if 0 is returned. 
		if(wasAdded === 0) {
			console.log(`Looks like someone is already watching ${channelId}`);
			continue;
		}


		let guildId = await redisClient.get(`discord:channel:${channelId}:guild-id`);
		if(!guildId || watched_guilds[guildId]) {
			let errText = `Can't watch ${channelId} - ${ !guildId 
				? 'There was no guildId found in redis. The cmd processor probably fucked up'
				: `Already connected to ${guildId}`
			}`
			console.log(errText);
			await releaseChannel(channelId);
			await setTimeout(coolDown);
			continue;
		}

		try {
			voicebotList[channelId] = await VoiceBot.init({ 
				channelId,
				guildId,
				idleTimeout: 30000,
				voiceAdapter: (await client.guilds.fetch(guildId)).voiceAdapterCreator
			 })
		} catch(err) {
			console.log(`Error creating VoiceBot - ${err}`);
			await releaseChannel(channelId);
			await setTimeout(coolDown);
			continue;
		}

		connectedGuilds[guildId] = true;
		let bot = voicebotList[channelId] as VoiceBot;
		bot.playNext()
			.catch(err => { 
				bot.cleanupAudio();
				delete connectedGuilds[guildId as string]
				releaseChannel(channelId);
				console.log(err) 
			})
		console.log(`Success! Watching channel ${channelId}`);
	} 
}