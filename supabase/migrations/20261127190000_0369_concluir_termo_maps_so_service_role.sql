-- 0369 — A CONCLUSÃO DE TERMO MAPS É DO MOTOR, NÃO DA SESSÃO.
--
-- A 0367 nasceu com `grant execute ... to authenticated, service_role` e a
-- varredura de hardening acusou, com razão: é uma SECURITY DEFINER que escreve
-- em `prospecting_searches` e em `prospect_search_results`, e a sessão de
-- qualquer tenant poderia chamá-la direto pelo PostgREST. O único call site é o
-- motor (`processarMapas`), que usa o client de service role.
--
-- Revogar de `authenticated` fecha a porta sem quebrar o call site. A guarda
-- interna (service_role / platform admin / agent) continua como defesa em
-- profundidade para quem um dia chamar por outro caminho.

revoke execute on function public.fn_concluir_termo_maps(uuid, uuid, jsonb, integer, text)
  from authenticated;

comment on function public.fn_concluir_termo_maps(uuid, uuid, jsonb, integer, text) is
  'Conclui um termo Maps (motor/service role): grava progresso e deriva encontradas/novas/duplicadas dos vínculos idempotentes, tudo numa escrita. Executável por service_role apenas; a guarda interna continua.';
