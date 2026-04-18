(() => {
  const csrfToken =
    document.querySelector('meta[name="csrf-token"]')?.content || "";

  const galleryGrid = document.getElementById("galleryGrid");
  const scrollSentinel = document.getElementById("scroll-sentinel");

  if (!galleryGrid) {
    return;
  }

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
  const canInteract = galleryGrid.dataset.canInteract === "true";
  const maxCommentLength = 500;

  let scrollObserver = null;
  let scrollErrorElement = null;

  const escapeHtml = (value) =>
    String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;");

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

  const parseErrorMessage = async (response) => {
    const raw = await response
      .clone()
      .text()
      .catch(() => "");

    try {
      const payload = JSON.parse(raw);
      if (
        payload &&
        typeof payload.error === "string" &&
        payload.error.trim()
      ) {
        return payload.error;
      }
    } catch (_error) {
      // Ignore JSON parsing failures and use text fallback.
    }

    return raw || "Request failed";
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

  const renderCommentsMarkup = (comments) => {
    if (!Array.isArray(comments) || comments.length === 0) {
      return '<li class="comment-empty">No comments yet.</li>';
    }

    return comments
      .map(
        (comment) => `
          <li>
            <span class="comment-author">${escapeHtml(comment.author_username)}</span>
            <span class="comment-content">${escapeHtml(comment.content)}</span>
          </li>
        `,
      )
      .join("");
  };

  const renderInteractionMarkup = ({ imageId, viewerLiked, page }) => {
    if (!canInteract) {
      return '<p class="interaction-hint"><a href="/login">Log in</a> to interact.</p>';
    }

    return `
      <div class="interaction-row">
        <form class="like-form" method="POST" action="/gallery/${imageId}/like" data-image-id="${imageId}">
          <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}">
          <input type="hidden" name="page" value="${page}">
          <button class="btn" type="submit">${viewerLiked ? "Unlike" : "Like"}</button>
        </form>
        <p class="form-error" hidden aria-live="polite"></p>
        <form class="comment-form" method="POST" action="/gallery/${imageId}/comment" data-image-id="${imageId}">
          <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}">
          <input type="hidden" name="page" value="${page}">
          <input class="input" type="text" name="content" maxlength="${maxCommentLength}" placeholder="Add a comment" required>
          <button class="btn" type="submit">Comment</button>
        </form>
        <p class="form-error" hidden aria-live="polite"></p>
      </div>
    `;
  };

  const buildImageCardHtml = (image, page) => {
    const imageId = Number.parseInt(image.id, 10);
    const safeImageId = Number.isInteger(imageId) ? imageId : 0;
    const filename = String(image.filename || "");
    const likeCount = Number(image.like_count) || 0;
    const commentCount = Number(image.comment_count) || 0;

    const commentsMarkup = renderCommentsMarkup(image.comments);
    const interactionMarkup = renderInteractionMarkup({
      imageId: safeImageId,
      viewerLiked: Boolean(image.viewer_liked),
      page,
    });

    return `
      <article class="image-card" id="image-${safeImageId}" data-image-id="${safeImageId}">
        <details class="image-disclosure">
          <summary>
            <div class="card-preview">
              <img src="/public/uploads/${encodeURIComponent(filename)}" alt="${escapeHtml(filename)}">
              <div class="card-meta">
                <span class="card-author">${escapeHtml(image.author_username)}</span>
                <span class="meta-stats"><span class="like-count">${likeCount}</span> likes · <span class="comment-count">${commentCount}</span> comments</span>
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
          buildImageCardHtml(image, currentPage),
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

    if (!response.ok) {
      const message = await parseErrorMessage(response);
      throw new Error(message);
    }

    return response.json();
  };

  const updateLikeUi = (form, payload) => {
    const button = form.querySelector('button[type="submit"]');
    if (button) {
      button.textContent = payload.liked ? "Unlike" : "Like";
    }

    const imageCard = getImageCard(form);
    const likeCountElement = imageCard?.querySelector(".like-count");
    if (likeCountElement && Number.isFinite(payload.likeCount)) {
      likeCountElement.textContent = String(payload.likeCount);
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

    const commentCountElement = imageCard?.querySelector(".comment-count");
    if (commentCountElement) {
      const current = Number.parseInt(commentCountElement.textContent, 10);
      if (Number.isInteger(current)) {
        commentCountElement.textContent = String(current + 1);
      }
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
      showError(form, error.message || "Request failed");
    } finally {
      if (submitButton) {
        submitButton.disabled = false;
      }
    }
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
