# 77 — Reconciliação do Mercos: a resposta para "tenho certeza?"

O bloco novo no topo de `colisoes-mercos` responde, em linguagem de dono, à pergunta que o resumo de colisões sozinho não respondia. Contrato do G: `reconciliacao` com `quando`, `censo_lido`, `censo_esperado`, `ausentes`, `status`. O campo é opcional/nulo — a tela continua funcionando no estado de hoje.

| Estado | Texto | Tom |
| --- | --- | --- |
| `completa` + 0 ausentes | "Nenhum pedido do Mercos ficou de fora." + verificado em … | verde |
| `completa` + N ausentes | "N pedidos do Mercos ainda não entraram" + lista logo abaixo | âmbar |
| `incompleta` | "Verificação incompleta: olhamos X de Y pedidos." + "A próxima execução termina a verificação. Zero ausente agora não é prova." | âmbar, `role="alert"` |
| sem reconciliação | "Ainda não verificamos os pedidos do Mercos contra o nosso cadastro" + quando roda | neutro |

Regras aplicadas: ausentes nunca sozinho (`0 ausentes · 5.929 de 5.929 verificados`); nada de tooltip escondendo "incompleta"; "nenhum ficou de fora" **só** no estado completa+zero — nem o card vazio diz isso quando a verificação não fechou; o ícone verde do card vazio também só aparece nesse estado. Em 390 o bloco são linhas curtas (`flex-wrap`, sem parágrafo denso).

Datas seguem a camada (`useTagDeIdioma`), nunca literal `pt-BR` — o mesmo corretivo que entrou no #844 também está aqui, porque este PR nasceu da `main` que ainda não o tinha.

Capturas dos 4 estados × claro/escuro × 1440/390: `docs/auditoria/capturas/recon-{completa,ausentes,incompleta,sem}-{light,dark}_{1440,390}.png` (contrato mockado; backend do G ainda não publicou o campo). Nomes com tema conferido, overflow 0, console limpo.

Gates: typecheck, lint, `mercos-colisoes-tela`, `i18n-a-data-segue-o-idioma`, `evidencia-citada`, `fragmentos-de-release`.
