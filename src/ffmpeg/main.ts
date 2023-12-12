import ffmpeg from 'fluent-ffmpeg';
import { INTERACTION_QUEUE_KEY, CLIP_QUEUE_KEY, ClipJob } from "../helpers/common";
import { dequeue, enqueue } from "../helpers/message_queue";
import * as yt from '../helpers/youtube';
import { DiscordResponse } from "../helpers/interactions";
import { nanoid } from "nanoid/non-secure";
import { rmSync } from "fs";
import { newClient } from "../helpers/redis";
import { MEDIA_DIR } from "../helpers/common";
import { LogType, logConsole } from "../helpers/logger";

async function clip(job: ClipJob) {
  const link = `https://youtube.com/watch?v=${job.video.id}`;
  const rawPath = `${MEDIA_DIR}/${nanoid()}`;
  const outputPath = `${MEDIA_DIR}/${nanoid()}.mp3`;
  const ytStream = await yt.download(link, rawPath);

  logConsole({ msg: `Processing ${job}` })
  ffmpeg(ytStream)
    .setStartTime(job.startTime)
    .setDuration(job.duration)
    .output(outputPath)
    .on('end', async () => {
      logConsole({ msg: 'Trimming and limiting size complete' });
      const message: DiscordResponse = {
        content: 'Here is your file',
        files: [outputPath],
        interactionId: job.interactionId,
      }
      await enqueue(INTERACTION_QUEUE_KEY, [message]);
      rmSync(rawPath);
    })
    .on('error', async (err : Error) => {
      logConsole({ msg: `Error trimming and limiting size of MP3: ${err}`, type: LogType.Error });
      const message: DiscordResponse = {
        content: 'Error trimming file.',
        interactionId: job.interactionId,
      }
      await enqueue(INTERACTION_QUEUE_KEY, [message]);
      try {
        rmSync(outputPath);
        rmSync(rawPath);
      } catch {
        // TODO: handle failed file removal
       }
    })
    .run();
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

    if(!res ||
      !res.message ||
      !res.message.duration || 
      !res.message.interactionId || 
      !res.message.startTime || 
      !res.message.video) 
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