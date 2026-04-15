(() => {
  const camera = document.getElementById("camera");
  const fallbackUpload = document.getElementById("fallbackUpload");
  const fileInput = document.getElementById("fileInput");
  const captureButton = document.getElementById("captureButton");
  const captureCanvas = document.getElementById("captureCanvas");
  const overlayList = document.getElementById("overlayList");
  const userImages = document.getElementById("userImages");
  const statusMessage = document.getElementById("statusMessage");
  const csrfToken =
    document.querySelector('meta[name="csrf-token"]')?.content || "";

  let selectedOverlayId = null;
  let mediaStream = null;

  const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;

  const setStatus = (message, isError = false) => {
    statusMessage.textContent = message;
    statusMessage.classList.toggle("error", isError);
  };

  const updateCaptureButtonState = () => {
    captureButton.disabled = !selectedOverlayId;
  };

  const showFallback = (message) => {
    camera.hidden = true;
    fallbackUpload.hidden = false;
    setStatus(message || "Webcam unavailable. Upload an image to continue.");
  };

  const stopWebcam = () => {
    if (!mediaStream) return;
    mediaStream.getTracks().forEach((track) => track.stop());
    mediaStream = null;
  };

  const startWebcam = async () => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      showFallback("Browser does not support webcam access.");
      return;
    }

    try {
      mediaStream = await navigator.mediaDevices.getUserMedia({ video: true });
      camera.srcObject = mediaStream;
      camera.hidden = false;
      fallbackUpload.hidden = true;
      await camera.play();
      setStatus("Webcam ready. Pick an overlay and capture.");
    } catch (_error) {
      showFallback("Unable to access webcam. Upload an image instead.");
    }
  };

  const blobFromCanvas = () =>
    new Promise((resolve, reject) => {
      captureCanvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error("Failed to capture image"));
            return;
          }
          resolve(blob);
        },
        "image/jpeg",
        0.92,
      );
    });

  const getSourceBlob = async () => {
    const webcamReady =
      mediaStream &&
      !camera.hidden &&
      camera.videoWidth > 0 &&
      camera.videoHeight > 0;

    if (webcamReady) {
      captureCanvas.width = camera.videoWidth;
      captureCanvas.height = camera.videoHeight;
      const context = captureCanvas.getContext("2d");
      context.drawImage(
        camera,
        0,
        0,
        captureCanvas.width,
        captureCanvas.height,
      );
      return blobFromCanvas();
    }

    const file = fileInput?.files?.[0];
    if (!file) {
      throw new Error("Select an image file first");
    }

    if (!["image/jpeg", "image/png"].includes(file.type)) {
      throw new Error("Only JPEG and PNG files are allowed");
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      throw new Error("Image size must be 5MB or less");
    }

    return file;
  };

  const removeEmptyStateIfNeeded = () => {
    const emptyState = userImages.querySelector(".empty-state");
    if (emptyState) {
      emptyState.remove();
    }
  };

  const ensureEmptyStateIfNeeded = () => {
    if (userImages.querySelector(".user-image-card")) {
      return;
    }

    if (userImages.querySelector(".empty-state")) {
      return;
    }

    const emptyState = document.createElement("p");
    emptyState.className = "empty-state";
    emptyState.textContent = "No images yet.";
    userImages.appendChild(emptyState);
  };

  const prependUserImage = ({ imageId, filename }) => {
    removeEmptyStateIfNeeded();

    const card = document.createElement("article");
    card.className = "user-image-card";
    card.dataset.imageId = String(imageId || "");

    const image = document.createElement("img");
    image.src = `/public/uploads/${encodeURIComponent(filename)}`;
    image.alt = filename;

    const meta = document.createElement("div");
    meta.className = "user-image-meta";

    const createdAt = document.createElement("span");
    createdAt.textContent = new Date().toLocaleString();

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "delete-image-btn";
    deleteButton.dataset.imageId = String(imageId || "");
    deleteButton.textContent = "Delete";

    meta.appendChild(createdAt);
    meta.appendChild(deleteButton);
    card.appendChild(image);
    card.appendChild(meta);

    userImages.prepend(card);
  };

  overlayList.addEventListener("click", (event) => {
    const target = event.target.closest(".overlay-item");
    if (!target) {
      return;
    }

    const items = overlayList.querySelectorAll(".overlay-item");
    items.forEach((item) => {
      const isSelected = item === target;
      item.classList.toggle("selected", isSelected);
      item.setAttribute("aria-pressed", isSelected ? "true" : "false");
    });

    selectedOverlayId = target.dataset.overlayId;
    updateCaptureButtonState();
    setStatus("Overlay selected. Ready to capture.");
  });

  captureButton.addEventListener("click", async () => {
    if (!selectedOverlayId) {
      setStatus("Select an overlay first", true);
      return;
    }

    captureButton.disabled = true;

    try {
      const sourceBlob = await getSourceBlob();
      const formData = new FormData();
      formData.append("image", sourceBlob, "capture.jpg");
      formData.append("overlayId", selectedOverlayId);
      formData.append("_csrf", csrfToken);

      const response = await fetch("/edit/capture", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || "Capture failed");
      }

      const data = await response.json();
      if (!data.success || !data.filename) {
        throw new Error("Unexpected server response");
      }

      prependUserImage({ imageId: data.imageId, filename: data.filename });
      setStatus("Image saved.");

      if (fileInput) {
        fileInput.value = "";
      }
    } catch (error) {
      setStatus(error.message || "Capture failed", true);
    } finally {
      updateCaptureButtonState();
    }
  });

  userImages.addEventListener("click", async (event) => {
    const button = event.target.closest(".delete-image-btn");
    if (!button) {
      return;
    }

    const imageId = button.dataset.imageId;
    if (!imageId) {
      setStatus("Cannot delete this image", true);
      return;
    }

    button.disabled = true;

    try {
      const response = await fetch(`/edit/${encodeURIComponent(imageId)}`, {
        method: "DELETE",
        headers: {
          "x-csrf-token": csrfToken,
        },
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || "Delete failed");
      }

      const payload = await response.json();
      if (!payload.success) {
        throw new Error("Delete failed");
      }

      const card = button.closest(".user-image-card");
      if (card) {
        card.remove();
      }
      ensureEmptyStateIfNeeded();
      setStatus("Image deleted.");
    } catch (error) {
      setStatus(error.message || "Delete failed", true);
      button.disabled = false;
    }
  });

  window.addEventListener("beforeunload", stopWebcam);

  updateCaptureButtonState();
  startWebcam();
})();
