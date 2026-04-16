/**
 * Servidor Express para desenvolvimento local.
 * Em produção na Vercel, cada arquivo em api/*.js é uma função serverless
 * independente e este arquivo não é utilizado.
 */

import "dotenv/config";
import path from "path";
import { fileURLToPath } from "url";
import express from "express";
import verificarHandler from "./api/verificar.js";
import healthHandler from "./api/health.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "public")));

app.get("/health", (req, res) => healthHandler(req, res));
app.post("/verificar", (req, res) => verificarHandler(req, res));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Verificador Jurídico rodando em http://localhost:${PORT}`);
  console.log(`   Interface:  http://localhost:${PORT}`);
  console.log(`   POST        http://localhost:${PORT}/verificar`);
});
