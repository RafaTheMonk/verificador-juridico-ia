/**
 * Normaliza metadados de processo a partir de diferentes fontes
 * (Datajud / SCON) para um formato único consumido pela camada de adequação.
 */

import { flagsFromMovimentos, inferirDispositivo } from "./tpuFlags.js";

/**
 * @typedef {Object} ConteudoProcesso
 * @property {string|null} assuntoReal   - assunto(s) CNJ concatenados
 * @property {string[]}    assuntos      - lista de assuntos por nome
 * @property {string|null} dispositivo   - PROVIDO | IMPROVIDO | NAO_CONHECIDO | EXTINTO_SEM_MERITO | null
 * @property {"primeiro"|"superior"|"segundo"|null} grau
 * @property {string|null} tribunal
 * @property {string|null} orgaoJulgador
 * @property {string|null} relator
 * @property {string|null} dataJulgamento
 * @property {string[]}    flags
 * @property {string|null} ementa
 */

function mapearGrau(grauDatajud) {
  if (!grauDatajud) return null;
  const g = String(grauDatajud).toUpperCase();
  if (g === "G1" || g === "1") return "primeiro";
  if (g === "G2" || g === "2") return "segundo";
  if (g === "GS" || g === "S") return "superior";
  return null;
}

export function extrairDoDatajud(doc, parseResult) {
  if (!doc) return null;

  const assuntos = (doc.assuntos || []).map((a) => a.nome).filter(Boolean);
  const { flags: tpuFlagsList, detalhes } = flagsFromMovimentos(doc.movimentos);

  const dispositivo = inferirDispositivo(tpuFlagsList);
  const grau = mapearGrau(doc.grau);

  // Heurística adicional: processos com vara != 0000 são 1º grau
  const ehPrimeiroGrau = parseResult?.componentes?.vara && parseResult.componentes.vara !== "0000";
  const grauFinal = grau || (ehPrimeiroGrau ? "primeiro" : null);

  return {
    assuntoReal: assuntos.length ? assuntos.join(" | ") : null,
    assuntos,
    dispositivo,
    grau: grauFinal,
    tribunal: doc.tribunal || parseResult?.tribunalInferido || null,
    orgaoJulgador: doc.orgaoJulgador?.nome || null,
    relator: null, // Datajud público raramente expõe relator - viria do SCON
    dataJulgamento: doc.dataAjuizamento || null,
    dataAjuizamento: doc.dataAjuizamento || null,
    numeroProcesso: doc.numeroProcesso || null,
    flags: tpuFlagsList,
    tpuDetalhes: detalhes,
    ementa: null,
    fonte: "Datajud (CNJ)",
  };
}

export function extrairDoScon(resultadoScon, parseResult) {
  if (!resultadoScon || !resultadoScon.resultados?.length) return null;

  // Pega o primeiro (mais relevante) - o SCON já ordena por relevância
  const r = resultadoScon.resultados[0];

  const flags = [];
  if (r.acordao && /n[aã]o\s+conhec/i.test(r.acordao)) flags.push("NAO_CONHECIDO");
  if (r.acordao && /prejudicad/i.test(r.acordao)) flags.push("PREJUDICADO");
  if (r.acordao && /s[uú]mula\s*282/i.test(r.acordao)) flags.push("SUMULA_282");
  if (r.acordao && /s[uú]mula\s*356/i.test(r.acordao)) flags.push("SUMULA_356");
  if (r.ementa) {
    if (/previd[eê]ncia\s+privada/i.test(r.ementa)) flags.push("TEMA_PREVIDENCIA_PRIVADA");
    if (/taxa\s+de\s+conveni[eê]ncia/i.test(r.ementa)) flags.push("TEMA_TAXA_CONVENIENCIA");
  }

  return {
    assuntoReal: r.classe || r.ementa?.slice(0, 180) || null,
    assuntos: r.classe ? [r.classe] : [],
    dispositivo: flags.includes("NAO_CONHECIDO") ? "NAO_CONHECIDO" : null,
    grau: "superior",
    tribunal: "STJ",
    orgaoJulgador: r.orgao || null,
    relator: r.relator || null,
    dataJulgamento: r.dataJulg || null,
    dataPublicacao: r.dataPub || null,
    numeroProcesso: r.processo || parseResult?.referenciaNormalizada || null,
    flags,
    ementa: r.ementa || null,
    fonte: "STJ SCON",
  };
}
