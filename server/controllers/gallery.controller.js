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

const renderNavAuth = ({ currentUser, csrfToken }) => {
  if (!currentUser) {
    return [
      '<a class="nav-link" href="/login">Login</a>',
      '<a class="nav-link" href="/register">Register</a>',
    ].join("");
  }

  return `
    <a class="nav-link nav-camera" href="/edit" aria-label="Open editor">📷</a>
    <span class="nav-user">${escapeHtml(currentUser.username || "User")}</span>
    <details class="profile-menu">
      <summary class="avatar-button" aria-label="Profile menu">👤</summary>
      <div class="dropdown">
        <a class="dropdown-link" href="/user/profile">Profile</a>
        <form method="POST" action="/logout">
          <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}">
          <button type="submit" class="dropdown-logout">Logout</button>
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
}) => {
  const imageCards = images
    .map((image) => {
      const commentsMarkup = image.comments.length
        ? image.comments
            .map(
              (comment) => `
							<li>
								<span class="comment-author">${escapeHtml(comment.author_username)}</span>
								<span class="comment-content">${escapeHtml(comment.content)}</span>
							</li>`,
            )
            .join("")
        : '<li class="comment-empty">No comments yet.</li>';

      const interactionMarkup = currentUser
        ? `
          <div class="interaction-row">
            <form class="like-form" method="POST" action="/gallery/${image.id}/like">
              <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}">
              <input type="hidden" name="page" value="${currentPage}">
              <button class="btn" type="submit">${image.viewer_liked ? "Unlike" : "Like"}</button>
            </form>
            <form class="comment-form" method="POST" action="/gallery/${image.id}/comment">
              <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}">
              <input type="hidden" name="page" value="${currentPage}">
              <input class="input" type="text" name="content" maxlength="${MAX_COMMENT_LENGTH}" placeholder="Add a comment" required>
              <button class="btn" type="submit">Comment</button>
            </form>
          </div>
				`
        : '<p class="interaction-hint"><a href="/login">Log in</a> to interact.</p>';

      return `
				<article class="image-card" id="image-${image.id}">
          <details class="image-disclosure">
            <summary>
              <div class="card-preview">
                <img src="/public/uploads/${encodeURIComponent(image.filename)}" alt="${escapeHtml(image.filename)}">
                <div class="card-meta">
                  <span class="card-author">${escapeHtml(image.author_username)}</span>
                  <span class="meta-stats">${image.like_count} likes · ${image.comment_count} comments</span>
                </div>
              </div>
            </summary>
            <div class="card-expanded">
              ${interactionMarkup}
              <ul class="comments">${commentsMarkup}</ul>
            </div>
          </details>
				</article>
			`;
    })
    .join("");

  const prevLink =
    currentPage > 1
      ? `<a class="pager-link" href="/gallery?page=${currentPage - 1}">Previous</a>`
      : '<span class="pager-link disabled">Previous</span>';
  const nextLink =
    currentPage < totalPages
      ? `<a class="pager-link" href="/gallery?page=${currentPage + 1}">Next</a>`
      : '<span class="pager-link disabled">Next</span>';

  return galleryTemplate
    .replace("{{CSRF_TOKEN}}", escapeHtml(csrfToken))
    .replace("{{NAV_AUTH}}", renderNavAuth({ currentUser, csrfToken }))
    .replace("{{PAGE_INFO}}", `Page ${currentPage} of ${totalPages}`)
    .replace(
      "{{AUTH_HINT}}",
      currentUser
        ? ""
        : '<p class="auth-hint"><a href="/login">Log in</a> to like and comment on photos.</p>',
    )
    .replace("{{IMAGES}}", imageCards || '<p class="empty">No images yet.</p>')
    .replace("{{PREV_LINK}}", prevLink)
    .replace("{{NEXT_LINK}}", nextLink);
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

  res.send(
    renderGalleryHTML({
      images: imagesWithComments,
      currentPage,
      totalPages,
      csrfToken: generate(req),
      currentUser: req.session.user || null,
    }),
  );
};

exports.postToggleLike = async (req, res) => {
  const imageId = Number.parseInt(req.params.id, 10);
  const page = parsePage(req.body.page);

  if (!Number.isInteger(imageId) || imageId <= 0) {
    return res.status(400).send("Invalid image id");
  }

  const image = await imageModel.findByIdWithAuthor(imageId);
  if (!image) {
    return res.status(404).send("Image not found");
  }

  await likeModel.toggle({
    userId: req.session.userId,
    imageId,
  });

  return res.redirect(`/gallery?page=${page}`);
};

exports.postComment = async (req, res) => {
  const imageId = Number.parseInt(req.params.id, 10);
  const page = parsePage(req.body.page);
  const content = String(req.body.content || "").trim();

  if (!Number.isInteger(imageId) || imageId <= 0) {
    return res.status(400).send("Invalid image id");
  }

  if (!content) {
    return res.status(400).send("Comment content is required");
  }

  if (content.length > MAX_COMMENT_LENGTH) {
    return res.status(400).send("Comment is too long");
  }

  const image = await imageModel.findByIdWithAuthor(imageId);
  if (!image) {
    return res.status(404).send("Image not found");
  }

  await commentModel.create({
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

  return res.redirect(`/gallery?page=${page}`);
};
