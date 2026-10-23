// Galerias e ampliação: mantém os mesmos álbuns e as fotografias originais.
(() => {
  const lightbox = document.querySelector(".foto-ampliada");
  const lightboxImage = lightbox?.querySelector("img");
  const closePhotoButton = lightbox?.querySelector(".fechar-foto");
  if (!lightbox || !lightboxImage || !closePhotoButton) return;

  let activeOverlay = null;
  let galleryTrigger = null;
  let photoTrigger = null;
  let previousOverflow = "";

  const focusableSelector =
    'button:not([disabled]), a[href], input:not([disabled]), [tabindex]:not([tabindex="-1"])';

  function lockPage() {
    if (!activeOverlay && !lightbox.classList.contains("aberta")) {
      previousOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
    }
  }

  function restoreFocus(element) {
    if (element?.isConnected && typeof element.focus === "function") element.focus();
  }

  function loadGalleryPreviews(overlay) {
    overlay.querySelectorAll("img[data-src]").forEach((image) => {
      if (!image.hasAttribute("src")) image.src = image.dataset.src;
    });
  }

  function openGallery(trigger, overlay) {
    if (activeOverlay && activeOverlay !== overlay) closeGallery(false);
    galleryTrigger = trigger;
    lockPage();
    activeOverlay = overlay;
    overlay.classList.add("aberta");
    overlay.setAttribute("aria-hidden", "false");
    loadGalleryPreviews(overlay);
    const dialog = overlay.querySelector('[role="dialog"]');
    dialog?.setAttribute("tabindex", "-1");
    requestAnimationFrame(() => overlay.querySelector(".fechar-galeria")?.focus());
  }

  function closeGallery(restore = true) {
    if (!activeOverlay) return;
    const closingOverlay = activeOverlay;
    closingOverlay.classList.remove("aberta");
    closingOverlay.setAttribute("aria-hidden", "true");
    activeOverlay = null;
    if (!lightbox.classList.contains("aberta")) document.body.style.overflow = previousOverflow;
    if (restore) restoreFocus(galleryTrigger);
    galleryTrigger = null;
  }

  function openPhoto(button) {
    const image = button.querySelector("img");
    if (!image) return;
    photoTrigger = button;
    lockPage();
    lightboxImage.src = image.dataset.fullSrc || image.src;
    lightboxImage.alt = image.alt || "Fotografia da turma 3DM ampliada";
    lightbox.classList.add("aberta");
    lightbox.setAttribute("aria-hidden", "false");
    lightbox.setAttribute("tabindex", "-1");
    requestAnimationFrame(() => closePhotoButton.focus());
  }

  function closePhoto(restore = true) {
    if (!lightbox.classList.contains("aberta")) return;
    lightbox.classList.remove("aberta");
    lightbox.setAttribute("aria-hidden", "true");
    lightboxImage.removeAttribute("src");
    if (!activeOverlay) document.body.style.overflow = previousOverflow;
    if (restore) restoreFocus(photoTrigger);
    photoTrigger = null;
  }

  document.querySelectorAll(".bloco-album").forEach((album) => {
    const openButton = album.querySelector(".abrir-galeria");
    const closeButton = album.querySelector(".fechar-galeria");
    const overlay = album.querySelector(".galeria-overlay");
    if (!overlay) return;

    openButton?.addEventListener("click", () => openGallery(openButton, overlay));
    closeButton?.addEventListener("click", () => closeGallery());
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) closeGallery();
    });

    album.querySelectorAll(".foto-item").forEach((button) => {
      button.addEventListener("click", () => openPhoto(button));
    });
  });

  closePhotoButton.addEventListener("click", () => closePhoto());
  lightbox.addEventListener("click", (event) => {
    if (event.target === lightbox) closePhoto();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      if (lightbox.classList.contains("aberta")) {
        event.stopPropagation();
        closePhoto();
      } else if (activeOverlay) {
        event.stopPropagation();
        closeGallery();
      }
      return;
    }

    const dialog = lightbox.classList.contains("aberta")
      ? lightbox
      : activeOverlay?.querySelector('[role="dialog"]');
    if (event.key !== "Tab" || !dialog) return;
    const focusable = [...dialog.querySelectorAll(focusableSelector)].filter(
      (element) => element.getClientRects().length > 0,
    );
    if (!focusable.length) {
      event.preventDefault();
      dialog.focus();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });
})();
