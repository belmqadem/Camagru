(() => {
  const camera = document.getElementById("camera");
  const uploadedPhotoPreview = document.getElementById("uploadedPhotoPreview");
  const fallbackUpload = document.getElementById("fallbackUpload");
  const fileInput = document.getElementById("fileInput");
  const captureButton = document.getElementById("captureButton");
  const captureCanvas = document.getElementById("captureCanvas");
  const overlayList = document.getElementById("overlayList");
  const userImages = document.getElementById("userImages");
  const statusMessage = document.getElementById("statusMessage");
  const liveOverlayPreview = document.getElementById("liveOverlayPreview");
  const overlayTransformControls = document.getElementById(
    "overlayTransformControls",
  );
  const overlayScale = document.getElementById("overlayScale");
  const overlayScaleValue = document.getElementById("overlayScaleValue");
  const overlayResetButton = document.getElementById("overlayResetButton");
  const csrfToken =
    document.querySelector('meta[name="csrf-token"]')?.content || "";

  let selectedOverlayId = null;
  let mediaStream = null;
  let overlayTransform = null;
  let dragState = null;
  let uploadedPreviewObjectUrl = null;

  const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;
  const MIN_SCALE = 0.2;
  const MAX_SCALE = 2;

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  const clearUploadedPreview = () => {
    if (uploadedPreviewObjectUrl) {
      URL.revokeObjectURL(uploadedPreviewObjectUrl);
      uploadedPreviewObjectUrl = null;
    }

    if (uploadedPhotoPreview) {
      uploadedPhotoPreview.src = "";
      uploadedPhotoPreview.hidden = true;
    }
  };

  const isFilePreviewReady = () =>
    Boolean(
      uploadedPhotoPreview &&
      !uploadedPhotoPreview.hidden &&
      uploadedPhotoPreview.naturalWidth > 0 &&
      uploadedPhotoPreview.naturalHeight > 0,
    );

  const isPreviewSurfaceReady = () => isWebcamReady() || isFilePreviewReady();

  const getActivePreviewSurface = () => {
    if (isFilePreviewReady()) {
      return uploadedPhotoPreview;
    }

    if (isWebcamReady()) {
      return camera;
    }

    return null;
  };

  const getPreviewDimensions = () => {
    const surface = getActivePreviewSurface();
    if (!surface) {
      return { width: 0, height: 0 };
    }

    const rect = surface.getBoundingClientRect();
    const width = surface.clientWidth || rect.width || 0;
    const height = surface.clientHeight || rect.height || 0;
    return { width, height };
  };

  const getPlacementForCapture = () => {
    if (!selectedOverlayId) {
      return null;
    }

    return getCurrentPlacement();
  };

  const isWebcamReady = () =>
    Boolean(
      mediaStream &&
      !camera.hidden &&
      camera.videoWidth > 0 &&
      camera.videoHeight > 0,
    );

  const updateScaleLabel = () => {
    if (!overlayScaleValue || !overlayScale) return;
    overlayScaleValue.textContent = `${Math.round(Number(overlayScale.value) * 100)}%`;
  };

  const getMaxScale = () => {
    if (!overlayTransform) return MAX_SCALE;
    const { baseWidthRatio, baseHeightRatio } = overlayTransform;
    return Math.max(
      MIN_SCALE,
      Math.min(MAX_SCALE, 1 / baseWidthRatio, 1 / baseHeightRatio),
    );
  };

  const getCurrentPlacement = () => {
    if (!overlayTransform) return null;

    const maxScale = getMaxScale();
    const effectiveScale = clamp(overlayTransform.scale, MIN_SCALE, maxScale);
    const widthRatio = overlayTransform.baseWidthRatio * effectiveScale;
    const heightRatio = overlayTransform.baseHeightRatio * effectiveScale;
    const maxX = Math.max(0, 1 - widthRatio);
    const maxY = Math.max(0, 1 - heightRatio);

    return {
      scale: effectiveScale,
      widthRatio,
      heightRatio,
      xRatio: clamp(overlayTransform.xRatio, 0, maxX),
      yRatio: clamp(overlayTransform.yRatio, 0, maxY),
    };
  };

  const renderLiveOverlay = () => {
    if (!liveOverlayPreview) return;

    const placement = getCurrentPlacement();
    if (!selectedOverlayId || !isPreviewSurfaceReady() || !placement) {
      liveOverlayPreview.classList.remove("visible");
      overlayTransformControls.hidden = true;
      return;
    }

    const { width, height } = getPreviewDimensions();
    if (!width || !height) {
      liveOverlayPreview.classList.remove("visible");
      overlayTransformControls.hidden = true;
      return;
    }

    overlayTransform.scale = placement.scale;
    overlayTransform.xRatio = placement.xRatio;
    overlayTransform.yRatio = placement.yRatio;

    liveOverlayPreview.style.left = `${placement.xRatio * width}px`;
    liveOverlayPreview.style.top = `${placement.yRatio * height}px`;
    liveOverlayPreview.style.width = `${placement.widthRatio * width}px`;
    liveOverlayPreview.style.height = `${placement.heightRatio * height}px`;
    liveOverlayPreview.classList.add("visible");

    overlayTransformControls.hidden = false;
    overlayScale.max = String(getMaxScale());
    overlayScale.value = String(overlayTransform.scale);
    updateScaleLabel();
    updateCaptureButtonState();
  };

  const applyScale = (nextScale) => {
    if (!overlayTransform) return;

    const current = getCurrentPlacement();
    if (!current) return;

    const centerX = current.xRatio + current.widthRatio / 2;
    const centerY = current.yRatio + current.heightRatio / 2;

    overlayTransform.scale = clamp(nextScale, MIN_SCALE, getMaxScale());
    const next = getCurrentPlacement();
    if (!next) return;

    overlayTransform.xRatio = clamp(
      centerX - next.widthRatio / 2,
      0,
      Math.max(0, 1 - next.widthRatio),
    );
    overlayTransform.yRatio = clamp(
      centerY - next.heightRatio / 2,
      0,
      Math.max(0, 1 - next.heightRatio),
    );

    renderLiveOverlay();
  };

  const createDefaultTransform = () => {
    if (!liveOverlayPreview || !liveOverlayPreview.naturalWidth) {
      overlayTransform = null;
      renderLiveOverlay();
      return;
    }

    const { width, height } = getPreviewDimensions();
    if (!width || !height) {
      overlayTransform = null;
      renderLiveOverlay();
      return;
    }

    const aspect =
      liveOverlayPreview.naturalWidth / liveOverlayPreview.naturalHeight;
    let baseWidthRatio = 0.35;
    let baseHeightRatio = (baseWidthRatio * width) / (aspect * height);

    if (baseHeightRatio > 0.6) {
      baseHeightRatio = 0.6;
      baseWidthRatio = (baseHeightRatio * height * aspect) / width;
    }

    baseWidthRatio = clamp(baseWidthRatio, 0.08, 0.95);
    baseHeightRatio = clamp(baseHeightRatio, 0.08, 0.95);

    overlayTransform = {
      xRatio: (1 - baseWidthRatio) / 2,
      yRatio: (1 - baseHeightRatio) / 2,
      baseWidthRatio,
      baseHeightRatio,
      scale: 1,
    };

    renderLiveOverlay();
  };

  const setStatus = (message, isError = false) => {
    statusMessage.textContent = message;
    statusMessage.classList.toggle("error", isError);
  };

  const updateCaptureButtonState = () => {
    captureButton.disabled = !getPlacementForCapture();
  };

  const showFallback = (message) => {
    camera.hidden = true;
    fallbackUpload.hidden = false;
    overlayTransform = null;
    if (!isFilePreviewReady()) {
      clearUploadedPreview();
      if (liveOverlayPreview) {
        liveOverlayPreview.classList.remove("visible");
      }
      overlayTransformControls.hidden = true;
      updateCaptureButtonState();
    } else {
      renderLiveOverlay();
    }
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
      clearUploadedPreview();
      await camera.play();
      if (selectedOverlayId && liveOverlayPreview?.src) {
        createDefaultTransform();
      }
      renderLiveOverlay();
      updateCaptureButtonState();
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
    const webcamReady = isWebcamReady();

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

  const handleFileSelection = () => {
    const file = fileInput?.files?.[0];
    if (!file) {
      clearUploadedPreview();
      overlayTransform = null;
      renderLiveOverlay();
      updateCaptureButtonState();
      return;
    }

    if (!["image/jpeg", "image/png"].includes(file.type)) {
      setStatus("Only JPEG and PNG files are allowed", true);
      fileInput.value = "";
      clearUploadedPreview();
      overlayTransform = null;
      renderLiveOverlay();
      updateCaptureButtonState();
      return;
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      setStatus("Image size must be 5MB or less", true);
      fileInput.value = "";
      clearUploadedPreview();
      overlayTransform = null;
      renderLiveOverlay();
      updateCaptureButtonState();
      return;
    }

    clearUploadedPreview();
    uploadedPreviewObjectUrl = URL.createObjectURL(file);
    uploadedPhotoPreview.src = uploadedPreviewObjectUrl;
    uploadedPhotoPreview.hidden = false;

    camera.hidden = true;
    fallbackUpload.hidden = false;

    uploadedPhotoPreview.onload = () => {
      if (selectedOverlayId && liveOverlayPreview?.src) {
        createDefaultTransform();
      } else {
        renderLiveOverlay();
      }
      updateCaptureButtonState();
      setStatus("Photo loaded. Position and resize overlay before capture.");
    };
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
    overlayTransform = null;
    updateCaptureButtonState();
    const selectedImage = target.querySelector("img");

    if (selectedImage?.src && liveOverlayPreview) {
      liveOverlayPreview.src = selectedImage.src;
      if (liveOverlayPreview.complete) {
        createDefaultTransform();
      } else {
        liveOverlayPreview.onload = () => {
          createDefaultTransform();
        };
      }
    }

    updateCaptureButtonState();
    setStatus("Overlay selected. Ready to capture.");
  });

  overlayScale.addEventListener("input", () => {
    applyScale(Number(overlayScale.value));
  });

  fileInput.addEventListener("change", handleFileSelection);

  overlayResetButton.addEventListener("click", () => {
    createDefaultTransform();
  });

  liveOverlayPreview.addEventListener("pointerdown", (event) => {
    if (!overlayTransform || !isPreviewSurfaceReady()) {
      return;
    }

    event.preventDefault();
    dragState = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startXRatio: overlayTransform.xRatio,
      startYRatio: overlayTransform.yRatio,
    };

    liveOverlayPreview.classList.add("dragging");
    if (liveOverlayPreview.setPointerCapture) {
      liveOverlayPreview.setPointerCapture(event.pointerId);
    }
  });

  liveOverlayPreview.addEventListener("pointermove", (event) => {
    if (
      !dragState ||
      event.pointerId !== dragState.pointerId ||
      !overlayTransform
    ) {
      return;
    }

    const { width, height } = getPreviewDimensions();
    if (!width || !height) {
      return;
    }

    const placement = getCurrentPlacement();
    if (!placement) {
      return;
    }

    const deltaXRatio = (event.clientX - dragState.startClientX) / width;
    const deltaYRatio = (event.clientY - dragState.startClientY) / height;

    overlayTransform.xRatio = clamp(
      dragState.startXRatio + deltaXRatio,
      0,
      Math.max(0, 1 - placement.widthRatio),
    );
    overlayTransform.yRatio = clamp(
      dragState.startYRatio + deltaYRatio,
      0,
      Math.max(0, 1 - placement.heightRatio),
    );

    renderLiveOverlay();
  });

  const stopDragging = (event) => {
    if (!dragState) {
      return;
    }

    if (
      event &&
      event.pointerId !== undefined &&
      event.pointerId !== dragState.pointerId
    ) {
      return;
    }

    if (
      event &&
      event.pointerId !== undefined &&
      liveOverlayPreview.releasePointerCapture
    ) {
      try {
        liveOverlayPreview.releasePointerCapture(event.pointerId);
      } catch (_error) {
        // Ignore release errors if capture already ended.
      }
    }

    dragState = null;
    liveOverlayPreview.classList.remove("dragging");
  };

  liveOverlayPreview.addEventListener("pointerup", stopDragging);
  liveOverlayPreview.addEventListener("pointercancel", stopDragging);
  liveOverlayPreview.addEventListener("lostpointercapture", stopDragging);

  captureButton.addEventListener("click", async () => {
    if (!selectedOverlayId) {
      setStatus("Select an overlay first", true);
      return;
    }

    const placement = getPlacementForCapture();
    if (!placement) {
      setStatus("Overlay is still loading. Try again in a moment.", true);
      updateCaptureButtonState();
      return;
    }

    captureButton.disabled = true;

    try {
      const sourceBlob = await getSourceBlob();
      const formData = new FormData();
      formData.append("image", sourceBlob, "capture.jpg");
      formData.append("overlayId", selectedOverlayId);
      formData.append("_csrf", csrfToken);

      formData.append("overlayXRatio", placement.xRatio.toFixed(6));
      formData.append("overlayYRatio", placement.yRatio.toFixed(6));
      formData.append("overlayWidthRatio", placement.widthRatio.toFixed(6));
      formData.append("overlayHeightRatio", placement.heightRatio.toFixed(6));

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

      if (fileInput && isWebcamReady()) {
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
  window.addEventListener("beforeunload", clearUploadedPreview);
  window.addEventListener("resize", renderLiveOverlay);

  updateCaptureButtonState();
  updateScaleLabel();
  startWebcam();
})();
