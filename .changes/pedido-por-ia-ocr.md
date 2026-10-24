---
impacto: capacidade_nova
secao: adicionado
titulo: A foto do pedido é lida na própria VPS, sem gastar crédito de IA
---

O botão **Adicionar com IA** passou a tentar primeiro um leitor de imagem que
roda junto com o CRM — em português, em CPU, sem GPU e sem serviço externo.
Quando a leitura sai confiável (ao menos um item reconhecido, a maioria casada
com o catálogo e confiança alta), a proposta aparece sem nenhuma chamada de
modelo; quando o manuscrito é difícil, a IA assume como antes. O catálogo
**não** é embutido no leitor: o casamento continua sendo a mesma busca relaxada
do agente, então produto novo passa a valer na leitura seguinte, sem retreino.
Quem já instalou não precisa fazer nada — o `update.sh` traz a imagem nova.
Para desligar o leitor, deixe `OCR_SERVICE_URL=` vazio no `.env`: a foto volta a
usar só a IA.
