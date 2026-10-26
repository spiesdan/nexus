-- 0288 — um "Enviar agora" por número, de cada vez.
--
-- ─── O defeito que isto resolve ─────────────────────────────────────────────
--
-- O ritmo do disparo em lote mora num `Map` em memória (`_ultimoEnvio`, por
-- sessão). Ele cumpre o que promete para UM envio por vez e não cumpre nada
-- quando dois clicam ao mesmo tempo: medido em 26/10/2026 na instalação do
-- usuário, três requisições de "Enviar agora" (20+19+10 prospects) entraram
-- juntas, leram `_ultimoEnvio` antes de qualquer escrita e cada uma começou a
-- mandar — ~3 mensagens por minuto num número que estava em aquecimento, com
-- o operador vendo "2 min entre mensagens" na tela. Quem paga é a linha da
-- empresa.
--
-- A trava é do NÚMERO (`channel_sessions`), não da campanha: a cota e o
-- ritmo que importam são os do aparelho, e duas campanhas diferentes no mesmo
-- número brigam pelo mesmo ritmo.
--
-- `dispatch_locked_until` é um LEASE, não um booleano: a requisição que morre
-- no meio (restart, deploy, aba fechada) não pode deixar o número travado para
-- sempre. O TTL é proporcional ao plano (intervalo × quantidade) e quem chega
-- depois de vencido assume a trava.
--
-- `dispatch_lock_token` existe para a liberação ser do DONO: uma requisição
-- que perdeu o lease por TTL não pode destravar o disparo de quem o assumiu.
alter table public.channel_sessions
  add column if not exists dispatch_locked_until timestamptz,
  add column if not exists dispatch_lock_token text;

comment on column public.channel_sessions.dispatch_locked_until is
  'Até quando este número está reservado para um disparo em lote (lease). Nulo ou vencido = livre. O TTL acompanha o plano (intervalo × quantidade), então uma requisição que morre não trava o número para sempre.';
comment on column public.channel_sessions.dispatch_lock_token is
  'Dono do lease de disparo. A liberação só vale para quem tem o token — quem perdeu a trava por TTL não destrava o disparo de outro.';
