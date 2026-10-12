---
impacto: nada_mudou
secao: corrigido
titulo: A chave de IA cadastrada pela tela agora liga o passe de NCM
---

A chave do Google cadastrada em **IA › Credenciais** não habilitava o passe de
IA do botão "Completar NCM". O código lia só a chave da instalação (o
`GEMINI_API_KEY` do `.env`) e mais nada — ou seja, quem cadastrava a chave pela
tela via o nome dela na lista, com a validação em dia, e o recurso continuava
desligado.

É o mesmo defeito que a base de conhecimento já teve com a OpenAI, e que a
própria tela promete não repetir: oferecer uma chave que o motor ignora.

Agora o passe de NCM resolve a chave na ordem do mais específico ao mais
genérico: primeiro a credencial Google da organização (ativa e validada), depois
a chave da instalação. Com mais de uma chave Google ativa, vale a mais antiga —
e a tela avisa qual está em uso e quantas existem, porque o desempate
silencioso faria o dono achar que a chave nova está valendo.

A tela de produtos passou a dizer qual chave o passe usou (ou que não houve
chave e o lote foi só por regra), para ninguém descobrir por que a IA não liga
só rodando o lote e olhando o resultado.