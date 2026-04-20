const multer = require("multer");
const path = require("path");
const crypto = require("crypto");
const fs = require("fs");

const tempUploadDir = path.join(__dirname, "../public/uploads/tmp");
const allowedMimeTypes = new Set(["image/jpeg", "image/png"]);

fs.mkdirSync(tempUploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, tempUploadDir),
  filename: (_req, file, cb) => {
    const hash = crypto.randomBytes(16).toString("hex");
    const ext = file.mimetype === "image/png" ? ".png" : ".jpg";
    cb(null, `${hash}${ext}`);
  },
});

const fileFilter = (req, file, cb) => {
  if (allowedMimeTypes.has(file.mimetype)) {
    cb(null, true);
    return;
  }

  const error = new Error("Only JPEG and PNG files are allowed");
  error.status = 400;
  cb(error);
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 },
});

module.exports = (req, res, next) => {
  upload.single("image")(req, res, (error) => {
    if (error instanceof multer.MulterError) {
      const mappedError = new Error(
        error.code === "LIMIT_FILE_SIZE"
          ? "Image size must be 5MB or less"
          : "Invalid upload request",
      );
      mappedError.status = 400;
      return next(mappedError);
    }

    if (error) {
      return next(error);
    }

    if (!req.file) {
      const missingFileError = new Error("Image file is required");
      missingFileError.status = 400;
      return next(missingFileError);
    }

    return next();
  });
};
