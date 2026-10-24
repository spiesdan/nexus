---
impacto: nada_mudou
secao: corrigido
titulo: A leitura de pedido por IA volta a funcionar com o Gemini
---

O schema completo gerado pelo Zod era recusado pelo Google com 400 antes de o
modelo ler a foto — a tela pedia "uma foto mais nítida" quando o problema era o
formato da requisição. O schema agora é mínimo para o Google e fechado para
OpenAI/Anthropic/OpenRouter, com a mesma validação local. A correção também
limita a resposta a 8.192 tokens e traduz saldo, chave, modelo e provedor fora
do ar em mensagens que dizem o que fazer.
