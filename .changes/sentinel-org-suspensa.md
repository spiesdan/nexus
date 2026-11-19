---
impacto: nada_mudou
secao: corrigido
titulo: Sentinel deixa de gastar atenção com organização suspensa
---

Organização suspensa não tem negócio em andamento, mas o Sentinel continuava
varrendo os dados dela: numa instalação real, 20 das 23 ocorrências abertas
eram de uma organização de teste já suspensa. O painel do dono virava 87% de
ruído.

Agora a varredura corta na origem: organização com `suspended_at` não tem
snapshot coletado, então nenhum detector roda, nenhuma ocorrência nasce e
nenhuma existente é reafirmada. A rodada continua registrada, com motivo
declarado e a contagem `organizacoes_puladas` no cron. As ocorrências abertas
da suspensa são encerradas — não apagadas — com motivo
`organizacao_suspensa`, preservando linha e histórico.
