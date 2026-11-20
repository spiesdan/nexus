# 49 — Sentinel: o passe visual do painel do G

**Data:** 19/11/2026 · **Base:** `nexus/main` · **Método:** recorte de design
(hierarquia, leitura de evidência, estados), medido em `next dev` no Supabase
local com as ocorrências da organização de teste.

**Nenhuma linha de detector, RPC, kill switch ou regra foi tocada.** O que mudou
é como a tela apresenta o que o motor já decidiu — `docs/frentes/front-sentinel.md`
segue valendo como está.

## O que mudou

1. **A ocorrência mais nova primeiro.** A lista era ordenada por peso de
   severidade: uma crítica de ontem ficava acima de uma crítica de agora. A
   pergunta operacional é "o que apareceu agora"; a severidade responde "quanto
   importa" — e agora ela é lida na **faixa lateral da linha** (crítica vermelha,
   alta âmbar, média azul, o resto neutra) e no selo (crítica em `semibold`).
   Empate de horário cai no peso, para a ordem ser estável.
2. **Evidência deixou de ser JSON.** O painel da ocorrência mostrava
   `JSON.stringify(…, null, 2)` num `<pre>`: preserva o dado e esconde a leitura.
   Agora cada chave vira **rótulo** (`qual nota`, `qual valor`, `qual cst`) e cada
   valor vira **valor** — números em `tabular-nums`, identificadores em mono — com
   o **JSON bruto recolhido** em `<details>` para quem quiser conferir a origem.
   A causa provável já era seção rotulada e continua.
3. **Vazio é boa notícia, e agora diz isso.** O texto era "Nenhuma ocorrência
   ainda" com instrução de varrer; agora a manchete é **"Nenhuma ocorrência — e
   isso é boa notícia"** e o subtítulo explica que a última varredura não achou
   inconsistência (e oferece varrer de novo).

## O que NÃO foi tocado (e por quê)

- **Detectores, severidades, regras**: o desenho não pediu dado novo.
- **Ações** (investigar/ignorar/encerrar/aprovar): já exigiam confirmação e
  motivo — a de ignorar diz, na própria tela, que "o motivo é o que separa um
  falso positivo conhecido de um alerta que ninguém olhou". Não reescrevi.
- **Permissão**: as ações já são gated por `podeGerir`.

## Números

| Medida | Resultado |
| --- | --- |
| Contraste AA (escuro) | **0 de 240** textos abaixo do mínimo |
| Contraste AA (claro) | **0 de 240** |
| Overflow horizontal | **0** em 1440 e 390 |
| Ocorrências na fixture | 26 abertas (8 é o número de tipos distintos que o despacho citava; a org local tem 26 linhas) |
| Painel da ocorrência | **3 campos** de evidência renderizados como rótulo/valor · JSON bruto recolhido · "Causa provável" presente |

## Capturas

`capturas/antes-sentinel/`, `capturas/depois-sentinel/` (claro/escuro × 1440/390)
e `capturas/sentinel-detalhe-{light,dark}-1440.png` (o painel com a evidência em
campos).

## Achado de instrumento (declarado)

O primeiro clique automatizado em "Abrir" pegou o **widget do assistente**
(que também é `role="dialog"`), e a captura do painel saiu vazia. Corrigido no
script com escopo em `tbody`; não é defeito da tela, mas é a segunda vez que o
assistente intercepta medição — vale registro.

## Pendência (não tocada)

O cartão "Alta prioridade" conta **críticas e altas** juntas (`1`). O rótulo diz
"alta prioridade", não "crítica" — separar os números é decisão de produto
(o G desenhou o cartão assim), não de desenho.

## Cardinalidade das regras

As relações `order_id`/`contact_id`/`invoice_id` que alimentam estas regras
foram varridas em `50-sentinel-cardinalidade.md`: nenhuma leitura 1:1 aberta,
com os sítios e as medições no banco local.
