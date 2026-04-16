/**
 * Motor de recomendação.
 *
 * A partir das três dimensões (existência, conteúdo, adequação) deriva:
 *   - recomendacao  ∈ [MANTER, CORRIGIR, REVISAR, SUBSTITUIR, REMOVER]
 *   - nivel_urgencia ∈ [BAIXO, MEDIO, ALTO, CRITICO]
 *
 * As regras são INDEPENDENTES e combinam pelo "pior caso": basta uma
 * condição de REMOVER disparar para a recomendação virar REMOVER.
 */

const RANK = { MANTER: 0, CORRIGIR: 1, REVISAR: 2, SUBSTITUIR: 3, REMOVER: 4 };
const URGENCIA = { BAIXO: 0, MEDIO: 1, ALTO: 2, CRITICO: 3 };

function pior(acumulada, nova) {
  return RANK[nova] > RANK[acumulada] ? nova : acumulada;
}

function piorUrg(a, b) {
  return URGENCIA[b] > URGENCIA[a] ? b : a;
}

export function recomendar({ existencia, conteudo, adequacao, parseResult }) {
  let rec = "MANTER";
  let urg = "BAIXO";
  const motivos = [];

  // --- Existência -----------------------------------------------------------
  if (existencia.status === "FORMATO_INVALIDO") {
    rec = pior(rec, "REMOVER"); urg = piorUrg(urg, "CRITICO");
    motivos.push("Dígito verificador CNJ inválido — referência muito provavelmente inventada.");
  }
  if (existencia.status === "NAO_ENCONTRADO") {
    // Se todas as fontes falharam por limitação de infra (CF + Datajud sem índice),
    // não temos evidência real de não-existência — tratar como inconclusivo.
    const todasFontesIndisponiveis = existencia.flags.some(
      f => f.startsWith("SCON_CLOUDFLARE") || f.startsWith("AMBAS_FONTES")
    );
    if (todasFontesIndisponiveis) {
      rec = pior(rec, "REVISAR"); urg = piorUrg(urg, "MEDIO");
      motivos.push("Fontes oficiais inacessíveis (Cloudflare / Datajud sem índice por número sequencial) — existência inconclusiva. Verifique manualmente em scon.stj.jus.br");
    } else {
      rec = pior(rec, "REMOVER"); urg = piorUrg(urg, "CRITICO");
      motivos.push("Processo não encontrado nas fontes oficiais consultadas.");
    }
  }
  if (existencia.status === "EXISTE_COM_DIVERGENCIA") {
    rec = pior(rec, "CORRIGIR"); urg = piorUrg(urg, "ALTO");
    motivos.push("Processo existe, porém há divergência nos dados informados (ex: UF, número).");
  }
  if (existencia.status === "ERRO_SCRAPING") {
    rec = pior(rec, "REVISAR"); urg = piorUrg(urg, "MEDIO");
    const detalhe = existencia.flags.find(f => f.startsWith("CLOUDFLARE") || f.startsWith("HTML_MUDOU") || f.startsWith("AMBAS")) || "";
    motivos.push(`Não foi possível confirmar existência automaticamente (${detalhe || "fonte inacessível"}). Verifique manualmente em ${existencia.url_fonte || "scon.stj.jus.br"}`);
  }
  if (existencia.status === "ERRO_FONTE") {
    rec = pior(rec, "REVISAR"); urg = piorUrg(urg, "MEDIO");
    const detalhe = existencia.flags.find(f => f.startsWith("ERRO:")) || "erro na consulta";
    motivos.push(`Falha ao consultar fonte oficial (${detalhe}) — não foi possível verificar existência. Verifique manualmente.`);
  }

  // --- Conteúdo (dispositivo/grau) -----------------------------------------
  const flags = conteudo?.flags || [];
  if (flags.includes("EXTINTO_SEM_MERITO")) {
    rec = pior(rec, "REMOVER"); urg = piorUrg(urg, "CRITICO");
    motivos.push("Processo foi extinto sem resolução de mérito — não constitui precedente.");
  }
  if (flags.includes("NAO_CONHECIDO") || conteudo?.dispositivo === "NAO_CONHECIDO") {
    rec = pior(rec, "REMOVER"); urg = piorUrg(urg, "CRITICO");
    motivos.push("Recurso não foi conhecido — não há tese de mérito firmada.");
  }
  if (conteudo?.grau === "primeiro") {
    rec = pior(rec, "REMOVER"); urg = piorUrg(urg, "ALTO");
    motivos.push("Decisão de 1º grau não tem eficácia precedencial invocável como 'entendimento consolidado'.");
  }

  // --- Adequação ------------------------------------------------------------
  if (adequacao?.adequacao_tematica === "INADEQUADO") {
    rec = pior(rec, "REMOVER"); urg = piorUrg(urg, "CRITICO");
    motivos.push("Assunto do julgado é incompatível com a tese defendida na petição.");
  }
  if (adequacao?.adequacao_dispositivo === "INUTIL") {
    rec = pior(rec, "REMOVER"); urg = piorUrg(urg, "ALTO");
    motivos.push("Dispositivo do julgado não serve para sustentar a tese.");
  }
  if (adequacao?.adequacao_dispositivo === "REVISAR_CONTRA_TESE") {
    rec = pior(rec, "REVISAR"); urg = piorUrg(urg, "MEDIO");
    motivos.push("Dispositivo pode ser contrário ao argumento — revisar sentido do julgado.");
  }
  if (adequacao?.adequacao_tematica === "PARCIAL" && rec === "MANTER") {
    rec = pior(rec, "REVISAR"); urg = piorUrg(urg, "MEDIO");
    motivos.push("Relação temática é parcial — confirmar pertinência.");
  }

  // Se até aqui nada disparou e adequação está boa, mantém
  if (rec === "MANTER") motivos.push("Referência passou em todas as verificações.");

  return {
    recomendacao: rec,
    nivel_urgencia: urg,
    motivos,
  };
}
