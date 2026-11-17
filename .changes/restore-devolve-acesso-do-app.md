---
impacto: nada_mudou
secao: corrigido
titulo: Backup e restauração passam a devolver o acesso do app
---

O ensaio de restauração restaurou um backup num banco limpo, as linhas voltaram
e o role da aplicação recebeu "permission denied": o dump era feito sem os
privilégios, então o banco restaurado não tinha as permissões que o app usa.

O backup agora carrega os privilégios junto com os dados. E, ao restaurar um
backup antigo (que não os tem), o próprio restore reaplica o schema idempotente
para recriá-los — se ainda assim o app ficar sem acesso, ele para com a causa
escrita, em vez de subir um sistema que responde erro em toda tela.
