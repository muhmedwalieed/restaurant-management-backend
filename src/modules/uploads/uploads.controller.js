import fs from "fs";
import { sendSuccess } from "../../shared/utils/response.js";
import { ValidationError } from "../../shared/errors/index.js";
import { sniffImage } from "../../lib/uploads.js";
import { asyncHandler } from "../../shared/utils/async-handler.js";

export class UploadsController {
  uploadImage = asyncHandler(async (req, res) => {
    if (!req.file) {
      throw new ValidationError("Image file is required");
    }

    const { ok } = sniffImage(req.file.path);
    if (!ok) {
      fs.unlink(req.file.path, () => {});
      throw new ValidationError("Uploaded file is not a valid image");
    }

    return sendSuccess(res, {
      statusCode: 201,
      message: "Image uploaded successfully",
      data: { url: `/uploads/${req.file.filename}` },
    });
  });
}

export const uploadsController = new UploadsController();
export default uploadsController;
