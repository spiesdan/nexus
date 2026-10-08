# evidence/ — as provas visuais do CRM Vivo

Cada wave tem seu índice: `wave-0.md`, `wave-1.md`, `wave-2.md`. Os PNGs são a prova;
os `.md` dizem o que cada um prova, contra qual commit, e o que ficou vermelho.

## Os dois tipos de evidência — e por que a distinção não é burocracia

| | **REPRODUZÍVEL** | **HISTÓRICA** |
|---|---|---|
| Como regenerar | rodar o script de novo | **não dá** |
| Por quê | o código que a produz continua lá | o código que produziu aquele estado **não existe mais** |
| Sobrescrever | inofensivo | **destrói a única cópia**, sem deixar rastro do que havia |
| Exemplo | `wave-2-board-depois.png` | `wave-0-board-antes.png` |

O **"antes" de uma wave vira histórico no instante em que a wave é commitada.** A partir
dali, aquele PNG é a única testemunha de um estado que ninguém consegue mais reconstruir —
nem com `git checkout`, porque o board depende de dados, de build e de um servidor vivo
naquele momento.

Tratar evidência histórica como saída de script é **erro de categoria**: script produz
artefato descartável; registro histórico é imutável por natureza.

## A proteção

`tests/qa-helpers.ts` mantém a lista `EVIDENCIA_HISTORICA`. Antes de gravar, o
`guardaEvidencia()` **recusa sobrescrever** um desses arquivos — e diz **qual** arquivo e
**por quê**:

```
[evidencia] RECUSADO sobrescrever "wave-0-board-antes.png": é evidência HISTÓRICA — o
código que produziu aquele estado não existe mais, então este PNG é a única cópia e não
pode ser regenerado.
Se você realmente quer perder o "antes", rode com FORCE=1.
```

Recusar **em silêncio** seria a mesma falha silenciosa que esta entrega inteira existe
para caçar. A recusa grita, nomeia o arquivo e oferece a saída consciente (`FORCE=1`).

Evidência reproduzível segue sobrescrevendo sem atrito — a guarda só vale para a lista.

## Como uma evidência nasce

Todo PNG aqui veio de navegação **como usuário**: login pela tela (com MFA quando o papel
exige), cliques até o destino, zero navegação por URL direta e zero asserção de API
tratada como prova. Os capturadores:

| Script | O que produz |
|---|---|
| `tests/capture-wave-0.ts` | linha de base do board (**histórica**) |
| `tests/capture-wave-1.ts` | os 4 cenários do dono-agente + axe + paridade de avatar |
| `tests/capture-wave-1-bulk.ts` | atribuição em massa sobre lead de dono agente |
| `tests/capture-wave-2.ts` | gate de altura constante, orçamento de elementos, axe |
| `tests/compose-antes-depois.ts` | o antes/depois lado a lado (cenário 8) |
| `tests/sonda-abas-do-inbox.ts` | a faixa de abas do inbox em 5 larguras (medição, não captura) |

A sonda de abas do inbox não captura cenas de usuário: ela **mede** a faixa de
filtros (colisão de rótulo, estouro de caixa, rolagem) em cinco larguras — md,
xl e 2xl — e grava a prova de cada medição: `evidence/abas-inbox-900.png`,
`evidence/abas-inbox-1280.png`, `evidence/abas-inbox-1440.png`,
`evidence/abas-inbox-1536.png` e `evidence/abas-inbox-1920.png`. O caso é o
conserto das abas colidindo em coluna estreita (PR do branch
`fix/inbox-abas-sem-sobreposicao`), e o `1280` é o aperto máximo: coluna de 272px.

`tests/capture-wave-2.ts` tem dois modos que auditam o **próprio instrumento**:

- `DEMO=1` — imprime a mensagem de falha sem navegador, para revisar o **formato** do
  relatório antes de precisar dele;
- `SELFCHECK=1` — infla um card por CSS e **exige** que o gate reprove. Gate que só foi
  visto passando é carimbo, não gate.

## 08/10 — Fotos do catálogo voltando a aparecer

- `evidence/fotos-produto-carregam.png` — coluna de fotos do catálogo com as
  imagens visíveis, capturada contra o site público **depois** da 1.25.3
  (PR #53). A captura é a ponta de uma cadeia que o spec
  `tests/fiscal/fotos-carregam.spec.ts` mede inteira, porque cada ponta já
  mentiu verde sozinha antes: semeei a foto, o *upload* respondia 200, o lote
  respondia 200, a URL respondia 200 com `image/png` — e a tela renderizava
  **zero** `<img>`. Foto nenhuma aparecia, e nenhuma dessas respostas apontava
  para o defeito. O spec mede os cinco `<img>` renderizados na tela e falha se
  algum deles não carregar.

## 06/10 — SPED Bloco H editável e barra de notas

- `evidence/sped-bloco-h/sped-arquivo-editavel.png` — arquivo EDF ICMS/IPI com Bloco H gerado e textarea editável (spec 20 / PR #36).
- `evidence/notas-barra/1-barra-notas-ainda-vazia.png` — barra de ações da tela de Notas visível mesmo sem notas (PR #32).
