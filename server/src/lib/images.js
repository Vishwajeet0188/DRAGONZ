// Secure image upload pipeline.
//  1) multer keeps the upload in memory with hard size/count limits (no temp files, no user filenames)
//  2) sharp decodes the bytes: anything that isn't a real JPEG/PNG/WebP/GIF image is rejected,
//     regardless of the declared MIME type or extension
//  3) the image is re-encoded to WebP — this strips EXIF/GPS metadata and any embedded payloads
//     (polyglot files, scripts in SVG are impossible because SVG is never accepted)
import multer from 'multer';
import sharp from 'sharp';
import { badRequest, AppError } from './errors.js';

export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const ALLOWED_FORMATS = new Set(['jpeg', 'png', 'webp', 'gif']);

const PRESETS = {
  avatar: { width: 512, height: 512, fit: 'cover' },
  banner: { width: 1920, height: 720, fit: 'inside' },
  content: { width: 2048, height: 2048, fit: 'inside' },
};

/** Multer middleware: `field` accepts up to `maxFiles` images. */
export function imageUpload(field, maxFiles = 1) {
  const m = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_UPLOAD_BYTES, files: maxFiles, fields: 20, fieldSize: 16 * 1024, parts: maxFiles + 20 },
    fileFilter: (_req, file, cb) => {
      if (!ALLOWED_MIME.has(file.mimetype)) return cb(badRequest('Only JPG, PNG, WebP or GIF images are allowed'));
      cb(null, true);
    },
  }).array(field, maxFiles);
  return (req, res, next) => m(req, res, (err) => {
    if (!err) return next();
    if (err instanceof AppError) return next(err);
    if (err.code === 'LIMIT_FILE_SIZE') return next(new AppError(413, 'FILE_TOO_LARGE', 'Images must be 8 MB or smaller'));
    if (err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE') return next(badRequest(`Upload at most ${maxFiles} image${maxFiles > 1 ? 's' : ''}`));
    return next(badRequest('Upload failed'));
  });
}

/** Decode + validate + re-encode. Returns { buffer, width, height, contentType }. */
export async function processImage(input, preset = 'content') {
  let meta;
  try {
    meta = await sharp(input, { limitInputPixels: 50_000_000 }).metadata();
  } catch {
    throw badRequest('That file is not a valid image');
  }
  if (!ALLOWED_FORMATS.has(meta.format)) throw badRequest('Only JPG, PNG, WebP or GIF images are allowed');
  const p = PRESETS[preset] ?? PRESETS.content;
  const { data, info } = await sharp(input, { limitInputPixels: 50_000_000, animated: false })
    .rotate() // honour EXIF orientation before metadata is dropped
    .resize({ width: p.width, height: p.height, fit: p.fit, withoutEnlargement: true })
    .webp({ quality: 82 })
    .toBuffer({ resolveWithObject: true });
  return { buffer: data, width: info.width, height: info.height, contentType: 'image/webp', sizeBytes: data.length };
}
