/**
 * Orquestrador da Camada 3.
 *
 * Seleciona entre rule-based (padrão, custo zero) e Gemini duas-passagens
 * (se USE_LLM_ADEQUACY=true e GEMINI_API_KEY presente). Se o LLM falhar,
 * cai graciosamente para o rule-based.
 */

import { avaliarAdequacao } from "./ruleBased.js";
import { avaliarAdequacaoLLM } from "./geminiAdequacy.js";

export async function avaliarAdequacaoCompleta(input) {
  const useLlm = process.env.USE_LLM_ADEQUACY === "true" && !!process.env.GEMINI_API_KEY;

  if (useLlm) {
    try {
      const llm = await avaliarAdequacaoLLM({
        referenciaNormalizada: input.parseResult?.referenciaNormalizada,
        contexto: input.contexto,
        conteudo: input.conteudo,
      });
      if (llm) return llm;
    } catch (e) {
      console.warn("[adequacy] LLM falhou, usando rule-based:", e.message);
    }
  }

  return avaliarAdequacao(input);
}
