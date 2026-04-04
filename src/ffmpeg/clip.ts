import ffmpeg from 'fluent-ffmpeg';
import { randomBytes } from 'crypto';
import { INTERACTION_QUEUE_KEY, ClipJob, MEDIA_DIR } from "../helpers/common";
import { enqueue } from "../helpers/message_queue";
import * as yt from '../helpers/youtube';
import { DiscordResponse } from "../helpers/interactions";
import { rmSync } from "fs";
import { LogType, logConsole } from "../helpers/logger";

export async function clip(job: ClipJob) {
  const rawPath = `${MEDIA_DIR}/${randomBytes(8).toString('base64url')}`;
  const outputPath = `${MEDIA_DIR}/${randomBytes(8).toString('base64url')}.mp3`;
  const ytStream = await yt.download(job.video.id, rawPath);

  logConsole({ msg: `Processing clip job interactionId=${job.interactionId} videoId=${job.video.id} startTime=${job.startTime} duration=${job.duration}` })
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
      rmSync(`${rawPath}.mp3`, { force: true });
    })
    .on('error', async (err : Error) => {
      logConsole({ msg: `Error trimming and limiting size of MP3: ${err}`, type: LogType.Error });
      const message: DiscordResponse = {
        content: 'Error trimming file.',
        interactionId: job.interactionId,
      }
      await enqueue(INTERACTION_QUEUE_KEY, [message]);
      try {
        rmSync(outputPath, { force: true });
        rmSync(`${rawPath}.mp3`, { force: true });
      } catch {
        // TODO: handle failed file removal
       }
    })
    .run();
}

export function validateClipJob(message: unknown): message is ClipJob {
  const job = message as ClipJob;
  return !!(job && job.duration && job.interactionId && job.startTime && job.video);
}
