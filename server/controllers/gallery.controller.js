const fs = require("fs");
const path = require("path");
const imageModel = require("../models/image.model");
const likeModel = require("../models/like.model");
const commentModel = require("../models/comment.model");
const { generate } = require("../core/csrf");
const { sendMail } = require("../core/mailer");
const logger = require("../core/logger");

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

const escapeHtml = (value) =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;");

const parsePage = (value) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
};

const normalizePath = (value) => {
  const raw = String(value || "/")
    .split("?")[0]
    .replace(/\/+$/, "");
  return raw || "/";
};

const formatPostDate = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Recently";
  }

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
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

const isAjaxRequest = (req) => {
  const requestedWith = String(req.get("x-requested-with") || "").toLowerCase();
  const accept = String(req.get("accept") || "").toLowerCase();

  return (
    requestedWith === "xmlhttprequest" || accept.includes("application/json")
  );
};

const sendError = (req, res, status, message) => {
  if (isAjaxRequest(req)) {
    return res.status(status).json({ error: message });
  }

  return res.status(status).send(message);
};

const renderNavAuth = ({ currentUser, csrfToken, currentPath }) => {
  const safePath = normalizePath(currentPath);
  const isActive = (path) => safePath === normalizePath(path);

  if (!currentUser) {
    return [
      `<a class="nav-link nav-login-link ${isActive("/login") ? "active" : ""}" href="/login">Login</a>`,
      `<a class="nav-link nav-register-btn ${isActive("/register") ? "active" : ""}" href="/register">Register</a>`,
    ].join("");
  }

  const username = escapeHtml(currentUser.username || "User");

  return `
    <a class="nav-link nav-icon-link nav-camera ${isActive("/edit") ? "active" : ""}" href="/edit" aria-label="Open editor">
      <i class="fa-solid fa-camera" aria-hidden="true"></i>
    </a>
    <details class="profile-menu">
      <summary class="nav-link nav-icon-link nav-profile-toggle ${isActive("/user/profile") ? "active" : ""}" aria-label="Open profile menu">
        <i class="fa-solid fa-user" aria-hidden="true"></i>
      </summary>
      <div class="profile-dropdown">
        <a class="profile-dropdown-link" href="/user/profile" title="${username}">
          <i class="fa-solid fa-user" aria-hidden="true"></i>
          <span class="profile-dropdown-username">${username}</span>
        </a>
        <form class="profile-dropdown-form" method="POST" action="/logout">
          <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}">
          <button type="submit" class="profile-dropdown-logout">
            <i class="fa-solid fa-right-from-bracket" aria-hidden="true"></i>
            <span>Logout</span>
          </button>
        </form>
      </div>
    </details>
  `;
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
      const postDate = formatPostDate(image.created_at);
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
            <img class="post-image" src="/public/uploads/${encodeURIComponent(image.filename)}" alt="${escapeHtml(image.filename)}">
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
			<p><strong>${escapeHtml(commenter)}</strong> commented on <strong>${escapeHtml(
        image.filename,
      )}</strong>.</p>
			<p>Comment: ${escapeHtml(content)}</p>
			<a href="${process.env.APP_URL}/gallery?page=${page}#image-${image.id}">View in gallery</a>
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
