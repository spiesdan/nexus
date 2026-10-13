---
impacto: nada_mudou
secao: adicionado
titulo: Disparo em lote com simulação por padrão, e arquivamento do inbox
---

**A mesma mensagem para as empresas marcadas — e o plano antes do envio.**

Em `/app/prospeccao` → Empresas, a barra de seleção ganha **"Enviar mensagem"**.

**O botão de enviar só existe depois que a simulação voltou**, e vem escrito
com o número dela: *"Enviar para 312 empresas"*. Não é etapa de confirmação: é
o que segura a tela, porque enviar mensagem de WhatsApp é das poucas coisas em
que o erro não aparece como erro — o número é banido e o dano só se vê semanas
depois, como "não recebo mais mensagem".

A simulação responde três perguntas: **quantos vão sair** (e quantos não, e por
quê, um a um); quanto tempo leva no ritmo configurado; e se dá para enviar
agora — isto é, se há número de WhatsApp conectado.

Sem a terceira, o operador descobre que mandou 300 mensagens para lugar nenhum:
com a sessão parada, o envio **não devolve erro** — joga a linha em `queued` e,
no caminho humano, ninguém reagenda. Medido nesta instalação: 6 sessões de
canal, todas em `STOPPED`, e a única real com `archived_at` preenchido.

`dry_run` é `true` **no schema**, não na tela: quem chama tem que pedir o envio.

**O ritmo faz parte do plano.** Mensagem fixa para centenas de números é o
padrão que derruba um número, e o repositório já tem o gate que pega isso. Por
isso o plano carrega cota do dia (padrão 50, teto 500) e intervalo entre
envios (1,2s + jitter). O envio usa o intervalo que o plano prometeu — e não o
espaçador fixo da automação, que faria a simulação mentir sobre o tempo.

**Quem não recebe, e a tela diz o motivo:** pediu para não ser contatado ·
bloqueado · **já é cliente** · pediu para parar (opt-out) · recusa registrada ·
sem telefone · fixo ou país sem WhatsApp · já tem conversa aberta · recebeu
mensagem há pouco · **cota do dia esgotada**.

Duas decisões. A primeira: **"já é cliente" vem antes da canalização**,
porque mandar oferta para quem já compra não pode aparecer como "sem WhatsApp".
A segunda: **cota esgotada fica separado**, porque quem ficou fora por cota
não é lead ruim — é lead para amanhã. Se a tela dissesse "não pode mandar", o
operador descartaria.

**Arquivar o inbox.** `POST /api/v1/conversations/arquivar-todas`, `manager`+
e exigindo `{"confirmar": true}`. **Arquiva, não apaga:** sai das abas Fila,
Minhas e Todas, zera as não-lidas, e o histórico continua para quando alguém
perguntar o que foi mandado em outubro. Apagar para limpar a tela troca um
problema pequeno por um que não tem volta.

**Testes.** 32 do planejador, 9 do contrato, e **10 mutações provadas** por
`scripts/provar-mutacoes-disparo.py` — desligar o opt-out, inverter o
bloqueado, tirar o "já é cliente", ignorar a recusa registrada, abrir a cota em
um, liberar envio sem sessão, mandar colado, ignorar a coluna de WhatsApp
potencial, ignorar a regex de celular, deixar telefone nulo passar: todas
reprovaram.

Uma delas **falhou na primeira rodada** e foi o que valeu: o teste da coluna
usava um telefone fixo, que a regex barrava sozinha — a coluna podia ser lida
sem ser lida e o teste continuaria verde. O caso em que só a coluna barra foi
acrescentado.
