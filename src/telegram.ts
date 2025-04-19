import axios from 'axios';
import FormData from 'form-data';
import { v4 as uuidv4 } from 'uuid';
import { Readable } from 'stream';
import { BotConfig, MediaType, Step } from './types.js';
import * as files from './files.js';
import ffmpeg from 'fluent-ffmpeg';
import * as os from 'os';
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const MAX_VIDEO_SIZE = 50 * 1024 * 1024; // 50MB
const MAX_PHOTO_SIZE = 10 * 1024 * 1024; // 10MB

export async function sendMessage(config: BotConfig["telegram_bot"], message: string) {
  await axios.post(`https://api.telegram.org/bot${config.token}/sendMessage`, {
    chat_id: config.chat_id,
    text: message,
    parse_mode: 'Markdown',
  });
}

export async function sendMediaGroup(config: BotConfig["telegram_bot"], stepMedia: Step["media"]) {
  stepMedia.sort((a, b) => a.order - b.order);

  const mediaBuffers = [];
  for (const m of stepMedia) {
    try {
      const type = m.type === MediaType.video ? 'video': 'photo';
      const ext = type === 'video' ? '.mp4' : '.jpg';
      const buffer = await files.getMediaBuffer(type, m);
      const compressedBuffer = type === 'photo'
        ? await compressPhoto(buffer)
        : await compressVideo(buffer);

      mediaBuffers.push({
        buffer: compressedBuffer,
        type,
        filename: `${uuidv4()}${ext}`,
      });
    } catch (err) {
      console.warn(`[TELEGRAM] Skipping file due to size/compression issue: ${m.path}`);
    }
  }

  // Create form data
  const form = new FormData();

  // Build media array for Telegram
  const media = mediaBuffers.map(({ type, filename }) => ({
    type,
    media: `attach://${filename}`,
  }));

  form.append('chat_id', config.chat_id);
  form.append('media', JSON.stringify(media));

  // Attach each file
  for (const { buffer, filename } of mediaBuffers) {
    form.append(filename, Readable.from(buffer), filename);
  }

  await axios.post(
    `https://api.telegram.org/bot${config.token}/sendMediaGroup`,
    form,
    { headers: form.getHeaders() }
  );
}

async function compressPhoto(buffer: Buffer): Promise<Buffer> {
  if (buffer.length < MAX_PHOTO_SIZE) {
    return buffer;
  }

  let compressed = await sharp(buffer)
    .resize({ width: 1280 })
    .jpeg({ quality: 75 })
    .toBuffer();

  if (compressed.length > MAX_PHOTO_SIZE) {
    // Try even lower quality as fallback
    compressed = await sharp(buffer)
      .resize({ width: 960 })
      .jpeg({ quality: 60 })
      .toBuffer();

    if (compressed.length > MAX_PHOTO_SIZE) {
      throw new Error('Image too large even after compression');
    }
  }

  return compressed;
}

async function compressVideo(buffer: Buffer): Promise<Buffer> {
  const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'vid-'));
  const inputPath = path.join(tmpDir, 'input.mp4');
  const outputPath = path.join(tmpDir, 'output.mp4');

  await fs.promises.writeFile(inputPath, buffer);

  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .videoCodec('libx264')
      .size('?x720')
      .outputOptions('-crf 28')
      .on('end', async () => {
        const compressed = await fs.promises.readFile(outputPath);

        if (compressed.length > MAX_VIDEO_SIZE) {
          reject(new Error('Video too large after compression'));
        } else {
          resolve(compressed);
        }
      })
      .on('error', reject)
      .save(outputPath);
  });
}

