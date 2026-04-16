/**
 * Parser de referências de tribunais superiores no formato "sigla NÚMERO[/UF]".
 * Ex.:   REsp 1.810.170/RS    AREsp 2.345.678    AgInt no REsp 1.234.567/SP
 *        HC 123.456           MS 35.678/DF       RMS 58.123/MG
 *
 * Tribunais cobertos nesta fase: STJ (REsp, AREsp, AgInt, AgRg, HC, RHC,
 * MS, RMS, EDcl, EREsp, Pet) e STF (RE, ARE, AI, HC, MS).
 */

const STJ_SIGLAS = [
  "REsp", "AREsp", "AgInt", "AgRg", "EDcl", "EREsp", "HC", "RHC",
  "MS", "RMS", "Pet", "CC", "IDC",
];
const STF_SIGLAS = ["RE", "ARE", "AI", "HC", "MS", "ADI", "ADPF", "ADC"];

const UFS = [
  "AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS",
  "MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO",
];

function buildRegex(siglas) {
  // Captura: prefixo opcional (AgInt no, AgRg no, EDcl no), sigla, número, UF opcional
  const siglasGroup = siglas.join("|");
  return new RegExp(
    `(?:(AgInt|AgRg|EDcl)\\s+(?:no|em)\\s+)?(${siglasGroup})\\s*n?º?\\s*([\\d.]+)(?:\\s*\\/\\s*(${UFS.join("|")}))?`,
    "i",
  );
}

const STJ_REGEX = buildRegex(STJ_SIGLAS);
const STF_REGEX = buildRegex(STF_SIGLAS);

function normalizarNumero(numStr) {
  return String(numStr).replace(/\D/g, "");
}

function tryParse(regex, tribunal, referencia) {
  const match = referencia.match(regex);
  if (!match) return null;
  const [raw, recursoEnvelopado, sigla, numero, uf] = match;
  const numeroLimpo = normalizarNumero(numero);

  // Heurística para detectar REsp -> AgInt no REsp como recurso envolvente
  const siglaBase = sigla.replace(/\W/g, "");

  const anoAtual = new Date().getFullYear();
  const flags = [];
  // STJ usa numeração sequencial; números muito baixos ou muito altos podem ser suspeitos,
  // mas não é possível validar via DV. Apenas flag informativa se for curto demais.
  if (numeroLimpo.length < 5) flags.push("NUMERO_CURTO_SUSPEITO");

  const refNormalizada = `${siglaBase} ${numeroLimpo}${uf ? `/${uf.toUpperCase()}` : ""}`;

  return {
    tipo: "TRIBUNAL_SUPERIOR",
    referenciaOriginal: referencia,
    referenciaNormalizada: refNormalizada,
    match: raw,
    tribunalInferido: tribunal,
    siglaDatajud: tribunal === "STJ" ? "stj" : tribunal === "STF" ? "stf" : null,
    recurso: {
      envelopante: recursoEnvelopado || null, // ex: "AgInt" quando é "AgInt no REsp"
      sigla: siglaBase,
      numero: numeroLimpo,
      uf: uf ? uf.toUpperCase() : null,
      anoAtual, // usado por heurísticas posteriores
    },
    flags,
  };
}

export function parseTribunalSuperior(referencia) {
  if (!referencia) return null;
  return (
    tryParse(STJ_REGEX, "STJ", referencia) ||
    tryParse(STF_REGEX, "STF", referencia) ||
    null
  );
}
