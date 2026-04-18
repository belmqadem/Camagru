(() => {
  const pageRoot = document.getElementById("imageDetailPage");
  if (!pageRoot) {
    return;
  }

  const csrfToken =
    document.querySelector('meta[name="csrf-token"]')?.content || "";
  const appUrlMeta = document.querySelector('meta[name="app-url"]')?.content;

  const imageId = pageRoot.dataset.imageId || "";
  const canInteract = pageRoot.dataset.canInteract === "true";

  const likeForm = document.getElementById("detailLikeForm");
  const likeCountNode = document.getElementById("detailLikeCount");
  const likeError = document.getElementById("detailLikeError");
  const commentJumpButton = document.getElementById("detailCommentJump");

  const commentsList = document.getElementById("detailCommentsList");
  const commentsCountNode = document.getElementById("detailCommentCount");
  const commentsTitleCountNode = document.getElementById(
    "detailCommentsTitleCount",
  );

  const commentForm = document.getElementById("detailCommentForm");
  const commentError = document.getElementById("detailCommentError");

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

  const formatRelativeTime = (value) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return "just now";
    }

    const elapsedSeconds = Math.max(
      0,
      Math.floor((Date.now() - date.getTime()) / 1000),
    );

    if (elapsedSeconds < 10) {
      return "just now";
    }

    if (elapsedSeconds < 60) {
      return `${elapsedSeconds} seconds ago`;
    }

    const elapsedMinutes = Math.floor(elapsedSeconds / 60);
    if (elapsedMinutes < 60) {
      return elapsedMinutes === 1
        ? "1 minute ago"
        : `${elapsedMinutes} minutes ago`;
    }

    const elapsedHours = Math.floor(elapsedMinutes / 60);
    if (elapsedHours < 24) {
      return elapsedHours === 1 ? "1 hour ago" : `${elapsedHours} hours ago`;
    }

    const elapsedDays = Math.floor(elapsedHours / 24);
    return elapsedDays === 1 ? "1 day ago" : `${elapsedDays} days ago`;
  };

  const refreshRelativeTimes = () => {
    document.querySelectorAll("[data-relative-time]").forEach((node) => {
      const value = node.getAttribute("data-relative-time") || "";
      node.textContent = formatRelativeTime(value);
    });
  };

  const getCanonicalImageUrl = () =>
    `${normalizedAppUrl}/gallery/${encodeURIComponent(String(imageId))}`;

  const getShareDialogUrl = (target) => {
    const encodedText = encodeURIComponent(shareText);
    const encodedUrl = encodeURIComponent(getCanonicalImageUrl());

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

  const setCountText = (node, value) => {
    if (node) {
      node.textContent = String(value);
    }
  };

  const updateCommentCount = (nextCount) => {
    setCountText(commentsCountNode, nextCount);
    setCountText(commentsTitleCountNode, nextCount);
  };

  const clearError = (node) => {
    if (!node) {
      return;
    }

    node.textContent = "";
    node.hidden = true;
  };

  const showError = (node, message) => {
    if (!node) {
      return;
    }

    node.textContent = message || "Request failed";
    node.hidden = false;
  };

  const appendComment = (comment) => {
    if (!commentsList || !comment) {
      return;
    }

    const emptyState = commentsList.querySelector(".detail-comments-empty");
    if (emptyState) {
      emptyState.remove();
    }

    const authorUsername = String(comment.author_username || "You");
    const avatarInitial = getAvatarInitial(authorUsername);
    const createdAt = comment.created_at || new Date().toISOString();

    const item = document.createElement("li");
    item.className = "detail-comment-item";

    const avatar = document.createElement("span");
    avatar.className = "detail-comment-avatar";
    avatar.textContent = avatarInitial;

    const contentWrap = document.createElement("div");
    contentWrap.className = "detail-comment-content";

    const text = document.createElement("p");
    text.className = "detail-comment-text";

    const author = document.createElement("span");
    author.className = "detail-comment-author";
    author.textContent = authorUsername;

    const body = document.createElement("span");
    body.textContent = comment.content || "";

    text.append(author, body);

    const time = document.createElement("time");
    time.className = "detail-comment-time";
    time.dateTime = createdAt;
    time.setAttribute("data-relative-time", createdAt);
    time.textContent = formatRelativeTime(createdAt);

    contentWrap.append(text, time);
    item.append(avatar, contentWrap);
    commentsList.appendChild(item);

    const currentCount = Number.parseInt(
      commentsCountNode?.textContent || "0",
      10,
    );
    const nextCount = Number.isInteger(currentCount) ? currentCount + 1 : 1;
    updateCommentCount(nextCount);

    commentsList.scrollTop = commentsList.scrollHeight;
  };

  if (likeForm) {
    likeForm.addEventListener("submit", async (event) => {
      event.preventDefault();

      const submitButton = likeForm.querySelector('button[type="submit"]');
      if (submitButton) {
        submitButton.disabled = true;
      }

      clearError(likeError);

      try {
        const payload = await postForm(likeForm);
        const isLiked = Boolean(payload?.liked);

        if (submitButton) {
          submitButton.classList.toggle("liked", isLiked);
          submitButton.setAttribute("aria-label", isLiked ? "Unlike" : "Like");
          submitButton.innerHTML = renderHeartIcon(isLiked);
        }

        if (Number.isFinite(payload?.likeCount)) {
          setCountText(likeCountNode, payload.likeCount);
        }
      } catch (error) {
        if (error && typeof error.redirectTo === "string" && error.redirectTo) {
          window.location.assign(error.redirectTo);
          return;
        }

        showError(likeError, error.message || "Unable to update like");
      } finally {
        if (submitButton) {
          submitButton.disabled = false;
        }
      }
    });
  }

  if (canInteract && commentForm) {
    commentForm.addEventListener("submit", async (event) => {
      event.preventDefault();

      const submitButton = commentForm.querySelector('button[type="submit"]');
      if (submitButton) {
        submitButton.disabled = true;
      }

      clearError(commentError);

      try {
        const payload = await postForm(commentForm);
        appendComment(payload?.comment);

        const input = commentForm.querySelector('input[name="content"]');
        if (input) {
          input.value = "";
          input.focus();
        }
      } catch (error) {
        if (error && typeof error.redirectTo === "string" && error.redirectTo) {
          window.location.assign(error.redirectTo);
          return;
        }

        showError(commentError, error.message || "Unable to post comment");
      } finally {
        if (submitButton) {
          submitButton.disabled = false;
        }
      }
    });
  }

  if (commentJumpButton) {
    commentJumpButton.addEventListener("click", () => {
      const input = commentForm?.querySelector('input[name="content"]');
      if (input) {
        input.focus();
        return;
      }

      commentsList?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  document.addEventListener("click", (event) => {
    const shareButton = event.target.closest(".share-btn");
    if (!shareButton) {
      return;
    }

    const target = shareButton.dataset.shareTarget;
    if (!target) {
      return;
    }

    const shareUrl = getShareDialogUrl(target);
    if (!shareUrl) {
      return;
    }

    window.open(shareUrl, "_blank", "noopener");
  });

  refreshRelativeTimes();
  window.setInterval(refreshRelativeTimes, 60000);
})();
