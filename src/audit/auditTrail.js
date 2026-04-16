/**
 * Trilha de auditoria para verificações jurídicas.
 *
 * Cada verificação gera um registro com:
 *   - id único
 *   - snapshot dos metadados reais capturados da fonte oficial (url, assunto, dispositivo, etc.)
 *   - resultado consolidado (existência, recomendação)
 *   - timestamp
 *
 * Persistência: arquivo JSONL (uma linha = um registro) em:
 *   - Vercel / produção:   /tmp/verificador-auditoria/auditoria.jsonl
 *   - Dev local:           data/auditoria/auditoria.jsonl  (na raiz do projeto)
 *
 * O registro também é retornado na resposta da API sob a chave `_auditoria`,
 * para que o chamador possa armazená-lo no seu próprio sistema se necessário.
 *
 * A persistência é síncrona e nunca propaga erros — uma falha de I/O não
 * deve bloquear a resposta ao usuário.
 */

import { randomUUID } from "node:crypto";
import { appendFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// Diretório de auditoria: gravável em ambos os ambientes
const DEFAULT_DIR = process.env.VERCEL
  ? "/tmp/verificador-auditoria"
  : join(dirname(fileURLToPath(import.meta.url)), "../../data/auditoria");

export const AUDIT_DIR = process.env.AUDIT_DIR || DEFAULT_DIR;

/**
 * Monta o registro de auditoria a partir dos dados já calculados pelo verifier.
 *
 * @param {Object} params
 * @param {string}  params.referencia    - referência original enviada pelo usuário
 * @param {Object}  params.parse         - resultado do parser (L0)
 * @param {Object}  params.existencia    - resultado da camada de existência (L1)
 * @param {Object|null} params.conteudo  - metadados extraídos (L2), ou null se não encontrado
 * @param {Object}  params.adequacao     - resultado da adequação (L3)
 * @param {Object}  params.rec           - recomendação final
 * @returns {Object} registro de auditoria
 */
export function criarRegistro({ referencia, parse, existencia, conteudo, adequacao, rec }) {
  const agora = new Date().toISOString();

  // Snapshot da evidência: só preenchido quando temos URL de fonte oficial
  const evidencia = existencia.url_fonte
    ? {
        fonte: existencia.fonte,
        url_fonte: existencia.url_fonte,
        snapshot_metadados: {
          numero_real: existencia.numero_real || null,
          assunto_real: conteudo?.assuntoReal || null,
          classe_processual: conteudo?.classeProcessual || null,
          dispositivo: conteudo?.dispositivo || null,
          grau: conteudo?.grau || null,
          orgao_julgador: conteudo?.orgaoJulgador || null,
          relator: conteudo?.relator || null,
          data_julgamento: conteudo?.dataJulgamento || null,
          flags_existencia: existencia.flags || [],
          flags_conteudo: conteudo?.flags || [],
        },
        timestamp_captura: agora,
      }
    : null;

  return {
    id: randomUUID(),
    timestamp_verificacao: agora,
    referencia_verificada: referencia,
    referencia_normalizada: parse.referenciaNormalizada,
    tribunal_inferido: parse.tribunalInferido,
    evidencia,
    resultado: {
      existencia_status: existencia.status,
      tese_inferida: adequacao.tese_inferida_na_peticao || null,
      adequacao_tematica: adequacao.adequacao_tematica || null,
      recomendacao: rec.recomendacao,
      nivel_urgencia: rec.nivel_urgencia,
      motivos: rec.motivos,
    },
  };
}

/**
 * Persiste o registro em disco (JSONL).
 * Síncrono para garantir a escrita antes da resposta ser enviada.
 * Erros de I/O são apenas logados — nunca propagados.
 */
export function persistirRegistro(registro) {
  try {
    mkdirSync(AUDIT_DIR, { recursive: true });
    const file = join(AUDIT_DIR, "auditoria.jsonl");
    appendFileSync(file, JSON.stringify(registro) + "\n", "utf-8");
  } catch (e) {
    console.warn("[auditoria] falha ao persistir:", e.message);
  }
}
