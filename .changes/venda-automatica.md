---
impacto: capacidade_nova
secao: adicionado
titulo: Venda Automática — campanhas de abordagem com cota diária, janela de horário e follow-ups
---

A **Venda Automática** entra no produto: você monta uma campanha por
cidade (e categorias do Radar), o sistema escolhe os candidatos do dia
dentro de uma cota diária, manda a primeira mensagem pela IA dentro da
janela de horário que você definiu, faz os follow-ups (24h e 48h por
padrão), classifica as respostas e encaminha interessados como lead —
tudo com fila visível e ações humanas.

**Como usar:** Radar → aba Empresas → filtre pela cidade e as
categorias → botão **“Criar venda automática”** (usa o filtro atual, a
lista ou a seleção de prospects como cota). A tela abre em
**Venda Automática** no menu lateral: campanhas, painel do dia, fila
com status e timeline de cada contato. Também dá para criar e editar
campanhas por lá, com cidade, categorias, cota (1 a 500), janela de
horário e horários de follow-up.

**No Inbox:** o filtro de tag vira **filtro de assunto** com atalhos
prontos — Venda Automática, Radar, Interessados, Sem resposta e
Oportunidades — e segue aceitando as tags da sua organização. Nenhuma
aba nova.

**Duplicidade e cota:** cada prospect entra uma vez por campanha; duas
campanhas nunca abordam o mesmo contato ao mesmo tempo; a cota diária
conta só quem foi contatado como **novo** no dia (follow-ups não consomem
cota). Contatos com opt-out, sem WhatsApp potencial ou fora da cidade
são descartados automaticamente, com o motivo registrado.

**Auditoria:** cada ação humana da fila (assumir, ignorar, bloquear,
reenfileirar) e cada transição do motor geram evento de auditoria e
linha na timeline. Bloquear ativa o opt-out de verdade.

**Operação:** o motor roda a cada minuto pelo cron
`api/v1/cron/automatic-sales` (mesma chave interna dos demais crons);
pausar uma campanha corta o envio no mesmo minuto. Nada a configurar.
