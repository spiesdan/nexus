# Admin — Audit Log (`/admin/audit`)

> **Escopo:** a lista de auditoria da plataforma e os dois defeitos que ela
> expôs na casca compartilhada por todas as 22 rotas de `/admin`.
> **Medido em:** 20/11/2026, produção (`next build` + `next start`), sessão
> `dono` por cookie, 1440×900 e 390×844, temas claro e escuro.
> **Nada aponta para produção.** Sem deploy.

## Antes/depois (mesma base, mesmo build)

| Medida | Antes | Depois |
|---|---:|---:|
| Overflow horizontal (1440/390) | **0 px** | 0 px |
| axe critical/serious | **1 sério** (`text-amber-800/80` = **4,24:1**) | **0/0** |
| Erros de console | **1** (`/api/v1/ai/inbox` **403** a cada 60 s) | **0** |
| Contraste mínimo amostrado | 4,24:1 (banner) | **4,74:1** (muted 10 px sobre elevated, escuro) |
| h1 | 16,26:1 claro · 16,6:1 escuro | igual |

Evidência: `capturas/antes-admin/audit_*.png` e
`capturas/depois-admin/audit_*.png` (8 PNGs), com `medidas.json` de cada lado.

## O que mudou

### 1. Banner “MODO PLATAFORMA” — contraste (vale para as 22)

`components/admin/PlatformModeBanner.tsx` usava `text-amber-800/80`. No
Tailwind 4 o alpha **pinta**: o par media **4,24:1** sobre `amber-100`, abaixo do
piso AA de 4,5 para texto normal. Sem o `/80`, o mesmo texto passa (o axe deixa
de acusar; o mínimo amostrado na tela sobe para 4,74).

O banner aparece em **toda** rota de `/admin` — corrigir aqui fecha a linha de
base de contraste das 22.

### 2. Sino de avisos no shell de plataforma — 403 no console

`components/shell/NotificationCenter.tsx` chama `useAgentInbox("open")`, que
consulta `/api/v1/ai/inbox` — endpoint **do tenant**. Sem organização ativa no
shell de plataforma, a resposta é **403**, registrada no console **a cada 60 s**
(polling), em qualquer tela de `/admin`.

`NotificationCenter` ganhou `ativo`; `AdminShell` passa `ativo={false}`. O sino
continua na barra (o desenho da topbar é o mesmo do tenant), sem request e sem
erro. Quando houver fonte de alerta de plataforma, ela entra nesse ponto.

## O que NÃO foi mudado, e por quê

- **Tabela rola horizontalmente no celular** (`overflow-auto` na primitiva
  `Table`): a página não estoura (0 px) e as colunas continuam alcançáveis.
  Trocar por cartões a 390 é decisão de desenho, não defeito medido.
- **`datetime-local` mostra `mm/dd/yyyy` na captura**: o formato é do
  **navegador** (controle nativo), não texto do produto. Em navegador pt-BR sai
  `dd/mm/aaaa`. Registrado como limitação do instrumento, não como achado.
- **`Actor (user ID)` em inglês**: é o vocabulário que a tela já usa para
  “Tenants” e “Actions”; não é regressão desta fatia.

## Prova dirigida

```bash
pnpm exec vitest run tests/unit/notification-center.test.tsx \
  tests/unit/admin-topbar.test.tsx tests/unit/central-de-avisos-anuncia.test.tsx \
  tests/unit/tailwind-tokens.test.ts
# 4 arquivos, 25 verdes
```

`eslint` zerado; `tsc --noEmit` dirigido: exit 0.
