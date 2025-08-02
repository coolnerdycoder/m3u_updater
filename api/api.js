import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';

// Configuration
const M3U_URL = 'https://raw.githubusercontent.com/alex4528/m3u/refs/heads/main/artl.m3u';
const CACHE_DIR = '/tmp/m3u-cache';
const CACHE_FILE = path.join(CACHE_DIR, 'cached_playlist.m3u');
const CACHE_TTL = 60 * 60 * 1000; // 1 hour cache

// Ensure cache directory exists
const ensureCacheDir = () => {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }
};

// Parse M3U to JSON format
const parseM3uToJson = (m3uContent) => {
  const lines = m3uContent.split('\n');
  const result = {
    header: null,
    channels: []
  };

  let currentChannel = null;

  lines.forEach(line => {
    line = line.trim();
    if (!line) return;

    if (line.startsWith('#EXTM3U')) {
      result.header = line;
    } 
    else if (line.startsWith('#EXTINF')) {
      currentChannel = {
        extinf: line,
        attributes: {},
        url: null
      };
      // Parse EXTINF attributes (-1 tvg-id="..." tvg-name="...")
      const attrMatch = line.match(/-1\s+(.*?)(?:\s*,(.*))?$/);
      if (attrMatch) {
        const attrs = attrMatch[1]?.split('" ') || [];
        attrs.forEach(attr => {
          const [key, value] = attr.split('=');
          if (key && value) {
            currentChannel.attributes[key] = value.replace(/"/g, '');
          }
        });
        currentChannel.name = attrMatch[2] || 'Unnamed';
      }
    } 
    else if (currentChannel && !line.startsWith('#')) {
      currentChannel.url = line;
      result.channels.push(currentChannel);
      currentChannel = null;
    }
  });

  return result;
};

export default async (req, res) => {
  try {
    ensureCacheDir();
    
    // Check cache first
    let m3uContent;
    if (fs.existsSync(CACHE_FILE)) {
      const stats = fs.statSync(CACHE_FILE);
      const now = new Date();
      
      if (now - stats.mtime < CACHE_TTL) {
        m3uContent = fs.readFileSync(CACHE_FILE, 'utf8');
      }
    }

    // Fetch fresh data if no cache
    if (!m3uContent) {
      const response = await fetch(M3U_URL, {
        timeout: 5000,
        headers: {
          'User-Agent': 'M3U-Fetcher/1.0'
        }
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      m3uContent = await response.text();
      
      // Validate
      if (!m3uContent.startsWith('#EXTM3U')) {
        throw new Error('Invalid M3U format');
      }
      
      // Update cache
      fs.writeFileSync(CACHE_FILE, m3uContent);
    }

    // Check if client wants JSON (browser) or raw M3U (player)
    const acceptHeader = req.headers.accept || '';
    const isBrowserRequest = acceptHeader.includes('text/html') || 
                           req.headers['user-agent']?.includes('Mozilla');

    if (isBrowserRequest) {
      // Return pretty JSON for browsers
      const jsonData = parseM3uToJson(m3uContent);
      res.setHeader('Content-Type', 'application/json');
      return res.status(200).json({
        success: true,
        metadata: {
          source: M3U_URL,
          cached: !!m3uContent,
          channelCount: jsonData.channels.length
        },
        ...jsonData
      });
    } else {
      // Return raw M3U for media players
      res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
      return res.status(200).send(m3uContent);
    }

  } catch (error) {
    console.error('Error:', error);
    
    // Try to return cached data even if parsing failed
    if (fs.existsSync(CACHE_FILE)) {
      const cachedContent = fs.readFileSync(CACHE_FILE, 'utf8');
      res.setHeader('Content-Type', 'application/json');
      return res.status(200).json({
        success: false,
        error: error.message,
        fallback: 'cached',
        content: parseM3uToJson(cachedContent)
      });
    }
    
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
};