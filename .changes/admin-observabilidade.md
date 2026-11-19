---
impacto: capacidade_nova
secao: adicionado
titulo: Admin ganha a tela de observabilidade com os três SLOs da instalação
---

A plataforma agora vê, em `/admin/observabilidade`, disponibilidade, latência
das listas e frescor da varredura do Sentinel — cada um com fórmula, janela,
alvo, valor atual e estado. A tela é leitura apenas e exige `platform_admin`.

O frescor do Sentinel é calculado de `organizations` + `sentinel_settings`.
Disponibilidade e latência mostram “sem histórico ainda” em vez de zero: a
fonte (`api.5xx` e duração das rotas) ainda não é persistida em tabela
consultável. Zero seria mentira, não saúde.
