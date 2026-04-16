import { test } from "node:test";
import assert from "node:assert/strict";

import { calcularDV, validarDV } from "../src/parser/dvValidator.js";
import { parseCNJ } from "../src/parser/cnjParser.js";
import { parseTribunalSuperior } from "../src/parser/stjParser.js";
import { parseReferencia } from "../src/parser/index.js";

test("DV mod 97-10: calcula corretamente um número real conhecido", () => {
  // Exemplo do caso 2 do desafio: 0815641-45.2025.8.10.0040
  //   seq=0815641 ano=2025 j=8 tr=10 vara=0040 dd=45
  const dv = calcularDV({ seq: "0815641", ano: "2025", j: "8", tr: "10", vara: "0040" });
  assert.equal(dv, 45, "DV esperado do processo do TJMA é 45");
});

test("DV mod 97-10: rejeita dígito inválido", () => {
  const r = validarDV({ seq: "0815641", dd: "99", ano: "2025", j: "8", tr: "10", vara: "0040" });
  assert.equal(r.valido, false);
  assert.equal(r.dvCalculado, 45);
});

test("parseCNJ: extrai componentes e infere tribunal", () => {
  const p = parseCNJ("0815641-45.2025.8.10.0040");
  assert.equal(p.tipo, "CNJ");
  assert.equal(p.componentes.seq, "0815641");
  assert.equal(p.componentes.ano, "2025");
  assert.equal(p.tribunalInferido, "TJMA");
  assert.equal(p.siglaDatajud, "tjma");
  assert.equal(p.dv.valido, true);
  assert.ok(p.flags.includes("VARA_NAO_ZERO"));
});

test("parseCNJ: flag FORMATO_INVALIDO quando DV errado", () => {
  // Mesmo processo com DV errado
  const p = parseCNJ("0815641-99.2025.8.10.0040");
  assert.equal(p.dv.valido, false);
  assert.ok(p.flags.some((f) => f.startsWith("FORMATO_INVALIDO")));
});

test("parseTribunalSuperior: extrai REsp com UF", () => {
  const p = parseTribunalSuperior("REsp 1.810.170/RS");
  assert.equal(p.tipo, "TRIBUNAL_SUPERIOR");
  assert.equal(p.tribunalInferido, "STJ");
  assert.equal(p.recurso.sigla, "REsp");
  assert.equal(p.recurso.numero, "1810170");
  assert.equal(p.recurso.uf, "RS");
  assert.equal(p.referenciaNormalizada, "REsp 1810170/RS");
});

test("parseTribunalSuperior: captura 'AgInt no REsp'", () => {
  const p = parseTribunalSuperior("AgInt no REsp 2.100.000/SP");
  assert.equal(p.recurso.envelopante, "AgInt");
  assert.equal(p.recurso.sigla, "REsp");
  assert.equal(p.recurso.uf, "SP");
});

test("parseReferencia: fallback quando formato não reconhecido", () => {
  const p = parseReferencia("qualquer coisa 123");
  assert.equal(p.tipo, "DESCONHECIDO");
  assert.ok(p.flags.includes("FORMATO_NAO_RECONHECIDO"));
});
