---
impacto: nada_mudou
secao: corrigido
titulo: A campanha mostra quem respondeu, inclusive a que saiu da base
---

Uma campanha de base — aquela que o operador monta escolhendo empresas que já estão no CRM — terminava o dia com dezenas de conversas abertas e o card dizendo **"0 respostas"**. Medido em 10/11/2026: 241 empresas na campanha, 71 já contatadas, respostas reais de clientes no inbox, e o contador em zero. A campanha anterior, de 251 empresas, estava igual.

Eram dois defeitos, e os dois eram de leitura:

1. o funil da campanha só sabia procurar o público pelas **buscas** (`prospecting_searches`). Campanha de base não tem busca nenhuma — o público já estava no banco e a campanha aponta para ele em `prospect_ids`. Sem busca, o funil ficava todo zerado;
2. o status comercial do prospect (`status_comercial`, de onde o funil conta) nunca saía de "Novo". Só o import manual para o CRM o escrevia — nem o envio da campanha nem a resposta do cliente mexiam nele. Todos os 71 prospects da campanha tinham `contact_id` nulo, então a resposta que chegava no inbox não tinha como voltar até a empresa de origem.

O que passou a acontecer sozinho: o envio da campanha grava o vínculo da empresa com o contato do WhatsApp e marca a empresa como **contatada**; a mensagem que o cliente manda marca **respondeu**. O status só anda para a frente — quem já foi marcado como sem interesse, descartado ou cliente não volta atrás por causa de um envio. E o funil da campanha de base passou a contar o público a partir da lista fechada, com o status real de cada empresa.

Campanha de recuperação (público de contatos do CRM) passou a mostrar **"—"** em respostas em vez de **0**: ali o estágio não é status de prospect, e zero era mentira com outra roupa.

Nas duas campanhas que já estavam em produção, o vínculo e os status foram recalculados a partir do histórico: 324 empresas vinculadas ao contato, 276 marcadas como contatadas e 50 como respondidas.
