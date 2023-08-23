const ffmpeg = require('fluent-ffmpeg');
import { INTERACTION_QUEUE_KEY, CLIP_QUEUE_KEY, ClipJob } from "../helpers/common";
import { dequeue, enqueue } from "../helpers/message_queue";
import * as yt from '../helpers/youtube';
import { DiscordResponse } from "../helpers/interactions";
import { nanoid } from "nanoid/non-secure";
import { rmSync } from "fs";
import { newClient } from "../helpers/redis";
import { MEDIA_DIR } from "../helpers/common";

async function clip(job: ClipJob) {
  let link = `https://youtube.com/watch?v=${job.video.id}`;
  let rawPath = `${MEDIA_DIR}/${nanoid()}`;
  let outputPath = `${MEDIA_DIR}/${nanoid()}.mp3`;
  let ytStream = await yt.download(link, rawPath);

  ffmpeg(ytStream)
    .setStartTime(job.startTime)
    .setDuration(job.duration)
    .output(outputPath)
    .on('end', async () => {
      console.log('Trimming and limiting size complete');
      let message: DiscordResponse = {
        content: 'File trimming done',
        files: [outputPath],
        interactionId: job.interactionId,
      }
      await enqueue(INTERACTION_QUEUE_KEY, [message])
      rmSync(rawPath);
    })
    .on('error', async (err : Error) => {
      console.error('Error trimming and limiting size of MP3:', err);
      let message: DiscordResponse = {
        content: 'Error trimming file.',
        interactionId: job.interactionId,
      }
      await enqueue(INTERACTION_QUEUE_KEY, [message]);
      rmSync(outputPath);
      rmSync(rawPath);
    })
    .run();
}


async function main() {
  let watch = true;

  while(watch) {
    let res = (await dequeue(CLIP_QUEUE_KEY, 1, 0))[0];
    if(res && res.error) {
      console.log(`Error dequeueing from interaction queue - ${res.error}`);
      continue;
    }

    if(!res.message) {
      console.log(`Error dequeueing from interaction queue - no message object`);
      continue;
    }

    let message = res.message as ClipJob;
    await clip(message);
  }
}

newClient()
  .then(() => { main() })
  .catch(err => { console.log(err); return 1; })