const axios = require('axios');
const ytdl = require('ytdl-core');
const fs = require('fs');

const SEARCH_ENDPOINT = 'https://www.googleapis.com/youtube/v3/search';

exports.search = async function(query, count, key) {
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

  const vidData = [];
  for(const item of res.data.items) {
    vidData.push({
      name: item.snippet.title,
      id: item.id.videoId,
    })
  }
  return vidData;
}


exports.download = function(songId, guildId) {
  let download = ytdl(songId, { filter: 'audioonly' });
  let buff = [];
  return new Promise((resolve, reject) => {
    download.on('data', (chunk) => {
      buff.push(chunk)
    })
    download.once('end', (res) => {
      fs.writeFileSync(`./${guildId}`, Buffer.concat(buff));
      buff = null;
      resolve(fs.createReadStream(`./${guildId}`));
    });
    download.on('error', (err) => {
      console.log(err);
      reject(null);
    })
  })
}
