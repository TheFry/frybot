import { createClient, defineScript } from "redis";


// Server side Scripts

// Used to atomically check if a channel is being watched by a worker bot
// If it isn't, add it 
const checkIfWatched = defineScript({
  NUMBER_OF_KEYS: 2,
  SCRIPT: `
    local isReserved = redis.call("SISMEMBER", KEYS[1], ARGV[1])
    if isReserved == 0 then
      redis.call("LPUSH", KEYS[2], ARGV[1])
    end
  `,
  transformArguments(reserveChannels: string, freeChannels: string, channelId: string) { return [reserveChannels, freeChannels, channelId] }
})


const REDIS_HOST = "redis.service.consul";

export const redisClient = createClient({ 
  url: `redis://${REDIS_HOST}`, 
  scripts: {
    checkIfWatched: checkIfWatched 
  } 
});

redisClient.on('error', err => console.log('Redis Client Error', err));

export async function connect() {
  await redisClient.connect();
}

export async function disconnect() {
  await redisClient.quit();
}
