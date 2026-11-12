---
impacto: nada_mudou
secao: corrigido
titulo: Cada aba de campanha lista só o seu tipo de campanha
---

As três audiências moram na mesma tabela e apareciam todas na mesma lista. A aba **Campanha** mostrava a garimpagem de empresa e a recuperação de conversa; a aba **Prospecção** mostrava campanha por região. Quem abria uma para ver um público encontrava o outro — e o card de campanha por região era rotulado "Recuperação", porque as duas usam público de contatos.

Agora cada tela pede o seu recorte ao servidor, antes de calcular envio e funil:

- **Campanha** — campanha por região: clientes cadastrados nas cidades escolhidas.
- **Prospecção** — campanha de garimpagem de empresa (`prospects`), e só ela.
- **Radar → Recuperação** — campanhas de recuperação, no mesmo lugar onde são criadas, com o andamento do envio.

O card de campanha por região passou a dizer "Por região" e quantos clientes entram.
