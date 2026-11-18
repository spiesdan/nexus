# P1-06 — listas da API: teto declarado e ordem estável

> Medido em 18/11/2026 com `node scripts/auditoria/auditar-listas.mjs` — o
> instrumento é o mesmo antes e depois, rodado sobre `main` (`13fefad3`) e
> sobre a branch. Nenhum componente de UI foi tocado.

## 1. As duas perguntas

1. **Teto**: a rota devolve conjunto sem `.limit()`/`.range()`? Cresce com o uso
   até virar timeout do PostgREST e tela que nunca carrega.
2. **Ordem estável**: com `.order()` + `.limit()`, existe desempate por coluna
   única? `order by created_at` com duas linhas no mesmo instante devolve ordem
   **arbitrária entre execuções** — a linha da página 1 pode reaparecer na 2, e
   a que ficou de fora some sem aviso.

## 2. Antes e depois (mesmo comando)

| Medida | main `13fefad3` | branch | Δ |
|---|---|---|---|
| Rotas `GET` que consultam o banco | 207 | 207 | — |
| **Ordem sem desempate único** (com teto > 1) | **42** | **0** | −42 |
| **Conjunto sem teto** | **25** | **11** | −14 |

As 11 restantes são **bounded by design**, uma a uma:

| Rota | Por que não recebe teto |
|---|---|
| `ai/agents/assignable` | agentes de UMA organização (dezenas) |
| `ai/automatico-ativo`, `ai/knowledge/chave` | configuração única / chave |
| `ai/providers/[provider]/models` | catálogo do provedor (centenas, leitura de vitrine) |
| `cron/*` (4) | processadores de lote com janela própria; o lote é o teto |
| `products/import` | prévia do arquivo enviado — o teto é o upload |
| `shipments/[id]/fechamento` | linhas de UMA carga |
| `webhooks/meta/[token]` | processa UM evento |

## 3. O que foi corrigido

- **Desempate**: 41 arquivos ganharam `.order("id")` (ou `desc`, espelhando a
  direção da ordem principal) depois da ordem de negócio e antes do `.limit()`.
  Exemplo: `invoices` passa a `created_at desc, id desc`; `tarefas` a
  `agendada_para asc, created_at desc, id desc`.
- **Teto explícito** nas rotas que crescem com o negócio e não tinham nenhum:
  notas de conversa (200), reativações pendentes (200), templates (200), fotos de
  produto (100), equipe/atribuíveis (500), tokens de API (100), categorias de
  mensagem (100), canais da campanha (100), eventos externos da agenda (500),
  usuários/admin e admins de plataforma (500), skills (500), disponibilidade de
  atendentes (500), metas (500), propostas de dado (200), frota (500),
  recuperações de rota (200).
- Rotas que já tinham teto mantiveram o valor; só ganharam desempate.

## 4. O que fica para o Agente E (UI) — anotado, não feito

- **“Carregar mais”/contagem**: as rotas continuam devolvendo as N primeiras
  linhas; a API não expõe `has_more`/total. Quem consome lista (pedidos, notas,
  fiscal, clientes, títulos) precisa de paginação de servidor + estado de URL.
  O backend já está determinístico, que é o pré-requisito.
- **Board do pipeline** (`pipelines/[id]/board`): não recebeu teto **de
  propósito** — cortar um Kanban esconde card, e esconder card é pior que
  carregar devagar. A solução é paginação/scroll com total visível na tela.
- **Agenda** e **inbox**: já têm recorte por janela/período; o que falta é a
  tela dizer o recorte.

## 5. Como medir de novo

```bash
node scripts/auditoria/auditar-listas.mjs            # working tree
node scripts/auditoria/auditar-listas.mjs --json     # para diff entre commits
```

O script sai 1 quando há achado — é sonda de revisão, **não** gate de CI (um
gate textual sobre `.order()` reprovaria agregação e detalhe de `[id]`). A
decisão de ordem total pode ser declarada no código com
`// ordem-estavel-ok: <razão>`; hoje só `ai/skills` usa, porque `name` é único
por organização (PK de `skill_pointers`).
