// =====================================================
// 3DM — PORTAL CINEMATOGRÁFICO DAS MEMÓRIAS
// =====================================================

const API_URL = ""; // A interface e a API compartilham a origem da prévia.

// =====================================================
// ELEMENTOS
// =====================================================

const searchInput = document.getElementById("name-search");

const searchResults = document.getElementById("search-results");

const tributeModal = document.getElementById("tribute-modal");

const lockScreen = document.getElementById("tribute-lock-screen");

const memoryLock = document.getElementById("memory-lock");

const lockPersonName = document.getElementById("lock-person-name");

const passwordInput = document.getElementById("tribute-password");

const passwordSubmit = document.getElementById("password-submit");

const passwordError = document.getElementById("password-error");

const tributeCancel = document.getElementById("tribute-cancel");

const tributeMemory = document.getElementById("tribute-memory");

const tributeClose = document.getElementById("tribute-close");

const tributeImage = document.getElementById("tribute-image");

const tributeTitle = document.getElementById("tribute-title");

const tributeMessage = document.getElementById("tribute-message");

const tributeFooter = document.getElementById("tribute-footer");

const tributePhrase = document.getElementById("tribute-phrase");

const readMemoryButton = document.getElementById("read-memory");

const particlesContainer = document.getElementById("memory-particles");

// =====================================================
// PESSOA ATUAL
// =====================================================

let pessoaSelecionada = null;
let homenagensEmCache = null;
let elementoComFocoAnterior = null;

// =====================================================
// CRIAR PARTÍCULAS
// =====================================================

function criarParticulas() {
  particlesContainer.innerHTML = "";

  const preferePoucoMovimento = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const telaPequena = window.matchMedia("(max-width: 680px)").matches;
  const quantidade = preferePoucoMovimento ? 0 : (telaPequena ? 28 : 56);

  for (let i = 0; i < quantidade; i++) {
    const particle = document.createElement("span");

    particle.className = "memory-particle";

    const x = Math.random() * 100;

    const y = Math.random() * 100;

    const duration = 4 + Math.random() * 7;

    const delay = Math.random() * 6;

    const moveX = (Math.random() - 0.5) * 150;

    const explodeX = (Math.random() - 0.5) * 900;

    const explodeY = (Math.random() - 0.5) * 600;

    particle.style.left = `${x}%`;

    particle.style.top = `${y}%`;

    particle.style.setProperty("--duration", `${duration}s`);

    particle.style.setProperty("--delay", `${delay}s`);

    particle.style.setProperty("--move-x", `${moveX}px`);

    particle.style.setProperty("--explode-x", `${explodeX}px`);

    particle.style.setProperty("--explode-y", `${explodeY}px`);

    particlesContainer.appendChild(particle);
  }
}

// =====================================================
// BUSCAR NOMES
// =====================================================

async function carregarNomes() {
  if (homenagensEmCache) {
    return homenagensEmCache;
  }

  try {
    const resposta = await fetch(`${API_URL}/api/homenagens`);

    if (!resposta.ok) {
      throw new Error("Erro ao buscar homenagens.");
    }

    homenagensEmCache = await resposta.json();
    return homenagensEmCache;
  } catch (erro) {
    console.error(erro);

    searchResults.innerHTML = `
      <div class="search-empty">
        Não foi possível carregar as lembranças.
      </div>
    `;

    return [];
  }
}

// =====================================================
// PESQUISAR
// =====================================================

async function pesquisarHomenagens() {
  const normalizar = (valor) => valor.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
  const termo = normalizar(searchInput.value.trim());

  searchResults.innerHTML = "";

  const pessoas = await carregarNomes();

  // Ao focar ou deixar a busca vazia, mostra todas as cartas disponíveis.
  const encontrados = termo
    ? pessoas.filter((pessoa) => normalizar(pessoa.nome).includes(termo))
    : pessoas;

  if (encontrados.length === 0) {
    searchResults.innerHTML = `
      <div class="search-empty">
        Não encontrei nenhuma lembrança com esse nome.
      </div>
    `;

    return;
  }

  encontrados.forEach((pessoa) => {
    const resultado = document.createElement("button");
    const informacao = document.createElement("div");
    const icone = document.createElement("span");
    const textos = document.createElement("div");
    const nome = document.createElement("span");
    const dica = document.createElement("span");
    const seta = document.createElement("span");

    resultado.type = "button";
    resultado.className = "search-result";
    informacao.className = "search-result-info";
    icone.className = "search-result-icon";
    icone.setAttribute("aria-hidden", "true");
    icone.textContent = "✦";
    nome.className = "search-result-name";
    nome.textContent = String(pessoa.nome ?? "");
    dica.className = "search-result-hint";
    dica.textContent = "Existe uma lembrança esperando por você";
    seta.className = "search-result-arrow";
    seta.setAttribute("aria-hidden", "true");
    seta.textContent = "→";

    textos.append(nome, dica);
    informacao.append(icone, textos);
    resultado.append(informacao, seta);
    resultado.addEventListener("click", () => iniciarPortal(pessoa));
    searchResults.appendChild(resultado);
  });
}

// =====================================================
// INICIAR PORTAL
// =====================================================

function iniciarPortal(pessoa) {
  pessoaSelecionada = pessoa;
  elementoComFocoAnterior = document.activeElement;

  lockPersonName.textContent = pessoa.nome;

  passwordInput.value = "";

  passwordError.textContent = "";

  lockScreen.classList.remove("unlocking");

  memoryLock.classList.remove("unlocked");

  memoryLock.classList.remove("shake");

  tributeMemory.classList.remove("revealed");

  tributeMemory.classList.remove("reading");

  tributeModal.classList.add("open");

  tributeModal.setAttribute("aria-hidden", "false");

  document.body.style.overflow = "hidden";

  criarParticulas();

  const focoInicial = window.matchMedia("(pointer: coarse)").matches
    ? tributeCancel
    : passwordInput;
  setTimeout(() => focoInicial.focus({ preventScroll: true }), 500);
}

// =====================================================
// TENTAR ABRIR
// =====================================================

async function tentarAbrir() {
  if (!pessoaSelecionada) {
    return;
  }

  const senha = passwordInput.value.trim();

  if (!senha) {
    passwordError.textContent = "Digite a senha para continuar.";

    memoryLock.classList.remove("shake");

    void memoryLock.offsetWidth;

    memoryLock.classList.add("shake");

    return;
  }

  passwordError.textContent = "Verificando...";

  try {
    const resposta = await fetch(
      `${API_URL}/api/homenagens/${pessoaSelecionada.id}`,
      {
        method: "POST",

        headers: {
          "Content-Type": "application/json",
        },

        body: JSON.stringify({
          senha: senha,
        }),
      },
    );

    const dados = await resposta.json();

    // =========================================
    // SENHA ERRADA
    // =========================================

    if (!resposta.ok) {
      passwordError.textContent = "Essa senha não abre esta lembrança.";

      memoryLock.classList.remove("shake");

      void memoryLock.offsetWidth;

      memoryLock.classList.add("shake");

      passwordInput.select();

      return;
    }

    // =========================================
    // SENHA CORRETA
    // =========================================

    passwordError.textContent = "";

    desbloquearMemoria(dados);
  } catch (erro) {
    console.error(erro);

    passwordError.textContent = "Não foi possível conectar ao servidor.";
  }
}

// =====================================================
// DESBLOQUEAR MEMÓRIA
// =====================================================

function desbloquearMemoria(dados) {
  // -----------------------------------------
  // PREPARAR CONTEÚDO
  // -----------------------------------------

  tributeTitle.textContent = dados.nome;

  tributeMessage.textContent = dados.mensagem;

  tributeFooter.textContent = dados.legenda || "3DM · O que fica";

  tributePhrase.textContent = dados.frase || dados.legenda || "Uma lembrança esperando para ser lida.";

  // Sem foto: transforma a carta em uma leitura limpa, sem deixar uma coluna vazia.
  tributeMemory.classList.toggle("no-photo", !dados.fotoUrl);

  if (dados.fotoUrl) {
    tributeImage.hidden = false;
    tributeImage.alt = `Foto da homenagem de ${dados.nome}`;
    tributeImage.onerror = () => {
      tributeImage.removeAttribute("src");
      tributeImage.hidden = true;
    };
    tributeImage.referrerPolicy = "no-referrer";
    tributeImage.src = dados.fotoUrl;
  } else {
    tributeImage.removeAttribute("src");
    tributeImage.hidden = true;
  }

  // -----------------------------------------
  // COMEÇA A ANIMAÇÃO
  // -----------------------------------------

  memoryLock.classList.add("unlocked");

  // -----------------------------------------
  // EXPLOSÃO DAS PARTÍCULAS
  // -----------------------------------------

  setTimeout(() => {
    particlesContainer.classList.add("explode");
  }, 250);

  // -----------------------------------------
  // TELA DO CADEADO DESAPARECE
  // -----------------------------------------

  setTimeout(() => {
    lockScreen.classList.add("unlocking");
  }, 500);

  // -----------------------------------------
  // MEMÓRIA APARECE
  // -----------------------------------------

  setTimeout(() => {
    tributeMemory.classList.add("revealed");
  }, 1000);
}

function lerEssaLembranca() {
  tributeMemory.classList.add("reading");
  document.getElementById("memory-letter")?.removeAttribute("hidden");
  readMemoryButton?.blur();
}

// =====================================================
// FECHAR PORTAL
// =====================================================

function fecharPortal() {
  tributeModal.classList.remove("open");

  tributeModal.setAttribute("aria-hidden", "true");

  tributeMemory.classList.remove("revealed");

  lockScreen.classList.remove("unlocking");

  memoryLock.classList.remove("unlocked");

  particlesContainer.classList.remove("explode");

  tributeImage.removeAttribute("src");
  tributeImage.hidden = true;
  tributeMemory.classList.remove("no-photo");
  tributeMemory.classList.remove("reading");
  lockPersonName.textContent = "Sua lembrança";
  tributeTitle.textContent = "Sua lembrança";
  tributeMessage.textContent = "";
  tributeFooter.textContent = "3DM · O que fica";
  tributePhrase.textContent = "Uma lembrança esperando para ser lida.";
  passwordInput.value = "";
  passwordError.textContent = "";

  document.body.style.overflow = "";

  pessoaSelecionada = null;
  if (elementoComFocoAnterior?.isConnected) {
    elementoComFocoAnterior.focus();
  }
  elementoComFocoAnterior = null;
}

// =====================================================
// VOLTAR
// =====================================================

tributeCancel.addEventListener("click", fecharPortal);

tributeClose.addEventListener("click", fecharPortal);

// =====================================================
// ABRIR COM BOTÃO
// =====================================================

passwordSubmit.addEventListener("click", tentarAbrir);

readMemoryButton.addEventListener("click", lerEssaLembranca);

// =====================================================
// ENTER NA SENHA
// =====================================================

passwordInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();

    tentarAbrir();
  }
});

// =====================================================
// ESC
// =====================================================

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && tributeModal.classList.contains("open")) {
    fecharPortal();
  }
});

// =====================================================
// CTRL + K
// =====================================================

document.addEventListener("keydown", (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();

    searchInput.focus();

    searchInput.select();
  }
});

// =====================================================
// PESQUISA
// =====================================================

let temporizadorBusca;
searchInput.addEventListener("input", () => {
  window.clearTimeout(temporizadorBusca);
  temporizadorBusca = window.setTimeout(pesquisarHomenagens, 130);
});

searchInput.addEventListener("focus", pesquisarHomenagens);
