// Camada de acabamento da Cápsula 2.0: animações e recursos opcionais sem dependências.
(() => {
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const coarsePointer = window.matchMedia("(pointer: coarse)");
  const navCollapse = document.getElementById("navbarNav");
  const albums = [...document.querySelectorAll(".bloco-album")];
  const carousel = document.querySelector("#carouselTurma");

  document.querySelectorAll(".navbar-capsula .nav-link").forEach((link) => {
    link.addEventListener("click", () => {
      if (
        navCollapse?.classList.contains("show") &&
        window.bootstrap?.Collapse
      ) {
        window.bootstrap.Collapse.getOrCreateInstance(navCollapse).hide();
      }
    });
  });

  // Linha fina de progresso do filme da turma.
  const progress = document.createElement("div");
  progress.className = "scroll-progress";
  progress.setAttribute("aria-hidden", "true");
  document.body.append(progress);
  let frameQueued = false;
  const updateProgress = () => {
    const maxScroll =
      document.documentElement.scrollHeight - window.innerHeight;
    const value =
      maxScroll > 0 ? Math.min(1, Math.max(0, window.scrollY / maxScroll)) : 0;
    document.documentElement.style.setProperty(
      "--scroll-progress",
      String(value),
    );
    frameQueued = false;
  };
  window.addEventListener(
    "scroll",
    () => {
      if (!frameQueued) {
        frameQueued = true;
        window.requestAnimationFrame(updateProgress);
      }
    },
    { passive: true },
  );
  window.addEventListener("resize", updateProgress, { passive: true });
  updateProgress();

  // Âncoras e entrada progressiva das seções.
  if ("IntersectionObserver" in window) {
    const navTargets = new Map(
      [...document.querySelectorAll(".navbar-capsula .nav-link[href^='#']")]
        .map((link) => [
          document.querySelector(link.getAttribute("href")),
          link,
        ])
        .filter(([section]) => section),
    );
    const sectionObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          navTargets.forEach((link, section) => {
            if (section === entry.target)
              link.setAttribute("aria-current", "location");
            else link.removeAttribute("aria-current");
          });
        });
      },
      { rootMargin: "-28% 0px -62% 0px", threshold: 0 },
    );
    navTargets.forEach((_, section) => sectionObserver.observe(section));

    document.documentElement.classList.add("has-film-reveal");
    const reveals = document.querySelectorAll(
      "main > section:not(.inicio), .bloco-album, .farewell-mark",
    );
    const revealObserver = new IntersectionObserver(
      (entries, observer) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        });
      },
      {
        threshold: reduceMotion.matches ? 0 : 0.08,
        rootMargin: "0px 0px -36px 0px",
      },
    );
    reveals.forEach((element) => {
      element.classList.add("film-reveal");
      if (reduceMotion.matches) element.classList.add("is-visible");
      else revealObserver.observe(element);
    });
  }

  // Pequeno parallax somente quando há mouse; celular fica leve e estável.
  if (!reduceMotion.matches && !coarsePointer.matches) {
    document
      .querySelectorAll(".moldura-carrossel, .momento-foto, .farewell-mark")
      .forEach((element) => {
        element.addEventListener("pointermove", (event) => {
          const box = element.getBoundingClientRect();
          const x = (event.clientX - box.left) / box.width - 0.5;
          const y = (event.clientY - box.top) / box.height - 0.5;
          element.style.setProperty("--tilt-x", `${(y * -2.2).toFixed(2)}deg`);
          element.style.setProperty("--tilt-y", `${(x * 2.2).toFixed(2)}deg`);
          element.classList.add("pointer-tilt");
        });
        element.addEventListener("pointerleave", () =>
          element.classList.remove("pointer-tilt"),
        );
      });
  }

  // Evita downloads desnecessários e mantém a primeira imagem prioritária.
  document.querySelectorAll("img").forEach((image) => {
    image.decoding = "async";
    if (!image.closest(".tribute-modal") && !image.closest(".foto-ampliada"))
      image.loading = "lazy";
  });
  const firstSlide = document.querySelector(
    "#carouselTurma .carousel-item.active img",
  );
  if (firstSlide) {
    firstSlide.loading = "eager";
    firstSlide.fetchPriority = "high";
  }
  if (reduceMotion.matches) {
    if (window.bootstrap?.Carousel && carousel) {
      window.bootstrap.Carousel.getOrCreateInstance(carousel, {
        interval: false,
      }).pause();
    }
    document
      .querySelectorAll(".momento-foto video[autoplay]")
      .forEach((video) => {
        video.pause();
        video.removeAttribute("autoplay");
      });
  }

  // Linha do tempo gerada pelos próprios álbuns. Os detalhes podem ser editados no HTML.
  const moments = document.querySelector("#momentos");
  const momentsTitle = moments?.querySelector(".momentos-titulo");
  if (moments && momentsTitle && albums.length) {
    const timeline = document.createElement("nav");
    timeline.className = "arquivo-linha-do-tempo";
    timeline.setAttribute("aria-label", "Linha do tempo dos momentos");
    timeline.innerHTML = albums
      .map((album, index) => {
        const title =
          album.querySelector("h3")?.textContent?.trim() ||
          `Momento ${index + 1}`;
        const target = album.querySelector("h3")?.id;
        return `<a href="#${target || "momentos"}" data-timeline-index="${index}"><span>${String(index + 1).padStart(2, "0")}</span>${title}</a>`;
      })
      .join("");
    momentsTitle.append(timeline);
    timeline.querySelectorAll("a").forEach((link) => {
      link.addEventListener("click", () => {
        const album = albums[Number(link.dataset.timelineIndex)];
        album?.classList.add("timeline-target");
        window.setTimeout(
          () => album?.classList.remove("timeline-target"),
          1000,
        );
      });
    });
  }

  // Barra de ações: recordação aleatória e apresentação.
  const dock = document.createElement("aside");
  dock.className = "arquivo-dock";
  dock.setAttribute("aria-label", "Ferramentas da cápsula");
  dock.innerHTML = `
    <button type="button" class="arquivo-dock-toggle" aria-expanded="false" aria-label="Abrir ferramentas da cápsula">✦</button>
    <div class="arquivo-dock-actions">
      <button type="button" data-action="random" title="Abrir uma lembrança aleatória"><span>✦</span><b>Recordação aleatória</b></button>
      <button type="button" data-action="slideshow" title="Iniciar modo apresentação"><span>▶</span><b>Modo apresentação</b></button>
      <button type="button" data-action="top" title="Voltar ao início"><span>↑</span><b>Voltar ao início</b></button>
    </div>`;
  document.body.append(dock);
  const dockToggle = dock.querySelector(".arquivo-dock-toggle");
  dockToggle.addEventListener("click", () => {
    const expanded = dock.classList.toggle("open");
    dockToggle.setAttribute("aria-expanded", String(expanded));
  });
  dock.querySelector('[data-action="top"]').addEventListener("click", () => {
    document
      .getElementById("inicio")
      ?.scrollIntoView({ behavior: reduceMotion.matches ? "auto" : "smooth" });
  });
  dock
    .querySelector('[data-action="random"]')
    .addEventListener("click", openRandomMemory);
  dock
    .querySelector('[data-action="slideshow"]')
    .addEventListener("click", openSlideshow);

  function closeDock() {
    dock.classList.remove("open");
    dockToggle.setAttribute("aria-expanded", "false");
  }

  function openRandomMemory() {
    const album = albums[Math.floor(Math.random() * albums.length)];
    const photos = album ? [...album.querySelectorAll(".foto-item")] : [];
    if (!album || !photos.length) return;
    closeDock();
    album.scrollIntoView({
      behavior: reduceMotion.matches ? "auto" : "smooth",
      block: "center",
    });
    album.classList.add("random-memory-target");
    window.setTimeout(
      () => {
        album.querySelector(".abrir-galeria")?.click();
        window.setTimeout(
          () => photos[Math.floor(Math.random() * photos.length)]?.click(),
          280,
        );
      },
      reduceMotion.matches ? 0 : 500,
    );
    window.setTimeout(
      () => album.classList.remove("random-memory-target"),
      1500,
    );
  }

  function slideshowItems() {
    const coverImages = [
      ...document.querySelectorAll(".bloco-album .momento-foto img"),
    ];
    const carouselImages = [
      ...document.querySelectorAll("#carouselTurma .carousel-item img"),
    ];
    return [...carouselImages.slice(0, 3), ...coverImages].filter(
      (image) => image?.src || image?.dataset.src,
    );
  }

  function openSlideshow() {
    const items = slideshowItems();
    if (!items.length) return;
    closeDock();
    let index = 0;
    let timer = null;
    const overlay = document.createElement("div");
    overlay.className = "arquivo-apresentacao aberta";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", "Modo apresentação de fotografias");
    overlay.innerHTML = `
      <button class="apresentacao-fechar" type="button" aria-label="Fechar apresentação">×</button>
      <div class="apresentacao-palco"><img alt="" /><p></p></div>
      <button class="apresentacao-nav apresentacao-anterior" type="button" aria-label="Foto anterior">←</button>
      <button class="apresentacao-nav apresentacao-proxima" type="button" aria-label="Próxima foto">→</button>
      <div class="apresentacao-meta"><span class="apresentacao-contador"></span><button class="apresentacao-pausa" type="button">Pausar</button></div>
      <div class="apresentacao-progresso"><span></span></div>`;
    document.body.append(overlay);
    document.body.classList.add("apresentacao-aberta");
    const image = overlay.querySelector("img");
    const label = overlay.querySelector("p");
    const count = overlay.querySelector(".apresentacao-contador");
    const progressLine = overlay.querySelector(".apresentacao-progresso span");
    const pause = overlay.querySelector(".apresentacao-pausa");
    let paused = false;
    const render = () => {
      const source =
        items[index].dataset.src || items[index].currentSrc || items[index].src;
      image.classList.remove("trocar");
      if (!reduceMotion.matches) void image.offsetWidth;
      image.classList.add("trocar");
      image.src = source;
      image.alt = items[index].alt || "Memória da turma 3DM";
      label.textContent = items[index].alt || "Memória da turma 3DM";
      count.textContent = `${index + 1} / ${items.length}`;
      progressLine.style.width = `${((index + 1) / items.length) * 100}%`;
    };
    const next = (step = 1) => {
      index = (index + step + items.length) % items.length;
      render();
    };
    const stop = () => {
      if (timer) window.clearInterval(timer);
      timer = null;
    };
    const start = () => {
      stop();
      if (!paused && !reduceMotion.matches)
        timer = window.setInterval(() => next(), 5200);
    };
    const close = () => {
      stop();
      document.body.classList.remove("apresentacao-aberta");
      overlay.remove();
    };
    overlay
      .querySelector(".apresentacao-fechar")
      .addEventListener("click", close);
    overlay
      .querySelector(".apresentacao-anterior")
      .addEventListener("click", () => {
        next(-1);
        start();
      });
    overlay
      .querySelector(".apresentacao-proxima")
      .addEventListener("click", () => {
        next();
        start();
      });
    pause.addEventListener("click", () => {
      paused = !paused;
      pause.textContent = paused ? "Continuar" : "Pausar";
      start();
    });
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) close();
    });
    overlay.addEventListener("keydown", (event) => {
      if (event.key === "Escape") close();
      if (event.key === "ArrowRight") {
        next();
        start();
      }
      if (event.key === "ArrowLeft") {
        next(-1);
        start();
      }
    });
    render();
    start();
    overlay.querySelector(".apresentacao-fechar").focus();
  }

  // Espaço de escrita para o 3DM: cartas públicas com consentimento explícito.
  const findContent = document.querySelector("#homenagens .find-content");
  if (findContent) {
    const lettersArea = document.createElement("section");
    lettersArea.className = "cartas-3dm-area";
    lettersArea.setAttribute("aria-labelledby", "cartas-3dm-title");
    lettersArea.innerHTML = `
      <button type="button" class="cartas-3dm-toggle" aria-expanded="false"><span>✦</span> Cartas para o 3DM <small>ver a sala de mensagens</small></button>
      <div class="cartas-3dm-wall" hidden><div class="cartas-3dm-wall-head"><span id="cartas-3dm-title">O que ficou escrito</span><small>mensagens compartilhadas pela turma</small></div><div class="cartas-3dm-grid" aria-live="polite"></div></div>`;
    findContent.insertBefore(
      lettersArea,
      findContent.querySelector(".privacy"),
    );
    const lettersToggle = lettersArea.querySelector(".cartas-3dm-toggle");
    const lettersWall = lettersArea.querySelector(".cartas-3dm-wall");
    const lettersGrid = lettersArea.querySelector(".cartas-3dm-grid");
    let lettersLoaded = false;
    const renderLetters = (letters) => {
      lettersGrid.innerHTML = "";
      if (!letters.length) {
        lettersGrid.innerHTML =
          '<p class="cartas-3dm-empty">Ainda não há cartas. Talvez a primeira possa ser sua.</p>';
        return;
      }
      letters.forEach((letter) => {
        const card = document.createElement("article");
        card.className = "carta-3dm-card";
        const date = letter.criadaEm
          ? new Date(letter.criadaEm).toLocaleDateString("pt-BR", {
              day: "2-digit",
              month: "long",
              year: "numeric",
            })
          : "";
        card.innerHTML = `<span class="carta-3dm-tipo"></span><h3></h3><p></p><small></small>`;
        card.querySelector(".carta-3dm-tipo").textContent =
          letter.categoria || "Alguém da turma";
        card.querySelector("h3").textContent =
          letter.nome || "Alguém da nossa história";
        card.querySelector("p").textContent = letter.mensagem || "";
        card.querySelector("small").textContent = date;
        lettersGrid.appendChild(card);
      });
    };
    const loadLetters = async () => {
      if (lettersLoaded) return;
      lettersGrid.innerHTML =
        '<p class="cartas-3dm-empty">Abrindo as cartas…</p>';
      try {
        const response = await fetch("/api/cartas-3dm", { cache: "no-store" });
        if (!response.ok) throw new Error("Falha ao carregar cartas");
        renderLetters(await response.json());
        lettersLoaded = true;
      } catch {
        lettersGrid.innerHTML =
          '<p class="cartas-3dm-empty">As cartas estarão disponíveis quando o arquivo for aberto.</p>';
      }
    };
    lettersToggle.addEventListener("click", () => {
      const open = lettersWall.hidden;
      lettersWall.hidden = !open;
      lettersToggle.setAttribute("aria-expanded", String(open));
      if (open) loadLetters();
    });
    const messageTrigger = document.createElement("button");
    messageTrigger.type = "button";
    messageTrigger.className = "mensagem-3dm-trigger";
    messageTrigger.innerHTML =
      'Escrever para o 3DM <span aria-hidden="true">↗</span>';
    findContent.insertBefore(
      messageTrigger,
      findContent.querySelector(".privacy"),
    );

    const messageModal = document.createElement("div");
    messageModal.className = "mensagem-3dm-modal";
    messageModal.setAttribute("role", "dialog");
    messageModal.setAttribute("aria-modal", "true");
    messageModal.setAttribute("aria-label", "Escrever para o 3DM");
    messageModal.hidden = true;
    messageModal.innerHTML = `
      <div class="mensagem-3dm-card">
        <button type="button" class="mensagem-3dm-close" aria-label="Fechar escrita">×</button>
        <span class="memory-label">UMA CARTA PARA A TURMA</span>
        <h3>Escrever para o 3DM</h3>
        <p>Escreva do seu jeito. O texto aparece aqui enquanto você escreve e só será visto pela turma se você autorizar.</p>
        <div class="mensagem-3dm-layout">
          <div class="mensagem-3dm-fields">
            <label>Seu nome <span>(opcional)</span><input class="mensagem-nome" type="text" maxlength="60" autocomplete="name" placeholder="Como posso te chamar?"></label>
            <label>Você é <select class="mensagem-categoria"><option>Aluno</option><option>Professor</option><option>Amigo</option><option>Família</option><option>Outro</option></select></label>
            <label>Sua mensagem<textarea class="mensagem-texto" maxlength="500" rows="5" required placeholder="Escreva algumas palavras…"></textarea></label>
          </div>
          <article class="mensagem-3dm-preview" aria-live="polite"><span>PARA O 3DM</span><h4 class="mensagem-preview-nome">Uma mensagem guardada</h4><div></div><p class="mensagem-preview-texto">Sua mensagem aparecerá aqui.</p><small>com carinho, alguém que fez parte</small></article>
        </div>
        <label class="mensagem-consentimento"><input class="mensagem-consentimento-check" type="checkbox"><span>Autorizo que esta carta apareça na aba “Cartas para o 3DM” para a turma ler.</span></label>
        <div class="mensagem-3dm-footer"><small class="mensagem-status">A publicação é opcional e passa por revisão.</small><button type="button" class="mensagem-enviar">enviar carta <span aria-hidden="true">↗</span></button></div>
      </div>`;
    document.body.appendChild(messageModal);
    const nomeField = messageModal.querySelector(".mensagem-nome");
    const textField = messageModal.querySelector(".mensagem-texto");
    const previewName = messageModal.querySelector(".mensagem-preview-nome");
    const previewText = messageModal.querySelector(".mensagem-preview-texto");
    const updatePreview = () => {
      previewName.textContent =
        nomeField.value.trim() || "Uma mensagem guardada";
      previewText.textContent =
        textField.value.trim() || "Sua mensagem aparecerá aqui.";
    };
    nomeField.addEventListener("input", updatePreview);
    textField.addEventListener("input", updatePreview);
    const closeMessage = () => {
      messageModal.hidden = true;
      document.body.classList.remove("mensagem-modal-aberta");
    };
    const openMessage = () => {
      messageModal.hidden = false;
      document.body.classList.add("mensagem-modal-aberta");
      textField.focus();
    };
    messageTrigger.addEventListener("click", openMessage);
    messageModal
      .querySelector(".mensagem-3dm-close")
      .addEventListener("click", closeMessage);
    messageModal.addEventListener("click", (event) => {
      if (event.target === messageModal) closeMessage();
    });
    messageModal
      .querySelector(".mensagem-enviar")
      .addEventListener("click", async () => {
        const nome = messageModal.querySelector(".mensagem-nome").value.trim();
        const texto = messageModal
          .querySelector(".mensagem-texto")
          .value.trim();
        if (!texto)
          return messageModal.querySelector(".mensagem-texto").focus();
        const categoria = messageModal.querySelector(
          ".mensagem-categoria",
        ).value;
        const consentimentoPublico = messageModal.querySelector(
          ".mensagem-consentimento-check",
        ).checked;
        const status = messageModal.querySelector(".mensagem-status");
        if (!consentimentoPublico) {
          status.textContent = "Confirme que a turma pode ler esta carta.";
          return;
        }
        const button = messageModal.querySelector(".mensagem-enviar");
        button.disabled = true;
        status.textContent = "Guardando sua carta…";
        try {
          const response = await fetch("/api/cartas-3dm", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              nome,
              categoria,
              mensagem: texto,
              consentimentoPublico,
            }),
          });
          const saved = await response.json();
          if (!response.ok)
            throw new Error(saved.erro || "Não foi possível guardar a carta.");
          status.textContent =
            "Carta enviada para revisão. Obrigado por escrever para o 3DM.";
          window.setTimeout(closeMessage, 1500);
        } catch (error) {
          status.textContent =
            error.message || "Não foi possível guardar agora.";
        } finally {
          button.disabled = false;
        }
      });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !messageModal.hidden) closeMessage();
    });
  }

  // Atalhos de teclado simples e foco cíclico no portal existente.
  document.addEventListener("keydown", (event) => {
    const key = typeof event.key === "string" ? event.key : "";
    if (
      (key === "/" ||
        (key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey))) &&
      document.activeElement?.tagName !== "INPUT"
    ) {
      event.preventDefault();
      document.getElementById("name-search")?.focus();
    }
    const modal = document.getElementById("tribute-modal");
    if (event.key !== "Tab" || !modal?.classList.contains("open")) return;
    const selector =
      'button:not([disabled]), input:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';
    const focusable = [...modal.querySelectorAll(selector)].filter(
      (element) => element.getClientRects().length > 0,
    );
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (
      event.shiftKey &&
      (document.activeElement === first || document.activeElement === modal)
    ) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });
})();
