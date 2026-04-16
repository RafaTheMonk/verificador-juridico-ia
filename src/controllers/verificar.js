/**
 * Controller — POST /verificar
 *
 * Responsabilidades:
 *  - CORS
 *  - Validação superficial do body (campos obrigatórios)
 *  - Delegação para o service
 *  - Formatação da resposta HTTP
 *
 * Compatível com Vercel (res.status/json) e node:http puro (res.writeHead/end).
 */

import { verificar } from "../services/verifier.js";

export default async function verificarController(req, res) {
  setCors(res);

  if (req.method === "OPTIONS") return sendJson(res, 204, null);

  if (req.method !== "POST") {
    return sendJson(res, 405, {
      ok: false,
      error: "Use POST para este endpoint.",
      curl: `curl -X POST /verificar -H "Content-Type: application/json" -d '{"referencia":"REsp 1.810.170/RS","contexto":"..."}'`,
    });
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body ?? {});
    const resultado = await verificar({ referencia: body.referencia, contexto: body.contexto });
    return sendJson(res, 200, resultado);
  } catch (err) {
    console.error("[/verificar]", err.message);
    return sendJson(res, 400, { ok: false, error: err.message });
  }
}

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function sendJson(res, status, data) {
  if (status === 204) {
    if (typeof res.status === "function") return res.status(204).end();
    res.writeHead(204);
    return res.end();
  }
  if (typeof res.status === "function") return res.status(status).json(data);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}
