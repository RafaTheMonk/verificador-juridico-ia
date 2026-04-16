/**
 * Parser do padrão CNJ de numeração única (Resolução CNJ nº 65/2008).
 *
 * Formato:   NNNNNNN-DD.AAAA.J.TR.OOOO
 *   seq (7)  = sequencial do processo no ano/origem
 *   dd  (2)  = dígito verificador (ISO 7064 mod 97-10)
 *   aaaa(4)  = ano de ajuizamento
 *   j   (1)  = segmento do Poder Judiciário
 *   tr  (2)  = código do tribunal
 *   oooo(4)  = unidade de origem / vara (0000 = originário/2º grau)
 *
 * Segmentos (J):
 *   1 = STF          2 = CNJ           3 = STJ
 *   4 = Justiça Federal                5 = Justiça do Trabalho (TST + TRTs)
 *   6 = Justiça Eleitoral              7 = Justiça Militar da União
 *   8 = Justiça Estadual               9 = Justiça Militar Estadual
 */

import { validarDV } from "./dvValidator.js";

// Regex robusta: aceita variações de separadores comuns em petições
// (espaços, pontos, traços) e normaliza antes de extrair.
const CNJ_REGEX = /(\d{7})-?(\d{2})\.?(\d{4})\.?(\d)\.?(\d{2})\.?(\d{4})/;

// Mapa parcial (J=8 = Justiça Estadual). Outros segmentos podem ser
// preenchidos conforme necessário; não é crítico para a validação.
const TR_ESTADUAL = {
  "01": "TJAC", "02": "TJAL", "03": "TJAP", "04": "TJAM",
  "05": "TJBA", "06": "TJCE", "07": "TJDFT", "08": "TJES",
  "09": "TJGO", "10": "TJMA", "11": "TJMT", "12": "TJMS",
  "13": "TJMG", "14": "TJPA", "15": "TJPB", "16": "TJPR",
  "17": "TJPE", "18": "TJPI", "19": "TJRJ", "20": "TJRN",
  "21": "TJRS", "22": "TJRO", "23": "TJRR", "24": "TJSC",
  "25": "TJSP", "26": "TJSE", "27": "TJTO",
};

const TR_FEDERAL = {
  "01": "TRF1", "02": "TRF2", "03": "TRF3",
  "04": "TRF4", "05": "TRF5", "06": "TRF6",
};

function inferirTribunal(j, tr) {
  if (j === "8") return TR_ESTADUAL[tr] || `TJ?(${tr})`;
  if (j === "4") return TR_FEDERAL[tr] || `TRF?(${tr})`;
  if (j === "1") return "STF";
  if (j === "3") return "STJ";
  if (j === "5") return tr === "00" ? "TST" : `TRT${parseInt(tr, 10)}`;
  return `J${j}TR${tr}`;
}

/**
 * Mapeia tribunal inferido -> sigla usada nos endpoints Datajud.
 * Ex: "TJMA" -> "tjma" (endpoint: api_publica_tjma).
 */
export function siglaDatajud(tribunal) {
  if (!tribunal) return null;
  return tribunal.toLowerCase().replace(/\W/g, "");
}

/**
 * Tenta parsear uma referência no formato CNJ.
 * Retorna null se não casar com o regex.
 */
export function parseCNJ(referencia) {
  if (!referencia) return null;
  const match = referencia.match(CNJ_REGEX);
  if (!match) return null;

  const [raw, seq, dd, ano, j, tr, vara] = match;

  const tribunal = inferirTribunal(j, tr);
  const numeroLimpo = `${seq}-${dd}.${ano}.${j}.${tr}.${vara}`;

  const dvCheck = validarDV({ seq, dd, ano, j, tr, vara });

  const anoAtual = new Date().getFullYear();
  const anoInt = parseInt(ano, 10);

  const flags = [];
  if (!dvCheck.valido) {
    flags.push(`FORMATO_INVALIDO: DV ${dd} não bate com calculado ${String(dvCheck.dvCalculado).padStart(2, "0")}`);
  }
  if (anoInt > anoAtual) flags.push("ANO_FUTURO");
  if (anoInt < 1998) flags.push("ANO_SUSPEITO"); // CNJ unificou numeração em 2010; antes de 1998 é altamente improvável
  if (vara !== "0000") flags.push("PRIMEIRO_GRAU");
  else flags.push("ORIGINARIO_OU_SEGUNDO_GRAU");

  return {
    tipo: "CNJ",
    referenciaOriginal: referencia,
    referenciaNormalizada: numeroLimpo,
    match: raw,
    componentes: { seq, dd, ano, j, tr, vara },
    tribunalInferido: tribunal,
    siglaDatajud: siglaDatajud(tribunal),
    dv: dvCheck,
    flags,
  };
}
