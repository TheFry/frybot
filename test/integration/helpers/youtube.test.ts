import { describe, expect, it } from '@jest/globals';
import * as yt from '../../../src/helpers/youtube';
import { accessSync, rmSync } from 'fs';

const YT_TOKEN = process.env['YT_TOKEN'] || '';
const describeIfToken = YT_TOKEN ? describe : describe.skip;

const testPlaylistQuery = 'Kanye - Late Registration'
const testVideoQuery = 'Infected Mushroom - Walking on the Moon'
const searchCases = [
  { count: 5, type: 'video', query: testVideoQuery },
  { count: 5, type: 'playlist', query: testPlaylistQuery},
  { count: 51, type: 'video', query: testVideoQuery},
  { count: 51, type: 'playlist', query: testPlaylistQuery},
]

const playlistCases = [
  {
    id: 'OLAK5uy_ljZc-x7bxToE4yodl2ujs7w0pBU9tyqKc',
    videos: [
      { name: 'Wake Up Mr. West', id: 'Bwyu-SZ7g_E', type: 'video' },
      { name: "Heard 'Em Say", id: 'R6dH8iBHzb4', type: 'video' },
      { name: 'Touch The Sky', id: 'B95OUKk7alM', type: 'video' },
      { name: 'Gold Digger', id: 'uVL4d8P44eM', type: 'video' },
      { name: 'Skit #1', id: 'G4qTNRbAp-c', type: 'video' },
      { name: 'Drive Slow', id: 'Q1ViJEYNki4', type: 'video' },
      { name: 'My Way Home', id: 'TgAomHGqKUM', type: 'video' },
      { name: 'Crack Music', id: '2tmPSK-w90o', type: 'video' },
      { name: 'Roses', id: 'Qxlnb1lEdEs', type: 'video' },
      { name: 'Bring Me Down', id: 'CZ_-O31R3p4', type: 'video' },
      { name: 'Addiction', id: 'YuCwP-NbY0s', type: 'video' },
      { name: 'Skit #2', id: 'vRBOIbTyTnU', type: 'video' },
      { name: 'Diamonds From Sierra Leone (Remix)', id: '4q7OpvvfjWs', type: 'video' },
      { name: 'We Major', id: '_fr4SV4fGAw', type: 'video' },
      { name: 'Skit #3', id: 'HyXEzp85RGE', type: 'video' },
      { name: 'Hey Mama', id: 'B3NmMKfl3Ic', type: 'video' },
      { name: 'Celebration', id: 'FZjlP-N7Hl4', type: 'video' },
      { name: 'Skit #4', id: 'Y4r6lS04RpQ', type: 'video' },
      { name: 'Gone', id: 'TwPCaWQIJME', type: 'video' },
      { name: 'Diamonds From Sierra Leone (Bonus Track)', id: 'glTZy-Sujuw', type: 'video' },
      { name: 'Late', id: 'YRwTaWWK3dI', type: 'video' }
    ]
  },
]

const listCases = [
  {
    ids: playlistCases[0].videos.map(vid => vid.id),
    list: playlistCases[0].videos,
    type: 'video'
  },
]

const downloadCases = [
  { path: './testdl1.mp3', id: 'Bwyu-SZ7g_E' },
  { path: undefined, id: 'R6dH8iBHzb4' }
]


describeIfToken('Youtube Helper Tests', () => {
  it.each(searchCases)('searches for $count $type and returns $count results', async({count, type, query}) => {
    const results = await yt.search(query, count, type as 'video' | 'playlist', YT_TOKEN);
    expect(results.length).toBe(count);
    results.forEach(result => {
      expect(result.type).toBe(type);
      expect(result.name).toBeDefined();
      expect(result.id).toBeDefined();
    })
  })

  it.each(playlistCases)('convert a playlist id $id to YTSearchResult[]', async ({id, videos}) => {
    const results = await yt.playlistToVideos(id, YT_TOKEN);
    expect(results).toEqual(videos);
  })

  it.each(listCases)('return YTSearchResult[] of a list of $type ids', async ({ids, list, type}) => {
    const results = await yt.list(ids, type as 'video' | 'playlist', YT_TOKEN);
    expect(results).toEqual(list);
  })

  it.each(downloadCases)('download/stream id $id and return read stream', async ({ id, path }) => {
    const stream = await yt.download(id, path);
    expect(stream.readable).toBe(true);
    if(path) {
      accessSync(`${path}.mp3`);
      rmSync(`${path}.mp3`);
    }
  })
});
