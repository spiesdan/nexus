---
impacto: nada_mudou
secao: acrescentado
titulo: Disparo em lote com simulação por padrão, e arquivamento do inbox
---

**Enviar a mesma mensagem para as empresas marcadas, sabendo antes o que vai
acontecer.** Em `/app/prospeccao` → Empresas, a barra de seleção ganha
**"Enviar mensagem"**.

## A simulação vem antes do botão de enviar

Não é etapa de confirmação. O botão de enviar **só existe** depois que a
simulação voltou, e vem escrito com o número dela: *"Enviar para 312
empresas"*. A simulação responde as três perguntas que nenhuma tela responde:

1. **quantos vão sair** — e quantos não, e por quê, um a um
2. **quanto tempo vai levar**, no ritmo configurado
3. **se dá para enviar agora** — isto é, se há número de WhatsApp conectado

Sem a terceira, o operador descobre que mandou 300 mensagens para lugar nenhum
depois: com a sessão parada, `sendMessageHandler` **não devolve erro** — joga
a linha em `messages` com `status='queued'` e
`queued_reason='channel_session_not_working'`, e no caminho humano não há quem
reagende `queued`.

`dry_run` é `true` **no schema**, não na tela: quem chama tem que pedir o
envio.

## O ritmo faz parte do plano

Mensagem fixa para centenas de números é o padrão que derruba um WhatsApp — o
próprio repositório já tem o gate `spinning` para pegar isso. Por isso o
planejador devolve o plano **com ritmo**: cota do dia (padrão 50, teto 500) e
intervalo entre envios (padrão 1,2s + jitter). E o envio usa o intervalo que
o plano prometeu, não o `espacarEnvio` da automação — aquele é fixo em 1200ms e
faria a simulação mentir sobre o tempo.

## Quem NÃO recebe, e a tela diz o motivo

`do_not_contact` · bloqueado · **já é cliente** · pediu para parar (opt-out) ·
recusa registrada · sem telefone · fixo ou país sem WhatsApp · já tem conversa
aberta · recebeu mensagem há pouco · **cota do dia esgotada**.

A cota é separada de propósito: quem ficou fora por cota **não é lead ruim**,
é lead para amanhã. Se a tela mostrasse "não pode mandar", o operador
descartaria.

## Arquivar o inbox

`POST /api/v1/conversations/arquivar-todas` — `manager`+, exige
`{"confirmar": true}` no corpo. **Arquiva, não apaga**: sai das abas Fila,
Minhas e Todas, zera as não-lidas, e o histórico continua para quando alguém
perguntar o que foi mandado em outubro. Apagar a conversa para limpar a tela
troca um problema pequeno por um que não tem volta.

## Testes

- `lib/prospeccao/disparo.ts` + `disparo.test.ts` — 32 testes
- `lib/schemas/prospeccao-disparo.test.ts` — 9 testes
- **10 mutações provadas** por `scripts/provar-mutacoes-disparo.py`:
  desligar o opt-out, inverter o bloqueado, tirar o "já é cliente", ignorar a
  recusa registrada, abrir a cota em um, liberar envio sem sessão, mandar
  colado, ignorar a coluna `whatsapp_potencial`, ignorar a regex de celular,
  deixar telefone nulo passar — **todas reprovaram**.

Uma das mutações **falhou na primeira rodada** e foi isso que valeu: o teste
"a coluna `whatsapp_potencial` mentindo não libera o envio" usava um fixo, que
a regex barrava sozinha — a coluna podia ser lida sem ser lida. O caso que só
a coluna barra foi acrescentado.

Suíte: **8.329 verdes**, `tsc` e lint limpos.
