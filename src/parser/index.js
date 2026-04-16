/**
 * Orquestrador da Camada 0 (parsing local).
 *
 * Decide qual parser usar e consolida o resultado num formato estável
 * consumido pelas camadas seguintes.
 */

import { parseCNJ } from "./cnjParser.js";
import { parseTribunalSuperior } from "./stjParser.js";

/**
 * @typedef {Object} ParseResult
 * @property {"CNJ"|"TRIBUNAL_SUPERIOR"|"DESCONHECIDO"} tipo
 * @property {string} referenciaOriginal
 * @property {string} referenciaNormalizada
 * @property {string|null} tribunalInferido
 * @property {string|null} siglaDatajud
 * @property {Object|null} componentes  - apenas para CNJ
 * @property {Object|null} recurso       - apenas para tribunais superiores
 * @property {{valido: boolean, dvCalculado: number, dvInformado: number}|null} dv
 * @property {string[]} flags
 */

export function parseReferencia(referencia) {
  const cnj = parseCNJ(referencia);
  if (cnj) return { ...cnj, dv: cnj.dv, recurso: null };

  const sup = parseTribunalSuperior(referencia);
  if (sup) return { ...sup, dv: null, componentes: null };

  return {
    tipo: "DESCONHECIDO",
    referenciaOriginal: referencia,
    referenciaNormalizada: String(referencia || "").trim(),
    tribunalInferido: null,
    siglaDatajud: null,
    componentes: null,
    recurso: null,
    dv: null,
    flags: ["FORMATO_NAO_RECONHECIDO"],
  };
}
