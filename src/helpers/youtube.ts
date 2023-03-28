import axios from 'axios';
import ytdl from 'ytdl-core';
import fs from 'fs';

const SEARCH_ENDPOINT = 'https://www.googleapis.com/youtube/v3/search';

export interface YTSearchResult {
  name: string,
  id: string
}

export async function search(query: string, count: Number, key: string): Promise<Array<YTSearchResult>> {
  const res = await axios.get(SEARCH_ENDPOINT, {
    headers: { "Content-Type": "application/json" },
    params: {
      q: query,
      key: key,
      type: 'video',
      part: 'snippet',
      maxResults: count
    }
  });

  const vidData: Array<YTSearchResult> = [];
  for(const item of res.data.items) {
    vidData.push({
      name: item.snippet.title,
      id: item.id.videoId,
    })
  }
  return vidData;
}


export function download(songId: string, guildId: string): Promise<fs.ReadStream> {
  let download = ytdl(songId, { filter: 'audioonly' });
  return new Promise((resolve, reject) => {
    let buff: any[] | null = [];
    download.on('data', (chunk) => {
      if(buff) buff.push(chunk);
    })
    download.once('end', () => {
      if(buff) {
        fs.writeFileSync(`./${guildId}`, Buffer.concat(buff));
      }
      buff = null;
      resolve(fs.createReadStream(`./${guildId}`));
    });
    download.on('error', (err) => {
      console.log(err);
      reject(null);
    })
  })
}
