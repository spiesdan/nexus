# NEXUS COMERCIAL — EVOLUÇÃO DA EXPEDIÇÃO INSPIRADA NO FLEETBASE

## OBJETIVO

Evoluir a aba **Expedição** do Nexus para permitir planejamento, execução e acompanhamento de rotas com mais controle, segurança e clareza operacional.

Use o Fleetbase como referência de conceitos e fluxos, principalmente:

- Planejamento de rotas e atribuição de pedidos.
- Separação entre proposta, revisão e confirmação.
- Sequenciamento manual ou otimizado de paradas.
- Manifestos e estados individuais de cada parada.
- Monitoramento de motoristas e veículos, quando houver dados reais.
- Experiência mobile do motorista, adaptada à estrutura existente do Nexus.

Referências para investigar:

- Fleetbase: https://github.com/fleetbase/fleetbase
- Fleet-Ops: https://github.com/fleetbase/fleetops
- Navigator: https://github.com/fleetbase/navigator-app
- Orchestrator Workbench: https://github.com/fleetbase/fleetops/blob/main/addon/components/orchestrator-workbench.js
- Orchestration Controller: https://github.com/fleetbase/fleetops/blob/main/server/src/Http/Controllers/Internal/v1/OrchestrationController.php

Essas referências são fontes para estudo, não especificações automáticas do Nexus. Confira a versão e o código atuais antes de basear uma decisão neles.

**Não substituir o Nexus pelo Fleetbase. Não migrar a arquitetura do Nexus para Laravel, Ember ou outro stack. Não copiar código do Fleetbase sem verificar licença, compatibilidade e necessidade. Reimplemente apenas conceitos compatíveis com o produto e a arquitetura atuais.**

---

# 1. REGRA FUNDAMENTAL: A ROTA COMEÇA COM SELEÇÃO MANUAL

O operador deve continuar criando cada rota manualmente, escolhendo os pedidos que deseja incluir.

Fluxo obrigatório:

1. Abrir Expedição.
2. Consultar os pedidos disponíveis.
3. Filtrar e selecionar explicitamente os pedidos.
4. Iniciar uma rota com os pedidos selecionados.
5. Escolher motorista e veículo, respeitando os dados e regras existentes.
6. Definir origem e destino final, se aplicável.
7. Revisar os pedidos e a localização de cada parada.
8. Organizar a sequência manualmente ou solicitar otimização opcional.
9. Revisar distância, duração, avisos e limitações do cálculo.
10. Confirmar a rota de forma explícita.
11. Acompanhar e atualizar a execução conforme os recursos reais disponíveis.

Regras que não podem ser violadas:

- Não criar rotas automaticamente ao abrir a tela.
- Não incluir pedidos sem seleção explícita.
- Não despachar ou confirmar uma rota automaticamente.
- Não distribuir automaticamente todos os pedidos entre motoristas.
- A otimização é opcional e nunca substitui a revisão do operador.
- Pedidos não selecionados devem permanecer fora da rota.
- Uma proposta não confirmada não pode alterar os pedidos originais.
- Ao recalcular, preservar alterações feitas manualmente, a menos que o operador peça uma nova otimização.

---

# 2. CONTINUIDADE E AUTONOMIA DE EXECUÇÃO

Trabalhe até concluir todas as fases e critérios de aceite. Não encerre depois de entregar apenas uma auditoria ou um plano.

Tome decisões de implementação rotineiras com base no código existente, documentando as escolhas. Não interrompa o trabalho para perguntar sobre decisões que possam ser resolvidas com evidências do repositório.

Não invente dados, integrações, estados ou capacidades. Quando uma função depender de credenciais, hardware, serviço externo, decisão de produto irreversível ou migração destrutiva, implemente o que for seguro e documente claramente o bloqueio e os passos pendentes.

Antes de alterações de banco:

- Inspecione o padrão real de migrations, schema e políticas do projeto.
- Siga o caminho de banco oficialmente usado pelo Nexus.
- Não assuma que uma migration pode ser aplicada com segurança só porque compila.
- Não apagar, recriar ou reescrever dados existentes para facilitar a implementação.

---

# 3. FASE 1 — AUDITORIA REAL DO NEXUS

Antes de editar arquivos, faça a auditoria da implementação atual da Expedição.

Mapeie e registre:

- Rotas, páginas, subtelas, componentes e estados de interface.
- Hooks, stores, serviços, endpoints e funções de backend.
- Tabelas, relações, migrations, constraints e políticas RLS.
- Como os pedidos entram e deixam a fila da Expedição.
- Como clientes, endereços e coordenadas são relacionados.
- Como motoristas e veículos são cadastrados e atribuídos.
- Como rotas, manifestos ou paradas são criados, alterados, confirmados e encerrados.
- Como a sequência de entregas é armazenada.
- Como o mapa calcula e desenha trajetos.
- Quais recursos de GPS, tracking, geocoding, Realtime, Capacitor ou offline existem de fato.
- Como a experiência mobile atual funciona.
- Quais testes, gates e padrões de design já existem.

Investigue especialmente:

- Pedidos aparecendo em locais incorretos ou duplicados.
- Coordenadas sem origem, antigas ou inconsistentes com o endereço.
- Pedidos entrando em rotas sem seleção explícita.
- Sequência exibida diferente da sequência persistida.
- Reatribuição incorreta de motorista ou veículo.
- Distâncias e tempos apresentados sem indicar como foram calculados.
- Atualizações de mapa que não correspondem ao banco.
- Perda de seleção ou alterações manuais ao atualizar ou recalcular.
- Isolamento incorreto entre empresas/tenants.

Não considere o fluxo correto apenas porque o typecheck ou testes passam.

Ao final da auditoria, registre a arquitetura atual e a origem dos dados. Preserve alterações locais já existentes e não apague trabalho alheio.

---

# 4. FASE 2 — MATRIZ DE CAPACIDADES E DEPENDÊNCIAS

Antes de prometer funções, crie uma matriz com:

| Capacidade | Existe hoje? | Evidência no código | Dados necessários | Dependência externa | Estado |
|---|---|---|---|---|---|

Inclua, no mínimo:

- Seleção e planejamento manual.
- Atribuição de motorista e veículo.
- Geocodificação e validação de endereços.
- Cálculo de trajeto rodoviário.
- Otimização da sequência.
- GPS e posição em tempo real.
- Geofencing.
- Status das paradas.
- Comprovante de entrega.
- Experiência mobile do motorista.
- Operação offline e sincronização.

Classifique cada capacidade como:

- **Implementada e comprovada**
- **Parcial**
- **Ausente**
- **Dependente de serviço, dispositivo ou configuração**
- **Não aplicável ao fluxo atual**

Não exiba na interface como disponível uma função classificada como ausente ou dependente sem que a dependência esteja configurada e validada.

---

# 5. FASE 3 — WORKBENCH DE EXPEDIÇÃO

Use o conceito de workbench do Fleetbase, adaptado à usabilidade e ao design system do Nexus.

## Painel de pedidos disponíveis

Exiba somente dados existentes e relevantes, como:

- Número do pedido.
- Cliente.
- Cidade e endereço.
- Status atual.
- Volumes, peso ou valor, se esses dados existirem e forem confiáveis.
- Situação da localização.
- Indicação de pedido já vinculado a rota.

Ofereça:

- Busca por pedido ou cliente.
- Filtros compatíveis com os dados existentes.
- Seleção individual e múltipla.
- Selecionar resultados filtrados, deixando claro o alcance da seleção.
- Contador de pedidos selecionados.
- Remoção explícita da seleção.
- Estado vazio, carregamento, erro e atualização.

Pedidos vinculados a uma rota ativa não devem ser selecionáveis para outra rota, salvo se existir uma operação controlada de transferência, com validação e histórico.

## Mapa operacional

Exiba apenas locais validados e relacionados aos pedidos selecionados.

Regras:

- Cada marcador corresponde a um pedido ou parada identificável.
- Selecionar um pedido destaca a parada correspondente.
- Selecionar uma parada mostra os dados do pedido.
- Pedidos sem coordenadas confiáveis aparecem em uma lista de pendências, sem marcador inventado.
- Diferencie claramente coordenada, estimativa em linha reta e trajeto rodoviário.
- Nunca desenhe uma linha reta como se fosse uma rota real de ruas.
- Informe qual provedor gerou o trajeto e quando o cálculo foi feito, se disponível.
- Não manter no mapa resultados obsoletos após troca de endereço ou seleção.

## Painel de planejamento

Antes da confirmação, mostre:

- Identificação da rota.
- Motorista e veículo.
- Número de pedidos e paradas.
- Sequência atual.
- Distância e duração, com fonte e estado do cálculo.
- Avisos de localização e dados incompletos.
- Capacidade usada somente se houver capacidade cadastrada e confiável.
- Indicadores de sequência manual ou sugerida.

Permita:

- Alterar sequência manualmente.
- Remover pedidos da proposta.
- Trocar motorista ou veículo.
- Recalcular quando disponível.
- Descartar a proposta sem alterar pedidos.
- Revisar todos os avisos antes de confirmar.

Em telas menores, adaptar o workbench para uso funcional: painéis em abas, drawers ou etapas, sem simplesmente comprimir três colunas em uma tela estreita.

---

# 6. FASE 4 — PROPOSTA E OTIMIZAÇÃO DE ROTAS

Separe claramente:

- **Planejamento:** proposta editável, sem efeito operacional.
- **Cálculo de trajeto:** distância e duração entre pontos por um provedor de roteamento.
- **Otimização:** sugestão de ordem para visitar os pontos selecionados.
- **Confirmação:** persistência definitiva e vínculo dos pedidos com a rota.
- **Execução:** atualização do andamento e das paradas.

Não trate cálculo de trajeto e otimização como a mesma função.

A seleção dos pedidos continua manual. A otimização pode alterar apenas a sequência dos pedidos selecionados, respeitando as regras existentes.

Ao avaliar OSRM, VROOM, Valhalla ou outro serviço:

- Confirme compatibilidade com a infraestrutura e políticas do Nexus.
- Identifique se o serviço faz routing, optimization ou ambos.
- Verifique licenciamento, hospedagem, custos, limites, disponibilidade e dados enviados.
- Não instalar um serviço novo ou criar cobrança sem documentar a necessidade e o impacto.
- Não assumir que um provedor está configurado porque aparece no código do Fleetbase.
- Se não houver provedor confiável, manter a sequência manual e informar que otimização ou trajeto real não está disponível.
- Não apresentar fallback em linha reta como resultado rodoviário.

Preserve alterações manuais nos recálculos. Ofereça uma ação explícita para descartar os ajustes manuais e pedir uma nova sugestão.

---

# 7. FASE 5 — MOTORISTAS, VEÍCULOS E CONFIRMAÇÃO

Motorista e veículo são escolhidos pelo operador, com validação baseada nas regras e dados que já existem.

Não inventar disponibilidade, capacidade, associação motorista-veículo, habilitação ou restrição. Se o sistema não mantiver determinado dado, não o apresente como validado.

Antes de confirmar, validar novamente:

- Tenant e permissões do usuário.
- Pedidos selecionados e situação atual.
- Pedido duplicado na proposta.
- Pedido já associado a outra rota.
- Dados obrigatórios de motorista e veículo, conforme regra existente.
- Coordenadas e avisos que impeçam a operação.
- Consistência da sequência.

A confirmação deve ser explícita e consistente:

1. Salvar a rota e as paradas.
2. Registrar a sequência final.
3. Vincular os pedidos.
4. Registrar autor e horário da confirmação, conforme padrão do Nexus.
5. Atualizar a interface com os dados persistidos.
6. Impedir confirmação parcial em caso de conflito.

Use transação ou mecanismo de consistência compatível com o backend atual. Se o mecanismo disponível não garantir atomicidade, documente a limitação e implemente compensação segura. Não reporte sucesso se parte da operação falhou.

---

# 8. FASE 6 — EXECUÇÃO, TRACKING E INTEGRAÇÃO MOBILE

## Tracking e monitoramento

Primeiro determine se o Nexus já recebe GPS confiável de motoristas ou veículos.

- Se houver GPS e eventos reais, integre-os com atualização eficiente.
- Mostre horário da última posição e estado de conexão, se esses dados existirem.
- Não simule posição, chegada, geofence ou atualização em tempo real.
- Não exiba “online” sem evidência de atualização recente.
- Trate ausência de sinal e posição desatualizada explicitamente.
- Não criar subscriptions Realtime duplicadas.
- Respeite retenção de dados e políticas do projeto.

Se GPS não existir, implemente apenas a interface e a estrutura que possam funcionar com dados atuais; não afirme que existe rastreamento. Documente o hardware, serviço, credencial ou app que será necessário para ativá-lo.

## Experiência do motorista

Audite primeiro a experiência mobile que já existe no Nexus, incluindo Capacitor, rotas responsivas, autenticação, notificações, câmera, localização e armazenamento offline.

- Se a estrutura atual suportar o fluxo, implemente a experiência do motorista dentro dela.
- Não crie um segundo aplicativo ou stack mobile sem comprovar que é necessário.
- Use o Navigator como referência de fluxo: próxima parada, rota do dia, ações de entrega, ocorrências e comprovantes.
- Não copie código do Navigator sem analisar compatibilidade e licença.
- Se uma app separada for indispensável, conclua primeiro o que cabe no Nexus e documente a arquitetura, dependências, custo operacional e plano de integração do app separado. Não apresente esse app como implementado.

Implemente fotos, assinatura, QR code, geofencing, notificações ou localização somente se os dados, permissões e infraestrutura necessários existirem ou forem implementados e validados.

## Offline

Não declarar suporte offline apenas por cache de interface.

Se implementar operações offline:

- Definir exatamente quais ações podem ocorrer offline.
- Persistir uma fila local com identificadores idempotentes.
- Resolver conflitos e duplicidade na sincronização.
- Mostrar pendências, erros e último sync.
- Não permitir que uma operação offline pareça confirmada no servidor.
- Proteger dados sensíveis armazenados localmente.
- Testar retomada após fechamento do app e perda de rede.

---

# 9. INTEGRIDADE GEOGRÁFICA

Validar coordenadas dentro dos limites de latitude e longitude, além de sua origem e relação com o endereço.

- Não usar localização do navegador como localização do cliente.
- Não associar coordenadas de um cliente a outro.
- Não geocodificar automaticamente um endereço ambíguo como se fosse certo.
- Após alteração de endereço, invalidar ou revalidar coordenadas conforme o modelo existente.
- Registrar origem e data da geocodificação se a estrutura atual permitir.
- Não criar campos duplicados sem justificativa.
- Não bloquear indiscriminadamente pedidos sem coordenada se o processo atual permitir completar o endereço depois; sinalizar a pendência e impedir apenas as ações que realmente dependam da localização.

---

# 10. FASE 7 — DESIGN E USABILIDADE

A Expedição deve parecer parte do Nexus, mantendo o design system atual e melhorando a eficiência operacional.

Priorize:

- Hierarquia visual clara e estados distinguíveis.
- Poucos passos para selecionar pedidos e iniciar uma rota.
- Feedback imediato para seleção, alteração, cálculo e confirmação.
- Mensagens que indiquem o problema e a ação possível.
- Acessibilidade por teclado, foco e leitores de tela.
- Densidade adequada para operação diária.
- Responsividade real para desktop, tablet e celular.
- Carregamento progressivo para listas e mapa.
- Confirmação clara antes de operações definitivas.

Não entregar apenas um mockup ou uma reorganização visual. Os controles precisam executar ações reais e persistir corretamente.

---

# 11. FASE 8 — TESTES, ESTABILIZAÇÃO E EVIDÊNCIAS

Siga os scripts e gates existentes no repositório. Crie ou atualize testes para cobrir, no mínimo:

1. Selecionar manualmente pedidos e criar proposta.
2. Confirmar que pedidos não selecionados não entram na rota.
3. Remover um pedido antes de confirmar.
4. Alterar manualmente a sequência.
5. Preservar a ordem manual após recálculo.
6. Solicitar otimização e lidar com provedor indisponível.
7. Trocar motorista ou veículo.
8. Impedir duplicidade na mesma rota.
9. Impedir vínculo simultâneo a duas rotas ativas.
10. Descartar proposta sem alterar pedido original.
11. Confirmar e persistir sequência e vínculos.
12. Impedir confirmação parcial em conflito.
13. Exibir localização inválida sem inventar marcador.
14. Atualizar uma parada sem alterar indevidamente outras.
15. Garantir isolamento entre tenants.
16. Refletir dados persistidos após recarregar.
17. Exibir posição GPS ausente ou desatualizada corretamente.
18. Testar fluxo mobile na infraestrutura já suportada.
19. Se houver offline, testar fila, retry, conflito e idempotência.
20. Garantir estados de erro, carregamento e vazio nos painéis.

Execute typecheck, lint, testes direcionados e gates relevantes do projeto. Não desabilite ou enfraqueça testes para fazer a implementação passar. Não reporte testes que não foram executados.

---

# 12. PRIORIZAÇÃO E ORDEM DE ENTREGA

Trabalhe progressivamente e conclua uma fase antes de avançar.

## P0 — Fluxo manual seguro

- Auditoria do fluxo atual.
- Workbench funcional.
- Seleção manual dos pedidos.
- Proposta editável.
- Motorista e veículo conforme regras existentes.
- Sequência manual.
- Confirmação consistente.
- Proteção contra duplicidade, conflitos e erros geográficos.
- Testes do fluxo principal.

## P1 — Routing e otimização

- Provedor real de trajeto.
- Distância e duração identificadas por fonte.
- Otimização opcional apenas dos pedidos selecionados.
- Preservação de alterações manuais.
- Comportamento claro quando serviço falha ou não está configurado.
- Testes de cálculo e indisponibilidade.

## P2 — Operação em campo

- Execução mobile do motorista, preferencialmente reaproveitando o app e a arquitetura existentes.
- Atualização de estados de parada suportados pelo Nexus.
- GPS e monitoramento, se houver origem real de dados.
- Comprovante de entrega e ocorrências, se houver armazenamento e fluxo compatíveis.
- Offline, geofencing e sincronização somente com desenho, segurança e testes completos.

Não marque itens dependentes de hardware, credenciais ou serviços externos como concluídos sem teste real. Continue trabalhando nos itens independentes e registre as dependências restantes.

---

# 13. CRITÉRIOS DE ACEITAÇÃO E DEFINITION OF DONE

A melhoria estará concluída quando:

- O operador selecionar manualmente quais pedidos entrarão na rota.
- A rota começar como proposta editável.
- Pedidos não selecionados permanecerem fora dela.
- O operador conseguir revisar e alterar a sequência.
- A otimização for opcional e restrita aos pedidos escolhidos.
- Routing e optimization forem funções claramente distintas.
- Distância, duração, origem do cálculo e indisponibilidade forem apresentados corretamente.
- A rota só for efetivada mediante confirmação explícita.
- A confirmação não criar vínculos duplicados nem atualizar parcialmente os registros.
- Tenant, RLS, permissões e histórico respeitarem os padrões atuais.
- Mapa e coordenadas não inventarem ou reutilizarem localizações incorretas.
- Tracking, app mobile, POD e offline só forem chamados de implementados quando houver integração real, persistência e testes.
- A interface funcione em desktop, tablet e celular.
- Todos os controles entregues tenham comportamento funcional.
- Os testes e gates relevantes tenham sido executados e seus resultados registrados.
- O fluxo atual de vendas e pedidos continue funcionando.

---

# 14. RELATÓRIO FINAL

Ao concluir, informe:

1. Estado inicial da Expedição e evidências encontradas.
2. Arquitetura e fluxo adotados.
3. Recursos implementados por prioridade.
4. Recursos não implementados e motivo verificável.
5. Arquivos criados e alterados.
6. Migrations e mudanças de banco, se houver.
7. Provedores externos, credenciais ou hardware necessários.
8. Testes executados e resultados reais.
9. Como o fluxo manual foi preservado.
10. Como validar o fluxo em desktop e mobile.
11. Riscos ou limitações que ainda existirem.

Não declarar “concluído” algo que esteja apenas planejado, simulado, sem persistência ou dependente de configuração não realizada.

**Comece pela auditoria do Nexus e pela leitura do código atual do Fleetbase. Depois implemente as fases até o limite que a infraestrutura real permitir, sem parar após o planejamento e sem inventar capacidades ausentes.**
