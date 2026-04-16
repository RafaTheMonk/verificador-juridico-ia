/**
 * Validação do dígito verificador CNJ (ISO 7064, módulo 97-10).
 *
 * Referência: Resolução CNJ nº 65/2008.
 * Padrão: NNNNNNN-DD.AAAA.J.TR.OOOO
 *
 * Algoritmo:
 *   base    = seq + ano + j + tr + vara  (string, sem separadores)
 *   calculo = 98 - ((BigInt(base) * 100) % 97)
 *   válido se calculo === DD
 *
 * Usamos BigInt porque o número base tem ~18 dígitos e estoura Number.
 */

/**
 * Calcula o dígito verificador esperado para os componentes do processo CNJ.
 * @param {Object} c
 * @param {string} c.seq  - 7 dígitos
 * @param {string} c.ano  - 4 dígitos
 * @param {string} c.j    - 1 dígito (segmento)
 * @param {string} c.tr   - 2 dígitos (tribunal)
 * @param {string} c.vara - 4 dígitos (origem/vara)
 * @returns {number} dígito verificador (00..99)
 */
export function calcularDV({ seq, ano, j, tr, vara }) {
  const base = `${seq}${ano}${j}${tr}${vara}`;
  const mod = (BigInt(base) * 100n) % 97n;
  return Number(98n - mod);
}

/**
 * Verifica se o DV informado bate com o calculado.
 * @param {Object} componentes - inclui dd (DV informado, 2 dígitos)
 * @returns {{ valido: boolean, dvCalculado: number, dvInformado: number }}
 */
export function validarDV(componentes) {
  const dvInformado = parseInt(componentes.dd, 10);
  const dvCalculado = calcularDV(componentes);
  return {
    valido: dvInformado === dvCalculado,
    dvCalculado,
    dvInformado,
  };
}
