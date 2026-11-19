# 45 — Inbox: o passe de design na lista e na thread

**Data:** 19/11/2026 · **Base:** `nexus/main` @ `3f28a8fb` · **Método:** recorte
de design (hierarquia, tipografia, espaçamento, densidade e estados), medido em
`next dev` no Supabase local com a org de teste do `.e2e-creds.json`.

Não é auditoria de acessibilidade nem mudança de regra: **nenhuma query, handler
ou condição de negócio mudou**. O que mudou é o que a tela diz e o quanto ela
ocupa.

## Por que dois PRs

A lista e a thread são 5 arquivos e ~1.300 linhas. Um PR só esconderia a
revisão atrás de 40 KB de diff. O recorte é por TELA:

| PR | Tela | Arquivos |
| --- | --- | --- |
| #623 | Lista (`/app/inbox`) | `ConversationList`, `ConversationListItem`, `InboxFilters` |
| #624 | Thread (`/app/inbox/<id>`) | `ChatThread`, `ConversationHeader`, `InboxLayout` |

## Lista — o que mudou

1. **Hierarquia da linha.** Nome e hora tinham o mesmo tamanho (14px/600 e
   12px/400) e a prévia da mensagem estava no cinza-mudo, no MESMO tamanho da
   hora. Agora: nome 14px `semibold` (ou `bold` com não-lidas), prévia 13px
   `leading-snug` (e sobe para a tinta + `medium` quando há não-lidas), hora
   11px.
2. **Densidade.** Respiro da linha 12px → 10px; margem da coluna unificada em
   14px (o filtro usava 16px e a linha 16px, com 0px de alinhamento entre o
   campo de busca e o avatar); a faixa de selos deixou de existir quando não há
   selo nenhum (era 6px de margem para um `div` vazio em toda linha de
   instalação com um canal só).
3. **Estados.** Carregando ganhou a forma da linha (avatar + duas linhas, oito
   delas) + `aria-busy` + "Carregando conversas…" em `role="status"`; vazio em
   `role="status"`; "Carregar mais" em largura inteira.
4. **Leitura por leitor de tela.** Iniciais do avatar são decoração
   (`aria-hidden`) e o selo de não-lidas diz "não lidas".
5. **Contraste na linha selecionada.** No tema escuro o metadado de 10px
   (`Entrou por …`) sobre `accent-soft` reprovava AA — o axe pegou
   (`color-contrast`). Em linha selecionada, o metadado de 10px vai na tinta.

### Medido (1440×900 e 390×844, temas claro e escuro)

| Medida | Antes | Depois |
| --- | --- | --- |
| Overflow horizontal (1440) | 0 px | **0 px** |
| Overflow horizontal (390) | 0 px | **0 px** |
| Coluna da lista (1440) | 272 px | 272 px |
| Coluna da lista (390) | 342 px | 342 px |
| Bloco de filtros (1440) | 272 px | **256 px** |
| Bloco de filtros (390) | 240 px | **224 px** |
| Altura da linha | 105 px | 105 px |
| Linhas inteiras na tela | 5 | 5 |
| axe crítico | 0 | **0** |
| axe sério | 1 (shell) | 1 (shell) |

**A ALTURA DA LINHA NÃO MUDOU — e a tabela diz o porquê.** O respiro caiu 4px,
os intervalos 2px, e a prévia subiu de 12px para 13px (+2px de entrelinha): o
ganho de legibilidade consumiu o ganho de densidade. Em troca, o bloco de
filtros devolveu 16px — a tela ganhou densidade onde ela não custa leitura.

A violação séria do axe é **pré-existente e do shell**, não do inbox: o seletor
de empresa da TopBar (`[data-testid="tenant-switcher"]`,
`label-content-name-mismatch`) aparece em toda tela do produto, nos dois temas, e
está igual no "antes". Não é crítica, e corrigi-la é mudar o shell — outro
recorte.

## Thread — o que mudou

1. **Cabeçalho.** Nome (16px/700) e selo de estado (12px/700) tinham o mesmo
   peso lado a lado. O nome fica `semibold` com tracking apertado e o selo desce
   para 11px/600. Telefone em 12px `tabular-nums`.
2. **Estados do fio.** Carregando com a forma da conversa (bolhas alternando de
   lado, sobre o fundo do fio) + `aria-busy`/`role="status"`; erro em
   `role="alert"`; conversa sem histórico com ícone e `role="status"`.
3. **Permissão.** "Conversa não encontrada ou fora do seu acesso" era um `<div>`
   centrado sem saída. Passa a `NexusErrorState` (`variant="denied"`) com
   "Voltar para as conversas".
4. **Canvas vazio.** Ícone, explicação e as teclas dos atalhos que já existem
   (j/k, r, ?). O texto exato é mantido — `invite-lifecycle` e `rbac-roles`
   provam a tela por ele.
5. **Landmark.** `role="region"` + "Mensagens da conversa" no fio.

### Medido

| Medida | Antes | Depois |
| --- | --- | --- |
| Overflow horizontal (1440) | 0 px | 0 px |
| Overflow horizontal (390) | 0 px | 0 px |
| Título do contato | 16px/700 | **16px/600** |
| Selo de estado | 12px/700 | **11px/600** |
| Ações sem nome acessível | 0 | **0** |
| Foco visível (anel) | 2px sólido | 2px sólido |
| axe crítico | 0 | 0 |

## O que NÃO foi feito, e por quê

- **Título visível "Inbox" na coluna.** O `<h1>` já existe (`sr-only`) e a
  decisão está registrada em `InboxLayout`: um "Inbox" em 24px no topo roubaria
  altura de conversa no celular, que é o espaço que a lista e o composer
  disputam. Não contradisse a decisão.
- **Recolher os dois selects + o interruptor atrás de "Filtros" no celular.**
  É a maior alavanca de densidade que sobrou (224px de filtro em 844px de tela),
  mas é mudança de INTERAÇÃO, não de desenho: esconde controle. Fica proposta,
  com o número medido, para decisão.
- **A violação séria do shell** (`tenant-switcher`), medida e fora do recorte.
