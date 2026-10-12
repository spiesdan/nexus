---
impacto: nada_mudou
secao: corrigido
titulo: O assistente interno passa a ser configurável em IA › Provedores
---

O assistente interno (`/api/v1/assistente/chat`) resolvia o modelo por um
propósito — `assistente` — que **não estava no registro de pontos de IA**. Três
consequências, todas silenciosas:

- A tela de provedores não oferecia o ponto, então ninguém conseguia apontá-lo
  para uma credencial.
- A API recusava a configuração com `ponto_desconhecido`.
- Sem binding, o assistente caía no modelo padrão da instalação, ignorando as
  credenciais cadastradas pela tela.

Medido em 12/10/2026 na instalação real: a chave do Google estava cadastrada,
ativa e validada, e o assistente seguia chamando `anthropic/claude-sonnet-5`
pelo OpenRouter — porque nada o ligava àquela chave.

Agora `assistente` está no registro, com a exigência de tools declarada (é o
que separa "responde" de "faz"), então a tela passa a oferecer e a API passa a
aceitar a configuração.

O teste de completude ganhou a entrada do ponto. Ele não pegaria sozinho: o
assistente não passa pelo seam, então não há `purpose: 'x'` literal para a
varredura encontrar — sem a entrada explícita ele continuaria invisível, que é
como passou despercebido até agora.