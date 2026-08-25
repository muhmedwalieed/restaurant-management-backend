import fs from "fs";
import { sendSuccess } from "../../shared/utils/response.js";
import { ValidationError } from "../../shared/errors/index.js";
import { sniffImage } from "../../lib/uploads.js";

export class UploadsController {

  async uploadImage(req, res, next) {
    try {
      if (!req.file) {
        return next(new ValidationError("Image file is required"));
      }

      const { ok } = sniffImage(req.file.path);
      if (!ok) {
        fs.unlink(req.file.path, () => {});
        return next(new ValidationError("Uploaded file is not a valid image"));
      }

      return sendSuccess(res, {
        statusCode: 201,
        message: "Image uploaded successfully",
        data: { url: `/uploads/${req.file.filename}` },
      });
    } catch (error) {
      next(error);
    }
  }
}

export const uploadsController = new UploadsController();
export default uploadsController;
