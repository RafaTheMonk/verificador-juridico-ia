# Verificador Jurídico IA

Serviço REST que verifica se uma referência jurídica citada numa petição existe, o que ela realmente diz, e se é adequada para o argumento em que foi empregada. Foco: detectar **alucinações de IA em peças jurídicas**.

Entrega de **Nível Intermediário** do Mini Desafio Técnico Super Estagiário de IA.

---

## O problema

Sistemas de IA generativa são usados para redigir contestações, recursos e memoriais. Um problema documentado é a citação de julgados **plausíveis mas inexistentes** — ou, pior, existentes porém inadequados (UF errada, tema diferente, recurso não conhecido). Este serviço faz a verificação automatizada por uma API REST.

## Arquitetura

Pipeline em quatro camadas, do mais barato para o mais custoso:

```
L0  Parsing local           →  regex + DV mod 97-10 (ISO 7064)
L1  Existência              →  Datajud (CNJ)  |  STJ SCON → fallback Datajud STJ
L2  Extração de conteúdo    →  movimentos TPU + assuntos + grau
L3  Adequação contextual    →  regras (padrão) ou Gemini 2-passagens
Rec Motor de recomendação   →  MANTER / CORRIGIR / REVISAR / SUBSTITUIR / REMOVER
```


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

**Valores possíveis de `existencia.status`:**

| Status | Significado |
|---|---|
| `ENCONTRADO` | Processo localizado na fonte oficial |
| `EXISTE_COM_DIVERGENCIA` | Existe, mas há divergência (ex: UF diferente) |
| `NAO_ENCONTRADO` | Não localizado em nenhuma fonte consultada |
| `FORMATO_INVALIDO` | Dígito verificador CNJ inválido |
| `ERRO_SCRAPING` | Fonte inacessível (Cloudflare, timeout, mudança de HTML) |
| `ERRO_FONTE` | Erro inesperado na consulta |
| `FONTE_NAO_COBERTA` | Tribunal sem cobertura implementada |

### `GET /health`

```json
{ "ok": true, "service": "verificador-juridico-ia", "version": "0.1.0" }
```

## Rodar localmente

```bash
cp .env.example .env
npm install
npm run dev        # http://localhost:3000
```

Testar via curl (fish shell — sem quebra de linha com `\`):

```fish
echo '{"referencia":"REsp 1.810.170/RS","contexto":"A cobrança de taxa de conveniência é abusiva conforme REsp 1.810.170/RS."}' > /tmp/p.json
curl -s -X POST http://localhost:3000/verificar -H "Content-Type: application/json" -d @/tmp/p.json | python3 -m json.tool
```

Testar via curl (bash/zsh):

```bash
curl -s -X POST http://localhost:3000/verificar \
  -H "Content-Type: application/json" \
  -d '{"referencia":"0815641-45.2025.8.10.0040","contexto":"No âmbito deste Egrégio Tribunal do Maranhão, cumpre citar o precedente..."}' \
  | python3 -m json.tool
```

## Rodar os testes

```bash
npm test     # testes unitários locais (sem rede)
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
| `HTTP_TIMEOUT_MS` | não | padrão `60000` |

## Estrutura

```
verificador-juridico-ia/
├── api/
│   ├── verificar.js          # serverless: POST /verificar
│   └── health.js             # serverless: GET /health
├── src/
│   ├── parser/
│   │   ├── index.js          # L0 - dispatcher (CNJ ou tribunal superior)
│   │   ├── cnjParser.js      # regex + DV mod 97-10 (ISO 7064)
│   │   ├── stjParser.js      # REsp, AREsp, AgInt, HC, MS, RE, ARE...
│   │   └── dvValidator.js    # algoritmo dígito verificador CNJ
│   ├── existence/
│   │   ├── datajudClient.js  # L1 - Datajud CNJ (todos os tribunais + fallback STJ)
│   │   └── sconClient.js     # L1 - STJ SCON (scraping HTML + detecção Cloudflare)
│   ├── content/
│   │   ├── metadataExtractor.js  # normaliza dados de Datajud e SCON
│   │   └── tpuFlags.js           # mapeamento de códigos TPU → flags
│   ├── adequacy/
│   │   ├── index.js          # L3 - dispatcher (LLM ou rule-based)
│   │   ├── geminiAdequacy.js # L3 - Gemini 2-passagens (opcional)
│   │   └── ruleBased.js      # L3 - heurística sem LLM
│   ├── recommendation/
│   │   └── engine.js         # motor MANTER→REMOVER (pior caso)
│   ├── audit/
│   │   └── auditTrail.js     # trilha de auditoria com snapshot da evidência
│   ├── controllers/
│   │   ├── verificar.js      # handler HTTP do endpoint /verificar
│   │   └── health.js         # handler HTTP do endpoint /health
│   ├── services/
│   │   └── verifier.js       # orquestrador principal do pipeline L0→Rec
│   └── utils/
│       ├── httpClient.js     # fetch com timeout e retry exponencial
│       └── envLoader.js      # carregamento de variáveis de ambiente
├── test/
│   ├── fixtures/             # casos 1 e 2 do desafio (JSON)
│   ├── parser.test.js
│   └── casos.test.js
├── public/
│   ├── index.html            # interface web (formulário + visualização do resultado)
│   ├── script.js             # fetch → /verificar + renderização do resultado
│   └── style.css             # dark theme, grid de resultados, pills de status
├── server.js                 # servidor node:http para dev local (serve public/ + API)
├── vercel.json               # config serverless (rewrites + maxDuration)
├── .env.example
└── RELATORIO.md              # decisões de arquitetura documentadas
```

## Cobertura atual

- **Parser CNJ**: validação completa com DV mod 97-10 (ISO 7064)
- **Parser STJ/STF**: REsp, AREsp, AgInt, AgRg, HC, RHC, MS, RMS, EDcl, EREsp, RE, ARE, CC, IDC
- **Datajud**: todos os tribunais com endpoint `api_publica_{sigla}` (TJs, TRFs, STJ, STF, TSTs)
- **SCON (STJ)**: acórdãos do STJ por número, com detecção automática de Cloudflare
- **Fallback STJ**: quando SCON é bloqueado por Cloudflare, tenta Datajud `api_publica_stj`
- **TPU**: 10 códigos mapeados (extinção, não-conhecimento, provimentos, publicação, trânsito)
- **Auditoria**: snapshot da evidência por verificação (fonte + metadados + timestamp)
- **ERRO_SCRAPING**: status dedicado quando fontes estão inacessíveis — evita falso negativo REMOVER/CRÍTICO

## Limitações conhecidas

| Limitação | Causa | Status |
|---|---|---|
| SCON bloqueado por Cloudflare | STJ adotou CF Managed Challenge em todas as rotas | Fallback Datajud implementado |
| REsp não encontrado no Datajud por número sequencial | Datajud indexa por número CNJ completo, não pelo número do recurso | Investigando |
| Decisões monocráticas fora do SCON | `processo.stj.jus.br` também protegido por Cloudflare | Não coberto |
| Temas repetitivos e IRDRs | Campo `tema_repetitivo` devolve `null` | Nível intermediário |
| Sugestão de substituição de precedente | Requer busca semântica por tema | Nível avançado |
| Processamento em lote | Endpoint aceita uma referência por vez | Nível avançado |

## Licença

MIT
