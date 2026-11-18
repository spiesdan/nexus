---
impacto: nada_mudou
secao: corrigido
titulo: Atualização para quando o banco recusa parte do schema
---

O `update.sh` aplicava o schema e, se o banco recusasse parte dele, **avisava e
continuava**: contêineres subiam na versão nova, o site respondia 200 e uma
tabela simplesmente não existia — o defeito apareceria só quando alguém usasse o
recurso.

Medido no deploy da 1.57.0: um erro de DDL no meio do baseline deixou o schema
incompleto e o `health` verde, porque o `health` é probe interno e não olha
schema.

Agora a atualização **para antes de trocar as imagens** quando o banco recusa
parte do schema: o que está no ar continua sendo a versão anterior, inteira, e a
mensagem diz o que fazer. Quem sabe o que está fazendo pode subir mesmo assim com
`NEXUS_SCHEMA_NAO_FATAL=1`.
