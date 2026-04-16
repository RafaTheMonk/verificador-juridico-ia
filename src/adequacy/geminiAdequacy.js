/**
 * Adequação contextual via Gemini — DUAS PASSAGENS sequenciais.
 * Sem dependências externas — usa fetch nativo para a REST API do Gemini.
 *
 * Passagem 1: infere a tese da petição SEM ver o julgado (evita anchoring).
 * Passagem 2: compara a tese com os metadados reais e emite o veredito.
 */

const MODEL = "gemini-2.5-pro";
const GEMINI_URL = (model, key) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;

async function generate(apiKey, systemText, userText, expectJson = false) {
  const body = {
    contents: [{ role: "user", parts: [{ text: userText }] }],
    systemInstruction: { parts: [{ text: systemText }] },
    generationConfig: {
      temperature: 0,
      ...(expectJson ? { responseMimeType: "application/json" } : {}),
    },
  };

  const res = await fetch(GEMINI_URL(MODEL, apiKey), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(JSON.stringify(err));
  }

  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
}

function parseJsonTolerante(s) {
  if (!s) return null;
  const start = Math.min(
    ...["{", "["].map((c) => (s.indexOf(c) === -1 ? Infinity : s.indexOf(c)))
  );
  if (!Number.isFinite(start)) return null;
  try { return JSON.parse(s.slice(start).replace(/```[\s\S]*$/, "").trim()); }
  catch { return null; }
}

export async function avaliarAdequacaoLLM({ referenciaNormalizada, contexto, conteudo }) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  // ----------- Passagem 1: inferir tese sem mostrar o julgado ----------------
  const sys1 = `Você é um assistente jurídico experiente. Dado um trecho de petição
em que uma referência jurídica é citada, sua tarefa é inferir QUAL tese de mérito
aquela citação está sendo usada para sustentar — SEM saber ainda o que a decisão
citada de fato diz. Responda em JSON com duas chaves:
  "tese_inferida": string curta (até 25 palavras) descrevendo a tese
  "tribunal_esperado": uma das strings [STJ, STF, TJ estadual, TRF, TST, outro]`;

  const user1 = `Referência citada: ${referenciaNormalizada}\n\nTrecho da petição:\n"""\n${contexto}\n"""`;

  const text1 = await generate(apiKey, sys1, user1, true);
  const passo1 = parseJsonTolerante(text1) || { tese_inferida: "", tribunal_esperado: null };

  // ----------- Passagem 2: comparar com o julgado real -----------------------
  const sys2 = `Você recebe (a) a tese que uma petição quer sustentar e (b) os
metadados reais do julgado citado. Sua tarefa é avaliar três dimensões
INDEPENDENTES e retornar APENAS JSON:
{
  "adequacao_tematica": "ADEQUADO" | "PARCIAL" | "INADEQUADO",
  "adequacao_dispositivo": "UTIL" | "INUTIL" | "REVISAR_CONTRA_TESE",
  "peso_precedencial": "ALTO" | "MEDIO" | "BAIXO" | "NULO",
  "justificativa": "1-3 frases objetivas"
}
Regras:
- Se o dispositivo é NAO_CONHECIDO ou EXTINTO_SEM_MERITO → adequacao_dispositivo = INUTIL e peso_precedencial = NULO.
- Se o grau é "primeiro" → peso_precedencial = NULO.
- Se os assuntos nada têm a ver com a tese → adequacao_tematica = INADEQUADO.`;

  const user2 = `Tese que a petição quer sustentar:\n${passo1.tese_inferida || "(não inferida)"}

Metadados REAIS do julgado citado (${referenciaNormalizada}):
- tribunal: ${conteudo?.tribunal || "?"}
- grau: ${conteudo?.grau || "?"}
- assuntos: ${(conteudo?.assuntos || []).join("; ") || "(desconhecido)"}
- dispositivo: ${conteudo?.dispositivo || "(desconhecido)"}
- flags detectadas: ${(conteudo?.flags || []).join(", ") || "(nenhuma)"}
- ementa (trecho): ${(conteudo?.ementa || "").slice(0, 800) || "(indisponível)"}

Avalie as três dimensões em JSON.`;

  const text2 = await generate(apiKey, sys2, user2, true);
  const passo2 = parseJsonTolerante(text2) || {};

  return {
    tese_inferida_na_peticao: passo1.tese_inferida || "",
    tribunal_esperado: passo1.tribunal_esperado || null,
    adequacao_tematica: passo2.adequacao_tematica || "INDETERMINADO",
    adequacao_dispositivo: passo2.adequacao_dispositivo || "INDETERMINADO",
    peso_precedencial: passo2.peso_precedencial || "BAIXO",
    justificativa: passo2.justificativa || "",
    metodo: "llm-gemini-2pass",
  };
}
