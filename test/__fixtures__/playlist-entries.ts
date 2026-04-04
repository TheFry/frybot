import { PlaylistEntry } from '../../src/helpers/playlist';

export const testVideos: PlaylistEntry[] = [
  { youtubeVideoTitle: "Around the World", youtubeVideoId: "Jb6gcoR266U", interactionId: "123456789" },
  { youtubeVideoTitle: "One More Time", youtubeVideoId: "fa5IWHDbftI", interactionId: "123456789" },
  { youtubeVideoTitle: "Open Mic\\\\Aquarius III", youtubeVideoId: "NzkWWRa98g0", interactionId: "123456789" },
  { youtubeVideoTitle: "Gray Area", youtubeVideoId: "qlUga4YnIvw", interactionId: "123456789" },
  { youtubeVideoTitle: "It Runs Through Me", youtubeVideoId: "QU_CoZvbLE4", interactionId: "123456789" },
  { youtubeVideoTitle: "Feed The Fire", youtubeVideoId: "0TK9eyoxPc4", interactionId: "123456789" },
  { youtubeVideoTitle: "Post Malone - Psycho ft. Ty Dolla $ign", youtubeVideoId: "au2n7VVGv_c", interactionId: "123456789" },
  { youtubeVideoTitle: "Redbone", youtubeVideoId: "H_HkRMOwwGo", interactionId: "123456789" },
  { youtubeVideoTitle: "Tints (feat. Kendrick Lamar)", youtubeVideoId: "YM1fyrMjjck", interactionId: "123456789" },
  { youtubeVideoTitle: "It Might Be Time", youtubeVideoId: "F9TiuqPXAoM", interactionId: "123456789" },
];

export const mockYTSearchResults = [
  { name: 'Test Song 1', id: 'abc123', type: 'video' as const },
  { name: 'Test Song 2', id: 'def456', type: 'video' as const },
  { name: 'Test Song 3', id: 'ghi789', type: 'video' as const },
  { name: 'Test Song 4', id: 'jkl012', type: 'video' as const },
  { name: 'Test Song 5', id: 'mno345', type: 'video' as const },
];
