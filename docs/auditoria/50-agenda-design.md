# 50 — Agenda: o passe que virou uma correção de leitura

**Data:** 19/11/2026 · **Base:** `nexus/main` · **Método:** recorte de design
medido em `next dev` no Supabase local, com a org de teste.

## O resultado honesto: a tela já estava no padrão

A Agenda é a superfície mais cuidada que este passe encontrou até aqui. O que a
medição e a leitura do código mostram, item por item do que o despacho pedia:

| Pedido | Estado |
| --- | --- |
| Hierarquia de período/visão | abas com contagem em **pílula** (`HistoricoDaAgenda:138`), navegação Dia/Semana/Mês em segmento |
| Estado vazio | **por aba**, com texto próprio ("Nada marcado daqui para a frente", "Ninguém esperando confirmação", "Ainda não há atendimentos concluídos", "Nenhum cancelamento") |
| Ação desabilitada com motivo | "Novo agendamento" desabilitado **com o motivo em texto ao lado** (não em `title`), porque o dono usa toque |
| Leitor de tela | o card da grade tem `aria-label` completo (título, início, fim, **com quem** × **quem atende** — papéis que já foram trocados uma vez) |
| Offline/erro | aviso de conexão Google e `error.tsx` próprios |

**Não inventei mudança onde não havia defeito.** Um "passe visual" que mexe em
tela conforme é churn, e este doc registra a conformidade com o número.

## O que mudou: a preposição

A barra de tipos da grade dizia **"Horários livres de"** e listava *tipos de
agendamento* (`AgendaInterativa:216`). "de" lê como "de quem" — a pessoa —, e o
chip ao lado é o tipo. Trocado para **"Horários livres para"**, que é o que a
frase quer dizer: os horários que a grade pinta são os livres **para aquele
tipo**.

É uma palavra. É também o único ponto em que a tela pedia leitura de duas vezes.

## Números

| Medida | Resultado |
| --- | --- |
| Contraste AA (escuro) | **0 de 91** textos abaixo do mínimo |
| Contraste AA (claro) | **0 de 91** |
| Overflow horizontal | **0** em 1440 e 390 |
| Erros de console | **0** |

Capturas: `capturas/antes-agenda/` e `capturas/depois-agenda/` (2 temas × 2
larguras).

## Matriz `41`

| Rota | Veredito |
| --- | --- |
| `/app/agenda` | **aplicado** — conformidade medida + a correção de preposição |

## Fora do escopo desta fatia

- `/app/settings/tenant/agenda` (configuração de tipos/jornada) — **pendente** na
  matriz; é outra tela.
- O painel de marcação (`Sheet`) não foi aberto na medição: a captura é da tela.
