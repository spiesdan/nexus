import { chromium } from "@playwright/test";
const b=await chromium.launch();
for (const [w,h] of [[1440,900],[390,844]]) {
 const ctx=await b.newContext({storageState:"/tmp/state-qa.json",viewport:{width:w,height:h},locale:"pt-BR"});
 let publicada=false;
 const carga=(pub)=>({id:"c1",numero:13,status:pub?"em_rota":"montando",placa:"ABC1D23",veiculo_tipo:"HR",motorista_nome:"Ana",origem_endereco:null,origem_lat:null,origem_lng:null,retornar_origem:false,tempo_parada_min:8,distancia_m:1000,duracao_s:600,rota_geojson:null,rota_em:pub?"2026-11-25T10:00:00Z":null,rota_versao:pub?2:1,rota_versao_confirmada:null,rota_confirmada_em:null,saida_prevista:null,started_at:null,finished_at:null});
 const rota=(pub)=>({data:{carga:carga(pub),paradas:[{chave:"p1",destination_id:null,contact_id:null,cliente:"Cliente A",fone:null,endereco:"Rua A, 10 — Mafra/SC",latitude:-26.12,longitude:-50.38,geo_status:"ok",geo_fonte:null,pedidos:[{shipment_order_id:"so1",order_id:"o1",numero:1,total_cents:100,status:"na_carga"}],total_cents:100}],itens:[{separado_em:"2026-11-25T09:00:00Z"}],ultima_posicao:null,distribuicao:null,historico_rotas:[]}});
 await ctx.route('**/api/v1/shipments/*/rota',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(rota(publicada))}));
 await ctx.route('**/api/v1/shipments/*/rota/ordem',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({data:{}})}));
 await ctx.route('**/api/v1/shipments/*/rota/iniciar',r=>{publicada=true;return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({data:{}})})});
 const p=await ctx.newPage();
 await p.goto("http://localhost:3046/app/expedicao/a7c1997e-e922-4a47-98d8-6257947069d3/rota",{waitUntil:"domcontentloaded",timeout:240000});await p.waitForTimeout(4000);
 const antes=await p.evaluate(()=>({botao:[...document.querySelectorAll('[data-testid="publicar-rota"]')].map(x=>x.textContent.trim()),selo:document.body.textContent.includes('Publicada em')}));
 await p.locator('[data-testid="publicar-rota"]').click();await p.waitForTimeout(600);
 const confirm=p.getByRole('button',{name:'Publicar rota'}).last(); if(await confirm.count()) await confirm.click();
 await p.waitForTimeout(3500);
 const depois=await p.evaluate(()=>({botao:[...document.querySelectorAll('[data-testid="publicar-rota"]')].map(x=>x.textContent.trim()),selo:document.body.textContent.includes('Publicada em'),faixa:document.body.textContent.match(/Publicada em[^\n]{0,80}/)?.[0]}));
 console.log(w,JSON.stringify({antes,depois}));
 await p.screenshot({path:`docs/auditoria/capturas/qa-rota-publicada-light_${w}.png`});await ctx.close();
}
await b.close();
