/**
 * Cliente STJ SCON — sem dependências externas (sem cheerio).
 *
 * O SCON não tem API oficial; fazemos scraping do HTML com regex e
 * manipulação de string pura.
 *
 * URL base: https://scon.stj.jus.br/SCON/pesquisar.jsp
 *   b=ACOR   → acórdãos
 *   numero=  → número do processo (só dígitos)
 */

import { httpRequest } from "../utils/httpClient.js";

const BASE = "https://scon.stj.jus.br/SCON/pesquisar.jsp";

function montarUrl(numero) {
  const p = new URLSearchParams({ b: "ACOR", livre: numero, numero });
  return `${BASE}?${p.toString()}`;
}

/**
 * Converte HTML em texto plano, removendo tags, scripts, estilos e entidades HTML.
 */
function htmlToText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#?\w+;/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Extrai blocos de resultado do HTML do SCON usando regex.
 * Replica a lógica anterior que usava cheerio, sem o overhead do parser DOM.
 */
function extrairAcordaosHTML(html) {
  const textoPagina = htmlToText(html);

  const temResultadoVisivel =
    !/nenhum documento encontrado/i.test(textoPagina) &&
    !/nenhum resultado foi encontrado/i.test(textoPagina);

  const resultados = [];

  // Encontra elementos com as classes usadas pelo SCON para cada resultado
  // Regex tolerante: captura conteúdo de <div> ou <tr> que contenham essas classes
  const blocoRe =
    /<(?:div|tr)[^>]*class="[^"]*(?:documento|paragrafoBRS|listaAcordaos)[^"]*"[^>]*>([\s\S]*?)(?=<(?:div|tr)[^>]*class="[^"]*(?:documento|paragrafoBRS|listaAcordaos)|<\/(?:table|body)|$)/gi;

  let m;
  while ((m = blocoRe.exec(html)) !== null) {
    const bloco = htmlToText(m[1]);
    if (!bloco || bloco.length < 30) continue;

    const extrair = (rotulo) => {
      const rx = new RegExp(
        `${rotulo}\\s*:?\\s*([^\\n]+?)(?=\\s{2,}|$|Relator|Ementa|Data|Processo|Órg|Classe)`,
        "i"
      );
      return bloco.match(rx)?.[1]?.trim() ?? null;
    };

    resultados.push({
      processo: extrair("Processo"),
      classe: extrair("Classe"),
      relator: extrair("Relator"),
      orgao: extrair("Órgão Julgador") ?? extrair("Orgao Julgador"),
      dataJulg: extrair("Data do Julgamento"),
      dataPub: extrair("Data da Publicação"),
      ementa: bloco.match(/Ementa\s*:?\s*([\s\S]{30,2000}?)(?=Acórd|Decis|$)/i)?.[1]?.trim() ?? null,
      acordao: bloco.match(/Acórdão\s*:?\s*([\s\S]{20,1000}?)(?=Ementa|$)/i)?.[1]?.trim() ?? null,
      raw: bloco.slice(0, 1500),
    });
  }

  return { resultados, temResultadoVisivel, textoPagina: textoPagina.slice(0, 4000) };
}

/**
 * Consulta o SCON por número de REsp/AREsp/HC etc.
 * @param {string} numero - apenas dígitos
 */
export async function buscarAcordaoPorNumero(numero) {
  const numeroLimpo = String(numero).replace(/\D/g, "");
  if (!numeroLimpo) throw new Error("SCON: número vazio");

  const url = montarUrl(numeroLimpo);

  const res = await httpRequest(url, {
    method: "GET",
    headers: {
      "User-Agent": "Mozilla/5.0 (VerificadorJuridicoIA/0.1; contato github.com)",
      Accept: "text/html",
    },
  });

  if (!res.ok) {
    return { encontrado: false, resultados: [], url, raw: res.text, erro: `HTTP ${res.status}` };
  }

  const { resultados, temResultadoVisivel, textoPagina } = extrairAcordaosHTML(res.text);

  return {
    encontrado: resultados.length > 0,
    paginaComConteudo: temResultadoVisivel,
    resultados,
    url,
    raw: textoPagina,
  };
}
