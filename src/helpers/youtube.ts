import axios from 'axios';
import ytdl from 'ytdl-core';
import { ReadStream, appendFileSync, createReadStream } from 'fs';
import { LogType, logConsole } from './logger';
import { FileHandle, open } from 'fs/promises';
import { Readable } from 'stream';

const SEARCH_ENDPOINT = 'https://www.googleapis.com/youtube/v3/search';
const VIDEO_ENDPOINT = 'https://www.googleapis.com/youtube/v3/videos';
const PLAYLIST_ENDPOINT = 'https://www.googleapis.com/youtube/v3/playlistItems';
const MAX_RESULTS = 250;
const MAX_PER_PAGE = 50;    // Upper bound on results returned in a single youtube api requ

export interface YTSearchResult {
  name: string;
  id: string;
  type: 'video' | 'playlist';
}


async function request(url: string, params: any): Promise<any> {
  let res;
  try {
    res = await axios.get(url, {
      headers: { "Content-Type": "application/json" },
      params
    });
  } catch(err: any) {
    if(err.response) {
      logConsole({ msg: `${JSON.stringify(err.response.data)}`, type: LogType.Error });
      logConsole({ msg: err.response.status, type: LogType.Error });
    } else {
      logConsole({ msg: err, type: LogType.Error });
    }
    return { data: { items: [] } };
  }
  return res.data;
}


export async function search(query: string, count: number, type: 'video' | 'playlist', key: string): Promise<YTSearchResult[]> {
  const results: YTSearchResult[] = [];
  count = count > MAX_RESULTS ? MAX_RESULTS : count;
  let maxResults = count <= MAX_PER_PAGE ? count : MAX_PER_PAGE;
  let numPages = Math.ceil(count / MAX_PER_PAGE);

  for(let i = 0; i < numPages; i++) {
    let data = await(request(SEARCH_ENDPOINT, {
      q: query,
      key: key,
      type: type,
      part: 'snippet',
      maxResults: maxResults,
    }));

    for(let item of data.items) {
      results.push({
        name: item.snippet.title,
        id: item.id.kind === 'youtube#video' ? item.id.videoId : item.id.playlistId,
        type: item.id.kind === 'youtube#video' ? 'video' : 'playlist'
      })
      
      if(results.length >= count) {
        return results;
      }
    }
  }
  return results;
}


export async function list(ids: string[], type: 'video' | 'playlist', key: string): Promise<YTSearchResult[]> {
  let results: YTSearchResult[] = [];
  const maxIds = 50;
  const endpoint = type === 'video' ? VIDEO_ENDPOINT : PLAYLIST_ENDPOINT;
  
  while(ids.length > 0) {
    let data = await(request(endpoint , {
      id: ids.splice(0, maxIds).join(','),
      key,
      type: type,
      part: 'snippet',
    }));

    for(let item of data.items)  {
      results.push({
        name: item.snippet.title,
        id: item.id,
        type: type
      })
    }
  }
  return results;
}


export async function playlistToVideos(playlistId: string, key: string): Promise<YTSearchResult[]> {
  let results: YTSearchResult[] = [];
  let nextPage = true;
  let data;

  while(nextPage) {
    data = await(request(PLAYLIST_ENDPOINT, {
      playlistId: playlistId,
      key: key,
      part: 'snippet',
      pageToken: data ? data.nextPageToken : undefined 
    }));

    for(let item of data.items) { 
      results.push({ 
        name: item.snippet.title,
        id: item.snippet.resourceId.videoId,
        type: 'video' 
      }) 
    }
    nextPage = data.nextPageToken ? true : false;
  }
  return results;
}


export async function download(songId: string, path?: string): Promise<Readable> {
  let download = ytdl(songId, { filter: 'audioonly' });
  if(!path) return download as ReadStream;
  let f: FileHandle;

  try {
    f = await open(path, 'w+');
  } catch(err) {
    logConsole({ msg: `Error opening ${path} - ${err}`, type: LogType.Error })
  }
  
  return new Promise((resolve, reject) => {
    if(!f) reject(null);
    download.on('data', (chunk) => {
      appendFileSync(path, chunk);
    });
    download.once('end', () => {
      resolve(f.createReadStream({autoClose: true}));
    });
    download.on('error', (err) => {
      logConsole({ msg: `${err}`, type: LogType.Error });
      f.close();
      reject(null);
    });
  })
}
