import { createClient, defineScript } from "redis";
import { Message } from "./message_queue";


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


const enqueue = defineScript({
  NUMBER_OF_KEYS: 2,
  SCRIPT: `
    redis.call("JSON.SET", KEYS[2], ".", ARGV[2])
    local cmd = "LPUSH"
    if ARGV[3] == "true" then
      cmd = "RPUSH"
    end
    return redis.call(cmd, KEYS[1], ARGV[1])
  `,
  transformArguments(queueKey: string, entryKey: string, uuid: string, message: Message, front = false) { return [queueKey, entryKey, uuid, JSON.stringify(message), front.toString()] }
})


const REDIS_HOST = "redis.service.consul";

export const redisClient = createClient({ 
  url: `redis://${REDIS_HOST}`, 
  scripts: {
    checkIfWatched: checkIfWatched, 
    enqueue: enqueue
  } 
});

redisClient.on('error', err => console.log('Redis Client Error', err));

export async function connect() {
  await redisClient.connect();
}

export async function disconnect() {
  await redisClient.quit();
}
