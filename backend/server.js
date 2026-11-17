const crypto = require("node:crypto");
const express = require("express");
const { Pool } = require("pg");
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
const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      max: 5,
      idleTimeoutMillis: 30000,
    })
  : null;

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

function cartaDoBanco(row) {
  return {
    id: row.id,
    nome: row.nome,
    categoria: row.categoria,
    mensagem: row.mensagem,
    criadaEm:
      row.criada_em instanceof Date
        ? row.criada_em.toISOString()
        : row.criada_em,
    publicada: row.publicada,
    revisadaEm:
      row.revisada_em instanceof Date
        ? row.revisada_em.toISOString()
        : row.revisada_em,
  };
}

async function prepararBanco() {
  if (!pool) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS cartas_3dm (
      id TEXT PRIMARY KEY,
      nome VARCHAR(80) NOT NULL,
      categoria VARCHAR(30) NOT NULL,
      mensagem VARCHAR(1200) NOT NULL,
      criada_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      publicada BOOLEAN NOT NULL DEFAULT FALSE,
      revisada_em TIMESTAMPTZ
    )
  `);

  const { rows } = await pool.query(
    "SELECT COUNT(*)::int AS total FROM cartas_3dm",
  );
  if (rows[0].total !== 0) return;
  for (const carta of carregarCartas()) {
    await pool.query(
      `INSERT INTO cartas_3dm (id, nome, categoria, mensagem, criada_em, publicada, revisada_em)
       VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (id) DO NOTHING`,
      [
        carta.id,
        carta.nome,
        carta.categoria,
        carta.mensagem,
        carta.criadaEm,
        carta.publicada === true,
        carta.revisadaEm || null,
      ],
    );
  }
}

async function listarCartas() {
  if (!pool) return carregarCartas();
  const { rows } = await pool.query(
    "SELECT id, nome, categoria, mensagem, criada_em, publicada, revisada_em FROM cartas_3dm ORDER BY criada_em DESC LIMIT 500",
  );
  return rows.map(cartaDoBanco);
}

async function inserirCarta(carta) {
  if (!pool) {
    const cartas = carregarCartas();
    cartas.push(carta);
    salvarCartas(cartas.slice(-500));
    return;
  }
  await pool.query(
    `INSERT INTO cartas_3dm (id, nome, categoria, mensagem, criada_em, publicada, revisada_em)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      carta.id,
      carta.nome,
      carta.categoria,
      carta.mensagem,
      carta.criadaEm,
      carta.publicada,
      carta.revisadaEm,
    ],
  );
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
app.get("/api/cartas-3dm", async (_req, res) => {
  try {
    const cartas = (await listarCartas())
      .filter((carta) => carta.publicada === true)
      .slice(0, 100)
      .map(({ id, nome, categoria, mensagem, criadaEm }) => ({
        id,
        nome,
        categoria,
        mensagem,
        criadaEm,
      }));
    return res.json(cartas);
  } catch (erro) {
    console.error("Não foi possível listar cartas públicas", erro);
    return res
      .status(500)
      .json({ erro: "Não foi possível carregar as cartas agora." });
  }
});

app.post("/api/cartas-3dm", async (req, res) => {
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
    await inserirCarta(carta);
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
app.get("/api/admin/cartas-3dm", exigirAdmin, async (_req, res) => {
  try {
    return res.json(await listarCartas());
  } catch (erro) {
    console.error("Não foi possível listar cartas administrativas", erro);
    return res
      .status(500)
      .json({ erro: "Não foi possível carregar o painel agora." });
  }
});

app.patch("/api/admin/cartas-3dm/:id", exigirAdmin, async (req, res) => {
  try {
    const publicada =
      typeof req.body?.publicada === "boolean" ? req.body.publicada : null;
    if (publicada === null)
      return res.status(400).json({ erro: "Informe o estado da publicação." });
    if (pool) {
      const resultado = await pool.query(
        "UPDATE cartas_3dm SET publicada = $1, revisada_em = NOW() WHERE id = $2 RETURNING id, nome, categoria, mensagem, criada_em, publicada, revisada_em",
        [publicada, req.params.id],
      );
      if (!resultado.rowCount)
        return res.status(404).json({ erro: "Carta não encontrada." });
      return res.json(cartaDoBanco(resultado.rows[0]));
    }
    const cartas = carregarCartas();
    const carta = cartas.find((item) => item.id === req.params.id);
    if (!carta) return res.status(404).json({ erro: "Carta não encontrada." });
    carta.publicada = publicada;
    carta.revisadaEm = new Date().toISOString();
    salvarCartas(cartas);
    return res.json(carta);
  } catch (erro) {
    console.error("Não foi possível revisar carta", erro);
    return res
      .status(500)
      .json({ erro: "Não foi possível atualizar a carta agora." });
  }
});

app.delete("/api/admin/cartas-3dm/:id", exigirAdmin, async (req, res) => {
  try {
    if (pool) {
      const resultado = await pool.query(
        "DELETE FROM cartas_3dm WHERE id = $1",
        [req.params.id],
      );
      if (!resultado.rowCount)
        return res.status(404).json({ erro: "Carta não encontrada." });
      return res.status(204).end();
    }
    const cartas = carregarCartas();
    const restantes = cartas.filter((item) => item.id !== req.params.id);
    if (restantes.length === cartas.length)
      return res.status(404).json({ erro: "Carta não encontrada." });
    salvarCartas(restantes);
    return res.status(204).end();
  } catch (erro) {
    console.error("Não foi possível apagar carta", erro);
    return res
      .status(500)
      .json({ erro: "Não foi possível apagar a carta agora." });
  }
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

async function iniciar() {
  await prepararBanco();
  app.listen(PORT, "0.0.0.0", () => {
    console.log(
      `3DM — O que fica disponível na porta ${PORT}${pool ? " (Neon PostgreSQL)" : " (arquivo local)"}`,
    );
  });
}

iniciar().catch((erro) => {
  console.error("Não foi possível iniciar o servidor", erro);
  process.exit(1);
});
