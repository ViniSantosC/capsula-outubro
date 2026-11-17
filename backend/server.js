const crypto = require("node:crypto");
const express = require("express");
const fs = require("node:fs");
const path = require("node:path");

const app = express();
const PORT = Number(process.env.PORT || 3000);
const FRONTEND_DIR = path.resolve(__dirname, "../frontend");
const PRIVATE_PHOTOS_DIR = path.resolve(__dirname, "private-homenagens");
const FRONTEND_HOMENAGENS_DIR = path.resolve(FRONTEND_DIR, "img/homenagens");
const ARQUIVO_HOMENAGENS = fs.existsSync("/etc/secrets/homenagens.json")
  ? "/etc/secrets/homenagens.json"
  : path.join(__dirname, "homenagens.json");
const ARQUIVO_CARTAS =
  process.env.CARTAS_3DM_FILE || path.join(__dirname, "cartas-3dm.json");
const ADMIN_CARTAS_TOKEN = process.env.ADMIN_CARTAS_TOKEN || "";

const RATE_WINDOW_MS = 15 * 60 * 1000;
const MAX_PASSWORD_ATTEMPTS = 8;
const PHOTO_TOKEN_TTL_MS = 15 * 60 * 1000;
const passwordAttempts = new Map();
const cartaAttempts = new Map();
const scryptOptions = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use(express.json({ limit: "16kb" }));
app.use("/api", (_req, res, next) => {
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  next();
});

function carregarHomenagens() {
  try {
    const dados = JSON.parse(fs.readFileSync(ARQUIVO_HOMENAGENS, "utf8"));
    return Array.isArray(dados) ? dados : [];
  } catch {
    return [];
  }
}

function carregarCartas() {
  try {
    const dados = JSON.parse(fs.readFileSync(ARQUIVO_CARTAS, "utf8"));
    return Array.isArray(dados) ? dados : [];
  } catch {
    return [];
  }
}

function salvarCartas(cartas) {
  const temporario = `${ARQUIVO_CARTAS}.tmp`;
  fs.writeFileSync(temporario, `${JSON.stringify(cartas, null, 2)}\n`, {
    mode: 0o600,
  });
  fs.renameSync(temporario, ARQUIVO_CARTAS);
}

function podeEnviarCarta(req) {
  const chave = req.ip || req.socket.remoteAddress || "desconhecido";
  const agora = Date.now();
  const anterior = cartaAttempts.get(chave) || { inicio: agora, total: 0 };
  if (agora - anterior.inicio >= RATE_WINDOW_MS) {
    anterior.inicio = agora;
    anterior.total = 0;
  }
  if (anterior.total >= 5) return false;
  anterior.total += 1;
  cartaAttempts.set(chave, anterior);
  return true;
}

function adminTokenValido(req) {
  if (!ADMIN_CARTAS_TOKEN || ADMIN_CARTAS_TOKEN.length < 20) return false;
  const recebido =
    req.get("x-admin-token") ||
    String(req.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const esperado = Buffer.from(ADMIN_CARTAS_TOKEN);
  const informado = Buffer.from(recebido);
  return (
    esperado.length === informado.length &&
    crypto.timingSafeEqual(esperado, informado)
  );
}

function exigirAdmin(req, res, next) {
  if (!adminTokenValido(req))
    return res
      .status(401)
      .json({ erro: "Acesso administrativo não autorizado." });
  return next();
}

function verificarSenha(senha, senhaHash) {
  try {
    const partes = String(senhaHash || "").split("$");
    if (partes.length !== 3 || partes[0] !== "scrypt-v1") return false;

    const salt = Buffer.from(partes[1], "base64url");
    const hashEsperado = Buffer.from(partes[2], "base64url");
    if (salt.length !== 16 || hashEsperado.length !== 64) return false;

    const hashRecebido = crypto.scryptSync(
      senha,
      salt,
      hashEsperado.length,
      scryptOptions,
    );
    return crypto.timingSafeEqual(hashRecebido, hashEsperado);
  } catch {
    return false;
  }
}

function chaveTentativa(req, id) {
  const endereco = req.ip || req.socket.remoteAddress || "desconhecido";
  return `${endereco}:${id}`;
}

function obterTentativa(chave) {
  const agora = Date.now();
  let registro = passwordAttempts.get(chave);
  if (!registro || agora - registro.inicio >= RATE_WINDOW_MS) {
    registro = { inicio: agora, total: 0, bloqueadoAte: 0 };
    passwordAttempts.set(chave, registro);
  }
  if (registro.bloqueadoAte > agora)
    return { registro, espera: registro.bloqueadoAte - agora };
  return { registro, espera: 0 };
}

function registrarFalha(chave, registro) {
  registro.total += 1;
  if (registro.total >= MAX_PASSWORD_ATTEMPTS)
    registro.bloqueadoAte = Date.now() + RATE_WINDOW_MS;

  if (passwordAttempts.size > 4096) {
    const agora = Date.now();
    for (const [key, item] of passwordAttempts) {
      if (agora - item.inicio >= RATE_WINDOW_MS && item.bloqueadoAte <= agora) {
        passwordAttempts.delete(key);
        if (passwordAttempts.size <= 3072) break;
      }
    }
  }
}

function criarTokenFoto(pessoa) {
  const expira = Date.now() + PHOTO_TOKEN_TTL_MS;
  const payload = Buffer.from(
    JSON.stringify({ id: pessoa.id, expira }),
  ).toString("base64url");
  const chave = crypto.createHash("sha256").update(pessoa.senhaHash).digest();
  const assinatura = crypto
    .createHmac("sha256", chave)
    .update(payload)
    .digest("base64url");
  return `${payload}.${assinatura}`;
}

function tokenFotoValido(pessoa, token) {
  try {
    if (typeof token !== "string") return false;
    const partes = token.split(".");
    if (partes.length !== 2) return false;

    const chave = crypto.createHash("sha256").update(pessoa.senhaHash).digest();
    const assinaturaEsperada = crypto
      .createHmac("sha256", chave)
      .update(partes[0])
      .digest();
    const assinaturaRecebida = Buffer.from(partes[1], "base64url");
    if (assinaturaRecebida.length !== assinaturaEsperada.length) return false;
    if (!crypto.timingSafeEqual(assinaturaRecebida, assinaturaEsperada))
      return false;

    const dados = JSON.parse(
      Buffer.from(partes[0], "base64url").toString("utf8"),
    );
    const agora = Date.now();
    return (
      dados.id === pessoa.id &&
      Number.isSafeInteger(dados.expira) &&
      dados.expira > agora &&
      dados.expira <= agora + PHOTO_TOKEN_TTL_MS
    );
  } catch {
    return false;
  }
}

function localizarFotoPrivada(pessoa) {
  const nome = path.basename(String(pessoa.foto || "").replace(/\\/g, "/"));
  if (!/\.(?:jpe?g|png|webp)$/i.test(nome)) return null;

  const nomeOtimizado = nome.replace(/\.(?:jpe?g)$/i, ".webp");
  const raizesPermitidas = [PRIVATE_PHOTOS_DIR, FRONTEND_HOMENAGENS_DIR].map(
    (diretorio) => `${diretorio}${path.sep}`,
  );
  const candidatos = [
    path.join(PRIVATE_PHOTOS_DIR, "optimized", nomeOtimizado),
    path.join(PRIVATE_PHOTOS_DIR, "original", nome),
    path.join(FRONTEND_HOMENAGENS_DIR, nome),
  ];

  for (const candidato of candidatos) {
    if (!fs.existsSync(candidato)) continue;
    try {
      const real = fs.realpathSync(candidato);
      if (
        raizesPermitidas.some((raiz) => real.startsWith(raiz)) &&
        fs.statSync(real).isFile()
      ) {
        return real;
      }
    } catch {
      // Ignora arquivos ausentes ou inválidos e tenta o original em seguida.
    }
  }
  return null;
}

app.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

// A listagem pública contém apenas identidade e identificador — nunca fotos ou mensagens.
app.get("/api/homenagens", (_req, res) => {
  const nomesPublicos = carregarHomenagens().map((pessoa) => ({
    id: pessoa.id,
    nome: pessoa.nome,
  }));
  res.json(nomesPublicos);
});

// Cartas públicas do 3DM: somente os campos consentidos são publicados.
app.get("/api/cartas-3dm", (_req, res) => {
  const cartas = carregarCartas()
    .filter((carta) => carta.publicada === true)
    .sort((a, b) => String(b.criadaEm).localeCompare(String(a.criadaEm)))
    .slice(0, 100)
    .map(({ id, nome, categoria, mensagem, criadaEm }) => ({
      id,
      nome,
      categoria,
      mensagem,
      criadaEm,
    }));
  res.json(cartas);
});

app.post("/api/cartas-3dm", (req, res) => {
  if (!podeEnviarCarta(req)) {
    res.setHeader("Retry-After", "900");
    return res
      .status(429)
      .json({
        erro: "Muitas cartas enviadas. Aguarde um pouco e tente novamente.",
      });
  }

  const nome =
    typeof req.body?.nome === "string" ? req.body.nome.trim().slice(0, 80) : "";
  const mensagem =
    typeof req.body?.mensagem === "string"
      ? req.body.mensagem.trim().slice(0, 1200)
      : "";
  const categoriasPermitidas = new Set([
    "Aluno",
    "Professor",
    "Amigo",
    "Família",
    "Outro",
  ]);
  const categoria = categoriasPermitidas.has(req.body?.categoria)
    ? req.body.categoria
    : "Outro";
  if (
    !mensagem ||
    mensagem.length < 2 ||
    req.body?.consentimentoPublico !== true
  ) {
    return res
      .status(400)
      .json({
        erro: "Escreva uma mensagem e confirme que ela pode ser publicada.",
      });
  }

  const carta = {
    id: crypto.randomUUID(),
    nome: nome || "Alguém da nossa história",
    categoria,
    mensagem,
    criadaEm: new Date().toISOString(),
    publicada: false,
    revisadaEm: null,
  };
  try {
    const cartas = carregarCartas();
    cartas.push(carta);
    salvarCartas(cartas.slice(-500));
    return res
      .status(201)
      .json({
        id: carta.id,
        nome: carta.nome,
        categoria: carta.categoria,
        mensagem: carta.mensagem,
        criadaEm: carta.criadaEm,
        publicada: false,
      });
  } catch (erro) {
    console.error("Não foi possível salvar carta do 3DM", erro);
    return res
      .status(500)
      .json({ erro: "Não foi possível guardar a carta agora." });
  }
});

// Painel privado: só funciona quando ADMIN_CARTAS_TOKEN está configurado no servidor.
app.get("/api/admin/cartas-3dm", exigirAdmin, (_req, res) => {
  const cartas = carregarCartas()
    .sort((a, b) => String(b.criadaEm).localeCompare(String(a.criadaEm)))
    .slice(0, 500);
  res.json(cartas);
});

app.patch("/api/admin/cartas-3dm/:id", exigirAdmin, (req, res) => {
  const cartas = carregarCartas();
  const carta = cartas.find((item) => item.id === req.params.id);
  if (!carta) return res.status(404).json({ erro: "Carta não encontrada." });
  if (typeof req.body?.publicada === "boolean")
    carta.publicada = req.body.publicada;
  carta.revisadaEm = new Date().toISOString();
  salvarCartas(cartas);
  return res.json(carta);
});

app.delete("/api/admin/cartas-3dm/:id", exigirAdmin, (req, res) => {
  const cartas = carregarCartas();
  const restantes = cartas.filter((item) => item.id !== req.params.id);
  if (restantes.length === cartas.length)
    return res.status(404).json({ erro: "Carta não encontrada." });
  salvarCartas(restantes);
  return res.status(204).end();
});

// A URL da foto só é emitida depois da senha correta e expira em 15 minutos.
app.get("/api/homenagens/:id/foto", (req, res) => {
  const pessoa = carregarHomenagens().find((item) => item.id === req.params.id);
  if (!pessoa || !tokenFotoValido(pessoa, req.query.token)) {
    return res.status(404).json({ erro: "Foto não encontrada." });
  }

  const arquivo = localizarFotoPrivada(pessoa);
  if (!arquivo) return res.status(404).json({ erro: "Foto não encontrada." });

  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("Referrer-Policy", "no-referrer");
  return res.sendFile(arquivo);
});

// A mensagem, legenda e URL de foto são devolvidas somente após validação.
app.post("/api/homenagens/:id", (req, res) => {
  const { id } = req.params;
  const pessoa = carregarHomenagens().find((item) => item.id === id);
  if (!pessoa)
    return res.status(404).json({ erro: "Homenagem não encontrada." });

  const chave = chaveTentativa(req, id);
  const { registro, espera } = obterTentativa(chave);
  if (espera > 0) {
    res.setHeader("Retry-After", String(Math.max(1, Math.ceil(espera / 1000))));
    return res
      .status(429)
      .json({ erro: "Muitas tentativas. Aguarde e tente novamente." });
  }

  const senha = typeof req.body?.senha === "string" ? req.body.senha : "";
  if (senha.length > 256 || !verificarSenha(senha, pessoa.senhaHash)) {
    registrarFalha(chave, registro);
    return res.status(401).json({ erro: "Senha incorreta." });
  }

  passwordAttempts.delete(chave);
  const fotoUrl =
    pessoa.foto && localizarFotoPrivada(pessoa)
      ? `/api/homenagens/${encodeURIComponent(id)}/foto?token=${encodeURIComponent(criarTokenFoto(pessoa))}`
      : null;

  return res.json({
    nome: pessoa.nome,
    fotoUrl,
    mensagem: pessoa.mensagem,
    legenda: pessoa.legenda,
    frase: pessoa.frase,
  });
});

// As fotos das cartas não podem ser abertas diretamente por /img/homenagens.
// Elas só saem pelo endpoint protegido acima, depois da validação da senha.
app.use("/img/homenagens", (_req, res) =>
  res.status(404).send("Não encontrado."),
);

// Só a pasta pública restante do site é estática. Dados e fotos pessoais ficam protegidos.
app.use(express.static(FRONTEND_DIR, { etag: true, index: "index.html" }));

app.listen(PORT, "0.0.0.0", () => {
  console.log(`3DM — O que fica disponível na porta ${PORT}`);
});
