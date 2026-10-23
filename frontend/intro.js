// Prólogo da cápsula: curto, dispensável e apresentado uma vez por sessão da aba.
(() => {
  const root = document.documentElement;
  const intro = document.getElementById("cinematic-intro");
  const skip = document.getElementById("cinematic-intro-skip");
  const storageKey = "3dm-intro-seen-v1";
  const motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");

  if (!intro || !skip || !root.classList.contains("cinematic-intro-pending")) {
    root.classList.remove("cinematic-intro-pending");
    return;
  }

  if (motionPreference.matches) {
    root.classList.remove("cinematic-intro-pending");
    intro.remove();
    return;
  }

  const duration = 4600;
  let timeoutId;
  let finished = false;

  const rememberIntro = () => {
    try {
      window.sessionStorage.setItem(storageKey, "1");
    } catch (_) {
      // A abertura continua funcionando caso o navegador restrinja sessionStorage.
    }
  };

  const finishIntro = () => {
    if (finished) return;
    finished = true;
    window.clearTimeout(timeoutId);
    rememberIntro();
    intro.setAttribute("aria-hidden", "true");
    intro.classList.add("is-leaving");
    root.classList.remove("cinematic-intro-pending");
    window.removeEventListener("keydown", handleKeydown, true);
    motionPreference.removeEventListener?.("change", handleMotionChange);
    window.setTimeout(() => intro.remove(), 650);
  };

  const handleKeydown = (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      finishIntro();
      return;
    }

    if (event.key === "Tab") {
      event.preventDefault();
      skip.focus({ preventScroll: true });
    }
  };

  const handleMotionChange = (event) => {
    if (event.matches) finishIntro();
  };

  intro.hidden = false;
  intro.setAttribute("aria-hidden", "false");
  intro.style.setProperty("--intro-duration", `${duration}ms`);
  rememberIntro();
  skip.addEventListener("click", finishIntro);
  window.addEventListener("keydown", handleKeydown, true);
  motionPreference.addEventListener?.("change", handleMotionChange);
  skip.focus({ preventScroll: true });
  timeoutId = window.setTimeout(finishIntro, duration);
})();
