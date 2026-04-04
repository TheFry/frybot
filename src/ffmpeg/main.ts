import { CLIP_QUEUE_KEY, ClipJob } from "../helpers/common";
import { dequeue } from "../helpers/message_queue";
import { newClient } from "../helpers/redis";
import { LogType, logConsole } from "../helpers/logger";
import { clip, validateClipJob } from "./clip";

async function main() {
  const watch = true;
  logConsole({ msg: `Watching ${CLIP_QUEUE_KEY} for jobs` });
  while(watch) {
    const res = (await dequeue(CLIP_QUEUE_KEY, 1, 0))[0];
    if(res && res.error) {
      logConsole({ msg: `Error dequeueing from clip jobs queue - ${res.error}`, type: LogType.Error });
      continue;
    }

    if(!validateClipJob(res.message)) {
      logConsole({ msg: `Error dequeueing from clip jobs queue - invalid message object\n${res}`, type: LogType.Error });
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
