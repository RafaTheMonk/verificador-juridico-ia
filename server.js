/**
 * Servidor de desenvolvimento local — node:http puro, sem Express.
 * Em produção (Vercel), este arquivo não é usado: cada api/*.js é uma
 * função serverless independente.
 */

import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { loadEnv } from "./src/utils/envLoader.js";
import verificarController from "./src/controllers/verificar.js";
import healthController from "./src/controllers/health.js";

loadEnv();

const __dir = fileURLToPath(new URL(".", import.meta.url));
const PUBLIC_DIR = join(__dir, "public");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css":  "text/css; charset=utf-8",
  ".js":   "application/javascript; charset=utf-8",
  ".json": "application/json",
  ".svg":  "image/svg+xml",
  ".ico":  "image/x-icon",
  ".png":  "image/png",
};

// ─── Utilitários ─────────────────────────────────────────────────────────────

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => {
      try { req.body = data ? JSON.parse(data) : {}; resolve(); }
      catch { req.body = {}; resolve(); }
    });
    req.on("error", reject);
  });
}

function serveStatic(pathname, res) {
  const safe = pathname.replace(/\.\./g, "").split("?")[0] || "/";
  const filePath = resolve(join(PUBLIC_DIR, safe === "/" ? "index.html" : safe));

  if (!filePath.startsWith(PUBLIC_DIR) || !existsSync(filePath)) return false;

  const mime = MIME[extname(filePath)] || "application/octet-stream";
  res.writeHead(200, { "Content-Type": mime });
  res.end(readFileSync(filePath));
  return true;
}

// ─── Roteador ────────────────────────────────────────────────────────────────

const server = createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    return res.end();
  }

  const url = new URL(req.url, "http://localhost");

  try {
    if (url.pathname === "/verificar") {
      if (req.method === "POST") await parseBody(req);
      return verificarController(req, res);
    }

    if (url.pathname === "/health" || (url.pathname === "/" && req.method === "GET")) {
      return healthController(req, res);
    }

    // Arquivos estáticos (public/)
    if (!serveStatic(url.pathname, res)) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: "Não encontrado." }));
    }
  } catch (err) {
    console.error("[server]", err.message);
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: false, error: err.message }));
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`✅ Verificador Jurídico rodando em http://localhost:${PORT}`);
  console.log(`   Interface:  http://localhost:${PORT}`);
  console.log(`   POST        http://localhost:${PORT}/verificar`);
  console.log(`   GET         http://localhost:${PORT}/health`);
});
