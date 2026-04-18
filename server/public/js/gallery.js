(() => {
  const csrfToken =
    document.querySelector('meta[name="csrf-token"]')?.content || "";

  const isAjaxEnabled = Boolean(
    document.querySelector(".like-form") ||
    document.querySelector(".comment-form"),
  );

  if (!isAjaxEnabled) {
    return;
  }

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
    try {
      const payload = await response.json();
      if (
        payload &&
        typeof payload.error === "string" &&
        payload.error.trim()
      ) {
        return payload.error;
      }
    } catch (_error) {
      // Ignore JSON parsing failures and use fallback text.
    }

    const text = await response.text().catch(() => "");
    return text || "Request failed";
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

    const commentCountElement = imageCard.querySelector(".comment-count");
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
})();
