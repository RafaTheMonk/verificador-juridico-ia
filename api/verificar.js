/**
 * Vercel serverless handler - POST /verificar
 *
 * Recebe { referencia, contexto } e devolve a resposta estruturada
 * em três dimensões (existencia, conteudo, adequacao) + recomendação.
 */

import { verificar } from "../src/verifier.js";

export default async function handler(req, res) {
  // CORS básico (para permitir teste via browsers / Postman)
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") {
    return res.status(405).json({
      ok: false,
      error: "Método não permitido. Use POST.",
    });
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
    const { referencia, contexto } = body;

    const resultado = await verificar({ referencia, contexto });
    return res.status(200).json(resultado);
  } catch (err) {
    console.error("[/verificar] erro:", err);
    return res.status(400).json({
      ok: false,
      error: err.message,
    });
  }
}
