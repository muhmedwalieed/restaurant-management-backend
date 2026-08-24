import multer from "multer";
import { randomUUID } from "crypto";
import path from "path";
import fs from "fs";
import { ValidationError } from "../shared/errors/index.js";

export const UPLOADS_DIR = path.resolve(process.cwd(), "uploads");

if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

export const ALLOWED_IMAGE_TYPES = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
};

export const MAX_IMAGE_SIZE = 2 * 1024 * 1024; // 2 MB

/**
 * Disk storage: random UUID filename + extension derived from the MIME type,
 * never from the client-supplied original name (prevents path/extension tricks).
 */
const storage = multer.diskStorage({
  destination: UPLOADS_DIR,
  filename: (req, file, cb) => {
    const ext = ALLOWED_IMAGE_TYPES[file.mimetype] || ".jpg";
    cb(null, `${randomUUID()}${ext}`);
  },
});

export const uploadImageMiddleware = multer({
  storage,
  limits: { fileSize: MAX_IMAGE_SIZE, files: 1 },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_IMAGE_TYPES[file.mimetype]) {
      cb(null, true);
      return;
    }
    cb(new ValidationError("Only JPEG, PNG, WEBP and GIF images are allowed"));
  },
});

/**
 * Verifies the first bytes of an uploaded file match a real image signature,
 * so a spoofed MIME type can't smuggle an arbitrary file through.
 * @returns {{ ok: boolean, type: string|null }}
 */
export function sniffImage(filePath) {
  let header;
  try {
    header = fs.readFileSync(filePath);
  } catch {
    return { ok: false, type: null };
  }

  const b = header.subarray(0, 12);

  // JPEG: FF D8 FF
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) {
    return { ok: true, type: "image/jpeg" };
  }
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) {
    return { ok: true, type: "image/png" };
  }
  // WEBP: RIFF....WEBP
  if (b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP") {
    return { ok: true, type: "image/webp" };
  }
  // GIF: GIF87a / GIF89a
  const gif = b.subarray(0, 6).toString("latin1");
  if (gif === "GIF87a" || gif === "GIF89a") {
    return { ok: true, type: "image/gif" };
  }
  return { ok: false, type: null };
}

export default uploadImageMiddleware;