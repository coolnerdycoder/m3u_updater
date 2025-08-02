import fs from 'fs';

const CACHE_FILE = '/tmp/m3u-cache/cached_playlist.m3u';

export default async function handler(req, res) {
  if (!fs.existsSync(CACHE_FILE)) {
    return res.status(404).send('Playlist not cached yet');
  }

  const content = fs.readFileSync(CACHE_FILE, 'utf8');
  res.setHeader('Content-Type', 'application/x-mpegURL');
  res.send(content);
}
