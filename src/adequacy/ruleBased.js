/**
 * Adequação contextual — heurísticas (sem LLM).
 *
 * Recebe:
 *   - contexto (parágrafo da petição onde a referência é citada)
 *   - conteudo  (metadados reais do processo extraídos na Camada 2)
 *
 * Retorna o mesmo shape da camada LLM, para que possam ser trocados
 * livremente (dependendo de USE_LLM_ADEQUACY).
 */

const STOPWORDS = new Set([
  "a","o","as","os","de","do","da","dos","das","em","no","na","nos","nas",
  "para","por","com","sem","sob","sobre","que","e","ou","se","ao","aos",
  "um","uma","uns","umas","pelo","pela","pelos","pelas","conforme","como",
  "razão","pela","deve","ser","seja","ilegalidade","reconhecida","presente",
  "caso","tese","citar","precedente","entendimento","pacificado","cumpre",
  "egrégio","tribunal","este","esta","deste","desta","nos","autos","processo",
  "número","nº","consolidou","favorável","ora","defendida",
]);

function tokenizar(texto) {
  return String(texto || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 4 && !STOPWORDS.has(t));
}

/**
 * Extrai ~5 palavras-chave representativas do contexto. Frequência simples
 * no texto após remoção de stopwords. Suficiente para heurísticas iniciais;
 * a camada LLM produz uma tese muito mais precisa.
 */
function extrairPalavrasChave(texto, n = 6) {
  const toks = tokenizar(texto);
  const freq = new Map();
  for (const t of toks) freq.set(t, (freq.get(t) || 0) + 1);
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([t]) => t);
}

function interseccao(a, b) {
  const sb = new Set(b);
  return a.filter((x) => sb.has(x));
}

export function avaliarAdequacao({ contexto, conteudo, parseResult, existencia }) {
  // Sem conteúdo (processo não encontrado ou não extraído)
  if (!conteudo) {
    return {
      tese_inferida_na_peticao: extrairPalavrasChave(contexto).join(", "),
      adequacao_tematica: "INDETERMINADO",
      adequacao_dispositivo: "INDETERMINADO",
      peso_precedencial: "NULO",
      justificativa:
        "Não foi possível recuperar o conteúdo do processo nas fontes oficiais consultadas.",
      metodo: "rule-based",
    };
  }

  // ---- Adequação temática (palavra-chave do contexto x assuntos do processo)
  const tokensContexto = tokenizar(contexto);
  const tokensAssunto = tokenizar((conteudo.assuntos || []).join(" ") + " " + (conteudo.ementa || ""));
  const overlap = interseccao(tokensContexto, tokensAssunto);

  let adequacao_tematica = "INDETERMINADO";
  if (tokensAssunto.length === 0) adequacao_tematica = "INDETERMINADO";
  else if (overlap.length >= 3) adequacao_tematica = "ADEQUADO";
  else if (overlap.length >= 1) adequacao_tematica = "PARCIAL";
  else adequacao_tematica = "INADEQUADO";

  // Detecções temáticas explícitas do SCON reforçam INADEQUADO
  const flags = conteudo.flags || [];
  const contextoMencionaConveniencia = /taxa\s+de\s+conveni[eê]ncia/i.test(contexto);
  const processoEhPrevidencia = flags.includes("TEMA_PREVIDENCIA_PRIVADA");
  if (contextoMencionaConveniencia && processoEhPrevidencia) {
    adequacao_tematica = "INADEQUADO";
  }

  // ---- Adequação do dispositivo
  let adequacao_dispositivo = "UTIL";
  if (["EXTINTO_SEM_MERITO", "NAO_CONHECIDO"].includes(conteudo.dispositivo)) {
    adequacao_dispositivo = "INUTIL";
  } else if (conteudo.dispositivo === "IMPROVIDO") {
    // Improvido pode ser útil ou contrário, dependendo de quem cita - sinalizamos como REVISAR
    adequacao_dispositivo = "REVISAR_CONTRA_TESE";
  }

  // ---- Peso precedencial
  let peso_precedencial = "BAIXO";
  if (conteudo.grau === "primeiro") peso_precedencial = "NULO"; // 1º grau não é precedente
  else if (conteudo.grau === "superior" && conteudo.dispositivo === "NAO_CONHECIDO") peso_precedencial = "NULO";
  else if (conteudo.grau === "superior" && flags.includes("EXTINTO_SEM_MERITO")) peso_precedencial = "NULO";
  else if (conteudo.grau === "superior") peso_precedencial = "ALTO";
  else if (conteudo.grau === "segundo") peso_precedencial = "MEDIO";

  // ---- Justificativa composta
  const partes = [];
  if (processoEhPrevidencia && contextoMencionaConveniencia) {
    partes.push("O julgado real trata de previdência privada complementar, enquanto a petição cita-o para taxa de conveniência.");
  }
  if (conteudo.dispositivo === "NAO_CONHECIDO") {
    partes.push("O recurso não foi conhecido, ou seja, não houve análise de mérito — não há tese firmada.");
  }
  if (conteudo.dispositivo === "EXTINTO_SEM_MERITO") {
    partes.push("O processo foi extinto sem resolução de mérito — não estabelece precedente de nenhuma tese.");
  }
  if (conteudo.grau === "primeiro") {
    partes.push("Decisão de 1º grau não possui eficácia precedencial na forma usualmente invocada em petições.");
  }
  if (!partes.length) {
    partes.push(`Sobreposição de ${overlap.length} termo(s) entre contexto e assuntos (${overlap.slice(0,4).join(", ") || "—"}).`);
  }

  return {
    tese_inferida_na_peticao: extrairPalavrasChave(contexto).join(", "),
    adequacao_tematica,
    adequacao_dispositivo,
    peso_precedencial,
    justificativa: partes.join(" "),
    metodo: "rule-based",
    debug: { overlap, tokensContexto_sample: tokensContexto.slice(0, 10) },
  };
}
