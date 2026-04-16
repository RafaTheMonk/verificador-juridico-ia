# Verificador Jurídico IA

Serviço REST que verifica se uma referência jurídica citada numa petição existe, o que ela realmente diz, e se é adequada para o argumento em que foi empregada. Foco: detectar **alucinações de IA em peças jurídicas**.

Entrega de **Nível Básico** do Mini Desafio Técnico Super Estagiário de IA.

---

## O problema

Sistemas de IA generativa são usados para redigir contestações, recursos e memoriais. Um problema documentado é a citação de julgados **plausíveis mas inexistentes** — ou, pior, existentes porém inadequados (UF errada, tema diferente, recurso não conhecido). Este serviço faz a verificação automatizada por uma API REST.

## Arquitetura

Pipeline em quatro camadas, do mais barato para o mais custoso:

```
L0  Parsing local           →  regex + DV mod 97-10 (ISO 7064)
L1  Existência              →  Datajud (CNJ)  |  STJ SCON (HTML)
L2  Extração de conteúdo    →  movimentos TPU + assuntos + grau
L3  Adequação contextual    →  regras (padrão) ou Gemini 2-passagens
Rec Motor de recomendação   →  MANTER / CORRIGIR / REVISAR / SUBSTITUIR / REMOVER
```

Ver [`RELATORIO.md`](./RELATORIO.md) para as decisões de arquitetura documentadas.

## Endpoints

### `POST /verificar`

**Request:**

```json
{
  "referencia": "REsp 1.810.170/RS",
  "contexto": "Conforme entendimento pacificado no STJ, a cobrança de taxa de conveniência é abusiva..."
}
```

**Response:** objeto com três dimensões independentes + recomendação:

```json
{
  "referencia_normalizada": "REsp 1810170/RS",
  "tribunal_inferido": "STJ",
  "existencia": {
    "status": "EXISTE_COM_DIVERGENCIA",
    "numero_real": "REsp 1810170/SP",
    "fonte": "STJ SCON",
    "url_fonte": "https://scon.stj.jus.br/SCON/pesquisar.jsp?...",
    "flags": ["UF_DIVERGENTE: citado RS, real SP"]
  },
  "conteudo": {
    "assunto_real": "Previdência privada complementar",
    "dispositivo": "NAO_CONHECIDO",
    "grau": "superior",
    "tema_repetitivo": null,
    "flags": ["NAO_CONHECIDO", "SUMULA_282"]
  },
  "adequacao": {
    "tese_inferida_na_peticao": "Ilegalidade da cobrança de taxa de conveniência ao consumidor",
    "adequacao_tematica": "INADEQUADO",
    "adequacao_dispositivo": "INUTIL",
    "peso_precedencial": "NULO",
    "justificativa": "O julgado trata de previdência privada. Recurso não conhecido. Não sustenta a tese."
  },
  "recomendacao": "REMOVER",
  "nivel_urgencia": "CRITICO"
}
```

### `GET /` — health check

## Rodar localmente

```bash
cp .env.example .env
npm install
npm run dev        # http://localhost:3000
```

Testar via curl:

```bash
curl -X POST http://localhost:3000/verificar \
  -H "Content-Type: application/json" \
  -d '{"referencia":"0815641-45.2025.8.10.0040","contexto":"No âmbito deste Egrégio Tribunal..."}'
```

## Rodar os testes

```bash
npm test     # 9 testes, todos locais (sem rede)
```

## Deploy na Vercel

```bash
npm i -g vercel
vercel              # primeira vez: segue o wizard
vercel --prod       # deploy de produção
```

Variáveis a configurar no painel da Vercel:

| Variável | Obrigatória | Descrição |
|---|---|---|
| `DATAJUD_API_KEY` | não (fallback embutido) | Chave pública do CNJ |
| `GEMINI_API_KEY` | não | Habilita L3 via LLM |
| `USE_LLM_ADEQUACY` | não | `true` para ligar Gemini |
| `HTTP_TIMEOUT_MS` | não | padrão `15000` |

## Estrutura

```
verificador-juridico-ia/
├── api/
│   ├── verificar.js          # serverless: POST /verificar
│   └── health.js             # serverless: GET /
├── src/
│   ├── parser/               # L0 - regex + DV mod 97-10
│   ├── existence/            # L1 - Datajud, SCON
│   ├── content/              # L2 - TPU flags, extractor
│   ├── adequacy/             # L3 - rule-based + Gemini
│   ├── recommendation/       # motor MANTER→REMOVER
│   ├── util/httpClient.js
│   └── verifier.js           # orquestrador
├── test/
│   ├── fixtures/             # casos 1 e 2 do desafio
│   ├── parser.test.js
│   └── casos.test.js
├── server.js                 # dev local (Express)
├── vercel.json
└── RELATORIO.md              # documento de aprendizado
```

## Cobertura atual

- **Parser CNJ**: validação completa com DV mod 97-10 (ISO 7064)
- **Parser STJ/STF**: REsp, AREsp, AgInt, AgRg, HC, RHC, MS, RMS, EDcl, EREsp, RE, ARE
- **Datajud**: todos os tribunais com endpoint `api_publica_{sigla}` (TJs, TRFs, STJ, STF, TSTs)
- **SCON**: acórdãos do STJ por número
- **TPU**: 10 códigos mapeados (extinção, não-conhecimento, provimentos, publicação, trânsito)

## Não cobre (ainda)

- Decisões monocráticas fora do SCON (usar `processo.stj.jus.br` no Nível Intermediário)
- Temas repetitivos e IRDRs (campo `tema_repetitivo` devolve `null`)
- Sugestão de substituição de precedente (Nível Avançado)
- Processamento em lote

## Licença

MIT
