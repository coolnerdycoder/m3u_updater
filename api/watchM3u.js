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

// Main handler
export default async (req, res) => {
  try {
    ensureCacheDir();
    
    // Check cache first
    if (fs.existsSync(CACHE_FILE)) {
      const stats = fs.statSync(CACHE_FILE);
      const now = new Date();
      
      if (now - stats.mtime < CACHE_TTL) {
        const cachedData = fs.readFileSync(CACHE_FILE, 'utf8');
        return res.status(200).send(cachedData);
      }
    }

    // Fetch fresh data
    const response = await fetch(M3U_URL, {
      timeout: 5000,
      headers: {
        'User-Agent': 'M3U-Fetcher/1.0 (+https://your-vercel-app.vercel.app)'
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch: ${response.status} ${response.statusText}`);
    }

    const m3uContent = await response.text();
    
    // Validate basic M3U format
    if (!m3uContent.startsWith('#EXTM3U')) {
      throw new Error('Invalid M3U file format');
    }

    // Update cache
    fs.writeFileSync(CACHE_FILE, m3uContent);
    
    // Return the content
    res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
    return res.status(200).send(m3uContent);

  } catch (error) {
    console.error('Error:', error);
    
    // Fallback to cache if available
    if (fs.existsSync(CACHE_FILE)) {
      const cachedData = fs.readFileSync(CACHE_FILE, 'utf8');
      return res.status(200).send(cachedData);
    }
    
    return res.status(500).json({
      error: 'Failed to fetch M3U',
      details: error.message
    });
  }
};