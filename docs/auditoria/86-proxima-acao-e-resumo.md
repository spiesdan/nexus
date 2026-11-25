# 86 — Cabeçalho com próxima ação, Resumo e Nova carga em 3 passos

Três peças, todas com rotas/páginas — nenhuma aba nova.

## 1. Cabeçalho com PRÓXIMA AÇÃO

O mesmo cabeçalho nas subtelas da carga traz: número + estado, linha `Motorista · Veículo · N pedidos · N conferidos · N pendentes`, e **`Próxima ação:` + uma frase + um botão**. A frase e o botão vêm do mesmo resolvedor do cartão "Próximo passo" — que foi **promovido** ao cabeçalho e teve o botão removido de lá (uma ação, um lugar). "Veículo" saiu da fileira e foi para o menu "…".

Medido em dois estados: `montando` com 2 por conferir → "Próxima ação: 2 pedidos faltam separar… [Conferir separação]"; `em_rota` com 1 parada → "…[Registrar desfecho]". 8 capturas claro/escuro × 1440/390 (`capturas/acao-{montando,rota,resumo,nova}_*.png`), overflow 0 e console limpo.

## 2. Resumo como página

`/app/expedicao/[id]/resumo` é a primeira da navegação (a raiz continua Paradas, onde se trabalha). Mostra progresso, pendências (sem endereço / sem separar / sem escala) e próxima ação — **não repete** o cabeçalho. Links para as outras três páginas. `aria-current="page"` marca a atual.

## 3. Nova carga em 3 passos

`1 · Pedidos` → `2 · Equipe` → `3 · Revisão`, navegação por botão (`aria-current="step"`), não abas. A seleção fica no estado do componente e **sobrevive a voltar/avançar**; o rótulo do avanço diz o que falta ("Continuar: equipe e veículo"). A confirmação só aparece na Revisão, com as sugestões de placa, avisos e bloqueios nomeados.

## Fora de escopo (decisão explícita)

- **Mapa da operação no painel de despacho** (posições de várias cargas em tempo real) — frente própria;
- **navegação curva a curva por SDK** — fora deste PR.

Testes: `cabecalho-proxima-acao` (4), mais gates de expedição e fragmentos. Sem deploy.
