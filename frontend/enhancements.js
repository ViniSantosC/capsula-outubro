// Acabamento de navegação e leitura do arquivo, sem dependências extras.
(() => {
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const mobilePointer = window.matchMedia("(pointer: coarse)");
  const navCollapse = document.getElementById("navbarNav");

  // Fecha o menu depois de escolher um capítulo no celular.
  document.querySelectorAll(".navbar-capsula .nav-link").forEach((link) => {
    link.addEventListener("click", () => {
      if (navCollapse?.classList.contains("show") && window.bootstrap?.Collapse) {
        window.bootstrap.Collapse.getOrCreateInstance(navCollapse).hide();
      }
    });
  });

  // A barra fina indica onde a pessoa está no filme da turma.
  const progress = document.createElement("div");
  progress.className = "scroll-progress";
  progress.setAttribute("aria-hidden", "true");
  document.body.append(progress);
  let frameQueued = false;
  const updateProgress = () => {
    const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
    const value = maxScroll > 0 ? Math.min(1, Math.max(0, window.scrollY / maxScroll)) : 0;
    document.documentElement.style.setProperty("--scroll-progress", String(value));
    frameQueued = false;
  };
  window.addEventListener("scroll", () => {
    if (!frameQueued) {
      frameQueued = true;
      window.requestAnimationFrame(updateProgress);
    }
  }, { passive: true });
  window.addEventListener("resize", updateProgress, { passive: true });
  updateProgress();

  // Realça apenas a âncora da seção que está em leitura.
  if ("IntersectionObserver" in window) {
    const navTargets = new Map(
      [...document.querySelectorAll(".navbar-capsula .nav-link[href^='#']")]
        .map((link) => [document.querySelector(link.getAttribute("href")), link])
        .filter(([section]) => section),
    );
    const sectionObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        navTargets.forEach((link, section) => {
          if (section === entry.target) link.setAttribute("aria-current", "location");
          else link.removeAttribute("aria-current");
        });
      });
    }, { rootMargin: "-28% 0px -62% 0px", threshold: 0 });
    navTargets.forEach((_, section) => sectionObserver.observe(section));

    if (!reduceMotion.matches) {
      document.documentElement.classList.add("has-film-reveal");
      const reveals = document.querySelectorAll("main > section:not(.inicio), .bloco-album");
      const revealObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        });
      }, { threshold: 0.08, rootMargin: "0px 0px -36px 0px" });
      reveals.forEach((element) => {
        element.classList.add("film-reveal");
        revealObserver.observe(element);
      });
    }
  }

  // Evita downloads desnecessários de fotos fora da primeira tela.
  document.querySelectorAll("img").forEach((image) => {
    image.decoding = "async";
    if (!image.closest(".tribute-modal") && !image.closest(".foto-ampliada")) {
      image.loading = "lazy";
    }
  });
  const firstSlide = document.querySelector("#carouselTurma .carousel-item.active img");
  if (firstSlide) {
    firstSlide.loading = "eager";
    firstSlide.fetchPriority = "high";
  }

  // Respeita movimento reduzido também no carrossel e no vídeo documental.
  if (reduceMotion.matches) {
    if (window.bootstrap?.Carousel) {
      const carouselElement = document.getElementById("carouselTurma");
      if (carouselElement) window.bootstrap.Carousel.getOrCreateInstance(carouselElement, { interval: false }).pause();
    }
    document.querySelectorAll(".momento-foto video[autoplay]").forEach((video) => {
      video.pause();
      video.removeAttribute("autoplay");
    });
  }

  // Mantém o foco dentro do portal pessoal quando ele está aberto.
  document.addEventListener("keydown", (event) => {
    const modal = document.getElementById("tribute-modal");
    if (event.key !== "Tab" || !modal?.classList.contains("open")) return;
    const selector = 'button:not([disabled]), input:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';
    const focusable = [...modal.querySelectorAll(selector)].filter((element) => element.getClientRects().length > 0);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && (document.activeElement === first || document.activeElement === modal)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });
})();
