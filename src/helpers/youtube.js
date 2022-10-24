const axios = require('axios');
const ytdl = require('ytdl-core');

const SEARCH_ENDPOINT = 'https://www.googleapis.com/youtube/v3/search';

exports.search = async function(query, count, key) {
  let res = {}
  try {
    res = await axios.get(SEARCH_ENDPOINT, {
      headers: { "Content-Type": "application/json" },
      params: {
        q: query,
        key: key,
        type: 'video',
        part: 'snippet',
        maxResults: count
      }
    });
  } catch(err) {
    throw err;
  }
  let vidData = [];
  for(const item of res.data.items) {
    vidData.push({
      name: item.snippet.title,
      id: item.id.videoId,
    })
  }
  return vidData;
}


exports.download = function(id) {
  const download = ytdl(id, { filter: 'audioonly' });
  return download;

  // Old code. just leaving it here for now
  // return new Promise((resolve, reject) => {
  //   download.on('data', (chunk) => {
  //     buff.push(chunk)
  //   })
  //   download.once('end', (res) => {
  //     resolve(Buffer.concat(buff));
  //   });
  //   download.on('error', (err) => {
  //     console.log(err);
  //     reject(null);
  //   })
  // })
}
