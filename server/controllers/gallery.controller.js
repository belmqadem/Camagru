const fs = require("fs");
const path = require("path");
const imageModel = require("../models/image.model");
const likeModel = require("../models/like.model");
const commentModel = require("../models/comment.model");
const { generate } = require("../core/csrf");
const { sendMail } = require("../core/mailer");
const logger = require("../core/logger");
const { escapeHtml, formatDate, isAjaxRequest } = require("../utils/helpers");
const renderNavAuth = require("../utils/renderNavAuth");

const PAGE_SIZE = 5;
const MAX_COMMENT_LENGTH = 500;
const AVATAR_COLORS = [
  "#ef476f",
  "#f78c6b",
  "#06d6a0",
  "#118ab2",
  "#8338ec",
  "#ffb703",
];
const galleryTemplate = fs.readFileSync(
  path.join(__dirname, "../views/gallery.html"),
  "utf8",
);
const imageTemplate = fs.readFileSync(
  path.join(__dirname, "../views/image.html"),
  "utf8",
);

const parsePage = (value) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
};

const getAppUrl = () => {
  const configured = String(process.env.APP_URL || "").trim();
  if (!configured) {
    return "http://localhost:8080";
  }

  return configured.replace(/\/+$/, "");
};

const getRequestPath = (req) =>
  normalizePath(`${req.baseUrl || ""}${req.path || ""}`);

const normalizePath = (value) => {
  const raw = String(value || "/")
    .split("?")[0]
    .replace(/\/+$/, "");
  return raw || "/";
};

const toIsoDate = (value) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
};

const hashUsername = (username) => {
  const raw = String(username || "U");
  let hash = 0;

  for (let index = 0; index < raw.length; index += 1) {
    hash = (hash * 31 + raw.charCodeAt(index)) % AVATAR_COLORS.length;
  }

  return Math.abs(hash);
};

const getAvatarColor = (username) => AVATAR_COLORS[hashUsername(username)];

const getAvatarInitial = (username) => {
  const raw = String(username || "U").trim();
  return raw ? raw.charAt(0).toUpperCase() : "U";
};

const renderHeartIcon = (liked) => {
  if (liked) {
    return '<i class="fa-solid fa-heart liked-heart" aria-hidden="true"></i>';
  }

  return '<i class="fa-regular fa-heart" aria-hidden="true"></i>';
};

const renderCommentIcon = () =>
  '<i class="fa-regular fa-comment" aria-hidden="true"></i>';

const renderShareButtons = (imageId) => `
  <div class="share-row" data-image-id="${imageId}">
    <button class="share-btn share-btn-x" type="button" data-share-target="x" data-image-id="${imageId}" aria-label="Share on X">
      <i class="fa-brands fa-x-twitter" aria-hidden="true"></i>
      <span class="sr-only">Share on X</span>
    </button>
    <button class="share-btn share-btn-facebook" type="button" data-share-target="facebook" data-image-id="${imageId}" aria-label="Share on Facebook">
      <i class="fa-brands fa-facebook-f" aria-hidden="true"></i>
      <span class="sr-only">Share on Facebook</span>
    </button>
    <button class="share-btn share-btn-whatsapp" type="button" data-share-target="whatsapp" data-image-id="${imageId}" aria-label="Share on WhatsApp">
      <i class="fa-brands fa-whatsapp" aria-hidden="true"></i>
      <span class="sr-only">Share on WhatsApp</span>
    </button>
  </div>
`;

const renderImageComments = (comments) => {
  if (!Array.isArray(comments) || comments.length === 0) {
    return '<li class="detail-comments-empty">No comments yet</li>';
  }

  return comments
    .map((comment) => {
      const authorUsername = String(comment.author_username || "User");
      const avatarInitial = getAvatarInitial(authorUsername);
      const commentDateIso = toIsoDate(comment.created_at);
      const commentDate = formatDate(comment.created_at);

      return `
        <li class="detail-comment-item">
          <span class="detail-comment-avatar">${escapeHtml(avatarInitial)}</span>
          <div class="detail-comment-content">
            <p class="detail-comment-text">
              <span class="detail-comment-author">${escapeHtml(authorUsername)}</span>
              <span>${escapeHtml(comment.content)}</span>
            </p>
            <time class="detail-comment-time" datetime="${escapeHtml(commentDateIso)}" data-relative-time="${escapeHtml(commentDateIso)}">${escapeHtml(commentDate)}</time>
          </div>
        </li>
      `;
    })
    .join("");
};

const renderImageNotFoundHTML = ({ csrfToken, currentUser, currentPath }) => `
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="csrf-token" content="${escapeHtml(csrfToken)}" />
    <link rel="icon" href="/public/favicon.ico" />
    <title>Image Not Found | Camagru</title>
    <link rel="stylesheet" href="/public/assets/fontawesome/css/all.min.css" />
    <link rel="stylesheet" href="/public/css/main.css" />
    <link rel="stylesheet" href="/public/css/image.css" />
  </head>
  <body>
    <div class="site-shell">
      <header class="site-header">
        <div class="container nav-wrap">
          <a class="brand" href="/gallery">
            <span class="brand-logo-wrap">
              <img src="/public/assets/camagru-logo.png" alt="Camagru Logo" class="logo" />
            </span>
          </a>
          <nav class="site-nav">${renderNavAuth({ currentUser, csrfToken, currentPath })}</nav>
        </div>
      </header>

      <main class="page-main">
        <div class="container image-detail-shell">
          <a class="back-link" href="/gallery">&larr; Back to Gallery</a>
          <section class="image-not-found">
            <h1>Image not found</h1>
            <p>The photo you are looking for does not exist or was removed.</p>
          </section>
        </div>
      </main>

      <footer class="site-footer">
        <p>Camagru © 2025</p>
      </footer>
    </div>
  </body>
</html>
`;

const renderImageDetailHTML = ({
  image,
  comments,
  likeCount,
  viewerLiked,
  csrfToken,
  currentUser,
  currentPath,
  page,
}) => {
  const appUrl = getAppUrl();
  const commentsCount = comments.length;
  const postDateIso = toIsoDate(image.created_at);
  const postDate = formatDate(image.created_at);
  const authorAvatarInitial = getAvatarInitial(image.author_username);
  const safeImageId = String(image.id);
  const safeFilename = String(image.filename || "");
  const encodedFilename = encodeURIComponent(safeFilename);
  const ogTitle = `Photo by ${image.author_username} on Camagru`;
  const ogImage = `/public/uploads/${encodedFilename}`;
  const ogUrl = `${appUrl}/gallery/${encodeURIComponent(safeImageId)}`;

  const likeButtonMarkup = currentUser
    ? `
      <form id="detailLikeForm" class="detail-like-form like-form" method="POST" action="/gallery/${safeImageId}/like" data-image-id="${safeImageId}">
        <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}">
        <input type="hidden" name="page" value="${page}">
        <button class="icon-btn like-toggle ${viewerLiked ? "liked" : ""}" type="submit" aria-label="${viewerLiked ? "Unlike" : "Like"}">${renderHeartIcon(viewerLiked)}</button>
      </form>
      <p id="detailLikeError" class="form-error" hidden aria-live="polite"></p>
    `
    : `
      <a class="icon-btn detail-login-link" href="/login" aria-label="Log in to like">
        ${renderHeartIcon(false)}
      </a>
    `;

  const commentComposerMarkup = currentUser
    ? `
      <form id="detailCommentForm" class="detail-comment-form comment-form" method="POST" action="/gallery/${safeImageId}/comment" data-image-id="${safeImageId}">
        <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}">
        <input type="hidden" name="page" value="${page}">
        <input class="input" type="text" name="content" maxlength="${MAX_COMMENT_LENGTH}" placeholder="Add a comment..." required>
        <button class="post-comment-btn" type="submit">Post</button>
      </form>
      <p id="detailCommentError" class="form-error" hidden aria-live="polite"></p>
    `
    : '<p class="interaction-hint"><a href="/login">Log in to comment</a></p>';

  return imageTemplate
    .replace("{{CSRF_TOKEN}}", escapeHtml(csrfToken))
    .replace("{{APP_URL}}", escapeHtml(appUrl))
    .replace("{{OG_IMAGE}}", escapeHtml(ogImage))
    .replace("{{OG_TITLE}}", escapeHtml(ogTitle))
    .replace("{{OG_URL}}", escapeHtml(ogUrl))
    .replace(
      "{{NAV_AUTH}}",
      renderNavAuth({ currentUser, csrfToken, currentPath }),
    )
    .replace("{{BACK_LINK}}", `/gallery?page=${page}`)
    .replace(/{{IMAGE_ID}}/g, escapeHtml(safeImageId))
    .replace("{{IMAGE_FILENAME}}", escapeHtml(encodedFilename))
    .replace("{{AUTHOR_AVATAR_INITIAL}}", escapeHtml(authorAvatarInitial))
    .replace(/{{AUTHOR_USERNAME}}/g, escapeHtml(image.author_username))
    .replace("{{POST_DATE_ISO}}", escapeHtml(postDateIso))
    .replace("{{POST_DATE}}", escapeHtml(postDate))
    .replace("{{LIKE_BUTTON}}", likeButtonMarkup)
    .replace("{{LIKE_COUNT}}", String(Number(likeCount) || 0))
    .replace("{{COMMENT_COUNT}}", String(commentsCount))
    .replace("{{SHARE_BUTTONS}}", renderShareButtons(safeImageId))
    .replace("{{COMMENTS_TITLE_COUNT}}", String(commentsCount))
    .replace("{{COMMENTS_ITEMS}}", renderImageComments(comments))
    .replace("{{COMMENT_COMPOSER}}", commentComposerMarkup)
    .replace("{{CAN_INTERACT}}", currentUser ? "true" : "false");
};

const serializeImageForJson = (image) => ({
  id: image.id,
  filename: image.filename,
  created_at: image.created_at,
  author_username: image.author_username,
  like_count: Number(image.like_count) || 0,
  comment_count: Number(image.comment_count) || 0,
  viewer_liked: Boolean(image.viewer_liked),
  comments: Array.isArray(image.comments)
    ? image.comments.map((comment) => ({
        author_username: comment.author_username,
        content: comment.content,
        created_at: comment.created_at,
      }))
    : [],
});

const sendError = (req, res, status, message) => {
  if (isAjaxRequest(req)) {
    return res.status(status).json({ error: message });
  }

  return res.status(status).send(message);
};

const renderGalleryHTML = ({
  images,
  currentPage,
  totalPages,
  csrfToken,
  currentUser,
  currentPath,
}) => {
  const imageCards = images
    .map((image) => {
      const totalLikeCount = Number(image.like_count) || 0;
      const totalCommentCount = Number(image.comment_count) || 0;
      const previewComments = image.comments.slice(-2);
      const commentsMarkup = previewComments.length
        ? previewComments
            .map(
              (comment) => `
                <li class="comment-item">
                  <span class="comment-author">${escapeHtml(comment.author_username)}</span>
                  <span class="comment-content">${escapeHtml(comment.content)}</span>
                </li>`,
            )
            .join("")
        : '<li class="comment-empty">No comments yet.</li>';

      const commentInputMarkup = currentUser
        ? `
          <form class="comment-form inline-comment-form" method="POST" action="/gallery/${image.id}/comment" data-image-id="${image.id}">
            <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}">
            <input type="hidden" name="page" value="${currentPage}">
            <input class="input" type="text" name="content" maxlength="${MAX_COMMENT_LENGTH}" placeholder="Add a comment..." required>
            <button class="post-comment-btn" type="submit">Post</button>
          </form>
          <p class="form-error" hidden aria-live="polite"></p>
        `
        : '<p class="interaction-hint"><a href="/login">Log in</a> to comment.</p>';

      const avatarColor = getAvatarColor(image.author_username);
      const avatarInitial = getAvatarInitial(image.author_username);
      const postDate = formatDate(image.created_at);
      const postDateIso = toIsoDate(image.created_at);

      return `
        <article class="image-card" id="image-${image.id}" data-image-id="${image.id}">
          <header class="post-header">
            <span class="author-avatar" style="background:${escapeHtml(avatarColor)}">${escapeHtml(avatarInitial)}</span>
            <div class="post-author-meta">
              <span class="post-username">${escapeHtml(image.author_username)}</span>
              <time class="post-date" datetime="${escapeHtml(postDateIso)}">${escapeHtml(postDate)}</time>
            </div>
          </header>

          <div class="post-media">
            <a class="post-image-link" href="/gallery/${image.id}?page=${currentPage}" aria-label="Open photo details">
              <img class="post-image" src="/public/uploads/${encodeURIComponent(image.filename)}" alt="${escapeHtml(image.filename)}">
            </a>
          </div>

          <div class="post-body">
            <div class="action-bar">
              <div class="action-left">
                <form class="like-form" method="POST" action="/gallery/${image.id}/like" data-image-id="${image.id}">
                  <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}">
                  <input type="hidden" name="page" value="${currentPage}">
                  <button class="icon-btn like-toggle ${image.viewer_liked ? "liked" : ""}" type="submit" aria-label="${image.viewer_liked ? "Unlike" : "Like"}">${renderHeartIcon(Boolean(image.viewer_liked))}</button>
                </form>
                <p class="form-error" hidden aria-live="polite"></p>
                <span class="action-count like-count">${totalLikeCount}</span>
                <button class="icon-btn comment-jump" type="button" data-image-id="${image.id}" aria-label="Open comments">${renderCommentIcon()}</button>
                <span class="action-count comment-count">${totalCommentCount}</span>
              </div>
              <div class="action-right">${renderShareButtons(image.id)}</div>
            </div>


            <div class="comments-block">
              <ul class="comments" data-expanded="false">${commentsMarkup}</ul>
              ${totalCommentCount > 2 ? `<button class="view-all-comments" type="button" data-image-id="${image.id}" data-total-comments="${totalCommentCount}">View all ${totalCommentCount} comments</button>` : ""}
            </div>

            ${commentInputMarkup}
          </div>
        </article>
      `;
    })
    .join("");

  return galleryTemplate
    .replace("{{CSRF_TOKEN}}", escapeHtml(csrfToken))
    .replace(
      "{{NAV_AUTH}}",
      renderNavAuth({ currentUser, csrfToken, currentPath }),
    )
    .replace("{{CURRENT_PAGE}}", String(currentPage))
    .replace("{{TOTAL_PAGES}}", String(totalPages))
    .replace("{{CAN_INTERACT}}", currentUser ? "true" : "false")
    .replace(
      "{{AUTH_HINT}}",
      currentUser
        ? ""
        : '<p class="auth-hint"><a href="/login">Log in</a> to like and comment on photos.</p>',
    )
    .replace("{{IMAGES}}", imageCards || '<p class="empty">No images yet.</p>');
};

exports.getGallery = async (req, res) => {
  const requestedPage = parsePage(req.query.page);
  const totalImages = await imageModel.countAll();
  const totalPages = Math.max(1, Math.ceil(totalImages / PAGE_SIZE));
  const currentPage = Math.min(requestedPage, totalPages);
  const offset = (currentPage - 1) * PAGE_SIZE;

  const images = await imageModel.findPaged({
    limit: PAGE_SIZE,
    offset,
    viewerId: req.session.userId || null,
  });

  const imageIds = images.map((image) => image.id);
  const comments = await imageModel.findCommentsByImageIds(imageIds);

  const commentsByImage = new Map();
  comments.forEach((comment) => {
    if (!commentsByImage.has(comment.image_id)) {
      commentsByImage.set(comment.image_id, []);
    }
    commentsByImage.get(comment.image_id).push(comment);
  });

  const imagesWithComments = images.map((image) => ({
    ...image,
    comments: commentsByImage.get(image.id) || [],
  }));

  if (isAjaxRequest(req)) {
    return res.json({
      images: imagesWithComments.map(serializeImageForJson),
      currentPage,
      totalPages,
      hasMore: currentPage < totalPages,
    });
  }

  res.send(
    renderGalleryHTML({
      images: imagesWithComments,
      currentPage,
      totalPages,
      csrfToken: generate(req),
      currentUser: req.session.user || null,
      currentPath: normalizePath(req.baseUrl),
    }),
  );
};

exports.getImage = async (req, res) => {
  const imageId = Number.parseInt(req.params.id, 10);
  const csrfToken = generate(req);
  const currentPath = getRequestPath(req);
  const page = parsePage(req.query.page);

  if (!Number.isInteger(imageId) || imageId <= 0) {
    return res.status(404).send(
      renderImageNotFoundHTML({
        csrfToken,
        currentUser: req.session.user || null,
        currentPath,
      }),
    );
  }

  const image = await imageModel.findByIdWithAuthor(imageId);
  if (!image) {
    return res.status(404).send(
      renderImageNotFoundHTML({
        csrfToken,
        currentUser: req.session.user || null,
        currentPath,
      }),
    );
  }

  const [comments, likeCount, viewerLiked] = await Promise.all([
    imageModel.findCommentsByImageIds([imageId]),
    likeModel.countByImageId(imageId),
    likeModel.hasViewerLikedImage({
      userId: req.session.userId || null,
      imageId,
    }),
  ]);

  return res.send(
    renderImageDetailHTML({
      image,
      comments,
      likeCount,
      viewerLiked,
      csrfToken,
      currentUser: req.session.user || null,
      currentPath,
      page,
    }),
  );
};

exports.getImageComments = async (req, res) => {
  const imageId = Number.parseInt(req.params.id, 10);

  if (!Number.isInteger(imageId) || imageId <= 0) {
    return res.status(400).json({ error: "Invalid image id" });
  }

  const image = await imageModel.findByIdWithAuthor(imageId);
  if (!image) {
    return res.status(404).json({ error: "Image not found" });
  }

  const comments = await imageModel.findCommentsByImageIds([imageId]);
  return res.json(
    comments.map((comment) => ({
      author_username: comment.author_username,
      content: comment.content,
      created_at: comment.created_at,
    })),
  );
};

exports.postToggleLike = async (req, res) => {
  const imageId = Number.parseInt(req.params.id, 10);
  const page = parsePage(req.body?.page);

  if (!Number.isInteger(imageId) || imageId <= 0) {
    return sendError(req, res, 400, "Invalid image id");
  }

  const image = await imageModel.findByIdWithAuthor(imageId);
  if (!image) {
    return sendError(req, res, 404, "Image not found");
  }

  const toggleResult = await likeModel.toggle({
    userId: req.session.userId,
    imageId,
  });

  if (isAjaxRequest(req)) {
    const likeCount = await likeModel.countByImageId(imageId);
    return res.json({ liked: toggleResult.liked, likeCount });
  }

  return res.redirect(`/gallery?page=${page}`);
};

exports.postComment = async (req, res) => {
  const imageId = Number.parseInt(req.params.id, 10);
  const page = parsePage(req.body?.page);
  const content = String(req.body?.content || "").trim();

  if (!Number.isInteger(imageId) || imageId <= 0) {
    return sendError(req, res, 400, "Invalid image id");
  }

  if (!content) {
    return sendError(req, res, 400, "Comment content is required");
  }

  if (content.length > MAX_COMMENT_LENGTH) {
    return sendError(req, res, 400, "Comment is too long");
  }

  const image = await imageModel.findByIdWithAuthor(imageId);
  if (!image) {
    return sendError(req, res, 404, "Image not found");
  }

  const createdComment = await commentModel.create({
    userId: req.session.userId,
    imageId,
    content,
  });

  const isDifferentUser = image.author_id !== req.session.userId;
  if (isDifferentUser && image.notify_comments) {
    const commenter = req.session.user?.username || "A user";

    void sendMail(
      image.author_email,
      "New comment on your Camagru image",
      `
			<h2>New comment on your image</h2>
			<p><strong>${escapeHtml(commenter)}</strong> commented with <strong>${escapeHtml(content)}</strong> on your image.</p>
			<a href="${process.env.APP_URL}/gallery/${image.id}">View image</a>
		`,
    ).catch((error) => {
      logger.error("Failed to send comment notification email", error);
    });
  }

  if (isAjaxRequest(req)) {
    return res.json({
      success: true,
      comment: {
        author_username: req.session.user?.username || "You",
        content: createdComment.content,
        created_at: createdComment.created_at,
      },
    });
  }

  return res.redirect(`/gallery?page=${page}`);
};
