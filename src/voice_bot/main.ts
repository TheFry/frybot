import { setTimeout } from 'timers/promises';
import { Redis } from 'ioredis';
import { Client, GatewayIntentBits, Snowflake } from 'discord.js';
import { DiscordClient, CHANNEL_EVENT_KEY, ChannelEvent, WATCHED_CHANNELS_KEY, FREE_CHANNELS_KEY } from '../helpers/common';
import { newClient as newRedisClient } from '../helpers/redis';
import { VoiceBot, voicebotList, connectedGuilds } from './VoiceBot';
import { getBotId } from '../helpers/playlist';
import { LogType, logConsole } from '../helpers/logger';

const DC_TOKEN = process.env['DC_TOKEN'] || '';
export const client: DiscordClient = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates] }) as DiscordClient;
let watchQueues = true;


client.login(DC_TOKEN)
	.catch((err) => {
		logConsole({ msg: `${err}`, type: LogType.Error });
		process.exit(1);
	})


client.once('ready', async () => {
	logConsole({ msg: 'Client logged in!' });
	let redisClient = await newRedisClient();
	reserveChannels(redisClient);
	watchChannelEvents(redisClient);
});


// Watch redis for open queues. Try to reserve one
async function reserveChannels(redisClient: Redis) {
	logConsole({ msg: `Looking for open channels...` });
	const coolDown = 5000; // How long to wait before looking for a new queue after failure
	let watched_guilds: any = {};

	const releaseChannel = async(channelId: Snowflake) => {
		await redisClient.multi()
			.srem(WATCHED_CHANNELS_KEY, channelId)
			.rpush(FREE_CHANNELS_KEY, channelId)
			.exec()
	}

	const initChannel = async(channelId: Snowflake) => {
		let guildId = await redisClient.get(`discord:channel:${channelId}:guild-id`);
		if(!guildId || watched_guilds[guildId]) {
			let errText = `Can't watch ${channelId} - ${ !guildId 
				? 'There was no guildId found in redis. The cmd processor probably fucked up'
				: `Already connected to ${guildId}`
			}`
			logConsole({ msg: `${errText}`, type: LogType.Error });
			await releaseChannel(channelId);
			await setTimeout(coolDown);
			return 1;
		}

		try {
			voicebotList[channelId] = await VoiceBot.init({ 
				channelId,
				guildId,
				idleTimeout: 600,
				voiceAdapter: (await client.guilds.fetch(guildId)).voiceAdapterCreator
			 })
		} catch(err) {
			logConsole({ msg: `Error creating VoiceBot - ${err}`, type: LogType.Error });
			await releaseChannel(channelId);
			return 1;
		}	

		connectedGuilds[guildId] = true;
		let bot = voicebotList[channelId] as VoiceBot;
		try {
			await bot.playNext();
		} catch(err) {
			logConsole({ msg: `Error running first playNext - ${err}`, type: LogType.Error });
			await bot.resourceLock.acquire();
			bot.cleanupAudio();
			bot.releaseChannel(true);
			delete connectedGuilds[guildId as string];
			delete voicebotList[channelId];
			bot.resourceLock.release();
			return 1;
		}
		
		bot.readyForEvents = true;
		bot.processEvents();
		logConsole({ msg: `Success! Watching channel ${channelId}` });
		await redisClient.setnx(`discord:channel:${channelId}:bot-id`, client.application?.id as string)
		return 0;
	}

	// Init channels already in redis we're assigned to
	let watched = await redisClient.smembers(WATCHED_CHANNELS_KEY);
	for(let channel of watched) {
		let id = await getBotId(channel);
		if(id && id === client.application?.id) {
			try {
				await initChannel(channel);
			} catch(err) {
				logConsole({ msg: `Init channel error - ${err}`, type: LogType.Error });
			}
		}
	}

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
			logConsole({ msg: `Looks like someone is already watching ${channelId}` });
			continue;
		}

		try {
			await initChannel(channelId);
		} catch(err) {
			logConsole({ msg: `Init channel error - ${err}` });
		}
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
			logConsole({ msg: `Channel event subscriber error - failed to parse message`, type: LogType.Warn });
			return;
		}

		if(!event.type || !event.channelId) {
			logConsole({ msg: `Channel event subscriber error - Invalid event\n${JSON.stringify(event, null, 2)}`, type: LogType.Warn });
			return;
		}

		if(!Object.keys(voicebotList).includes(event.channelId)) return;
		let bot = voicebotList[event.channelId];

		if(bot !== undefined && bot.readyForEvents) {
			bot.eventList.lpush(event);
		}
	})

	subscriber.on('error', (err) => {
		logConsole({ msg: `Channel event subscriber error - ${err}`, type: LogType.Error });
	})
}