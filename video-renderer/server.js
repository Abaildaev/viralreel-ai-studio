const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
const { createClient } = require('@supabase/supabase-js');
const { createOverlayImage } = require('./overlay');

ffmpeg.setFfmpegPath(ffmpegPath);

const app = express();
const allowedOrigin = process.env.ALLOWED_ORIGIN || 'http://localhost:3000';
const rendererToken = process.env.RENDERER_TOKEN;
const supabaseUrl = process.env.SUPABASE_URL;
if (!supabaseUrl) {
  throw new Error('SUPABASE_URL is required for video-renderer');
}
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const allowedMediaHosts = new Set([
  new URL(supabaseUrl).hostname,
  ...(process.env.ALLOWED_MEDIA_HOSTS || '').split(',').map(host => host.trim()).filter(Boolean),
]);

app.use(cors({ origin: allowedOrigin }));
app.use(express.json({ limit: '256kb' }));

const supabase = createClient(
  supabaseUrl,
  supabaseServiceRoleKey || ''
);

function authenticateRenderer(req, res, next) {
  if (!rendererToken || !supabaseServiceRoleKey) {
    return res.status(503).json({ error: 'Renderer authentication or storage is not configured' });
  }

  const authorization = req.headers.authorization || '';
  const provided = authorization.startsWith('Bearer ')
    ? authorization.slice('Bearer '.length)
    : req.headers['x-renderer-token'];

  if (provided !== rendererToken) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

function validateMediaUrl(value, fieldName) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${fieldName} must be a valid URL`);
  }

  if (parsed.protocol !== 'https:' || !allowedMediaHosts.has(parsed.hostname)) {
    throw new Error(`${fieldName} host is not allowed`);
  }
  return parsed.toString();
}

function validateStoragePath(value) {
  if (typeof value !== 'string' || value.length > 512 || value.startsWith('/') || value.includes('..')) {
    throw new Error('Invalid Supabase storage path');
  }
  return value;
}

// Health check
app.get('/', (req, res) => res.send('Video Renderer is Active'));

app.post('/api/render', authenticateRenderer, async (req, res) => {
  console.log('Received render request:', req.body);
  const { videoUrl, audioUrl, variation, supabaseFilePath } = req.body || {};

  if (!videoUrl || !variation || !supabaseFilePath) {
    return res.status(400).json({ error: 'Missing required parameters: videoUrl, variation or supabaseFilePath' });
  }

  let sourceUrl;
  let soundtrackUrl = null;
  try {
    sourceUrl = validateMediaUrl(videoUrl, 'videoUrl');
    soundtrackUrl = audioUrl ? validateMediaUrl(audioUrl, 'audioUrl') : null;
    validateStoragePath(supabaseFilePath);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }

  // We immediately respond so client doesn't timeout
  res.status(202).json({ status: 'processing', message: 'Video render started' });

  const tmpDir = path.join(__dirname, 'tmp');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir);

  const jobId = crypto.randomUUID();
  const overlayPath = path.join(tmpDir, `overlay_${jobId}.png`);
  const outputPath = path.join(tmpDir, `output_${jobId}.mp4`);

  try {
    // 1. Generate Overlay Image
    const pngBuffer = createOverlayImage(variation, 720, 1280);
    fs.writeFileSync(overlayPath, pngBuffer);

    // 2. Setup FFmpeg Command
    let command = ffmpeg(sourceUrl)
      .input(overlayPath)
      .complexFilter([
        // Pan/Scale background video first according to variation settings
        // Wait: The original code scales and translates the video on canvas.
        // We will just overlay the full PNG on top of the original video.
        // If the video needs to be cropped to 9:16 and scaled, we can do a crop filter.
        // For simplicity, let's just resize the video to 720x1280 (crop to match) then overlay.
        '[0:v]scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280[bg]',
        '[bg][1:v]overlay=0:0[outv]'
      ])
      .outputOptions([
        '-map [outv]',
        '-c:v libx264',
        '-preset fast',
        '-crf 23',
        '-pix_fmt yuv420p',
        '-t 60' // Max 60 seconds
      ]);

    if (soundtrackUrl) {
      command = command.input(soundtrackUrl)
        .outputOptions([
          '-map 2:a',
          '-c:a aac',
          '-b:a 128k',
          '-shortest' // End video when audio ends, or max 60s
        ]);
    } else {
      command = command.outputOptions([
        '-map 0:a?', // keep original audio if exists
        '-c:a aac',
        '-b:a 128k'
      ]);
    }

    command.save(outputPath)
      .on('end', async () => {
        console.log(`Render completed for ${jobId}`);
        try {
          // Upload to Supabase Storage
          const fileBuffer = fs.readFileSync(outputPath);
          const { data, error } = await supabase.storage
            .from('reels') // Assuming bucket is reels or videos
            .upload(supabaseFilePath, fileBuffer, {
              contentType: 'video/mp4',
              upsert: true
            });

          if (error) throw error;
          console.log(`Successfully uploaded ${supabaseFilePath}`);
        } catch (uploadErr) {
          console.error(`Upload failed for ${jobId}:`, uploadErr);
        } finally {
          // Cleanup
          if (fs.existsSync(overlayPath)) fs.unlinkSync(overlayPath);
          if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
        }
      })
      .on('error', (err) => {
        console.error(`FFmpeg error for ${jobId}:`, err);
        if (fs.existsSync(overlayPath)) fs.unlinkSync(overlayPath);
        if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
      });

  } catch (error) {
    console.error(`Unhandled error in render job ${jobId}:`, error);
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Video Renderer service listening on port ${PORT}`);
});
