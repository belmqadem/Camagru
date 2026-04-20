const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const sharp = require("sharp");
const { pool } = require("../core/db");
const { generate } = require("../core/csrf");
const overlayModel = require("../models/overlay.model");
const imageModel = require("../models/image.model");
const { escapeHtml, formatDate } = require("../utils/helpers");
const renderNavAuth = require("../utils/renderNavAuth");

const uploadsDir = path.join(__dirname, "../public/uploads");
const overlaysDir = path.join(__dirname, "../public/overlays");
const editTemplate = fs.readFileSync(
  path.join(__dirname, "../views/edit.html"),
  "utf8",
);

const toHttpError = (status, message) => {
  const error = new Error(message);
  error.status = status;
  return error;
};

const normalizePath = (value) => {
  const raw = String(value || "/")
    .split("?")[0]
    .replace(/\/+$/, "");
  return raw || "/";
};

const parseOverlayPlacement = (body, imageWidth, imageHeight) => {
  const parseRatio = (raw) => {
    if (raw === undefined || raw === null || raw === "") {
      return null;
    }

    const parsed = Number.parseFloat(String(raw));
    return Number.isFinite(parsed) ? parsed : null;
  };

  const xRatio = parseRatio(body.overlayXRatio);
  const yRatio = parseRatio(body.overlayYRatio);
  const widthRatio = parseRatio(body.overlayWidthRatio);
  const heightRatio = parseRatio(body.overlayHeightRatio);

  const values = [xRatio, yRatio, widthRatio, heightRatio];
  const hasAnyPlacementValue = values.some((value) => value !== null);

  if (!hasAnyPlacementValue) {
    return {
      left: 0,
      top: 0,
      width: imageWidth,
      height: imageHeight,
    };
  }

  if (values.some((value) => value === null)) {
    throw toHttpError(400, "Invalid overlay placement");
  }

  if (
    xRatio < 0 ||
    xRatio > 1 ||
    yRatio < 0 ||
    yRatio > 1 ||
    widthRatio <= 0 ||
    widthRatio > 1 ||
    heightRatio <= 0 ||
    heightRatio > 1
  ) {
    throw toHttpError(400, "Invalid overlay placement");
  }

  const width = Math.max(1, Math.round(imageWidth * widthRatio));
  const height = Math.max(1, Math.round(imageHeight * heightRatio));

  const safeWidth = Math.min(width, imageWidth);
  const safeHeight = Math.min(height, imageHeight);

  const maxLeft = Math.max(0, imageWidth - safeWidth);
  const maxTop = Math.max(0, imageHeight - safeHeight);

  const left = Math.min(maxLeft, Math.max(0, Math.round(imageWidth * xRatio)));
  const top = Math.min(maxTop, Math.max(0, Math.round(imageHeight * yRatio)));

  return {
    left,
    top,
    width: safeWidth,
    height: safeHeight,
  };
};

const renderEditHtml = ({
  overlays,
  userImages,
  csrfToken,
  user,
  currentPath,
}) => {
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
                <div class="image-card-actions">
                  <button type="button" class="delete-image-btn" data-image-id="${image.id}">Delete</button>
                </div>
						</div>
					</article>
				`,
        )
        .join("")
    : '<p class="empty-state">No images yet.</p>';

  return editTemplate
    .replace(/{{CSRF_TOKEN}}/g, escapeHtml(csrfToken))
    .replace(/{{USERNAME}}/g, escapeHtml(user?.username || "User"))
    .replace(
      "{{NAV_AUTH}}",
      renderNavAuth({ currentUser: user, csrfToken, currentPath }),
    )
    .replace("{{OVERLAY_ITEMS}}", overlaysMarkup)
    .replace("{{USER_IMAGES}}", imagesMarkup);
};

exports.getEditPage = async (req, res) => {
  const [overlays, userImages] = await Promise.all([
    overlayModel.findAll(),
    imageModel.findByUserId(req.session.userId),
  ]);

  res.send(
    renderEditHtml({
      overlays,
      userImages,
      csrfToken: generate(req),
      user: req.session.user,
      currentPath: normalizePath(req.baseUrl),
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

    const placement = parseOverlayPlacement(
      req.body,
      metadata.width,
      metadata.height,
    );

    const overlayBuffer = await sharp(overlayPath)
      .resize(placement.width, placement.height, { fit: "fill" })
      .png()
      .toBuffer();

    await userPhoto
      .composite([
        {
          input: overlayBuffer,
          blend: "over",
          left: placement.left,
          top: placement.top,
        },
      ])
      .jpeg({ quality: 90 })
      .toFile(outputPath);

    const inserted = await imageModel.create({
      userId: req.session.userId,
      filename: outputFilename,
    });

    return res.json({
      success: true,
      filename: outputFilename,
      imageId: inserted?.id || null,
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

  const image = await imageModel.findByIdAndUser(imageId, req.session.userId);
  if (!image) {
    throw toHttpError(404, "Image not found");
  }

  const imagePath = path.join(uploadsDir, path.basename(image.filename));

  await fs.promises.unlink(imagePath).catch((error) => {
    if (error.code !== "ENOENT") {
      throw error;
    }
  });

  await imageModel.deleteById(imageId, req.session.userId);

  return res.json({ success: true });
};
