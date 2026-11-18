# Triagem de produção — 17/11/2026 (somente leitura)

> **Nada foi reenviado, cancelado ou corrigido em produção.** As consultas foram
> `SELECT` pela conexão de administração da VPS (`ssh vps`, container
> `supabase_db_selfhost`). O objetivo é separar o que é **código** do que é
> **operação**, com número medido agora — não com o número do plano, que
> envelhece.

## 1. Fila de jobs

| `kind` | `status` | Linhas |
|---|---|---|
| `followup_turn` | `dead` | **7** |
| `case_reply_turn` | `done` | 1 |

Não há `queued`/`pending` paradas: a fila de jobs está vazia fora as 7 mortas.
O plano citava "18 queued antigas" — **não se confirma hoje**; o número era de
outro momento. As 7 `dead` são de follow-up de fluxo (o teto de tentativas foi
atingido) e o lote é pequeno.

## 2. Alertas operacionais

| Prefixo | Linhas |
|---|---|
| `fora_da_carga` | **217** |
| `nf_pendente` | 11 |
| `vencimento` | 9 |

Os 217 de `fora_da_carga` são um alerta por pedido/carga (chave inclui o id),
não um estado por carga — é o volume esperado se a condição vale para muitos
pedidos. O plano citava 121; hoje são 217. **Não é erro de código**: é a regra
de negócio apontando pedido que não está em nenhuma carga.

## 3. Chamadas de IA — **achado vivo, de operação**

| `status` | Linhas |
|---|---|
| `ok` | 387 |
| `erro` | **623** |

Por código: **`limite_ou_saldo` 545**, `erro_desconhecido` 78.

**O erro continua acontecendo hoje** — e não é falha do produto:

| Dia | `limite_ou_saldo` |
|---|---|
| **17/11** | **80** |
| 13/11 | 32 |
| 12/11 | 73 |
| 10/11 | 75 |
| 09/11 | 70 |

Todas as falhas de hoje são da **mesma organização** (`4bc721ce-…`), provedor
**anthropic**, modelo `anthropic/claude-haiku-4-5`. Última chamada bem-sucedida:
**17/11/2026 14:30 UTC**. A mensagem do provedor é explícita:

```
This request requires more credits, or fewer max_tokens. You requested up to
256 tokens, but can only afford 229.
```

**O que isso significa:** a conta do provedor dessa organização está sem
crédito. O agente responde falha, e o CRM mostra erro — não porque o código
esteja errado, mas porque não há saldo. **Ação do dono**: recarregar os créditos
no provedor ou trocar o provedor/modelo do ponto no painel de IA. O produto já
classifica e explica esse erro (`O_QUE_FAZER.erro_ou_saldo`), então a tela de
execuções mostra a causa.

## 4. O que é código × o que é operação

| Achado | Classe | Ação |
|---|---|---|
| 545 `limite_ou_saldo` (80 hoje) | **operação** — saldo do provedor | dono recarrega/troca; nenhuma mudança de código |
| 78 `erro_desconhecido` | misto — provedor devolveu erro não classificado | investigar amostra (não feito nesta triagem) |
| 7 `followup_turn` dead | operação/produto | ver o `last_error` de cada uma antes de agir |
| 217 `fora_da_carga` | regra de negócio | é o alerta funcionando; conferir se a condição está correta para a operação |
| 11 `nf_pendente`, 9 `vencimento` | regra de negócio | normais |

## 5. O que NÃO foi feito

- Nenhum job foi reenviado; nenhuma chamada de IA foi refeita; nada foi cancelado.
- A amostra de `erro_desconhecido` não foi classificada (78 linhas, exige ler
  `error_message` de cada provedor).
- O `last_error` das 7 `followup_turn` dead não foi lido.
- Não há série histórica além de 30 dias nesta consulta.
