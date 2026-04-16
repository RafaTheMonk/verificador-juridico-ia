/**
 * Cliente do Datajud (CNJ) - API Pública Nacional.
 *
 * Documentação: https://datajud-wiki.cnj.jus.br
 * Endpoint padrão: https://api-publica.datajud.cnj.jus.br/api_publica_{sigla}/_search
 * Autenticação: header `Authorization: ApiKey {DATAJUD_API_KEY}`
 *               (a chave pública é fornecida pelo CNJ; não é segredo)
 *
 * Rate limit documentado: ~120 req/min. Respeitamos com retry exponencial.
 */

import { httpRequest } from "../util/httpClient.js";

const BASE = "https://api-publica.datajud.cnj.jus.br";
const PUBLIC_KEY_FALLBACK =
  "cDZHYzlZa0JadVREZDJCendQbXY6SkJlTzNjLV9TRENyQk1RdnFKZGRQdw==";

function authHeader() {
  const key = process.env.DATAJUD_API_KEY || PUBLIC_KEY_FALLBACK;
  return { Authorization: `ApiKey ${key}`, "Content-Type": "application/json" };
}

/**
 * Busca um processo pelo número no formato CNJ (NNNNNNN-DD.AAAA.J.TR.OOOO).
 * @param {string} sigla - sigla do tribunal no Datajud (ex: "tjma", "trf1", "stj")
 * @param {string} numeroProcesso - pode vir com ou sem separadores
 * @returns {Promise<{ encontrado: boolean, doc: Object|null, total: number, raw: any, url: string }>}
 */
export async function buscarProcessoPorNumero(sigla, numeroProcesso) {
  if (!sigla) throw new Error("Datajud: sigla do tribunal obrigatória");

  // Buscamos pelo número normalizado (com separadores CNJ) via match_phrase,
  // que respeita a tokenização do Elasticsearch. O fallback com dígitos puros
  // garante recall quando o número foi indexado em formato diferente.
  const numeroNormalizado = String(numeroProcesso).trim();
  const apenasDigitos = numeroNormalizado.replace(/\D/g, "");

  const url = `${BASE}/api_publica_${sigla}/_search`;

  const payload = {
    size: 5,
    query: {
      bool: {
        should: [
          { match_phrase: { numeroProcesso: numeroNormalizado } },
          { match: { numeroProcesso: apenasDigitos } },
        ],
        minimum_should_match: 1,
      },
    },
  };

  const res = await httpRequest(url, {
    method: "POST",
    headers: authHeader(),
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    return {
      encontrado: false, doc: null, total: 0, raw: res.json || res.text, url,
      erro: `HTTP ${res.status}`,
    };
  }

  const hits = res.json?.hits?.hits || [];
  const total = res.json?.hits?.total?.value ?? hits.length;
  const doc = hits[0]?._source || null;

  return { encontrado: hits.length > 0, doc, total, raw: res.json, url };
}

/**
 * Diagnóstico: tenta múltiplas siglas (útil quando o usuário cita um processo
 * e a sigla não foi determinada com certeza pelo parser — por ora apenas
 * exportamos para uso futuro em camada de fallback).
 */
export async function tentarSiglas(siglas, numeroProcesso) {
  for (const sigla of siglas) {
    try {
      const r = await buscarProcessoPorNumero(sigla, numeroProcesso);
      if (r.encontrado) return { ...r, siglaEncontrada: sigla };
    } catch (_) { /* tenta a próxima */ }
  }
  return { encontrado: false, doc: null, total: 0, raw: null, url: null };
}
