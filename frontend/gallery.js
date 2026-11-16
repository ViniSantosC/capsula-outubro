// Galerias e ampliação: mantém os álbuns originais e acrescenta navegação cinematográfica.
(() => {
  const lightbox = document.querySelector(".foto-ampliada");
  const lightboxImage = lightbox?.querySelector("img");
  const closePhotoButton = lightbox?.querySelector(".fechar-foto");
  const previousButton = lightbox?.querySelector(".navegar-foto--anterior");
  const nextButton = lightbox?.querySelector(".navegar-foto--proxima");
  const counter = lightbox?.querySelector(".foto-ampliada-contador");
  const caption = lightbox?.querySelector(".foto-ampliada-legenda");
  const status = lightbox?.querySelector(".foto-ampliada-status");
  if (!lightbox || !lightboxImage || !closePhotoButton) return;

  let activeOverlay = null;
  let galleryTrigger = null;
  let photoTrigger = null;
  let currentCollection = [];
  let currentIndex = 0;
  let previousOverflow = "";
  let touchStartX = null;
  const focusableSelector =
    'button:not([disabled]), a[href], input:not([disabled]), [tabindex]:not([tabindex="-1"])';
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  function lockPage() {
    if (!activeOverlay && !lightbox.classList.contains("aberta")) {
      previousOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
    }
  }

  function restoreFocus(element) {
    if (element?.isConnected && typeof element.focus === "function") {
      element.focus({ preventScroll: true });
    }
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
    requestAnimationFrame(() =>
      overlay.querySelector(".fechar-galeria")?.focus(),
    );
  }

  function closeGallery(restore = true) {
    if (!activeOverlay) return;
    const closingOverlay = activeOverlay;
    closingOverlay.classList.remove("aberta");
    closingOverlay.setAttribute("aria-hidden", "true");
    activeOverlay = null;
    if (!lightbox.classList.contains("aberta"))
      document.body.style.overflow = previousOverflow;
    if (restore) restoreFocus(galleryTrigger);
    galleryTrigger = null;
  }

  function imageSource(image) {
    // As galerias já declaram versões WebP em data-src. Elas evitam transferir
    // os originais de vários megabytes e mantêm data-full-src como fallback.
    return (
      image.dataset.src ||
      image.currentSrc ||
      image.src ||
      image.dataset.fullSrc ||
      ""
    );
  }

  function collectionFor(buttons) {
    return [...buttons].filter((button) => button.querySelector("img"));
  }

  function updateNavigation() {
    const total = currentCollection.length;
    const hasNavigation = total > 1;
    if (previousButton) {
      previousButton.hidden = !hasNavigation;
      previousButton.disabled = !hasNavigation;
    }
    if (nextButton) {
      nextButton.hidden = !hasNavigation;
      nextButton.disabled = !hasNavigation;
    }
    if (counter)
      counter.textContent = total > 1 ? `${currentIndex + 1} / ${total}` : "";
  }

  function preload(index) {
    const item = currentCollection[index];
    const image = item?.querySelector("img");
    const source = image && imageSource(image);
    if (!source) return;
    const nextImage = new Image();
    nextImage.decoding = "async";
    nextImage.src = source;
  }

  function renderPhoto(index, direction = "") {
    if (!currentCollection.length) return;
    currentIndex =
      (index + currentCollection.length) % currentCollection.length;
    const trigger = currentCollection[currentIndex];
    const image = trigger.querySelector("img");
    const source = imageSource(image);
    if (!source) {
      status.textContent = "Esta fotografia está indisponível.";
      lightbox.classList.add("foto-com-erro");
      return;
    }
    photoTrigger = trigger;
    lightbox.classList.remove("foto-com-erro", "foto-carregando");
    if (!reduceMotion.matches && direction) {
      lightbox.dataset.direction = direction;
      lightbox.classList.remove("foto-trocando");
      void lightbox.offsetWidth;
      lightbox.classList.add("foto-trocando");
    }
    lightbox.classList.add("foto-carregando");
    status.textContent = "Carregando fotografia…";
    lightboxImage.alt = image.alt || "Fotografia da turma 3DM ampliada";
    lightboxImage.src = source;
    caption.textContent = image.alt || "Memória da turma 3DM";
    status.textContent = "";
    updateNavigation();
    preload((currentIndex + 1) % currentCollection.length);
    preload(
      (currentIndex - 1 + currentCollection.length) % currentCollection.length,
    );
  }

  function openPhoto(buttons, button, direction = "") {
    currentCollection = collectionFor(buttons);
    const index = Math.max(0, currentCollection.indexOf(button));
    photoTrigger = button;
    lockPage();
    lightbox.classList.add("aberta");
    lightbox.setAttribute("aria-hidden", "false");
    lightbox.setAttribute("tabindex", "-1");
    renderPhoto(index, direction);
    requestAnimationFrame(() =>
      closePhotoButton.focus({ preventScroll: true }),
    );
  }

  function movePhoto(step) {
    if (currentCollection.length < 2) return;
    renderPhoto(currentIndex + step, step > 0 ? "next" : "previous");
  }

  function closePhoto(restore = true) {
    if (!lightbox.classList.contains("aberta")) return;
    lightbox.classList.remove(
      "aberta",
      "foto-carregando",
      "foto-com-erro",
      "foto-trocando",
    );
    lightbox.removeAttribute("data-direction");
    lightbox.setAttribute("aria-hidden", "true");
    lightboxImage.removeAttribute("src");
    status.textContent = "";
    caption.textContent = "";
    if (!activeOverlay) document.body.style.overflow = previousOverflow;
    if (restore) restoreFocus(photoTrigger);
    photoTrigger = null;
    currentCollection = [];
  }

  document.querySelectorAll(".bloco-album").forEach((album) => {
    const openButton = album.querySelector(".abrir-galeria");
    const closeButton = album.querySelector(".fechar-galeria");
    const overlay = album.querySelector(".galeria-overlay");
    const photos = album.querySelectorAll(".foto-item");
    if (!overlay) return;
    openButton?.addEventListener("click", () =>
      openGallery(openButton, overlay),
    );
    closeButton?.addEventListener("click", () => closeGallery());
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) closeGallery();
    });
    photos.forEach((button) =>
      button.addEventListener("click", () => openPhoto(photos, button)),
    );
  });

  const carouselPhotos = document.querySelectorAll(
    "#carouselTurma .carousel-item img",
  );
  carouselPhotos.forEach((image) => {
    image.setAttribute("role", "button");
    image.setAttribute("tabindex", "0");
    image.addEventListener("click", () => openPhoto(carouselPhotos, image));
    image.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openPhoto(carouselPhotos, image);
      }
    });
  });

  closePhotoButton.addEventListener("click", () => closePhoto());
  previousButton?.addEventListener("click", () => movePhoto(-1));
  nextButton?.addEventListener("click", () => movePhoto(1));
  lightboxImage.addEventListener("load", () => {
    lightbox.classList.remove("foto-carregando");
    status.textContent = "";
  });
  lightboxImage.addEventListener("error", () => {
    lightbox.classList.remove("foto-carregando");
    lightbox.classList.add("foto-com-erro");
    status.textContent = "Não foi possível carregar esta fotografia.";
  });
  lightbox.addEventListener("click", (event) => {
    if (event.target === lightbox) closePhoto();
  });
  lightbox.addEventListener(
    "touchstart",
    (event) => {
      touchStartX = event.changedTouches[0]?.clientX ?? null;
    },
    { passive: true },
  );
  lightbox.addEventListener(
    "touchend",
    (event) => {
      if (touchStartX === null) return;
      const delta =
        (event.changedTouches[0]?.clientX ?? touchStartX) - touchStartX;
      touchStartX = null;
      if (Math.abs(delta) > 48) movePhoto(delta < 0 ? 1 : -1);
    },
    { passive: true },
  );

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
    if (lightbox.classList.contains("aberta") && event.key === "ArrowLeft") {
      event.preventDefault();
      movePhoto(-1);
      return;
    }
    if (lightbox.classList.contains("aberta") && event.key === "ArrowRight") {
      event.preventDefault();
      movePhoto(1);
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
    if (
      event.shiftKey &&
      (document.activeElement === first || document.activeElement === dialog)
    ) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });
})();
