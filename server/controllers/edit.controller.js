const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const sharp = require("sharp");
const { pool } = require("../core/db");
const { generate } = require("../core/csrf");
const overlayModel = require("../models/overlay.model");

const uploadsDir = path.join(__dirname, "../public/uploads");
const overlaysDir = path.join(__dirname, "../public/overlays");
const editTemplate = fs.readFileSync(
  path.join(__dirname, "../views/edit.html"),
  "utf8",
);

const escapeHtml = (value) =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;");

const toHttpError = (status, message) => {
  const error = new Error(message);
  error.status = status;
  return error;
};

const formatDate = (value) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString();
};

const renderEditHtml = ({ overlays, userImages, csrfToken, user }) => {
  const overlaysMarkup = overlays.length
    ? overlays
        .map(
          (overlay) => `
					<button type="button" class="overlay-item" data-overlay-id="${overlay.id}" aria-pressed="false">
						<img src="/public/overlays/${encodeURIComponent(overlay.filename)}" alt="Overlay ${overlay.id}">
					</button>
				`,
        )
        .join("")
    : '<p class="empty-state">No overlays available.</p>';

  const imagesMarkup = userImages.length
    ? userImages
        .map(
          (image) => `
					<article class="user-image-card" data-image-id="${image.id}">
						<img src="/public/uploads/${encodeURIComponent(image.filename)}" alt="${escapeHtml(image.filename)}">
						<div class="user-image-meta">
							<span>${escapeHtml(formatDate(image.created_at))}</span>
							<button type="button" class="delete-image-btn" data-image-id="${image.id}">Delete</button>
						</div>
					</article>
				`,
        )
        .join("")
    : '<p class="empty-state">No images yet.</p>';

  return editTemplate
    .replace(/{{CSRF_TOKEN}}/g, escapeHtml(csrfToken))
    .replace(/{{USERNAME}}/g, escapeHtml(user?.username || "User"))
    .replace("{{OVERLAY_ITEMS}}", overlaysMarkup)
    .replace("{{USER_IMAGES}}", imagesMarkup);
};

exports.getEditPage = async (req, res) => {
  const [overlays, userImagesResult] = await Promise.all([
    overlayModel.findAll(),
    pool.query(
      `SELECT id, filename, created_at
			 FROM images
			 WHERE user_id = $1
			 ORDER BY created_at DESC`,
      [req.session.userId],
    ),
  ]);

  res.send(
    renderEditHtml({
      overlays,
      userImages: userImagesResult.rows,
      csrfToken: generate(req),
      user: req.session.user,
    }),
  );
};

exports.postCapture = async (req, res) => {
  if (!req.file) {
    throw toHttpError(400, "Image file is required");
  }

  const overlayId = Number.parseInt(req.body.overlayId, 10);
  if (!Number.isInteger(overlayId) || overlayId <= 0) {
    throw toHttpError(400, "Invalid overlay id");
  }

  const overlay = await overlayModel.findById(overlayId);
  if (!overlay) {
    throw toHttpError(400, "Invalid overlay selection");
  }

  const uploadedFilePath = req.file.path;
  const safeOverlayFile = path.basename(String(overlay.filename || ""));
  if (!safeOverlayFile) {
    throw toHttpError(400, "Overlay file is invalid");
  }

  const overlayPath = path.join(overlaysDir, safeOverlayFile);
  const outputFilename = `${crypto.randomBytes(16).toString("hex")}.jpg`;
  const outputPath = path.join(uploadsDir, outputFilename);

  try {
    const userPhoto = sharp(uploadedFilePath).rotate();
    const metadata = await userPhoto.metadata();

    if (!metadata.width || !metadata.height) {
      throw toHttpError(400, "Invalid source image");
    }

    const overlayBuffer = await sharp(overlayPath)
      .resize(metadata.width, metadata.height, { fit: "fill" })
      .png()
      .toBuffer();

    await userPhoto
      .composite([{ input: overlayBuffer, blend: "over" }])
      .jpeg({ quality: 90 })
      .toFile(outputPath);

    const insertResult = await pool.query(
      `INSERT INTO images (user_id, filename)
			 VALUES ($1, $2)
			 RETURNING id`,
      [req.session.userId, outputFilename],
    );

    return res.json({
      success: true,
      filename: outputFilename,
      imageId: insertResult.rows[0]?.id || null,
    });
  } catch (error) {
    await fs.promises.unlink(outputPath).catch(() => {});
    throw error;
  } finally {
    await fs.promises.unlink(uploadedFilePath).catch(() => {});
  }
};

exports.deleteImage = async (req, res) => {
  const imageId = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(imageId) || imageId <= 0) {
    throw toHttpError(400, "Invalid image id");
  }

  const imageResult = await pool.query(
    `SELECT id, filename
		 FROM images
		 WHERE id = $1
			 AND user_id = $2`,
    [imageId, req.session.userId],
  );

  const image = imageResult.rows[0];
  if (!image) {
    throw toHttpError(404, "Image not found");
  }

  const imagePath = path.join(uploadsDir, path.basename(image.filename));

  await fs.promises.unlink(imagePath).catch((error) => {
    if (error.code !== "ENOENT") {
      throw error;
    }
  });

  await pool.query(
    `DELETE FROM images
		 WHERE id = $1
			 AND user_id = $2`,
    [imageId, req.session.userId],
  );

  return res.json({ success: true });
};
