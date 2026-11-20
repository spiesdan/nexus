---
impacto: nada_mudou
secao: corrigido
titulo: Botão decorativo deixa de parecer ativo; permissão medida no primeiro render
---

O campo de arquivo desenhava a pintura com um botão sem handler: parecia ativo,
cursor de mão, clique sem efeito. Virou `span` decorativo. A leitura da permissão
de notificação passou a ser feita onde a informação existe (cliente), sem
“Hydration failed” e sem esconder o interruptor de quem já concedeu.

**Nada a fazer na VPS.**
