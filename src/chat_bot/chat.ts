import axios from "axios";
import { DiscordClient, GEN_ENDPOINT, GenRequestBody, KOBOLD_QUEUE_KEY, KoboldJob, DC_MSG_LIMIT } from "../helpers/common";
import { LogType, logConsole } from "../helpers/logger";
import { dequeue } from "../helpers/message_queue";
import { ChannelType, DMChannel } from "discord.js";

const ALLOWED_USERS = [
  'thefry',
  'phatgeeb',
  'itsicg',
  'cnolan_20',
  'geeb420'
]

export async function processChats(client: DiscordClient) {
  let watching = true;

  while(watching) {
    const res = (await dequeue(KOBOLD_QUEUE_KEY, 1, 0))[0];
    if(res && res.error) {
      logConsole({ msg: `Error dequeueing from kobold queue - ${res.error}`, type: LogType.Error });
      continue;
    }
    const job = res.message as KoboldJob;
    if(!job.channelId || !job.userId || !job.prompt) {
      logConsole({ msg: `Invalid KoboldJob - ${JSON.stringify(job)}`, type: LogType.Error });
      continue;
    } 


    let user;
    try {
      user = await client.users.fetch(job.userId);
    } catch(err) {
      logConsole({ msg: `KoboldJob error - Invalid user id - ${err}`, type: LogType.Error });
      return;
    }

    if(!ALLOWED_USERS.includes(user.username)) {
      logConsole({ msg: `KoboldJob error - User ${user.username} does not have permission`, type: LogType.Error });
      return
    }

    let dmChannel;
    try {
      dmChannel = await client.channels.fetch(job.channelId);
    } catch(err) {
      logConsole({ msg: `KoboldJob error - Invalid dmChannel id - ${err}`, type: LogType.Error });
      return;
    }
    
    if(!dmChannel || dmChannel.type !== ChannelType.DM) {
      logConsole({ msg: `KoboldJob error - Invalid dmChannel id`, type: LogType.Error });
      continue;
    }

    dmChannel = dmChannel as DMChannel;
    const genOptions: GenRequestBody = {
      n: 1,
      max_context_length: 1600,
      max_length: 350,
      rep_pen: 1.1,
      temperature: 0.7,
      top_p: 0.92,
      top_k: 100,
      top_a: 0,
      typical: 1,
      tfs: 1,
      rep_pen_range: 320,
      rep_pen_slope: 0.7,
      sampler_order: [6, 0, 1, 3, 4, 2, 5],
      memory: `[Your name is frybot. You are talking to ${job.username}]`,
      min_p: 0,
      dynatemp_range: 0,
      presence_penalty: 0,
      logit_bias: {},
      prompt: `<|im_end|>\n<|im_start|>user\n${job.prompt}<|im_end|>\n<|im_start|>assistant\n`,
      quiet: true,
      stop_sequence: [`<|im_end|>\n<|im_start|>user`, `<|im_end|>\n<|im_start|>assistant`],
      use_default_badwordsids: false
    };

    let koboldRes;
    try {
      koboldRes = await axios.post(GEN_ENDPOINT, genOptions);
    } catch(err) {
      logConsole({ msg: `Error sending request to kobold: ${err}`, type: LogType.Error });
      await dmChannel.send(`*snores*`)
      continue;
    }

    let msg = ""
    const results = koboldRes.data.results as [{ text: string }]
    results.forEach(result => { msg += `${result.text}\n` })
    
    // Split messages that are too long by words rather than characters
    const regex = new RegExp(`(.{1,${DC_MSG_LIMIT}})(\\s|$)`, 'g');
    const chunks = msg.match(regex) || [];
    for(let chunk of chunks) {
      try {
        await dmChannel.send(chunk.trim());
      } catch(err) {
        logConsole({ msg: `Error sending chat message ${err}`, type: LogType.Error })
        return;
      }
    }
  }
}

