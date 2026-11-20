# Admin — módulo Incidentes

> **Escopo:** `/admin/incidents` e `/admin/incidents/[id]` — a rodada do módulo.
> **Como foi medido:** `tests/captura-admin-matriz.ts` com **build de produção**
> (`next build` + `next start`), claro/escuro × 1440/390, sessão `dono` por
> cookie, `h1` esperado (15 s) antes do PNG e `urlFinal` registrada. Servidor
> derrubado no fim.
> **Fixture:** um incidente local sintético (`fixture_matriz_41`) para exercitar
> a ficha; nada de produção.
> **Nada aponta para produção.** Sem deploy.

## Antes/depois (mesma base, mesma rodada)

| Tela | Medida | Antes | Depois |
|---|---|---:|---:|
| `/admin/incidents` | axe critical (`button-name`) | **1** nas 4 combinações | **0/0** |
| `/admin/incidents` | alvos < 40 px (1440/390) | **3 / 3** | **0 / 0** |
| `/admin/incidents/[id]` | axe serious a 390 | **1** | **0/0** |
| `/admin/incidents/[id]` | alvos < 40 px (1440/390) | **2 / 1** | **0 / 0** |

Overflow 0 e console 0 nas duas; contraste mínimo 4,74:1 nos dois temas.

## O que mudou

### Lista

- **`button-name` crítico**: os dois `SelectTrigger` (“Abertos” e “Todas
  severidades”) não tinham nome acessível — o valor visível é texto dentro do
  `SelectValue`, e o Radix põe `role="combobox"` num `button`. Ganharam
  `aria-label` (“Filtrar por status” / “Filtrar por severidade”).
- Filtros e o link “Ver” de cada linha: 36/18 px → `min-h-10` (o “Ver” com
  `min-w-10`), como nas outras listas.

### Ficha

- Breadcrumb “Incidentes” e “Resolver incidente”: `min-h-10`.
- **Payload** (`<pre>`) e **auditoria do incidente** (lista com `max-h`): eram
  regiões roláveis sem foco — ganharam `role="region"`, `aria-label` e
  `tabIndex={0}`. A do `main` já veio da primitiva do módulo usuários.

## O que NÃO foi mudado, e por quê

- O payload continua em `<pre>` (leitura fiel do JSON), agora focável.
- O incidente de fixture é local e serve só à captura; nenhuma regra mudou.

## Prova dirigida

`eslint` zerado; `tsc --noEmit` completo: exit 0.
