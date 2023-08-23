import { setTimeout } from 'timers/promises';
import { Redis } from 'ioredis';
import { Client, GatewayIntentBits, Snowflake } from 'discord.js';
import { DiscordClient, CHANNEL_EVENT_KEY, ChannelEvent, WATCHED_CHANNELS_KEY, FREE_CHANNELS_KEY } from '../helpers/common';
import { newClient as newRedisClient } from '../helpers/redis';
import { VoiceBot, voicebotList, connectedGuilds } from './VoiceBot';

const DC_TOKEN = process.env['DC_TOKEN'] || '';
export const client: DiscordClient = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates] }) as DiscordClient;
let watchQueues = true;


client.login(DC_TOKEN)
	.catch((err) => {
		console.log(err);
		process.exit(1);
	})


client.once('ready', async () => {
	console.log('Client logged in!');
	let redisClient = await newRedisClient();
	reserveChannels(redisClient);
	watchChannelEvents(redisClient);
});


// Watch redis for open queues. Try to reserve one
async function reserveChannels(redisClient: Redis) {
	const coolDown = 5000; // How long to wait before looking for a new queue after failure
	let watched_guilds: any = {};

	const releaseChannel = async(channelId: Snowflake) => {
		await redisClient.multi()
			.srem(WATCHED_CHANNELS_KEY, channelId)
			.rpush(FREE_CHANNELS_KEY, channelId)
			.exec()
	}

	console.log(`Looking for open channels...`);
	while(watchQueues) {
    const response = await redisClient.duplicate().brpop(FREE_CHANNELS_KEY, 0);
		if(!response) continue;  // Make typescript happy. This should always return something
		const channelId = response[1];
		const wasAdded = await redisClient.sadd(WATCHED_CHANNELS_KEY, channelId);

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
				idleTimeout: 600,
				voiceAdapter: (await client.guilds.fetch(guildId)).voiceAdapterCreator
			 })
		} catch(err) {
			console.log(`Error creating VoiceBot - ${err}`);
			await releaseChannel(channelId);
			await setTimeout(coolDown);
			continue;
		}

		console.log(`Success! Watching channel ${channelId}`);

		connectedGuilds[guildId] = true;
		let bot = voicebotList[channelId] as VoiceBot;
		bot.playNext()
			.catch(err => { 
				console.log(`Error running first playNext - ${err}`)
				bot.resourceLock.acquire()
					.then(() => {
						bot.cleanupAudio();
						bot.releaseChannel(true);
						delete connectedGuilds[guildId as string];
						delete voicebotList[channelId];
						bot.resourceLock.release();
					})
					.catch(err => {
						console.log(err);
						bot.resourceLock.release();
					})
			})
	} 
}


async function watchChannelEvents(redisClient: Redis) {
	let subscriber = redisClient.duplicate();
	subscriber.subscribe(CHANNEL_EVENT_KEY);

	subscriber.on('message', async (channel, message) => {
		let event: ChannelEvent;
		try {
			event = JSON.parse(message) as ChannelEvent;
		} catch(err) {
			console.log(`Channel event subscriber error - failed to parse message`);
			return;
		}

		if(!event.eventName || !event.channelId) {
			console.log(`Channel event subscriber error - Invalid event\n${JSON.stringify(event, null, 2)}`);
			return;
		}

		if(!Object.keys(voicebotList).includes(event.channelId)) return;
		let bot = voicebotList[event.channelId];

		if(event.eventName === 'stop' && bot !== undefined) {
			console.log(`Channel ${event.channelId} - user requested stop`);
			await bot.resourceLock.acquire();
			await bot.stop();
			bot.resourceLock.release();
		}

		if(event.eventName === 'skip' && bot !== undefined) {
			console.log(`Channel ${event.channelId} - user requested skip`);
			await bot.resourceLock.acquire();
			await bot.playNext(true);
			bot.resourceLock.release();
		}
	})

	subscriber.on('error', (err) => {
		console.log(`Channel event subscriber error - ${err}`);
	})
}