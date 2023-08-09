import { createClient, defineScript } from "redis";
import { EnqueueOptions, EnqueueResponseStatus } from "./message_queue";


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


// Used to atomically add messages to the message queue
const enqueue = defineScript({
  NUMBER_OF_KEYS: 2,
  SCRIPT: `
    local response = {}
    response[1] = redis.pcall('JSON.SET', KEYS[2], '.', ARGV[2])
    
    if response[1]['err'] ~= nil then
      redis.log(redis.LOG_WARNING, response[1]['err'])
      redis.debug(redis.LOG_WARNING, response[1]['err'])
      response[2] = 0
      return response
    end
    
    local cmd = "LPUSH"
    if ARGV[3] == "true" then
      cmd = "RPUSH"
    end
    
    response[2] = redis.pcall(cmd, KEYS[1], ARGV[1])
    if response[2] <= 0 then 
      redis.log(redis.LOG_WARNING, response[2]['err'])
      redis.debug(redis.LOG_WARNING, response[2]['err'])
      redis.pcall('del', KEYS[2])
    end
    
    return response
  `,
  
  transformArguments(options: EnqueueOptions) { 
    return [
      options.queueKey, 
      options.entryKey, 
      options.uuid, 
      JSON.stringify(options.message), 
      options.inFront ? options.inFront.toString() : 'false' 
    ] 
  },

  transformReply(reply: any): EnqueueResponseStatus { 
    return { jsonSet: reply[0], listPush: reply[1].toString() } 
  }
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
