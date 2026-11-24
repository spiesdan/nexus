# 85 — Despacho por exceções e prontidão na criação

## Faixa de exceções em `/app/expedicao`

Quatro famílias, contagem + link que já filtra a lista (`?excecao=<chave>`), ordenadas por urgência (em rota com problema primeiro):

1. `precisa_atencao` — rota não calculada, entrega com problema ou carga parada há >3 dias;
2. `sem_localizacao` — pedido da carga ativa sem `endereco_entrega`;
3. `sem_motorista_veiculo` — `montando` sem placa ou condutor;
4. `prontas_para_sair` — tudo conferido, escala completa, sem os problemas acima.

Só aparece o que tem item; zero exceções diz "Nada exige ação agora — boa notícia." (teste unitário cobre o estado, não há captura: o fixture local tem exceções e não foi alterado só para fabricar o estado vazio). Nenhuma métrica nova: tudo vem dos campos já existentes. No celular, uma linha por família (`grid` que empilha), sem parágrafo.

Medido no fixture: "Precisa de atenção 1 · Sem localização 38 · Sem motorista/veículo 3", 8 combinações sem overflow e console limpo; link filtra (marcador "Lista filtrada por exceção" presente). Capturas `capturas/excecoes-{light,dark}_{1440,390}.png`.

## Prontidão em "Nova carga"

Mesmo vocabulário do cartão "Próximo passo": `✓ N pedidos selecionados`, `✗ Sem motorista — a rota não pode ser publicada` (**aviso**, não impede criar), `✗ N pedidos sem endereço — corrija antes de incluir` (**bloqueio**). O botão só desabilita com bloqueio; aviso é nomeado como aviso.

## Placa sem tabela de frota

Placa validada nos formatos `ABC1D23` e `ABC1234` (máscara, erro nomeado, inválida não salva) e sugestão das últimas 5 combinações placa+motorista já usadas na organização — `distinct` no que existe, sem entidade nova. Sem veículo continua permitido; a faixa de exceções mostra o que falta.

Testes: `excecoes-do-despacho`, `prontidao`, `placa`, `expedicao-busca-e-paginas` (17 verdes).
