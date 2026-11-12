---
impacto: nada_mudou
secao: corrigido
titulo: A aba Campanha mostra só campanha por região, não a prospecção
---

A aba **Campanha** listava tudo o que existe em `prospecting_campaigns` — inclusive as campanhas de garimpagem de empresa (criadas na aba Prospecção, com público `prospects`) e as de recuperação de conversa. Quem abria "Campanha" para ver quem já comprou na região encontrava campanha de público que nunca comprou.

Agora a lista pede a origem ao servidor e mostra só a campanha por região: público de contatos **com** recorte de cidade. A prospecção e a recuperação continuam na aba onde foram criadas. Os cards de campanha por região passaram a dizer "Por região" e quantos clientes entram — antes eram rotulados como "Recuperação", porque as duas usam público de contatos.
