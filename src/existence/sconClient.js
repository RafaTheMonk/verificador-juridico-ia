/**
 * Cliente STJ SCON (Sistema de Consulta a Jurisprudência).
 *
 * SCON não tem API oficial pública, mas expõe páginas HTML estáveis com
 * ementa, classe, relator, data, UF. Fazemos scraping minimalista com
 * cheerio, extraindo apenas os campos necessários para as camadas seguintes.
 *
 * URL base: https://scon.stj.jus.br/SCON/pesquisar.jsp
 * Parâmetros úteis:
 *   b=ACOR       - busca em acórdãos (principal)
 *   b=DTXT       - busca em decisões monocráticas (complementar)
 *   numero=...   - número interno do REsp/AREsp/HC etc. (apenas dígitos)
 *
 * Alternativa mais completa (HTML dinâmico, evitamos):
 *   https://processo.stj.jus.br/processo/pesquisa/?num_registro=...
 */

import * as cheerio from "cheerio";
import { httpRequest } from "../util/httpClient.js";

const BASE = "https://scon.stj.jus.br/SCON/pesquisar.jsp";

function montarUrl(numero) {
  const params = new URLSearchParams({
    b: "ACOR",
    livre: numero,          // busca livre também captura variações
    numero: numero,          // casa contra o campo "Número Único"
  });
  return `${BASE}?${params.toString()}`;
}

/**
 * Extrai, do HTML de resultado, os blocos de acórdão. O SCON renderiza
 * cada resultado dentro de divs com classe "paragrafoBRS" / "documento".
 * Tolerante a pequenas mudanças: se a estrutura variar, retornamos o
 * texto bruto e a camada superior decide.
 */
function extrairAcordaosHTML(html) {
  const $ = cheerio.load(html);
  const resultados = [];

  // A página tradicional do SCON agrupa cada ocorrência em tabelas
  // com <tr> que contêm os campos Processo, Relator, Ementa, etc.
  const textoPagina = $("body").text().replace(/\s+/g, " ").trim();
  const temResultadoVisivel = !/nenhum documento encontrado/i.test(textoPagina)
    && !/nenhum resultado foi encontrado/i.test(textoPagina);

  // Heurística 1: blocos <div class="documento">
  $(".documento, .paragrafoBRS, .listaAcordaos tr").each((_, el) => {
    const bloco = $(el).text().replace(/\s+/g, " ").trim();
    if (!bloco) return;

    const extrair = (rotulo) => {
      const m = bloco.match(new RegExp(`${rotulo}\\s*:?\\s*([^\\n]+?)(?=\\s{2,}|$|Relator|Ementa|Data|Processo|Órg|Classe)`, "i"));
      return m ? m[1].trim() : null;
    };

    resultados.push({
      processo: extrair("Processo"),
      classe: extrair("Classe"),
      relator: extrair("Relator"),
      orgao: extrair("Órgão Julgador") || extrair("Orgao Julgador"),
      dataJulg: extrair("Data do Julgamento"),
      dataPub: extrair("Data da Publicação"),
      ementa: (bloco.match(/Ementa\s*:?\s*([\s\S]{30,2000}?)(?=Acórd|Decis|$)/i) || [])[1]?.trim() || null,
      acordao: (bloco.match(/Acórdão\s*:?\s*([\s\S]{20,1000}?)(?=Ementa|$)/i) || [])[1]?.trim() || null,
      raw: bloco.slice(0, 1500),
    });
  });

  return { resultados, temResultadoVisivel, textoPagina: textoPagina.slice(0, 4000) };
}

/**
 * Consulta o SCON por número de REsp/AREsp/HC etc.
 * @param {string} numero - apenas dígitos
 * @returns {Promise<{ encontrado: boolean, resultados: Array, url: string, raw: string }>}
 */
export async function buscarAcordaoPorNumero(numero) {
  const numeroLimpo = String(numero).replace(/\D/g, "");
  if (!numeroLimpo) throw new Error("SCON: número vazio");

  const url = montarUrl(numeroLimpo);

  const res = await httpRequest(url, {
    method: "GET",
    headers: {
      "User-Agent":
        "Mozilla/5.0 (VerificadorJuridicoIA/0.1; contato github.com)",
      Accept: "text/html",
    },
  });

  if (!res.ok) {
    return { encontrado: false, resultados: [], url, raw: res.text, erro: `HTTP ${res.status}` };
  }

  const { resultados, temResultadoVisivel, textoPagina } = extrairAcordaosHTML(res.text);

  return {
    encontrado: resultados.length > 0 || temResultadoVisivel,
    resultados,
    url,
    raw: textoPagina,
  };
}
