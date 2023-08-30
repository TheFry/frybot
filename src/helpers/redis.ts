import Redis, { Result, Callback } from "ioredis";
import { readFileSync } from "fs";
import { Snowflake } from "discord.js";

const REDIS_URL = process.env['REDIS_URL'] || 'redis://localhost:6379';
const REDIS_SCRIPT_DIR = './redis_scripts';

declare module "ioredis" {
  interface RedisCommander<Context> {
    enqueue(
      queueKey: string,
      entryKey: string,
      uuid: string,
      message: string,
      inFront?: string,
      callback?: Callback<string>
    ): Result<[string | object, number | object], Context>;

    checkIfWatched(
      redis_watchedKey: string,
      redis_freeKey: string,
      channelId: Snowflake,
      callback?: Callback<string>
    ): Result<string, Context>;
  }
}

export let redisClient: Redis | null = null;

export async function newClient(url: string = REDIS_URL) {
  let newClient = new Redis(url)

  newClient.defineCommand('enqueue', {
    numberOfKeys: 2,
    lua: readFileSync(`${REDIS_SCRIPT_DIR}/enqueue.lua`).toString()
  })

  newClient.defineCommand('checkIfWatched', {
    numberOfKeys: 2,
    lua: readFileSync(`${REDIS_SCRIPT_DIR}/checkIfWatched.lua`).toString(),
  })

  newClient.on('error', err => console.log('Redis Client Error', err));
  redisClient = newClient;
  return newClient;
}
