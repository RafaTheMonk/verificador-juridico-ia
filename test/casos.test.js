/**
 * Testes E2E com os dois casos canônicos do desafio.
 *
 * Estes testes fazem chamadas REAIS ao Datajud / SCON e podem falhar
 * por indisponibilidade externa. Use `RUN_E2E=1 npm test` para executá-los.
 *
 * Sem RUN_E2E, apenas verificamos que o parser + recomendador tomam a
 * decisão correta em regras locais (isto é, sem tocar rede).
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parseReferencia } from "../src/parser/index.js";
import { recomendar } from "../src/recommendation/engine.js";
import { avaliarAdequacao } from "../src/adequacy/ruleBased.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const caso1 = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures/caso1.json"), "utf-8"));
const caso2 = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures/caso2.json"), "utf-8"));

test("caso 1 (REsp 1.810.170/RS): parse + simulação de conteúdo real resultam em REMOVER", () => {
  const parse = parseReferencia(caso1.entrada.referencia);
  assert.equal(parse.tribunalInferido, "STJ");

  // Simulamos o que o SCON/Datajud retornaria (sem tocar rede)
  const conteudo = {
    assuntoReal: "Previdência privada complementar",
    assuntos: ["Previdência privada", "Banco do Brasil"],
    dispositivo: "NAO_CONHECIDO",
    grau: "superior",
    flags: ["NAO_CONHECIDO", "SUMULA_282", "TEMA_PREVIDENCIA_PRIVADA"],
    ementa: "Previdência privada complementar...",
  };
  const existencia = {
    status: "EXISTE_COM_DIVERGENCIA",
    numero_real: "REsp 1810170/SP",
    flags: ["UF_DIVERGENTE: citado RS, real SP"],
  };

  const adeq = avaliarAdequacao({ contexto: caso1.entrada.contexto, conteudo, parseResult: parse, existencia });
  assert.equal(adeq.adequacao_dispositivo, "INUTIL");
  assert.equal(adeq.peso_precedencial, "NULO");

  const rec = recomendar({ existencia, conteudo, adequacao: adeq, parseResult: parse });
  assert.equal(rec.recomendacao, "REMOVER");
  assert.equal(rec.nivel_urgencia, "CRITICO");
});

test("caso 2 (0815641-45.2025.8.10.0040): parse + conteúdo simulado resultam em REMOVER", () => {
  const parse = parseReferencia(caso2.entrada.referencia);
  assert.equal(parse.tipo, "CNJ");
  assert.equal(parse.dv.valido, true);
  assert.equal(parse.siglaDatajud, "tjma");
  assert.ok(parse.flags.includes("VARA_NAO_ZERO"));

  const conteudo = {
    assuntoReal: "Contratos Bancários",
    assuntos: ["Contratos Bancários"],
    dispositivo: "EXTINTO_SEM_MERITO",
    grau: "primeiro",
    flags: ["EXTINTO_SEM_MERITO"],
  };
  const existencia = { status: "ENCONTRADO", flags: [] };

  const adeq = avaliarAdequacao({ contexto: caso2.entrada.contexto, conteudo, parseResult: parse, existencia });
  const rec = recomendar({ existencia, conteudo, adequacao: adeq, parseResult: parse });

  assert.equal(rec.recomendacao, "REMOVER");
  assert.ok(rec.motivos.some((m) => /extinto/i.test(m)));
  assert.ok(rec.motivos.some((m) => /1º grau/i.test(m)));
});
