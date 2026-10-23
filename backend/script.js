#!/usr/bin/env node
// Gera um hash scrypt compatível com backend/server.js.
// Uso: node script.js "senha da carta"

const crypto = require("node:crypto");

const senha = process.argv.slice(2).join(" ");

if (!senha) {
  console.error('Uso: node script.js "sua senha"');
  process.exit(1);
}

if (senha.length < 8 || senha.length > 256) {
  console.error("A senha deve ter entre 8 e 256 caracteres.");
  process.exit(1);
}

const salt = crypto.randomBytes(16);
const hash = crypto.scryptSync(senha, salt, 64, {
  N: 16384,
  r: 8,
  p: 1,
  maxmem: 64 * 1024 * 1024,
});

process.stdout.write(
  `scrypt-v1$${salt.toString("base64url")}$${hash.toString("base64url")}\n`,
);
