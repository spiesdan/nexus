---
impacto: nada_mudou
secao: corrigido
titulo: Admin — banner legível e sino sem 403 no console
---

O banner “MODO PLATAFORMA” usava `text-amber-800/80` e media 4,24:1 no tema
claro — abaixo do piso AA de 4,5; sem o `/80` o texto passa. O sino de avisos
do shell de plataforma consultava o endpoint do tenant (`/api/v1/ai/inbox`) sem
organização ativa e enchia o console com 403 a cada 60 s; agora fica inativo no
`AdminShell` e volta a consultar quando houver fonte de alerta de plataforma.

Nenhuma regra de negócio mudou; a lista de auditoria em si já estava conforme
(overflow 0 em 1440/390).
