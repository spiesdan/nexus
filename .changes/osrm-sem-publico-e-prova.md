---
impacto: exige_acao
secao: alterado
titulo: Roteamento de ruas exige OSRM próprio; comprovante sem conexão é registrado com motivo
---

O OSRM público deixou de ser padrão. Sem `OSRM_URL`, a rota responde "roteamento não configurado — use Google Maps ou Waze" e nenhuma requisição sai para terceiros. Timeout de 5 segundos vira erro nomeado em vez de espera indefinida. Configure `OSRM_URL` no `.env` da VPS (runbook em docs/runbooks/geodados.md) para voltar a ter ruas.

Na cabine, sem conexão a foto do comprovante não é aceita: o desfecho entra na fila com o motivo "Foto precisa de conexão — desfecho registrado sem foto". Foto continua disponível pelo endpoint de proof quando houver sinal.

## Requer atenção
Configure seu próprio OSRM (ou aceite Google Maps/Waze) antes de usar rotas por ruas nesta instalação.
