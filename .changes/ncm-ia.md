---
impacto: nada_mudou
secao: adicionado
titulo: Desempate do NCM por IA (Gemini) no preenchimento em lote
---

O botão "Completar NCM" ganhou um passe de IA na zona cinzenta. Onde o
casamento por regra é duvidoso (empate ou nota abaixo do limiar), o produto
vai para o Gemini escolher entre os candidatos que a própria regra separou.

A IA NÃO escolhe o código: ela recebe a lista de candidatos e a resposta só é
aceita se o código vier de dentro dela. Fora da lista é invenção — e NCM
inventado em nota é autuação, então a resposta é descartada.

Só o nível mais alto de confiança grava sozinho: quando a IA escolhe o mesmo
primeiro colocado da regra com confiança alta, dois sistemas independentes
dizendo a mesma coisa. Discordância, confiança baixa ou falha de rede vão
para revisão humana — com a opinião da IA anexada no item, para acelerar
quem revisa em vez de substituir a revisão.

Sem chave do Gemini configurada (`GEMINI_API_KEY`, gratuita no Google AI
Studio) nada muda: o lote usa só a regra e o resto continua indo para revisão.
Cada falha vira "vai para revisão", nunca "aplica qualquer coisa".