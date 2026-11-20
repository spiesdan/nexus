# Admin — módulo Configuração

> **Escopo:** `/admin/usage`, `/admin/platform-admins`, `/admin/marca`,
> `/admin/google` e `/admin/observabilidade` — a rodada do módulo.
> **Como foi medido:** `tests/captura-admin-matriz.ts` com **build de produção**
> (`next build` + `next start`), claro/escuro × 1440/390, sessão `dono` por
> cookie, `h1` por timeout antes do PNG e `urlFinal` registrada. Servidor
> derrubado no fim.
> **Nada aponta para produção.** Sem deploy.

## Antes/depois (mesma base, mesma rodada)

| Tela | Antes | Depois |
|---|---|---:|
| `/admin/usage` — axe critical (`button-name`) | **1** nas 4 combinações | **0/0** |
| `/admin/usage` — alvos < 40 px (1440/390) | **2 / 1** | **0 / 0** |
| `/admin/platform-admins` — axe serious (contraste) | **1** no escuro 1440 (`#008236` sobre `#151515` = **3,69:1**) | **0/0** |
| `/admin/platform-admins` — alvos | **1 / 1** | **0 / 0** |
| `/admin/marca` — alvos | **2 / 0** | **0 / 0** |
| `/admin/google` — axe serious (contraste) | **1** no escuro (`#909090` sobre `#3c3226` = **3,92:1**) | **0/0** |
| `/admin/google` — alvos | **1 / 0** | **0 / 0** |
| `/admin/observabilidade` — alvos | **1 / 0** | **0 / 0** |

Overflow **0** e console **0** nas cinco, antes e depois.

## O que mudou (primitiva + varredura)

- **`campo-de-arquivo`** (primitiva compartilhada): o botão “Escolher arquivo”
  media 36 px → `min-h-10`. Vale para toda tela que usa o campo.
- **usage**: o `SelectTrigger` de período não tinha nome acessível
  (`button-name` crítico) → `aria-label="Período"`; “Exportar CSV” em 40 px.
- **platform-admins**: o selo “Ativo” usava `green-500/green-700` fixos
  (**3,69:1** no escuro) → `Badge variant="success"` (6,13:1); a linha revogada
  perdeu o `opacity-60` que apagava o texto; “Ver runbook →” em 40 px.
- **google**: o aviso de credenciais usava `text-text-muted` sobre
  `bg-warning-bg` (**3,92:1**) → `text-warning-fg`; “Salvar” em 40 px.
- **marca**: “Salvar” em 40 px (o “Escolher arquivo” veio da primitiva).
- **observabilidade**: “Tentar novamente” (estado de erro) em 40 px.

## Nota de ambiente (não é defeito de produto)

A primeira captura de `/admin/observabilidade` deu **500** porque o Supabase
**local** é anterior às tabelas `api_request_samples`/`api_request_probes` e às
funções `fn_slo_api_*` que já estão no `baseline.sql`. Aplicado o trecho do
baseline no banco local e semeadas amostras sintéticas, a tela mediu limpa. Em
produção as tabelas existem; o 500 era o ambiente, não a tela.

## Prova dirigida

`eslint` zerado; `tsc --noEmit` completo: exit 0.
