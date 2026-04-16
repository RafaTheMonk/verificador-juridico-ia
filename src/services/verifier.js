/**
 * Service — orquestrador principal da pipeline.
 *
 * Fluxo:
 *   L0 parse → decide fonte → L1 existência → L2 conteúdo → L3 adequação → recomendação → auditoria
 */

import { parseReferencia } from "../parser/index.js";
import { buscarProcessoPorNumero } from "../existence/datajudClient.js";
import { buscarAcordaoPorNumero } from "../existence/sconClient.js";
import { extrairDoDatajud, extrairDoScon } from "../content/metadataExtractor.js";
import { avaliarAdequacaoCompleta } from "../adequacy/index.js";
import { recomendar } from "../recommendation/engine.js";
import { criarRegistro, persistirRegistro } from "../audit/auditTrail.js";

// Cache em memória simples (invalida a cada cold start em serverless — comportamento correto)
const cache = new Map();
const CACHE_MAX = 200;

function cacheKey(parse) {
  return `${parse.tipo}:${parse.referenciaNormalizada}`;
}

function cachePut(k, v) {
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value);
  cache.set(k, { v, at: Date.now() });
}

export async function verificar({ referencia, contexto }) {
  if (!referencia || typeof referencia !== "string") {
    throw new Error("Campo 'referencia' é obrigatório e deve ser string.");
  }
  if (!contexto || typeof contexto !== "string") {
    throw new Error("Campo 'contexto' é obrigatório e deve ser string.");
  }

  // =========================================================================
  // L0 — Parsing local
  // =========================================================================
  const parse = parseReferencia(referencia);
  const dvInvalido = parse.dv && parse.dv.valido === false;

  // =========================================================================
  // L1 — Existência (+ L2 conteúdo na mesma chamada quando possível)
  // =========================================================================
  const existencia = {
    status: "DESCONHECIDO",
    numero_real: null,
    fonte: null,
    url_fonte: null,
    flags: [],
  };

  let conteudo = null;
  const ck = cacheKey(parse);
  const cached = cache.get(ck);

  if (dvInvalido) {
    existencia.status = "FORMATO_INVALIDO";
    existencia.fonte = "local";
    existencia.flags.push(...parse.flags);
  } else if (cached) {
    Object.assign(existencia, cached.v.existencia);
    conteudo = cached.v.conteudo;
  } else if (parse.tipo === "CNJ" && parse.siglaDatajud) {
    try {
      const r = await buscarProcessoPorNumero(parse.siglaDatajud, parse.referenciaNormalizada);
      if (r.encontrado) {
        conteudo = extrairDoDatajud(r.doc, parse);
        existencia.status = "ENCONTRADO";
        existencia.numero_real = conteudo?.numeroProcesso || parse.referenciaNormalizada;
        existencia.fonte = "Datajud (CNJ)";
        existencia.url_fonte = r.url;
      } else {
        existencia.status = "NAO_ENCONTRADO";
        existencia.fonte = "Datajud (CNJ)";
        existencia.url_fonte = r.url;
        existencia.flags.push("NAO_LOCALIZADO_DATAJUD");
      }
    } catch (e) {
      existencia.status = "ERRO_FONTE";
      existencia.fonte = "Datajud (CNJ)";
      existencia.flags.push(`ERRO: ${e.message}`);
    }
  } else if (parse.tipo === "TRIBUNAL_SUPERIOR" && parse.tribunalInferido === "STJ") {
    try {
      const r = await buscarAcordaoPorNumero(parse.recurso.numero);
      existencia.fonte = "STJ SCON";
      existencia.url_fonte = r.url;

      if (r.encontrado) {
        conteudo = extrairDoScon(r, parse);

        const ufCitada = parse.recurso.uf;
        const ufReal = (() => {
          const raw = r.resultados?.[0]?.raw || "";
          const m = raw.match(/\/([A-Z]{2})\b/);
          return m ? m[1] : null;
        })();

        if (ufCitada && ufReal && ufCitada !== ufReal) {
          existencia.status = "EXISTE_COM_DIVERGENCIA";
          existencia.numero_real = `${parse.recurso.sigla} ${parse.recurso.numero}/${ufReal}`;
          existencia.flags.push(`UF_DIVERGENTE: citado ${ufCitada}, real ${ufReal}`);
        } else {
          existencia.status = "ENCONTRADO";
          existencia.numero_real = parse.referenciaNormalizada;
        }
      } else if (r.bloqueadoCloudflare || r.erroScraping) {
        // SCON bloqueado — tenta Datajud STJ como fallback (doc: Camada 1, fonte alternativa)
        existencia.flags.push(r.bloqueadoCloudflare
          ? "SCON_CLOUDFLARE: tentando Datajud STJ como fallback"
          : "SCON_HTML_MUDOU: tentando Datajud STJ como fallback");
        try {
          const dj = await buscarProcessoPorNumero("stj", parse.recurso.numero);
          if (dj.encontrado) {
            conteudo = extrairDoDatajud(dj.doc, parse);
            existencia.status = "ENCONTRADO";
            existencia.numero_real = dj.doc?.numeroProcesso || parse.referenciaNormalizada;
            existencia.fonte = "Datajud (STJ) — via fallback";
            existencia.url_fonte = dj.url;
          } else if (dj.erro) {
            // Datajud retornou erro HTTP (429, 5xx) — não é "não existe", é falha de infra
            existencia.status = "ERRO_SCRAPING";
            existencia.fonte = "STJ SCON + Datajud (STJ)";
            existencia.flags.push(`AMBAS_FONTES_INDISPONIVEIS: SCON=Cloudflare, Datajud=${dj.erro}`);
          } else {
            existencia.status = "NAO_ENCONTRADO";
            existencia.fonte = "STJ SCON + Datajud (STJ)";
            existencia.flags.push("NAO_LOCALIZADO_EM_NENHUMA_FONTE");
          }
        } catch (djErr) {
          existencia.status = "ERRO_SCRAPING";
          existencia.flags.push(`CLOUDFLARE_BLOQUEOU_SCON + DATAJUD_ERRO: ${djErr.message}`);
        }
      } else {
        existencia.status = "NAO_ENCONTRADO";
      }
    } catch (e) {
      existencia.status = "ERRO_FONTE";
      existencia.fonte = "STJ SCON";
      existencia.flags.push(`ERRO: ${e.message}`);
    }
  } else {
    existencia.status = "FONTE_NAO_COBERTA";
    existencia.flags.push(
      `Tipo ${parse.tipo} / tribunal ${parse.tribunalInferido || "?"} sem cobertura na Camada 1.`
    );
  }

  for (const f of parse.flags) if (!existencia.flags.includes(f)) existencia.flags.push(f);

  // =========================================================================
  // L3 — Adequação contextual
  // =========================================================================
  const adequacao = await avaliarAdequacaoCompleta({
    contexto,
    conteudo,
    parseResult: parse,
    existencia,
  });

  // =========================================================================
  // Recomendação final
  // =========================================================================
  const rec = recomendar({ existencia, conteudo, adequacao, parseResult: parse });

  // =========================================================================
  // Auditoria
  // =========================================================================
  const auditoria = criarRegistro({ referencia, parse, existencia, conteudo, adequacao, rec });
  persistirRegistro(auditoria);

  if (existencia.status !== "ERRO_FONTE") {
    cachePut(ck, { existencia, conteudo });
  }

  return {
    referencia_normalizada: parse.referenciaNormalizada,
    tribunal_inferido: parse.tribunalInferido,

    existencia: {
      status: existencia.status,
      numero_real: existencia.numero_real,
      fonte: existencia.fonte,
      url_fonte: existencia.url_fonte,
      flags: existencia.flags,
    },

    conteudo: {
      assunto_real: conteudo?.assuntoReal || null,
      dispositivo: conteudo?.dispositivo || "DESCONHECIDO",
      grau: conteudo?.grau || null,
      tema_repetitivo: null,
      flags: conteudo?.flags || [],
    },

    adequacao: {
      tese_inferida_na_peticao: adequacao.tese_inferida_na_peticao,
      adequacao_tematica: adequacao.adequacao_tematica,
      adequacao_dispositivo: adequacao.adequacao_dispositivo,
      peso_precedencial: adequacao.peso_precedencial,
      justificativa: adequacao.justificativa,
    },

    recomendacao: rec.recomendacao,
    nivel_urgencia: rec.nivel_urgencia,

    _meta: {
      metodo_adequacao: adequacao.metodo,
      motivos: rec.motivos,
      parser: { tipo: parse.tipo, flags: parse.flags, dv: parse.dv },
    },

    _auditoria: auditoria,
  };
}
