# Mini Desafio Técnico — Super Estagiário de IA
## Verificador Automatizado de Referências Jurídicas Geradas por IA

---

### Contexto

Sistemas de inteligência artificial generativa já são usados ativamente na produção de peças jurídicas: contestações, recursos, memoriais. Um problema crítico e documentado é a **alucinação de referências** — a IA cita processos e acórdãos com números plausíveis, mas inexistentes, com dados trocados (UF errada, classe errada) ou com conteúdo completamente incompatível com o argumento que sustentam.

Em 2023 e 2024, juízes no Brasil e nos EUA já aplicaram sanções a advogados que protocolaram peças com citações fictícias geradas por IA. A verificação manual, processo a processo, é lenta e propensa a erros. Existe espaço claro para automação.

Este desafio propõe que você construa um **serviço de verificação automatizada** que receba uma referência jurídica com seu contexto de uso e devolva, de forma estruturada, se ela existe, o que diz e se é adequada para o argumento em que foi empregada.

---

### O que se espera como entrega

**Obrigatório:**

1. **Repositório público no GitHub** com código organizado, README em inglês (ou português), e instruções claras para rodar localmente
2. **API REST operacional**, hospedada em alguma plataforma pública e testável via `curl` ou Postman

**Não há prazo fixo.** Este é um exercício de exploração individual — e de comparação coletiva. Cada um entrega quando considerar que tem algo que vale mostrar. Não existe resposta única correta.

---

### Especificação da API

#### Endpoint principal

```
POST /verificar
Content-Type: application/json
```

#### Corpo da requisição

```json
{
  "referencia": "REsp 1.810.170/RS",
  "contexto": "Conforme entendimento pacificado no STJ, a cobrança
               de taxa de conveniência é abusiva ao consumidor,
               como decidido no REsp 1.810.170/RS, razão pela qual
               deve ser reconhecida a ilegalidade da cobrança."
}
```

| Campo | Tipo | Descrição |
|---|---|---|
| `referencia` | string | O identificador jurídico exato como aparece na peça |
| `contexto` | string | O trecho da petição onde a referência aparece (idealmente o parágrafo completo) |

#### Corpo da resposta esperada

A resposta deve ser um objeto JSON com **três dimensões independentes** — nunca um score único colapsado:

```json
{
  "referencia_normalizada": "REsp 1810170",
  "tribunal_inferido": "STJ",

  "existencia": {
    "status": "EXISTE_COM_DIVERGENCIA",
    "numero_real": "REsp 1.810.170/SP",
    "fonte": "STJ SCON",
    "url_fonte": "https://scon.stj.jus.br/...",
    "flags": ["UF_DIVERGENTE: citado RS, real SP"]
  },

  "conteudo": {
    "assunto_real": "Previdência privada complementar / Banco do Brasil",
    "dispositivo": "NAO_CONHECIDO",
    "grau": "superior",
    "tema_repetitivo": null,
    "flags": ["NAO_CONHECIDO_MERITO", "SUMULA_282", "SUMULA_356"]
  },

  "adequacao": {
    "tese_inferida_na_peticao": "Ilegalidade da cobrança de taxa de conveniência ao consumidor",
    "adequacao_tematica": "INADEQUADO",
    "adequacao_dispositivo": "INUTIL",
    "peso_precedencial": "NULO",
    "justificativa": "O julgado trata de previdência privada complementar e foi encerrado sem análise de mérito por ausência de prequestionamento. Não guarda relação com o tema de taxa de conveniência e não estabelece tese utilizável."
  },

  "recomendacao": "REMOVER",
  "nivel_urgencia": "CRITICO"
}
```

Os valores possíveis de `recomendacao` são: `MANTER`, `CORRIGIR`, `REVISAR`, `SUBSTITUIR`, `REMOVER`.

---

### Arquitetura sugerida (ponto de partida, não obrigatória)

O pipeline recomendado tem quatro camadas, da mais rápida para a mais custosa:

**Camada 0 — Validação local (sem requisição de rede)**

Antes de qualquer chamada externa, o sistema deve analisar a estrutura da referência:

- Identificar o padrão via regex: padrão CNJ (`NNNNNNN-DD.AAAA.J.TR.OOOO`) ou padrão tribunal superior (`REsp`, `AREsp`, `AgInt`, etc.)
- Para referências CNJ: validar o **dígito verificador** pelo algoritmo módulo 97-10 (ISO 7064). Uma referência com dígito inválido é provavelmente inventada e pode ser rejeitada sem nenhuma requisição
- Extrair e registrar: tipo, número limpo, UF (se presente), ano, código do tribunal (`TR`), código da vara/origem (`OOOO`)
- Emitir flags locais imediatas: `ANO_FUTURO`, `ANO_SUSPEITO`, `VARA_NAO_ZERO` (processo de 1º grau), `FORMATO_INVALIDO`

O cálculo do dígito verificador CNJ funciona assim:

```
número_base = seq + ano + j + tr + vara  (concatenar como string, sem separadores)
dígito_calculado = 98 - ((int(número_base) * 100) % 97)
se dígito_calculado != dig_informado → FORMATO_INVALIDO
```

**Camada 1 — Verificação de existência em fonte oficial**

Fontes a consultar, em ordem de prioridade:

Para qualquer processo no padrão CNJ (estaduais, federais, trabalhistas):
- **Datajud (CNJ)** — API REST pública, sem captcha, sem JavaScript. Endpoint: `https://api-publica.datajud.cnj.jus.br/api_publica_{sigla_tribunal}/_search`. A chave de acesso pública está disponível em `https://datajud-wiki.cnj.jus.br`. O retorno inclui os campos `grau` (`G1`/`G2`), `movimentos` com códigos TPU, `assuntos`, `orgaoJulgador`

Para processos do STJ:
- **SCON** (`https://scon.stj.jus.br/SCON/pesquisar.jsp?b=ACOR&numero={numero}`) — indexa acórdãos publicados, retorna ementa e metadados
- **Consulta Processual** (`https://processo.stj.jus.br/processo/pesquisa/`) — cobre também decisões monocráticas não publicadas no DJe

Importante: Jusbrasil e Escavador **não são fontes de existência** — são auxiliares para localizar o link da fonte oficial quando a busca direta falhar. Nunca usar agregador como prova.

Dos movimentos TPU do Datajud, detectar automaticamente:

| Código TPU | Significado | Flag gerada |
|---|---|---|
| 22 | Homologação de desistência | `EXTINTO_SEM_MERITO` |
| 237 | Extinção sem resolução de mérito | `EXTINTO_SEM_MERITO` |
| 848 | Acórdão publicado | `TEM_ACORDAO` |
| 904 | Trânsito em julgado | `TRANSITADO` |

**Camada 2 — Extração de conteúdo e metadados**

Com o processo localizado, extrair e normalizar: ementa, dispositivo (provido / improvido / não conhecido / extinto sem mérito), relator, data, grau, assuntos CNJ, existência de tema repetitivo ou IRDR associado.

**Camada 3 — Adequação contextual via LLM**

Esta é a camada mais diferenciada. A comparação entre contexto e julgado deve ser feita em **duas passagens sequenciais**:

*Passagem 1 — inferir a tese implícita* (sem mostrar o julgado ao modelo ainda):

> "Dado o trecho de petição abaixo, em que a referência `[REF]` é citada: qual argumento jurídico de mérito essa citação está sendo usada para sustentar? Qual seria o tribunal hierarquicamente adequado para esse argumento?"

*Passagem 2 — comparar com o julgado real* (agora com a ementa e os metadados):

> "A tese que a petição quer sustentar é `[tese inferida]`. O julgado real trata de `[assuntos]`, com dispositivo `[dispositivo]` e grau `[grau]`. Avalie: a adequação temática, a utilidade do dispositivo e o peso precedencial."

A separação em duas passagens é importante: na primeira, o modelo infere a tese sem saber o que o julgado diz, evitando que o conhecimento do julgado contamine a leitura do contexto.

Para a camada LLM, usar **exclusivamente APIs gratuitas** nesta fase do projeto. Opções:
- **Google Gemini API** (nível gratuito generoso, bom para português)
- **Groq** (inferência rápida com modelos open source como LLaMA 3 e Mixtral, nível gratuito disponível)
- **Ollama local** (rodar modelos como Mistral ou Llama 3 localmente, sem custo, viável para desenvolvimento)
- **OpenRouter** (agrega vários modelos com camada gratuita)

---

### Referências técnicas úteis

**Datajud — documentação oficial:**
`https://datajud-wiki.cnj.jus.br`

A wiki inclui a lista completa de índices por tribunal (ex: `tjma`, `tjsp`, `tjrj`), exemplos de queries Elasticsearch e a chave pública de acesso.

**Padrão CNJ de numeração única:**
Resolução CNJ nº 65/2008. O padrão é `NNNNNNN-DD.AAAA.J.TR.OOOO` onde:
- `J=8` → Justiça Estadual; `J=1` → Justiça Federal; `J=5` → TST
- `TR` → código do tribunal (10=TJMA, 26=TJSP, 19=TJRJ, 15=TJMG, 08=TJRS...)
- `OOOO=0000` → originário/2º grau; qualquer outro valor → 1º grau

**STJ SCON:**
`https://scon.stj.jus.br/SCON/`

**Algoritmo de dígito verificador CNJ:**
ISO 7064, módulo 97-10. Implementações de referência estão disponíveis em vários repositórios públicos no GitHub buscando por `digito verificador cnj python`.

---

### Casos de teste sugeridos

Use estes dois casos para validar seu sistema — eles foram analisados manualmente com quatro abordagens diferentes e têm comportamento conhecido:

**Caso 1:**
```json
{
  "referencia": "REsp 1.810.170/RS",
  "contexto": "Conforme entendimento pacificado no STJ, a cobrança de
               taxa de conveniência é abusiva ao consumidor, como decidido
               no REsp 1.810.170/RS, razão pela qual deve ser reconhecida
               a ilegalidade da cobrança no presente caso."
}
```
Resultado esperado: processo existe, mas a UF é SP (não RS), o assunto é previdência privada (não taxa de conveniência), e o STJ não conheceu o recurso — três problemas independentes.

**Caso 2:**
```json
{
  "referencia": "0815641-45.2025.8.10.0040",
  "contexto": "No âmbito deste Egrégio Tribunal de Justiça do Estado do
               Maranhão, cumpre citar o precedente firmado nos autos do
               processo nº 0815641-45.2025.8.10.0040, que consolidou
               entendimento favorável à tese ora defendida."
}
```
Resultado esperado: processo existe, mas é de 1º grau (não "Egrégio Tribunal"), foi extinto por desistência sem resolução de mérito, e portanto não constitui precedente de nenhuma tese.

---

### Níveis de ambição

O desafio não tem escopo fixo. Pense nestes níveis como progressão natural:

**Nível básico** — entrega mínima funcional
- Parser de referência funcionando (regex + extração de componentes)
- Verificação de existência no Datajud para processos CNJ e no SCON para STJ
- Output estruturado com as três dimensões (mesmo que a camada de adequação seja baseada em regras simples, sem LLM)
- API hospedada e testável

**Nível intermediário**
- Validação do dígito verificador CNJ implementada
- Flags automáticas derivadas dos metadados (TPU, grau, dispositivo)
- Camada de adequação com LLM (duas passagens sequenciais)
- Cache básico para evitar reconsultar o mesmo número

**Nível avançado**
- Processamento de lote (lista de referências de uma mesma peça)
- Sugestão de substituição: quando uma referência é inadequada, buscar precedentes reais sobre o tema inferido
- Cobertura de mais tribunais (TRFs, TST, STF)
- Trilha de auditoria: salvar a evidência de cada verificação (link + snapshot dos metadados) junto com o resultado

---

### Critérios de avaliação (quando compararem entre si)

Ao apresentarem suas soluções uns para os outros, considerem discutir:

- **Cobertura de casos:** quantos dos casos de teste o sistema resolve corretamente?
- **Clareza do output:** o relatório gerado seria útil para um advogado revisar rapidamente?
- **Escolhas de arquitetura:** por que usou essa API, esse modelo, essa estrutura de dados?
- **Robustez:** o que acontece com entradas malformadas, tribunais não cobertos, ou quando a API externa está fora?
- **Custo zero:** a solução realmente roda inteiramente com recursos gratuitos?

---

### Uma nota sobre o problema

Este não é um exercício acadêmico desconectado da realidade. A verificação de alucinações em peças jurídicas é um problema ativo no Brasil, com casos documentados de advogados advertidos pela OAB e processos anulados. As APIs do Datajud e do SCON são públicas e estáveis. Uma solução razoável para este desafio é, com poucas adaptações, algo que poderia ser usado em produção.

Bom trabalho.