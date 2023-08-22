import axios, { AxiosRequestConfig, AxiosResponse } from 'axios';
import ytdl from '@distube/ytdl-core';
import fs, { ReadStream } from 'fs';

const SEARCH_ENDPOINT = 'https://www.googleapis.com/youtube/v3/search';
const LIST_ENDPOINT = 'https://www.googleapis.com/youtube/v3/videos';

export interface YTSearchResult {
  name: string,
  id: string
}


async function request(url: string, params: any): Promise<YTSearchResult[]> {
  let res;
  try {
    res = await axios.get(url, {
      headers: { "Content-Type": "application/json" },
      params
    });
  } catch(err: any) {
    if(err.response) {
      console.log(err.response.data);
      console.log(err.response.status);
      console.log(err.response.headers);
    } else {
      console.log(err);
    }
    return[];
  }
  const vidData: Array<YTSearchResult> = [];
  for(const item of res.data.items) {
    vidData.push({
      name: item.snippet.title,
      id: item.id.videoId ? item.id.videoId : item.id,
    })
  }
  return vidData;
}


export async function search(query: string, count: Number, key: string): Promise<Array<YTSearchResult>> {
  return await(request(SEARCH_ENDPOINT, {
    q: query,
    key: key,
    type: 'video',
    part: 'snippet',
    maxResults: count
  }));
}


export async function list(ids: string[], key: string): Promise<Array<YTSearchResult>> {
  let results: YTSearchResult[] = [];
  while(ids.length > 0) {
    let batch = await(request(LIST_ENDPOINT, {
      id: ids.splice(0, 50).join(','),
      key,
      type: 'video',
      part: 'snippet,id',
    }));
    console.log(batch);
    results = results.concat(batch);
  }
  return results;
}


export async function download(songId: string, path?: string): Promise<fs.ReadStream> {
  let download = ytdl(songId, { filter: 'audioonly' });
  if(!path) return download as ReadStream;
  return new Promise((resolve, reject) => {
    let buff: any[] | null = [];
    download.on('data', (chunk) => {
      if(buff) buff.push(chunk);
    })
    download.once('end', () => {
      if(buff) {
        fs.writeFileSync(path, Buffer.concat(buff));
      }
      buff = null;
      resolve(fs.createReadStream(path));
    });
    download.on('error', (err) => {
      console.log(err);
      reject(null);
    })
  })
}
