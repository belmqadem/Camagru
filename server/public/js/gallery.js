(() => {
  const csrfToken =
    document.querySelector('meta[name="csrf-token"]')?.content || "";
  const appUrlMeta = document.querySelector('meta[name="app-url"]')?.content;

  const galleryGrid = document.getElementById("galleryGrid");
  const scrollSentinel = document.getElementById("scroll-sentinel");
  const shareButtonsTemplate = document.getElementById(
    "share-buttons-template",
  );

  if (!galleryGrid) {
    return;
  }

  const isLocalHostName = (hostName) =>
    hostName === "localhost" || hostName === "127.0.0.1";

  const getNormalizedShareBaseUrl = (rawBaseUrl) => {
    const fallbackOrigin = window.location.origin;
    const candidate =
      typeof rawBaseUrl === "string" && rawBaseUrl.trim()
        ? rawBaseUrl.trim()
        : fallbackOrigin;

    try {
      const parsed = new URL(candidate, fallbackOrigin);
      if (parsed.protocol === "https:" && isLocalHostName(parsed.hostname)) {
        parsed.protocol = "http:";
      }

      return `${parsed.protocol}//${parsed.host}`.replace(/\/+$/, "");
    } catch (_error) {
      const fallback = new URL(fallbackOrigin);
      if (
        fallback.protocol === "https:" &&
        isLocalHostName(fallback.hostname)
      ) {
        fallback.protocol = "http:";
      }

      return `${fallback.protocol}//${fallback.host}`;
    }
  };

  const normalizedAppUrl = getNormalizedShareBaseUrl(appUrlMeta);
  const shareText = "Check out this photo on Camagru!";
  const maxCommentLength = 500;
  const canInteract = galleryGrid.dataset.canInteract === "true";

  let currentPage = Number.parseInt(galleryGrid.dataset.currentPage || "1", 10);
  if (!Number.isInteger(currentPage) || currentPage < 1) {
    currentPage = 1;
  }

  let totalPages = Number.parseInt(galleryGrid.dataset.totalPages || "1", 10);
  if (!Number.isInteger(totalPages) || totalPages < 1) {
    totalPages = 1;
  }

  let hasMore = currentPage < totalPages;
  let isLoading = false;
  let scrollObserver = null;
  let scrollErrorElement = null;

  const avatarColors = [
    "#ef476f",
    "#f78c6b",
    "#06d6a0",
    "#118ab2",
    "#8338ec",
    "#ffb703",
  ];

  const escapeHtml = (value) =>
    String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;");

  const hashUsername = (username) => {
    const raw = String(username || "U");
    let hash = 0;

    for (let index = 0; index < raw.length; index += 1) {
      hash = (hash * 31 + raw.charCodeAt(index)) % avatarColors.length;
    }

    return Math.abs(hash);
  };

  const getAvatarColor = (username) => avatarColors[hashUsername(username)];

  const getAvatarInitial = (username) => {
    const raw = String(username || "U").trim();
    return raw ? raw.charAt(0).toUpperCase() : "U";
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

  const renderHeartIcon = (liked) => {
    if (liked) {
      return '<i class="fa-solid fa-heart liked-heart" aria-hidden="true"></i>';
    }

    return '<i class="fa-regular fa-heart" aria-hidden="true"></i>';
  };

  const renderCommentIcon = () =>
    '<i class="fa-regular fa-comment" aria-hidden="true"></i>';

  const getCanonicalImageUrl = (imageId) =>
    `${normalizedAppUrl}/gallery/${encodeURIComponent(String(imageId))}`;

  const getShareDialogUrl = ({ imageId, target }) => {
    const encodedText = encodeURIComponent(shareText);
    const encodedUrl = encodeURIComponent(getCanonicalImageUrl(imageId));

    if (target === "x") {
      return `https://twitter.com/intent/tweet?text=${encodedText}&url=${encodedUrl}`;
    }

    if (target === "facebook") {
      return `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`;
    }

    if (target === "whatsapp") {
      return `https://wa.me/?text=${encodedText}%20${encodedUrl}`;
    }

    return "";
  };

  const renderShareButtonsMarkup = (imageId) => {
    const safeImageId = escapeHtml(String(imageId));

    if (shareButtonsTemplate?.innerHTML) {
      return shareButtonsTemplate.innerHTML.replaceAll(
        "{{IMAGE_ID}}",
        safeImageId,
      );
    }

    return `
      <div class="share-row" data-image-id="${safeImageId}">
        <button class="share-btn share-btn-x" type="button" data-share-target="x" data-image-id="${safeImageId}" aria-label="Share on X">
          <i class="fa-brands fa-x-twitter" aria-hidden="true"></i>
          <span class="sr-only">Share on X</span>
        </button>
        <button class="share-btn share-btn-facebook" type="button" data-share-target="facebook" data-image-id="${safeImageId}" aria-label="Share on Facebook">
          <i class="fa-brands fa-facebook-f" aria-hidden="true"></i>
          <span class="sr-only">Share on Facebook</span>
        </button>
        <button class="share-btn share-btn-whatsapp" type="button" data-share-target="whatsapp" data-image-id="${safeImageId}" aria-label="Share on WhatsApp">
          <i class="fa-brands fa-whatsapp" aria-hidden="true"></i>
          <span class="sr-only">Share on WhatsApp</span>
        </button>
      </div>
    `;
  };

  const getImageCard = (form) => form.closest(".image-card");

  const getErrorElement = (form) => {
    const next = form.nextElementSibling;
    return next && next.classList.contains("form-error") ? next : null;
  };

  const clearError = (form) => {
    const errorElement = getErrorElement(form);
    if (!errorElement) {
      return;
    }

    errorElement.textContent = "";
    errorElement.hidden = true;
  };

  const showError = (form, message) => {
    const errorElement = getErrorElement(form);
    if (!errorElement) {
      return;
    }

    errorElement.textContent = message || "Request failed";
    errorElement.hidden = false;
  };

  const getCommentsErrorElement = (imageCard) => {
    const commentsBlock = imageCard?.querySelector(".comments-block");
    if (!commentsBlock) {
      return null;
    }

    let errorElement = commentsBlock.querySelector(".comments-error");
    if (!errorElement) {
      errorElement = document.createElement("p");
      errorElement.className = "form-error comments-error";
      errorElement.hidden = true;
      errorElement.setAttribute("aria-live", "polite");
      commentsBlock.appendChild(errorElement);
    }

    return errorElement;
  };

  const parseErrorPayload = async (response) => {
    const raw = await response
      .clone()
      .text()
      .catch(() => "");

    try {
      const payload = JSON.parse(raw);
      if (payload && typeof payload === "object") {
        const message =
          typeof payload.error === "string" && payload.error.trim()
            ? payload.error
            : "Request failed";
        const redirectTo =
          typeof payload.redirectTo === "string" && payload.redirectTo.trim()
            ? payload.redirectTo
            : "";

        return { message, redirectTo };
      }
    } catch (_error) {
      // Ignore JSON parsing failures and use text fallback.
    }

    const cleanedMessage = String(raw || "").trim();
    if (!cleanedMessage || cleanedMessage.startsWith("<")) {
      return { message: "Request failed", redirectTo: "" };
    }

    return { message: cleanedMessage, redirectTo: "" };
  };

  const parseErrorMessage = async (response) => {
    const payload = await parseErrorPayload(response);
    return payload.message;
  };

  const getRedirectPathFromResponse = (response) => {
    if (!response?.redirected || !response.url) {
      return "";
    }

    try {
      const redirectedUrl = new URL(response.url, window.location.href);
      if (redirectedUrl.origin !== window.location.origin) {
        return "";
      }

      return `${redirectedUrl.pathname}${redirectedUrl.search}`;
    } catch (_error) {
      return "";
    }
  };

  const responseHasJson = (response) => {
    const contentType = String(response.headers.get("content-type") || "");
    return contentType.toLowerCase().includes("application/json");
  };

  const clearScrollError = () => {
    if (!scrollErrorElement) {
      return;
    }

    scrollErrorElement.textContent = "";
    scrollErrorElement.hidden = true;
  };

  const showScrollError = (message) => {
    if (!scrollErrorElement) {
      scrollErrorElement = document.createElement("p");
      scrollErrorElement.className = "form-error";
      scrollErrorElement.hidden = true;
      scrollErrorElement.setAttribute("aria-live", "polite");

      if (scrollSentinel?.parentNode) {
        scrollSentinel.parentNode.insertBefore(
          scrollErrorElement,
          scrollSentinel.nextSibling,
        );
      }
    }

    scrollErrorElement.textContent = message || "Unable to load more images";
    scrollErrorElement.hidden = false;
  };

  const renderCommentItems = (comments) => {
    if (!Array.isArray(comments) || comments.length === 0) {
      return '<li class="comment-empty">No comments yet.</li>';
    }

    return comments
      .map(
        (comment) => `
          <li class="comment-item">
            <span class="comment-author">${escapeHtml(comment.author_username)}</span>
            <span class="comment-content">${escapeHtml(comment.content)}</span>
          </li>
        `,
      )
      .join("");
  };

  const renderPreviewComments = (comments) => {
    const list = Array.isArray(comments) ? comments.slice(-2) : [];
    return renderCommentItems(list);
  };

  const renderCommentFormMarkup = (imageId, page) => {
    if (!canInteract) {
      return '<p class="interaction-hint"><a href="/login">Log in</a> to comment.</p>';
    }

    return `
      <form class="comment-form inline-comment-form" method="POST" action="/gallery/${imageId}/comment" data-image-id="${imageId}">
        <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}">
        <input type="hidden" name="page" value="${page}">
        <input class="input" type="text" name="content" maxlength="${maxCommentLength}" placeholder="Add a comment..." required>
        <button class="post-comment-btn" type="submit">Post</button>
      </form>
      <p class="form-error" hidden aria-live="polite"></p>
    `;
  };

  const createViewAllButton = (imageId, totalComments) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "view-all-comments";
    button.dataset.imageId = String(imageId);
    button.dataset.totalComments = String(totalComments);
    button.textContent = `View all ${totalComments} comments`;
    return button;
  };

  const updateLikeCountUi = (imageCard, likeCount) => {
    imageCard
      ?.querySelectorAll(".like-count, .likes-line-count")
      .forEach((node) => {
        node.textContent = String(likeCount);
      });
  };

  const updateCommentCountUi = (imageCard, commentCount) => {
    imageCard?.querySelectorAll(".comment-count").forEach((node) => {
      node.textContent = String(commentCount);
    });

    const viewAllButton = imageCard?.querySelector(".view-all-comments");
    if (viewAllButton) {
      viewAllButton.dataset.totalComments = String(commentCount);
      viewAllButton.textContent = `View all ${commentCount} comments`;
    }
  };

  const buildImageCard = (image, page) => {
    const imageId = Number.parseInt(image.id, 10);
    const safeImageId = Number.isInteger(imageId) ? imageId : 0;
    const filename = String(image.filename || "");
    const likeCount = Number(image.like_count) || 0;
    const commentCount = Number(image.comment_count) || 0;
    const authorUsername = String(image.author_username || "User");

    const commentsMarkup = renderPreviewComments(image.comments);
    const avatarInitial = getAvatarInitial(authorUsername);
    const avatarColor = getAvatarColor(authorUsername);
    const postDate = formatPostDate(image.created_at);
    const postDateIso = toIsoDate(image.created_at);

    return `
      <article class="image-card" id="image-${safeImageId}" data-image-id="${safeImageId}">
        <header class="post-header">
          <span class="author-avatar" style="background:${escapeHtml(avatarColor)}">${escapeHtml(avatarInitial)}</span>
          <div class="post-author-meta">
            <span class="post-username">${escapeHtml(authorUsername)}</span>
            <time class="post-date" datetime="${escapeHtml(postDateIso)}">${escapeHtml(postDate)}</time>
          </div>
        </header>

        <div class="post-media">
          <a class="post-image-link" href="/gallery/${safeImageId}?page=${page}" aria-label="Open photo details">
            <img class="post-image" src="/public/uploads/${encodeURIComponent(filename)}" alt="${escapeHtml(filename)}">
          </a>
        </div>

        <div class="post-body">
          <div class="action-bar">
            <div class="action-left">
              <form class="like-form" method="POST" action="/gallery/${safeImageId}/like" data-image-id="${safeImageId}">
                <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}">
                <input type="hidden" name="page" value="${page}">
                <button class="icon-btn like-toggle ${image.viewer_liked ? "liked" : ""}" type="submit" aria-label="${image.viewer_liked ? "Unlike" : "Like"}">${renderHeartIcon(Boolean(image.viewer_liked))}</button>
              </form>
              <p class="form-error" hidden aria-live="polite"></p>
              <span class="action-count like-count">${likeCount}</span>
              <button class="icon-btn comment-jump" type="button" data-image-id="${safeImageId}" aria-label="Open comments">${renderCommentIcon()}</button>
              <span class="action-count comment-count">${commentCount}</span>
            </div>
            <div class="action-right">${renderShareButtonsMarkup(safeImageId)}</div>
          </div>


          <div class="comments-block">
            <ul class="comments" data-expanded="false">${commentsMarkup}</ul>
            ${commentCount > 2 ? `<button class="view-all-comments" type="button" data-image-id="${safeImageId}" data-total-comments="${commentCount}">View all ${commentCount} comments</button>` : ""}
          </div>

          ${renderCommentFormMarkup(safeImageId, page)}
        </div>
      </article>
    `;
  };

  const stopInfiniteScroll = () => {
    hasMore = false;

    if (scrollObserver) {
      scrollObserver.disconnect();
    }

    if (scrollSentinel) {
      scrollSentinel.remove();
    }
  };

  const fetchNextPage = async () => {
    if (!hasMore || isLoading) {
      return;
    }

    const nextPage = currentPage + 1;
    isLoading = true;
    clearScrollError();

    try {
      const response = await fetch(`/gallery?page=${nextPage}`, {
        method: "GET",
        headers: {
          "x-requested-with": "XMLHttpRequest",
          accept: "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(await parseErrorMessage(response));
      }

      const payload = await response.json();
      const images = Array.isArray(payload.images) ? payload.images : [];

      const pageFromPayload = Number.parseInt(payload.currentPage, 10);
      currentPage = Number.isInteger(pageFromPayload)
        ? pageFromPayload
        : nextPage;

      const totalPagesFromPayload = Number.parseInt(payload.totalPages, 10);
      if (
        Number.isInteger(totalPagesFromPayload) &&
        totalPagesFromPayload > 0
      ) {
        totalPages = totalPagesFromPayload;
      }

      images.forEach((image) => {
        galleryGrid.insertAdjacentHTML(
          "beforeend",
          buildImageCard(image, currentPage),
        );
      });

      galleryGrid.dataset.currentPage = String(currentPage);
      galleryGrid.dataset.totalPages = String(totalPages);

      hasMore =
        typeof payload.hasMore === "boolean"
          ? payload.hasMore
          : currentPage < totalPages;

      if (!hasMore) {
        stopInfiniteScroll();
      }
    } catch (error) {
      showScrollError(error.message || "Unable to load more images");
    } finally {
      isLoading = false;
    }
  };

  const postForm = async (form) => {
    const formData = new FormData(form);
    const encodedBody = new URLSearchParams();
    formData.forEach((value, key) => {
      encodedBody.append(key, String(value));
    });

    const response = await fetch(form.action, {
      method: "POST",
      body: encodedBody,
      headers: {
        "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
        "x-csrf-token": csrfToken,
        "x-requested-with": "XMLHttpRequest",
        accept: "application/json",
      },
    });

    const redirectedPath = getRedirectPathFromResponse(response);
    if (redirectedPath) {
      const err = new Error("Please log in to continue");
      err.redirectTo = redirectedPath;
      throw err;
    }

    if (!response.ok) {
      const errorPayload = await parseErrorPayload(response);
      const err = new Error(errorPayload.message);
      err.redirectTo = errorPayload.redirectTo;
      throw err;
    }

    if (!responseHasJson(response)) {
      throw new Error("Unexpected server response");
    }

    return response.json();
  };

  const fetchAllComments = async (imageId) => {
    const response = await fetch(
      `/gallery/${encodeURIComponent(imageId)}/comments`,
      {
        method: "GET",
        headers: {
          "x-requested-with": "XMLHttpRequest",
          accept: "application/json",
        },
      },
    );

    if (!response.ok) {
      throw new Error(await parseErrorMessage(response));
    }

    const payload = await response.json();
    return Array.isArray(payload) ? payload : [];
  };

  const updateLikeUi = (form, payload) => {
    const imageCard = getImageCard(form);
    const button = form.querySelector(".like-toggle");

    if (button) {
      const isLiked = Boolean(payload.liked);
      button.classList.toggle("liked", isLiked);
      button.setAttribute("aria-label", isLiked ? "Unlike" : "Like");
      button.innerHTML = renderHeartIcon(isLiked);
      button.classList.remove("liked-pulse");
      void button.offsetWidth;
      button.classList.add("liked-pulse");
      window.setTimeout(() => button.classList.remove("liked-pulse"), 220);
    }

    if (imageCard && Number.isFinite(payload.likeCount)) {
      updateLikeCountUi(imageCard, payload.likeCount);
    }
  };

  const appendCommentUi = (form, payload) => {
    const imageCard = getImageCard(form);
    const commentsList = imageCard?.querySelector(".comments");
    if (!commentsList || !payload?.comment) {
      return;
    }

    const emptyItem = commentsList.querySelector(".comment-empty");
    if (emptyItem) {
      emptyItem.remove();
    }

    const item = document.createElement("li");
    item.className = "comment-item";

    const author = document.createElement("span");
    author.className = "comment-author";
    author.textContent = payload.comment.author_username || "You";

    const content = document.createElement("span");
    content.className = "comment-content";
    content.textContent = payload.comment.content || "";

    item.appendChild(author);
    item.appendChild(content);
    commentsList.appendChild(item);

    const input = form.querySelector('input[name="content"]');
    if (input) {
      input.value = "";
    }

    const currentCount = Number.parseInt(
      imageCard?.querySelector(".comment-count")?.textContent || "0",
      10,
    );
    const nextCount = Number.isInteger(currentCount) ? currentCount + 1 : 1;
    updateCommentCountUi(imageCard, nextCount);

    const isExpanded = commentsList.dataset.expanded === "true";
    if (!isExpanded) {
      while (commentsList.children.length > 2) {
        commentsList.firstElementChild?.remove();
      }

      let viewAllButton = imageCard.querySelector(".view-all-comments");
      if (nextCount > 2 && !viewAllButton) {
        viewAllButton = createViewAllButton(
          imageCard.dataset.imageId,
          nextCount,
        );
        commentsList.insertAdjacentElement("afterend", viewAllButton);
      }
    }
  };

  const expandComments = async (button) => {
    const imageId = button?.dataset.imageId;
    if (!button || !imageId) {
      return;
    }

    const imageCard = button.closest(".image-card");
    const commentsList = imageCard?.querySelector(".comments");
    if (!commentsList) {
      return;
    }

    const commentsError = getCommentsErrorElement(imageCard);
    if (commentsError) {
      commentsError.textContent = "";
      commentsError.hidden = true;
    }

    button.disabled = true;

    try {
      const comments = await fetchAllComments(imageId);
      commentsList.innerHTML = renderCommentItems(comments);
      commentsList.dataset.expanded = "true";
      updateCommentCountUi(imageCard, comments.length);
      button.remove();
    } catch (error) {
      if (commentsError) {
        commentsError.textContent = error.message || "Unable to load comments";
        commentsError.hidden = false;
      }
      button.disabled = false;
    }
  };

  document.addEventListener("submit", async (event) => {
    const likeForm = event.target.closest(".like-form");
    const commentForm = event.target.closest(".comment-form");

    if (!likeForm && !commentForm) {
      return;
    }

    const form = likeForm || commentForm;
    event.preventDefault();

    clearError(form);
    const submitButton = form.querySelector('button[type="submit"]');
    if (submitButton) {
      submitButton.disabled = true;
    }

    try {
      const payload = await postForm(form);

      if (likeForm) {
        updateLikeUi(form, payload);
      }

      if (commentForm) {
        appendCommentUi(form, payload);
      }
    } catch (error) {
      if (error && typeof error.redirectTo === "string" && error.redirectTo) {
        window.location.assign(error.redirectTo);
        return;
      }

      showError(form, error.message || "Request failed");
    } finally {
      if (submitButton) {
        submitButton.disabled = false;
      }
    }
  });

  document.addEventListener("click", (event) => {
    const viewAllButton = event.target.closest(".view-all-comments");
    if (viewAllButton) {
      void expandComments(viewAllButton);
      return;
    }

    const commentJumpButton = event.target.closest(".comment-jump");
    if (commentJumpButton) {
      const imageCard = commentJumpButton.closest(".image-card");
      const input = imageCard?.querySelector(
        '.comment-form input[name="content"]',
      );
      if (input) {
        input.focus();
      } else {
        imageCard?.querySelector(".comments")?.scrollIntoView({
          behavior: "smooth",
          block: "nearest",
        });
      }
      return;
    }

    const shareButton = event.target.closest(".share-btn");
    if (!shareButton) {
      return;
    }

    const imageId = shareButton.dataset.imageId;
    const target = shareButton.dataset.shareTarget;

    if (!imageId || !target) {
      return;
    }

    const shareUrl = getShareDialogUrl({ imageId, target });
    if (!shareUrl) {
      return;
    }

    window.open(shareUrl, "_blank", "noopener");
  });

  if (scrollSentinel && hasMore && "IntersectionObserver" in window) {
    scrollObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            void fetchNextPage();
          }
        });
      },
      {
        root: null,
        rootMargin: "250px 0px",
        threshold: 0,
      },
    );

    scrollObserver.observe(scrollSentinel);
  } else if (scrollSentinel && !hasMore) {
    stopInfiniteScroll();
  }
})();
