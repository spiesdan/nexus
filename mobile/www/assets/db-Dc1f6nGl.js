const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["assets/esm-CYSzktrt.js","assets/dist-TLtlamx_.js"])))=>i.map(i=>d[i]);
(function(){let e=document.createElement(`link`).relList;if(e&&e.supports&&e.supports(`modulepreload`))return;for(let e of document.querySelectorAll(`link[rel="modulepreload"]`))n(e);new MutationObserver(e=>{for(let t of e)if(t.type===`childList`)for(let e of t.addedNodes)e.tagName===`LINK`&&e.rel===`modulepreload`&&n(e)}).observe(document,{childList:!0,subtree:!0});function t(e){let t={};return e.integrity&&(t.integrity=e.integrity),e.referrerPolicy&&(t.referrerPolicy=e.referrerPolicy),t.credentials=e.crossOrigin===`use-credentials`?`include`:e.crossOrigin===`anonymous`?`omit`:`same-origin`,t}function n(e){if(e.ep)return;e.ep=!0;let n=t(e);fetch(e.href,n)}})();var e=`
CREATE TABLE IF NOT EXISTS pedidos_pendentes (
  uuid TEXT PRIMARY KEY,
  numero_provisorio TEXT NOT NULL,
  payload TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pendente',
  tentativas INTEGER NOT NULL DEFAULT 0,
  ultimo_erro TEXT,
  criado_em TEXT NOT NULL,
  enviado_em TEXT,
  pedido_id TEXT,
  pedido_numero INTEGER
);
CREATE INDEX IF NOT EXISTS pedidos_pendentes_status_idx
  ON pedidos_pendentes (status, criado_em);
`;function t(e){return{uuid:e.uuid,numero_provisorio:e.numero_provisorio,payload:JSON.parse(e.payload),status:e.status,tentativas:Number(e.tentativas??0),ultimo_erro:e.ultimo_erro??null,criado_em:e.criado_em,enviado_em:e.enviado_em??null,pedido_id:e.pedido_id??null,pedido_numero:e.pedido_numero==null?null:Number(e.pedido_numero)}}async function n(e,t){await e.execute(`INSERT INTO pedidos_pendentes (uuid, numero_provisorio, payload, status, tentativas, criado_em)
     VALUES (?, ?, ?, 'pendente', 0, ?)`,[t.uuid,t.numero_provisorio,JSON.stringify(t.payload),t.agora])}async function r(e){return((await e.query(`SELECT * FROM pedidos_pendentes WHERE status IN ('pendente','enviando','rejeitado') ORDER BY criado_em ASC`)).values??[]).map(t)}async function i(e){let t=await e.query(`SELECT status, COUNT(*) as n FROM pedidos_pendentes
     WHERE status IN ('pendente','enviando','rejeitado') GROUP BY status`),n=0,r=0;for(let e of t.values??[])e.status===`rejeitado`?r+=Number(e.n):n+=Number(e.n);return{pendentes:n,rejeitados:r}}var a=`
CREATE TABLE IF NOT EXISTS catalogo_produtos (
  id TEXT PRIMARY KEY,
  codigo TEXT,
  nome TEXT NOT NULL,
  preco_cents INTEGER NOT NULL,
  controla_estoque INTEGER NOT NULL DEFAULT 0,
  quantidade REAL,
  ativo INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS catalogo_contatos (
  id TEXT PRIMARY KEY,
  nome TEXT NOT NULL,
  documento TEXT,
  cidade TEXT,
  limite_cents INTEGER
);
CREATE TABLE IF NOT EXISTS catalogo_tabelas (
  id TEXT PRIMARY KEY,
  nome TEXT NOT NULL,
  desconto_pct REAL NOT NULL DEFAULT 0,
  itens TEXT NOT NULL DEFAULT '[]'
);
CREATE TABLE IF NOT EXISTS meta (
  chave TEXT PRIMARY KEY,
  valor TEXT NOT NULL
);
`;async function o(e){let t=(await e.query(`SELECT valor FROM meta WHERE chave = 'catalogo_sincronizado_em'`)).values?.[0]?.valor;return typeof t==`string`?t:null}async function s(e){let[t,n]=await Promise.all([e.query(`SELECT COUNT(*) as n FROM catalogo_produtos`),e.query(`SELECT COUNT(*) as n FROM catalogo_contatos`)]);return{produtos:Number(t.values?.[0]?.n??0),contatos:Number(n.values?.[0]?.n??0)}}async function c(e,t,n=30){return((await e.query(`SELECT * FROM catalogo_produtos
     WHERE ativo = 1 AND (nome LIKE '%' || ? || '%' OR codigo LIKE '%' || ? || '%')
     ORDER BY nome LIMIT ?`,[t,t,n])).values??[]).map(e=>({id:e.id,codigo:e.codigo??null,nome:e.nome,preco_cents:Number(e.preco_cents),controla_estoque:Number(e.controla_estoque)===1,quantidade:e.quantidade==null?null:Number(e.quantidade),ativo:!0}))}async function l(e,t,n=30){return((await e.query(`SELECT * FROM catalogo_contatos WHERE nome LIKE '%' || ? || '%' ORDER BY nome LIMIT ?`,[t,n])).values??[]).map(e=>({id:e.id,nome:e.nome,documento:e.documento??null,cidade:e.cidade??null,limite_cents:e.limite_cents==null?null:Number(e.limite_cents)}))}var u=`modulepreload`,d=function(e){return`/`+e},f={},p=function(e,t,n){let r=Promise.resolve();if(t&&t.length>0){let e=document.getElementsByTagName(`link`),i=document.querySelector(`meta[property=csp-nonce]`),a=i?.nonce||i?.getAttribute(`nonce`);function o(e){return Promise.all(e.map(e=>Promise.resolve(e).then(e=>({status:`fulfilled`,value:e}),e=>({status:`rejected`,reason:e}))))}function s(e){return import.meta.resolve?import.meta.resolve(e):new URL(e,import.meta.url).href}r=o(t.map(t=>{if(t=d(t,n),t=s(t),t in f)return;f[t]=!0;let r=t.endsWith(`.css`);for(let n=e.length-1;n>=0;n--){let i=e[n];if(i.href===t&&(!r||i.rel===`stylesheet`))return}let i=document.createElement(`link`);if(i.rel=r?`stylesheet`:u,r||(i.as=`script`),i.crossOrigin=``,i.href=t,a&&i.setAttribute(`nonce`,a),document.head.appendChild(i),r)return new Promise((e,n)=>{i.addEventListener(`load`,e),i.addEventListener(`error`,()=>n(Error(`Unable to preload CSS for ${t}`)))})}))}function i(e){let t=new Event(`vite:preloadError`,{cancelable:!0});if(t.payload=e,window.dispatchEvent(t),!t.defaultPrevented)throw e}return r.then(t=>{for(let e of t||[])e.status===`rejected`&&i(e.reason);return e().catch(i)})},m=`crm-offline`,h=null;function g(){return h||=_(),h}async function _(){let{Capacitor:t}=await p(async()=>{let{Capacitor:e}=await import(`./dist-TLtlamx_.js`);return{Capacitor:e}},[]),{SQLiteConnection:n,CapacitorSQLite:r}=await p(async()=>{let{SQLiteConnection:e,CapacitorSQLite:t}=await import(`./esm-CYSzktrt.js`);return{SQLiteConnection:e,CapacitorSQLite:t}},__vite__mapDeps([0,1])),i=new n(r);t.getPlatform()===`web`&&(await p(()=>import(`./dist-BvRk9kiK.js`),[]),await customElements.whenDefined(`jeep-sqlite`),await i.initWebStore());let o=(await i.isConnection(m,!1)).result?await i.retrieveConnection(m,!1):await i.createConnection(m,!1,`no-encryption`,1,!1);return await o.open(),await o.execute(e),await o.execute(a),{async query(e,t){return{values:(await o.query(e,t??[])).values??[]}},async execute(e,t){let n=await o.run(e,t??[]);return{changes:Number(n.changes?.changes??0)}}}}export{o as a,n as c,c as i,r as l,p as n,s as o,l as r,i as s,g as t};