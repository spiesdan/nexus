# Expedição — identidade visual aplicada (19/11/2026)

> **Régua:** o dono foi explícito — *"medir acessibilidade não conta como redesign"*.
> Este recorte aplica **hierarquia, tipografia, densidade e estados** nas cinco telas
> da expedição, com captura antes/depois e número por tela. Nenhuma regra de negócio
> foi tocada: nada de status, permissão, cálculo de rota ou fechamento mudou.
>
> Capturas: `capturas/antes-expedicao/` e `capturas/depois-expedicao/`.

## Matriz por rota

| Rota | Antes | Depois | Captura |
| --- | --- | --- | --- |
| `/app/expedicao` | número 18 px, estado em cinza-mudo, barra solta da contagem, grupo sem pílula | número 20 px, estado com peso de texto, `0` em negrito antes de `/N`, barra 56 px, contagem em pílula | `antes-expedicao/desktop_app_expedicao.png` → `depois-expedicao/desktop_app_expedicao.png` |
| `/app/expedicao/<id>` (paradas/romaneio) | 3 blocos cinza sem título; "Endereço não informado" duas vezes; excluir colado em imprimir | moldura com número, status, abas e "Carregando a carga…"; endereço uma vez; divisor antes de excluir | `antes-expedicao/<id>_dark_1440.png` → `depois-expedicao/carregando-detalhe.png` |
| `/app/expedicao/<id>/rota` | 3 blocos cinza; faixa de métricas com célula vazia | moldura + esqueleto com forma (métricas + mapa); 5 métricas em uma linha ≥1280 px | `antes-expedicao/<id>_rota_light_1440.png` → `depois-expedicao/desktop_app_expedicao_..._rota.png` |
| `/app/expedicao/<id>/fechamento` | 3 blocos cinza | moldura + esqueleto de faixa e lista; erro inline com "Tentar novamente" | `antes-expedicao/<id>_fechamento_light_1440.png` → `depois-expedicao/carregando-fechamento.png` |
| `/app/expedicao/<id>/motorista` | 3 blocos cinza (o `h1` da cabine é `sr-only`: nem título pintava) | moldura + esqueleto de lista | `antes-expedicao/<id>_motorista_light_1440.png` → `depois-expedicao/carregando-rota.png` |

Cada linha foi medida nas duas larguras (1440 e 390) e nos dois temas; o conjunto
completo está em `capturas/antes-expedicao/` e `capturas/depois-expedicao/`.

## O que estava errado (medido, não opinado)

| Sintoma | Onde | Antes (captura) |
| --- | --- | --- |
| **Esqueleto sem estrutura**: 3 retângulos cinza, sem número, sem aba, sem dizer o que carrega | `/expedicao/<id>`, `/rota`, `/fechamento`, `/motorista` | `antes-expedicao/*_dark_1440.png` — `h1: []`, 3 blocos |
| **Número da carga pequeno** (18 px) para o identificador principal da linha | lista | `antes-expedicao/desktop_app_expedicao.png` |
| **Status como metadado**: "Em rota" saía em cinza-mudo, no mesmo peso da data | lista | idem |
| **Barra de progresso solta**: traço de 80 px separado da contagem por 40 px | lista | idem |
| **Endereço dito duas vezes** na mesma parada ("Endereço não informado" inline + bloco com pino) | detalhe | `antes-expedicao/<id>_light_1440.png` |
| **Destruir colado em imprimir**: "Excluir romaneio" na mesma fita, sem separação | detalhe | idem |
| **Célula vazia** na faixa de métricas (5 itens em grade de 3 → buraco na 2ª linha) | rota | `antes-expedicao/<id>_rota_light_1440.png` |

## O que foi feito, por tela

### 1. Lista — `/app/expedicao`

- **Número** `text-lg` → `text-xl tracking-tight`: é a identidade da linha, não um
  detalhe ao lado de um rótulo.
- **Estado** deixa de ser metadado: ganha `font-medium text-text` (o ponto colorido
  continua dizendo a cor; o texto deixou de competir com a data em cinza).
- **Progresso**: `0` em negrito antes de `/1 paradas`, e a barra de 80 px → 56 px
  para colar no número que ela desenha.
- **Contagem do grupo** ("NA RUA 1", "NA DOCA 26") vira pílula `bg-muted`, em vez de
  texto solto no fim da linha.

### 2. Ficha, rota, fechamento e motorista — a moldura pinta antes do dado

A causa raiz: `CargaClient` só renderizava **depois** de `detalhe`, então tudo —
número, status, abas — esperava o fetch do cliente. O `_contexto.ts` já lê a linha
no servidor; agora ele leva `numero, placa, veiculo_tipo, motorista_nome, status,
created_at` e a moldura usa isso.

- Esqueleto com **forma**: voltar → `Carga 031` + selo de status → abas (com a ativa
  marcada) → `Carregando a carga…` → blocos no formato da seção (faixa + lista; na
  rota, métricas + mapa).
- `aria-busy` + `aria-live` no contêiner: o leitor de tela anuncia o carregamento.
- Estado de erro preservado dentro da moldura (`NexusErrorState` + Tentar novamente),
  provado com a chamada bloqueada: `depois-expedicao/carregando-*.png`.

### 3. Detalhe — paradas

- **Endereço uma vez só**: a linha de metadados mostra `PED-0083 · R$ 49,90` e, quando
  há endereço, o endereço; o alerta com pino virou a única voz do "não informado".
- **Ações separadas**: um divisor antes de "Excluir romaneio" — o que destrói não mora
  encostado no que imprime.

### 4. Rota — faixa de métricas

- Grade `sm:grid-cols-3 2xl:grid-cols-5` → `xl:grid-cols-5`: as cinco métricas cabem
  em uma linha a partir de 1280 px e a célula vazia some. A ordem da página **não**
  mudou: o mapa continua em cima e grande, que é decisão registrada no arquivo.

## Números

| Medida | Resultado |
| --- | --- |
| Contraste WCAG AA (dark) | **0 de 445** textos abaixo do mínimo |
| Contraste WCAG AA (light) | **0 de 417** textos abaixo do mínimo |
| Overflow horizontal (5 telas × 2 larguras) | **0** |
| Erros de console nas capturas | **0** |
| `h1` antes/depois nas subtelas | **`[]` → `"Carga 031"`** (e `"Modo motorista · Carga 031"` na cabine) |
| Tempo até a tela estar pronta (`esperouTelaMs`) | 4–822 ms, registrado por captura |
| Alvos < 40 px no CONTEÚDO (`main`), 5 telas | **12 · 11 · 11 · 1 · 1 → 0 em todas** |
| Alvos < 40 px na página inteira (instrumento do D) | lista 42→30 · detalhe 33→31; a casca (sidebar 28 px, topbar 36 px) não foi tocada — é dívida global, não da expedição |

> Sobre os alvos: o piso do WCAG 2.2 AA é **24 px**; o instrumento conta abaixo de
> 40 px (régua de conforto, não de reprovação). Ficam registrados como fila de
> trabalho, não como defeito — os links de linha são a maioria.

## O que NÃO foi tocado

- Regras de status da carga, permissões (`podeOperar/podeExcluir/podeFechar`),
  cálculo de rota, fechamento de caixa, romaneio (PDF).
- A ordem "mapa em cima" da rota: é decisão registrada em `_roteirizador.tsx`.
- Tokens globais de cor/tipografia: nenhum arquivo de `globals.css` foi alterado.

## Pendências (declaradas, não escondidas)

1. **Nome do motorista**: a linha mostra `Motorista 1795040572758` — o dado do seed é
   um telefone no campo do nome. Não é design: é cadastro. Fica para a ficha de dados.
2. **Alvos < 40 px — resolvido no conteúdo, não na casca.** As cinco telas
   ganharam um piso de **44 px** para `a`, `button` e `input` dentro do `main`
   (lista, detalhe, rota, fechamento, motorista): o instrumento mede **0** no
   conteúdo. A página inteira ainda acusa ~30 porque a sidebar (links de 28 px)
   e a topbar (ícones de 36 px) são globais; mexer nelas muda a densidade de
   todo o produto e fica como dívida própria.
3. **Toast + erro inline simultâneos** quando a carga falha: o toast "Erro inesperado"
   repete o que o bloco já diz. Unificar é uma linha, mas mexe no `showApiError` global.
