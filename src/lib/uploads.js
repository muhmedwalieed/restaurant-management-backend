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

export const MAX_IMAGE_SIZE = 2 * 1024 * 1024;

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

export function sniffImage(filePath) {
  let header;
  try {
    header = fs.readFileSync(filePath);
  } catch {
    return { ok: false, type: null };
  }

  const b = header.subarray(0, 12);

  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) {
    return { ok: true, type: "image/jpeg" };
  }

  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) {
    return { ok: true, type: "image/png" };
  }

  if (b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP") {
    return { ok: true, type: "image/webp" };
  }

  const gif = b.subarray(0, 6).toString("latin1");
  if (gif === "GIF87a" || gif === "GIF89a") {
    return { ok: true, type: "image/gif" };
  }
  return { ok: false, type: null };
}

export default uploadImageMiddleware;
