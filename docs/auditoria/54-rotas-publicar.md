# 54 — Rota, fatia 3: o que o motorista recebeu × o que mudou depois

**Data:** 20/11/2026 · **Base:** `nexus/main` · **Tela:** `/app/expedicao/<id>/rota`

## O que o código já garante (lido, não inventado)

| Ação | O que grava | O que o motorista vê |
| --- | --- | --- |
| `PATCH /rota/ordem` (“salvar ordem”) | `sequencia` nos itens + cache da rota + **`rota_versao` += 1** | a nova versão **só é aplicada quando ele confirma** no aparelho (`_motorista.tsx:385` compara `rota_versao > versaoVista` e abre a confirmação) |
| `POST /rota/iniciar` | `montando → em_rota`, carimba quem/quando | dispara o **aviso de saída** aos clientes (`avisarClientesDaCarga`) |
| `POST /rota/finalizar` | `em_rota → concluida` | — |

**Não existe “publicar” como ação separada.** Publicar = **salvar a ordem**: é o
que sobe a versão. O comentário da migration 0231 diz a regra em uma frase —
*“O app do motorista aplica a nova só com confirmação — nunca sobrescreve em
silêncio.”*

## O que mudou na tela

1. **Sob o selo de estado**, quando há versão publicada:
   **“Publicada em 20/11/2026 09:14 · versão 3”** (`rota_em` + `rota_versao`).
2. **Banner de alterações não publicadas** (`data-testid="alteracoes-nao-publicadas"`):
   *“A ordem tem alterações que o motorista ainda não recebeu: **2 moveram ·
   1 nova · 1 saiu**. Ao salvar, a versão sobe e o motorista confirma a nova
   sequência no aparelho.”* + botão **Publicar nova versão** (chama o mesmo
   `salvarOrdem`).
3. **Toast de sucesso diz a versão**: “Rota salva. Versão 4” — o operador confere
   no aparelho sem perguntar a ninguém.

## A diferença é lógica pura (testada sem browser)

`lib/rotas/diferenca-da-ordem.ts` + `6` casos:

- ordem idêntica → nada mudou;
- trocar duas de lugar → **2 moveram** (não 1);
- parada nova → **novas**, não “moveu”;
- parada removida → **saíram**;
- sem publicação ainda → tudo é nova;
- array reconstruído com a mesma ordem → **não mudou**.

## O que NÃO foi feito (decisão de produto, não de tela)

O operador **não** consegue ver **qual versão o motorista confirmou**: o app
guarda isso no aparelho (`versaoVista`), e o banco não tem
`rota_versao_confirmada`. Para dizer “o motorista está na versão 3 de 4” seria
preciso **coluna nova + escrita do app** — migration e regra, não desenho.
Fica como proposta:

> **Proposta (para o dono):** `shipments.rota_versao_confirmada` + `confirmada_em`,
> escritos pelo app do motorista no aceite. Com isso a tela passa a dizer
> “motorista confirmou a versão N em HH:MM” e o banner de alterações ganha a
> pergunta certa: *o aparelho dele já viu a última?*

Enquanto isso não existe, a tela **não inventa** esse número: diz o que sabe —
versão publicada, quantas paradas mudaram e que o motorista confirma.

## Pendente de evidência

Capturas e a tarefa medida (12 paradas / 2 veículos) dependem da janela — a
máquina está com o F. A prova do banner de falha (fatia 2) vem **primeiro**, com
`scripts/auditoria/rotas-falha-real.mjs`, que agora grava JSON com
`bannerApareceu`, `topoAntes`, `topoDepois` e `listaPulou`.
