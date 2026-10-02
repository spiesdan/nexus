# Meu Dia — a linha do tempo do dia (2026-10-02)

Evidências da refatoração da aba Meu Dia, capturadas pelo e2e
`tests/e2e/meu-dia.spec.ts` num Supabase local com o `baseline.sql`
aplicado — navegação como usuário (login pelo fluxo, zero URL direta),
desktop e mobile na mesma rodada.

| Arquivo | O que prova |
|---|---|
| `evidence/meu-dia/1-meu-dia-1280.png` | Desktop 1280: saudação pelo relógio de quem olha ("Boa tarde, E2E"), a data por extenso com o resumo "N atrasadas · N hoje", a linha do tempo ATRASADO → HOJE com os botões Concluir e Amanhã em cada linha, e a coluna de contexto ao lado (Mensagens, Follow-ups ativos, Recomendações, Pedidos e atalhos) |
| `evidence/meu-dia/2-meu-dia-390.png` | Mobile 390: a mesma tela em pilha única — a timeline primeiro, o contexto depois, bottom nav no lugar, sem rolagem horizontal |

As duas imagens são REPRODUZÍVEIS: rodar a spec de novo a regrava (o
título das tarefas semeadas leva o carimbo da rodada, então a tela
nunca é byte a byte igual, mas o que ela prova é sempre o mesmo).
