# Contrato — Prospecção Maps (provider `maps_browser`)

Fonte de verdade para a tela do Radar. Deriva do código desta branch:
`lib/prospeccao/checkpoint.ts`, `lib/prospeccao/parada.ts`,
`app/api/v1/prospecting/searches/route.ts` e `.../searches/[id]/route.ts`.
Não é mockup: os nomes e formatos abaixo são os que as rotas devolvem.

## Tipos

```ts
type StatusBusca =
  | "queued" | "running" | "paused" | "completed" | "failed" | "cancelled";

/** progresso jsonb — unidade é TERMO × CIDADE (a busca já é de uma cidade). */
interface ProgressoDaBusca {
  termos_total: number;
  termos_concluidos: string[];      // categorias concluídas
  termos_falhos: string[];          // esgotaram 3 tentativas
  termo_atual: string | null;       // em execução ou reexecução
  tentativas: number;               // 0..3 do termo_atual
  bloqueio: { motivo: string; em: string } | null;
  /** quantos negócios cada termo trouxe; a soma é `encontradas` */
  termos_encontradas?: Record<string, number>;
}

type EstadoDeParada = "parando" | "parado" | null;

interface Resumo {
  total: number;
  concluidos: number;
  falhos: number;
  pendentes: number;
  percentual: number;   // 0..100
  completa: boolean;
  parcial: boolean;
  bloqueada: boolean;
  motivo: string;       // texto pronto para a tela
}
```

## Campos de estado (sempre presentes no detalhe)

| Campo | Tipo | Leitura |
|---|---|---|
| `degradada` | boolean | `true` = o Maps não foi o executor (sidecar fora, `fast_mode` não confirmado, provider trocado). |
| `degradacao_motivo` | string \| null | Motivo legível; nunca vazio quando `degradada=true`. |
| `motivo_zero` | string \| null | `"sem_resultados"` quando a busca terminou com 0; `null` quando houve resultado. |
| `progresso` | `ProgressoDaBusca` | Checkpoint por termo. `{}` em busca antiga/sem início. |
| `progresso_pct` | number | Maps: `Resumo.percentual`. Outros providers: células processadas. |
| `parcial_motivo` | string \| null | Maps: motivo de degradação, bloqueio ou “X de Y termos”. Outros: `null`. |
| `parcial` | boolean \| null | Maps: `!completa`. Outros: `null`. |
| `parada_solicitada_em` | ISO \| null | Quando o operador pediu pause. |
| `estado_parada` | `"parando" \| "parado" \| null` | `parando` = termo em curso; `parado` = motor já fechou. |
| `parada_maxima_s` | number | `125` (120 s do termo + folga de escrita). |
| `encontradas` | number | Soma `termos_encontradas` (bruto do provider). |
| `novas` | number | Vínculos `primeira_vez=true` (inclui o degrau “provável”? **não**: provável entra em duplicadas). |
| `duplicadas` | number | Vínculos `primeira_vez=false` (place_id/telefone/provável). |

`estado_parada` é derivado: `running` + `parada_solicitada_em` → `parando`;
`paused` + `parada_solicitada_em` → `parado`. Não há status novo no banco.

## Endpoints

### `GET /api/v1/prospecting/searches/[id]`

```json
{
  "data": {
    "id": "33333333-3333-4333-8333-333333333333",
    "provider": "maps_browser",
    "status": "running",
    "categorias": ["oficina mecânica", "auto peças"],
    "cidade": "Canoinhas",
    "estado": "SC",
    "raio_km": 30,
    "max_empresas": 20,
    "total_celulas": 0,
    "celulas_processadas": 1,
    "encontradas": 40,
    "novas": 12,
    "duplicadas": 28,
    "erros": 0,
    "progresso_pct": 50,
    "progresso": {
      "termos_total": 2,
      "termos_concluidos": ["oficina mecânica"],
      "termos_falhos": [],
      "termo_atual": "auto peças",
      "tentativas": 0,
      "bloqueio": null,
      "termos_encontradas": { "oficina mecânica": 40 }
    },
    "parcial_motivo": "1 de 2 termos concluídos, 1 pendente(s).",
    "parcial": true,
    "motivo_zero": null,
    "degradada": false,
    "degradacao_motivo": null,
    "parada_solicitada_em": null,
    "estado_parada": null,
    "parada_maxima_s": 125,
    "ultimo_erro": null,
    "created_at": "2026-12-03T12:00:00.000Z",
    "started_at": "2026-12-03T12:00:02.000Z",
    "finished_at": null
  }
}
```

### Parcial (termo morto após 3 tentativas)

```json
{
  "data": {
    "provider": "maps_browser",
    "status": "completed",
    "encontradas": 40,
    "novas": 12,
    "duplicadas": 28,
    "progresso": {
      "termos_total": 2,
      "termos_concluidos": ["oficina mecânica"],
      "termos_falhos": ["auto peças"],
      "termo_atual": null,
      "tentativas": 0,
      "bloqueio": null,
      "termos_encontradas": { "oficina mecânica": 40 }
    },
    "progresso_pct": 100,
    "parcial_motivo": "1 de 2 termos concluídos; 1 falharam após as tentativas.",
    "parcial": true,
    "motivo_zero": null,
    "degradada": false,
    "degradacao_motivo": null,
    "estado_parada": null,
    "parada_maxima_s": 125
  }
}
```

### Zero resultados

```json
{
  "data": {
    "provider": "maps_browser",
    "status": "completed",
    "encontradas": 0,
    "novas": 0,
    "duplicadas": 0,
    "progresso": {
      "termos_total": 1,
      "termos_concluidos": ["oficina mecânica"],
      "termos_falhos": [],
      "termo_atual": null,
      "tentativas": 0,
      "bloqueio": null,
      "termos_encontradas": { "oficina mecânica": 0 }
    },
    "progresso_pct": 100,
    "parcial_motivo": "1 de 1 termos concluídos.",
    "parcial": false,
    "motivo_zero": "sem_resultados",
    "degradada": false,
    "degradacao_motivo": null,
    "estado_parada": null,
    "parada_maxima_s": 125
  }
}
```

A tela de zero mostra o motivo e as três ações (ampliar raio, OSM, Places); nunca lista vazia sem texto.

### Degradada (`fast_mode` não confirmado / sidecar fora / provider trocado)

```json
{
  "data": {
    "provider": "maps_browser",
    "status": "paused",
    "encontradas": 0,
    "novas": 0,
    "duplicadas": 0,
    "progresso": {
      "termos_total": 2,
      "termos_concluidos": [],
      "termos_falhos": [],
      "termo_atual": null,
      "tentativas": 0,
      "bloqueio": {
        "motivo": "sidecar_em_modo_navegador: o job não confirmou fast_mode=true; abortado antes de rodar (a imagem distroless não tem Chromium).",
        "em": "2026-12-03T12:00:30.000Z"
      },
      "termos_encontradas": {}
    },
    "progresso_pct": 0,
    "parcial_motivo": "Descoberta degradada: sidecar_em_modo_navegador: o job não confirmou fast_mode=true; abortado antes de rodar (a imagem distroless não tem Chromium).",
    "parcial": true,
    "motivo_zero": null,
    "degradada": true,
    "degradacao_motivo": "sidecar_em_modo_navegador: o job não confirmou fast_mode=true; abortado antes de rodar (a imagem distroless não tem Chromium).",
    "parada_solicitada_em": null,
    "estado_parada": null,
    "parada_maxima_s": 125
  }
}
```

### Parando (pause pedido no meio do termo)

```json
{
  "data": {
    "status": "running",
    "parada_solicitada_em": "2026-12-03T12:01:00.000Z",
    "estado_parada": "parando",
    "parada_maxima_s": 125,
    "parcial_motivo": "1 de 2 termos concluídos, 1 pendente(s)."
  }
}
```

Após o motor fechar o termo: `status: "paused"`, `estado_parada: "parado"`, mesmo `parada_solicitada_em`.

## `GET /api/v1/prospecting/searches` (lista)

`{ "data": [ ... ] }` com os mesmos campos do detalhe, sem `degradacao_motivo` omitido:
cada item traz `progresso`, `motivo_zero`, `degradada`, `degradacao_motivo`,
`estado_parada` e `parada_maxima_s`. `parcial_motivo` é `null` para providers
diferentes de `maps_browser` (o caminho de células não tem esse conceito).

## `POST /api/v1/prospecting/searches` (201)

Cria a busca. Resposta: `{ "data": { id, provider, progresso, motivo_zero,
degradada, degradacao_motivo, parcial_motivo, estado_parada: null,
parada_maxima_s: 125, total_celulas } }`.

## `PATCH /api/v1/prospecting/searches/[id]` (`pause` | `resume` | `cancel`)

- `pause` em `running`: grava `parada_solicitada_em`, mantém `running` e devolve
  `estado_parada: "parando"`; o motor fecha o termo e grava `paused`.
- `pause` em `queued`: grava `paused` direto (não há termo em curso).
- `resume`: `queued` + `parada_solicitada_em: null`.
- `cancel`: `cancelled` + `parada_solicitada_em: null` (kill-switch imediato;
  o job HTTP em curso termina o termo, no máximo 120 s).

Resposta: `{ "data": { id, status, parada_solicitada_em, degradada,
degradacao_motivo, estado_parada, parada_maxima_s: 125 } }`.

## O que a tela NÃO deve inferir

- Não existe `status: "parcial"` nem `"degradada"` no banco. Use
  `progresso`/`parcial` para parcial e `degradada` + `degradacao_motivo` para
  degradação.
- `novas` não inclui o degrau “provável”: ele grava a linha, mas conta em
  `duplicadas` (já existia) e leva `candidato_duplicado_de` para revisão.
- `place_id` é a identidade; `telefone` E.164 e nome+CEP são os outros degraus.
- `motivo_zero` só existe quando `encontradas = 0` no total da busca.
