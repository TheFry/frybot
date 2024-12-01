import axios from 'axios';
import ytdl = require('@distube/ytdl-core')
import { ReadStream, appendFileSync } from 'fs';
import { LogType, logConsole } from './logger';
import { FileHandle, open } from 'fs/promises';
import { Readable } from 'stream';
import { hasProperties } from './common';

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

interface Thumbnails {
  [key: string]: {
    url: string;
    width: number;
    height: number;
  };
}

interface PageInfo {
  totalResults: number;
  resultsPerPage: number;
}

interface SearchResource {
  kind: 'youtube#searchResult';
  etag: string;
  id: {
    kind: string;
    videoId?: string;
    channelId?: string;
    playlistId?: string;
  };
  snippet: {
    publishedAt: Date;
    channelId: string;
    title: string;
    description: string;
    thumbnails: Thumbnails;
    channelTitle: string;
    liveBroadcastContent: string;
  };
}

interface VideoResource {
  kind: 'youtube#video';
  etag: string;
  id: string;
  snippet: {
    publishedAt: Date;
    channelId: string;
    title: string;
    description: string;
    thumbnails: Thumbnails;
    channelTitle: string;
    tags: string[];
    categoryId: string;
    liveBroadcastContent: string;
    defaultLanguage: string;
    localized: {
      title: string;
      description: string;
    }
    defaultAudioLanguage: string;
  };
}

interface PlaylistItemResource {
  kind: 'youtube#playlistItem';
  etag: string;
  id: string;
  snippet: {
    publishedAt: Date;
    channelId: string;
    title: string;
    description: string;
    thumbnails: Thumbnails;
    channelTitle: string;
    videoOwnerChannelTitle: string;
    videoOwnerChannelId: string;
    playlistId: string;
    position: number;
    resourceId: {
      kind: string;
      videoId: string;
    };
  };
  contentDetails: {
    videoId: string;
    startAt: string;
    endAt: string;
    note: string;
    videoPublishedAt: Date;
  };
  status: {
    privacyStatus: string;
  };
}

interface SearchListResponse {
  kind: 'youtube#searchListResponse';
  etag: string;
  nextPageToken: string;
  prevPageToken: string;
  regionCode: string;
  pageInfo: PageInfo
  items: SearchResource[];
}

interface VideoListResponse {
  kind: 'youtube#videoListResponse';
  etag: string;
  nextPageToken: string;
  prevPageToken: string;
  pageInfo: PageInfo
  items: VideoResource[];
}

interface PlaylistItemListResponse {
  kind: 'youtube#playlistItemListResponse';
  etag: string;
  nextPageToken: string;
  prevPageToken: string;
  pageInfo: PageInfo;
  items: PlaylistItemResource[];
}

async function request(url: string, params: unknown): Promise<SearchListResponse | VideoListResponse | PlaylistItemListResponse | void> {
  let res;
  try {
    res = await axios.get(url, {
      headers: { "Content-Type": "application/json" },
      params
    });
  } catch(err) {
    if(hasProperties(err, ['response.data', 'response.status'])) {
      const checked = err as { response: { data: unknown, status: unknown } }
      logConsole({ msg: `${JSON.stringify(checked.response.data)}`, type: LogType.Error });
      logConsole({ msg: `${checked.response.status}`, type: LogType.Error });
    } else {
      logConsole({ msg: `${err}`, type: LogType.Error });
    }
    return;
  }
  return res.data;
}


export async function search(query: string, count: number, type: 'video' | 'playlist', key: string): Promise<YTSearchResult[]> {
  const results: YTSearchResult[] = [];
  count = count > MAX_RESULTS ? MAX_RESULTS : count;
  const maxResults = count <= MAX_PER_PAGE ? count : MAX_PER_PAGE;
  const numPages = Math.ceil(count / MAX_PER_PAGE);

  for(let i = 0; i < numPages; i++) {
    let data = await(request(SEARCH_ENDPOINT, {
      q: query,
      key: key,
      type: type,
      part: 'snippet',
      maxResults: maxResults,
    }));

    if(data) data = data as SearchListResponse;
    else return [];

    for(const item of data.items) {
      results.push({
        name: item.snippet.title,
        id: item.id.kind === 'youtube#video' ? item.id.videoId as string : item.id.playlistId as string,
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
  const results: YTSearchResult[] = [];
  const maxIds = 50;
  const endpoint = type === 'video' ? VIDEO_ENDPOINT : PLAYLIST_ENDPOINT;
  
  while(ids.length > 0) {
    let data = await(request(endpoint , {
      id: ids.splice(0, maxIds).join(','),
      key,
      type: type,
      part: 'snippet',
    }));

    if(data) data = data as VideoListResponse | PlaylistItemListResponse;
    else return [];

    for(const item of data.items)  {
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
  const results: YTSearchResult[] = [];
  let nextPage = true;
  let data;

  while(nextPage) {
    data = await(request(PLAYLIST_ENDPOINT, {
      playlistId: playlistId,
      key: key,
      part: 'snippet',
      pageToken: data ? data.nextPageToken : undefined 
    }));

    if(data) data = data as PlaylistItemListResponse;
    else return [];
    
    for(const item of data.items) { 
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
  let download: Readable;
  try {
    download = ytdl(songId, { filter: 'audioonly' });
  } catch(err) {
    logConsole({ msg: `ytdl error while downloading: ${err}` })
    throw(err)
  }

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
