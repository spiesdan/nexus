# Prova visual — J6, J13 e J14 na camada de navegador (2026-11-19)

Capturas de tela do **app de produção** (`next build` + `next start`), contra o
Supabase local do e2e, com sessão real. Nenhum dado de cliente real aparece
aqui: os contatos, a nota e as solicitações são semeados pelos próprios specs
com nome sintético.

Comando que gerou tudo (as três specs, uma sessão de worker, 3 passed):

```bash
E2E_PORT=3011 pnpm exec playwright test \
  tests/e2e/j6-inbox-atender-e-recuperar.spec.ts \
  tests/e2e/j13-fiscal-homologacao.spec.ts \
  tests/e2e/j14-lgpd-aprovar-pela-tela.spec.ts
```

## J6 — inbox: atender, falhar e recuperar

O app fala com um **WAHA de verdade no fio** (`tests/e2e/helpers/waha-de-teste.ts`),
na porta que o `.env.e2e` aponta. O stub muda de humor em tempo de execução para
separar os três desfechos na mesma sessão de navegador.

| Arquivo | O que mostra |
|---|---|
| `j6-01-envio-com-sucesso.png` | Conversa da Fila assumida ("Liberar" no lugar de "Assumir") e a resposta saindo sem marca de falha. O texto aparece na bolha **e** no registro do stub — a prova é do HTTP, não do otimista. |
| `j6-02-envio-falhou.png` | O transporte recusa (500): a bolha diz **Falhou** e oferece **Reenviar**. O texto enviado NÃO entrou na lista de enviados do stub. |
| `j6-03-recuperado-pelo-reenviar.png` | Transporte de volta e "Reenviar" resolve: toast "Mensagem reenviada." e a linha NOVA enviada, com a tentativa que falhou preservada no histórico. |
| `j6-04-conversa-fechada.png` | Fechamento pela confirmação; o cabeçalho passa a dizer **Fechada**. |

## J13 — fiscal em homologação

Nada aqui toca SEFAZ: o portão é local (`motivoDeNaoBaixar`, `lib/fiscal/eventos.ts`)
e a spec usa `ambiente=homologacao`. O que se prova é o tratamento da falha e a
recuperação da causa PELA TELA.

| Arquivo | O que mostra |
|---|---|
| `j13-01-falha-com-motivo-acionavel.png` | "Sincronizar agora" sem a senha do certificado: mensagem em português e a execução gravada no histórico como **erro** — nunca um "0 novas" verde. |
| `j13-02-recuperado-o-bloqueio-mudou.png` | Depois de gravar a senha em Configurações, a nova tentativa passa do bloqueio anterior e para no motivo de ambiente (homologação não distribui DF-e). As DUAS execuções estão na tabela: a causa antiga e a nova. |
| `j13-03-conferencia-aprovada.png` | Nota de entrada completa (XML + item): "Aprovar conferência" muda o estado para **Aprovada** com autor e data. |
| `j13-04-reaberta-e-aprovada-de-novo.png` | "Reabrir conferência" volta para pendente e a aprovação funciona de novo — a decisão não é beco sem saída. |

## J14 — LGPD pela tela do DPO

A solicitação nasce semeada porque o produto não a cria pela tela (ela vem de
API/webhook); tudo o mais é o caminho real de quem aprova.

| Arquivo | O que mostra |
|---|---|
| `j14-01-previa-da-solicitacao.png` | Prévia da titular com as contagens (conversas, mensagens, leads, auditoria…) — o que será entregue, sem CPF nem telefone crus. |
| `j14-02-aprovada-e-auditada.png` | Aprovação com justificativa: status **Processando** e a trilha `lgpd.manually_approved` na mesma página. |
| `j14-03-falha-de-rede-nao-vira-sucesso.png` | POST abortado no fio: "Falha ao aprovar a solicitação. Tente novamente." e o status continua **Recebido**. |
| `j14-04-recuperada-apos-a-falha.png` | Sem a falha injetada, a mesma solicitação (mesmo diálogo) é aprovada e vai para **Processando**. |

## O que esta evidência NÃO prova

- **Distribuição DF-e com sucesso** em homologação: impossível por decisão de
  produto (a SEFAZ não entrega nota de terceiro nesse ambiente; o app recusa
  antes de chamar). Exigiria produção — proibida nesta doutrina — ou certificado
  real no sidecar.
- **Anonimização executada** a partir da tela: a execução é do worker/rota, e
  continua provada por Vitest (`j14-lgpd-anonimizar`), não por navegador.
- **Envio real ao WhatsApp**: o destino é um stub que registra o que chegou. O
  que se prova é o caminho do app até o HTTP e o desfecho na tela, não a entrega
  no aparelho do cliente.
