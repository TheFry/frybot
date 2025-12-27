import { ffmpeg } from '../helpers/ffmpeg-wrapper';
import { randomBytes } from 'crypto';
import { INTERACTION_QUEUE_KEY, CLIP_QUEUE_KEY, ClipJob, MEDIA_DIR } from "../helpers/common";
import { dequeue, enqueue } from "../helpers/message_queue";
import * as yt from '../helpers/youtube';
import { DiscordResponse } from "../helpers/interactions";
import { rmSync } from "fs";
import { newClient } from "../helpers/redis";
import { LogType, logConsole } from "../helpers/logger";

async function clip(job: ClipJob) {
  const rawPath = `${MEDIA_DIR}/${randomBytes(8).toString('base64url')}`;
  const outputPath = `${MEDIA_DIR}/${randomBytes(8).toString('base64url')}.mp3`;
  const ytStream = await yt.download(job.video.id, rawPath);

  let responseMessage: DiscordResponse | null = null;
  try {
    await ffmpeg({
      input: ytStream,
      inputArgs: ['-ss', job.startTime, '-t', job.duration.toString()],
      outputArgs: ['-codec', 'copy'],
      output: outputPath,
    });
    logConsole({ msg: 'Trimming and limiting size complete' });
    responseMessage = {
      content: 'Here is your file',
      files: [outputPath],
      interactionId: job.interactionId,
    }
  } catch (err) {
    responseMessage = {
      content: 'Error trimming file.',
      interactionId: job.interactionId,
    }
    logConsole({ msg: `Error trimming and limiting size of MP3: ${err}`, type: LogType.Error });
  } finally {
    const response = await enqueue(INTERACTION_QUEUE_KEY, [responseMessage]);
    try {
      rmSync(outputPath);
      rmSync(rawPath);
    } catch {
      logConsole({ msg: `Error cleaning up temp files: ${rawPath}, ${outputPath}`, type: LogType.Error });  
    }
    if(response[0].error) {
      logConsole({ msg: `Enqueue response for interaction ${job.interactionId}: ${JSON.stringify(response[0])}` });
    }
  }
}


async function main() {
  const watch = true;
  logConsole({ msg: `Watching ${CLIP_QUEUE_KEY} for jobs` });
  while(watch) {
    const res = (await dequeue(CLIP_QUEUE_KEY, 1, 0))[0];
    if(res && res.error) {
      logConsole({ msg: `Error dequeueing from interaction queue - ${res.error}`, type: LogType.Error });
      continue;
    }

    const message = res.message as ClipJob;
    if(!message ||
      !message.duration || 
      !message.interactionId || 
      !message.startTime || 
      !message.video) 
    {
      logConsole({ msg: `Error dequeueing from interaction queue - invalid message object\n${res}`, type: LogType.Error });
      continue;
    }

    try {
      const message = res.message as ClipJob;
      await clip(message);
    } catch(err) {
      logConsole({ msg: `Error clipping message - ${err}`, type: LogType.Error });
    }
  }
}

newClient()
  .then(() => { main() })
  .catch(err => { logConsole({ msg: `${err}`, type: LogType.Error }); return 1; })