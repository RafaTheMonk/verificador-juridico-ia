/**
 * Carregador de variáveis de ambiente a partir de arquivo .env.
 * Substitui o pacote `dotenv` — sem dependências externas.
 *
 * Regras:
 *  - Linhas vazias e comentários (#) são ignorados
 *  - Aspas simples/duplas nos valores são removidas
 *  - Não sobrescreve variáveis já definidas no processo (mesma semântica do dotenv)
 *  - Silencioso se o arquivo não existir (útil em produção onde as vars já vêm do ambiente)
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

export function loadEnv(path = ".env") {
  const file = resolve(path);
  if (!existsSync(file)) return;

  const lines = readFileSync(file, "utf-8").split("\n");

  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;

    const eqIdx = line.indexOf("=");
    if (eqIdx === -1) continue;

    const key = line.slice(0, eqIdx).trim();
    const val = line.slice(eqIdx + 1).trim().replace(/^(["'])(.*)\1$/, "$2"); // remove quotes

    if (key && !(key in process.env)) {
      process.env[key] = val;
    }
  }
}
