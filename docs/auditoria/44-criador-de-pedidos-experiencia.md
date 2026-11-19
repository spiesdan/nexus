# Estudo C — criador de pedidos: a experiência medida (19/11/2026)

> **Regra desta rodada:** `_editor.tsx`, `_cliente.tsx` e `_itens.tsx` são do F.
> Nada neles foi tocado. O protótipo vive em
> `app/app/pedidos/novo-experimento/` (arquivos **copiados**), sem link no produto.
> Medição com Playwright e banco **local**; nenhum pedido em produção.

## 0. O que a premissa supunha — e o que o código tem

O despacho falava em "wizard de 5 etapas". **Ele não existe.** O editor atual é
uma **página única com quatro seções numeradas** (cliente, representada,
produtos, detalhes) e o próprio arquivo registra a decisão:

> "Uma página só, como o Mercos: as quatro seções … ficam todas visíveis e o
> estado é único. Nada de passo escondendo campo." — `_editor.tsx:174`

O que existe de "etapa" é a **prévia** (`Visualizar` / `Prévia do pedido`), que é
o papel de revisão do wizard. Então a comparação honesta desta rodada é:

- **A — o que está no produto:** página única em coluna de 1024 px, resumo
  **dentro** da seção de produtos (`_editor.tsx:882`), apesar de o comentário
  antigo prometer "70/30 no desktop, barra sticky no mobile" (`_editor.tsx:95`).
- **B — o protótipo:** a mesma página única, com o resumo numa **coluna
  persistente** (`lg:sticky`), fora do fluxo das seções.

## 1. Medição do fluxo atual (A)

Caso único: **cliente cadastrado (`Ana Souza`) + 3 produtos + desconto R$ 5 +
Gerar pedido**. Instrumento: `scripts/auditoria/criador-de-pedidos.mjs`
(`pointerdown` = clique, `keydown` = tecla, tempo do primeiro evento ao pedido
criado, erros = console + pageerror + HTTP ≥ 400 + alerta visível).

| Config | Execuções | Sucessos | Cliques (mediana) | Teclas (mediana) | Tempo (mediana) | Erros |
| --- | --- | --- | --- | --- | --- | --- |
| desktop 1440 | 3 | 3/3 | **7** | **34** | **5.082 ms** | 0 |
| celular 390 | 3 | 3/3 | **7** | **34** | **4.509 ms** | 0 |

Rodadas: 6.104 / 5.082 / 4.533 ms (desktop) · 4.462 / 4.541 / 4.509 ms (celular).

## 2. Medição do protótipo (B)

Mesmo caso, mesmo instrumento, mesma sessão:

| Config | Execuções | Sucessos | Cliques | Teclas | Tempo | Erros |
| --- | --- | --- | --- | --- | --- | --- |
| desktop 1440 | 3 | 3/3 | **7** | **34** | **4.545 ms** | 0 |
| celular 390 | 3 | 3/3 | **7** | **34** | **4.396 ms** | 0 |

Diferença: **−10,6%** no desktop (−537 ms) e **−2,5%** no celular (−113 ms).
Cliques e teclas são **idênticos** — a tela única não encurta o caminho, e isso
é o achado, não um detalhe.

## 3. O que a hipótese realmente muda: o total à vista

Medido passo a passo (o resumo está dentro da janela? topo em px):

| Momento | A · desktop | B · desktop | A · celular | B · celular |
| --- | --- | --- | --- | --- |
| tela aberta | não (901) | **sim (104)** | não (1149) | não (2171) |
| cliente escolhido | não (945) | **sim (104)** | não (1193) | não (2215) |
| produto 1 | não (1211) | **sim (104)** | não (849) | não (1871) |
| produto 2 | não (1311) | **sim (104)** | não (979) | não (2001) |
| produto 3 | não (1433) | **sim (104)** | não (1109) | não (2131) |
| desconto | sim (413) | **sim (104)** | sim (385) | sim (493) |

**Desktop: 1/6 → 6/6.** O vendedor vê subtotal, desconto e total enquanto
escolhe o produto 2 e 3 — hoje eles ficam 1.200–1.400 px abaixo da dobra.

**Celular: 1/6 → 1/6 — e pior.** Sem `lg`, o `lg:sticky` não vale e o resumo
cai para **2.171 px** (contra 1.149 px de A). O protótipo, como está, **regride
o celular**: o resumo persistente não acontece fora do desktop.

## 4. Veredito

| Perfil | Vence | Por quê (medido) |
| --- | --- | --- |
| **Vendedor experiente** (sabe o que quer, digita códigos, teclado) | **B no desktop** | mesmos 7 cliques/34 teclas, −10,6% no tempo e o total visível em 6/6 momentos; a coluna não atrapalha o fluxo |
| **Vendedor ocasional** (confere preço/total a cada item) | **B no desktop, com folga** | é exatamente quem hoje rola até o fim para ver o total; 6/6 vs 1/6 |
| **Celular (qualquer perfil)** | **empate técnico, ambos ruins** | A 1/6 com resumo a 1.149 px; B 1/6 a 2.171 px — o resumo precisa de barra fixa no rodapé, que nenhum dos dois tem |

**Recomendação:** adotar a coluna persistente **no desktop** e **não** levar o
protótipo ao celular como está. No celular, a fatia seguinte deve ser uma
**barra fixa** (total + Gerar) — é a peça que falta nos dois desenhos.

**O que manter do desenho atual mesmo se a coluna vencer:**

1. **A prévia** ("Visualizar" / "Revisar pedido") — é a revisão que o wizard
   daria, e ela é modal de propósito: não compete com a edição.
2. **As ações no cabeçalho** (Gerar/Visualizar/Enviar/Mais opções): o protótipo
   manteve, e a medição não mostrou motivo para mover — o resumo com
   `mostrarAcoes={false}` foi decisão consciente.
3. **A ordem das seções** (cliente → produtos → detalhes): o protótipo não
   mudou; só o resumo saiu de dentro de produtos.

## 5. Lista do que não pode regredir — verificado no protótipo

| Item | Como foi verificado | A (produto) | B (protótipo) |
| --- | --- | --- | --- |
| Atalho `/` foca a busca de produto | `keyboard.press("/")` → `document.activeElement.id` | `busca-produto` ✓ | `busca-produto` ✓ |
| 320 px sem rolagem horizontal | `scrollWidth − clientWidth` | 0 ✓ | 0 ✓ |
| 390 px: fluxo completa | 3 execuções | 3/3 ✓ | 3/3 ✓ |
| Offline: autosave continua | `context.setOffline(true)` + digitar desconto | grava ✓ | grava ✓ |
| Autosave: grava item e desconto | `localStorage["pedido-rascunho"]` | 636 B, `linhas`+`descontoTexto` ✓ | idem ✓ |
| Autosave: **restaura** após reload | reload + contar linhas | item volta ✓ | item volta ✓ |
| **Desconto restaurado** | `#desconto` depois do reload | **"" ✗** | **"" ✗** |
| Leitor de tela: resumo nomeado | `aside[aria-label]` | — (não é aside) | `aria-label="Resumo do pedido"` ✓ |
| Foco visível nos campos | foco por teclado no `#desconto` | ✓ | ✓ |

**Defeito encontrado nos dois (não é do protótipo, é herdado):** o rascunho
**salva** `descontoTexto`, mas a restauração (`_editor.tsx:333-368`) não chama
`setDescontoTexto` — o desconto some ao voltar. Fica registrado para o F; não
corrigi porque o arquivo é dele.

**Observação de instrumento:** o toast "Rascunho anterior restaurado" apareceu
em 1 de 2 execuções de cada tela — a restauração em si (item volta) foi
consistente; o toast é que é instável de observar. Não usei o toast como prova.

## 6. O que este estudo NÃO fez

- Não alterou nenhum arquivo de `app/app/pedidos/novo/` (do F).
- Não mediu a jornada de IA (`_ia.tsx`) nem a de cliente avulso.
- Não mediu leitor de tela de verdade (NVDA/VoiceOver): o que está medido é
  nome acessível e ordem de foco, não a experiência narrada.
- Não aplicou o desenho no produto. O caminho
  `app/app/pedidos/novo-experimento/` existe só para o experimento e não é
  linkado de lugar nenhum.

## Reproduzir

```bash
# app local + Supabase local de pé
BASE=/app/pedidos/novo              SAIDA=/tmp/medicao-atual.json        node scripts/auditoria/criador-de-pedidos.mjs
BASE=/app/pedidos/novo-experimento  SAIDA=/tmp/medicao-experimento.json   node scripts/auditoria/criador-de-pedidos.mjs
```
