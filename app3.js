/* ---------- 渲染 ---------- */
function countUp(el,to,suffix='',dur=900){
  const t0=performance.now(),from=0;
  function step(t){const p=Math.min(1,(t-t0)/dur),e=1-Math.pow(1-p,3);
    el.textContent=fmtInt(from+(to-from)*e)+suffix;
    if(p<1)requestAnimationFrame(step)}
  requestAnimationFrame(step);
}
function renderKPIs(){
  const cs=state.customers;
  const orders=cs.reduce((s,c)=>s+c.orders,0);
  const M=cs.reduce((s,c)=>s+c.M,0);
  const active30=cs.filter(c=>c.R!=null&&c.R<=30).length;
  const data=[
    {lab:'客户总数',v:cs.length,suf:' 人',sub:'有效去重客户'},
    {lab:'累计订单',v:orders,suf:' 笔',sub:'导入流水行数口径'},
    {lab:'消费总额 GMV',v:M,suf:'',sub:'全部客户累计贡献',money:true},
    {lab:'平均客单价',v:M/orders,suf:'',sub:'每笔订单金额',money:true},
    {lab:'近30天活跃率',v:100*active30/cs.length,suf:'%',sub:fmtInt(active30)+' 位客户近期下单',float:true}
  ];
  $('#kpis').innerHTML=data.map((d,i)=>`
    <div class="kpi reveal" style="animation-delay:${i*70}ms">
      <div class="lab">${d.lab}</div>
      <div class="val" id="kpi${i}"></div>
      <div class="sub">${d.sub}</div>
    </div>`).join('');
  data.forEach((d,i)=>{const el=$('#kpi'+i);
    if(d.money){const t0=performance.now();requestAnimationFrame(function st(t){const p=Math.min(1,(t-t0)/900);
      el.innerHTML=(d.v>=1e4?'¥'+(d.v*p/1e4).toFixed(1)+'<small>万</small>':'¥'+fmtInt(d.v*p));if(p<1)requestAnimationFrame(st)})}
    else if(d.float){const t0=performance.now();requestAnimationFrame(function st(t){const p=Math.min(1,(t-t0)/900);
      el.innerHTML=(d.v*p).toFixed(1)+'<small>%</small>';if(p<1)requestAnimationFrame(st)})}
    else countUp(el,d.v,d.suf)});
}

/* --- SVG 通用 --- */
function svgEl(w,h){return `<svg viewBox="0 0 ${w} ${h}" width="100%" style="display:block">`}
const NS='http://www.w3.org/2000/svg';

function renderDonut(){
  const gs=state.groups,tot=gs.reduce((s,g)=>s+g.size,0);
  const revTot=gs.reduce((s,g)=>s+g.revenue,0);
  const cx=110,cy=110,r=74,C=2*Math.PI*r,off=1.6;
  let acc=0;
  const segs=gs.map(g=>{
    const frac=g.size/tot,len=Math.max(0,frac*C-off);
    const dash=`${len} ${C-len}`,rot=-90+acc/C*360;acc+=frac*C;
    return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${g.color}" stroke-width="24"
      stroke-dasharray="${dash}" transform="rotate(${rot} ${cx} ${cy})" style="opacity:${state.legendOff[g.name]?0.25:1};transition:.2s">
      <animate attributeName="stroke-dasharray" from="0 ${C}" to="${dash}" dur=".9s" fill="freeze"/></circle>`;
  }).join('');
  $('#donut').innerHTML=svgEl(460,250)+
    `<g transform="translate(10,0)">${segs}
      <text x="${cx}" y="${cy-6}" text-anchor="middle" font-size="26" font-weight="700" fill="#1B2420"
        font-family="Noto Serif SC,serif">${fmtInt(tot)}</text>
      <text x="${cx}" y="${cy+16}" text-anchor="middle" font-size="11" fill="#8A918A" letter-spacing="2">客户总数</text>
    </g>
    <g transform="translate(250,30)" font-size="12.5" fill="#4A554F">
      ${gs.map((g,i)=>`<g transform="translate(0,${i*27})">
        <rect width="10" height="10" rx="2" y="1" fill="${g.color}"/>
        <text x="18" y="10">营收 ${(100*g.revenue/revTot).toFixed(1)}%</text>
        <text x="185" y="10" text-anchor="end" fill="#8A918A">人数 ${(100*g.size/tot).toFixed(1)}%</text>
      </g>`).join('')}
    </g></svg>`;
  $('#donut-legend').innerHTML=gs.map(g=>
    `<span data-n="${g.name}"><i style="background:${g.color}"></i>${g.name} · ${g.size}人</span>`).join('');
}

function renderScatter(){
  const cs=state.customers,W=620,H=340,L=52,B=34,R=14,T=14;
  let pts=cs;
  if(cs.length>1400){const rnd=mulberry(5);pts=cs.filter(()=>rnd()<1400/cs.length)}
  const Rs=cs.map(c=>Math.max(.5,c.R??.5)),Ms=cs.map(c=>Math.max(1,c.M));
  const xMin=0,xMax=Math.max(...cs.map(c=>c.R??0))*1.05;
  const yMin=Math.log10(Math.min(...Ms)*.8),yMax=Math.log10(Math.max(...Ms)*1.1);
  const X=v=>L+(Math.max(0,v)-xMin)/(xMax-xMin||1)*(W-L-R);
  const Y=v=>T+(yMax-Math.log10(Math.max(v,Math.pow(10,yMin))))/(yMax-yMin||1)*(H-T-B);
  let grid='';
  for(let i=0;i<=4;i++){
    const x=xMin+(xMax-xMin)*i/4,px=X(x);
    grid+=`<line x1="${px}" y1="${T}" x2="${px}" y2="${H-B}" stroke="#EDE7D9"/>
      <text x="${px}" y="${H-B+18}" text-anchor="middle" font-size="10.5" fill="#8A918A">${Math.round(x)}天</text>`;
    const lv=yMin+(yMax-yMin)*i/4,py=Y(Math.pow(10,lv));
    grid+=`<line x1="${L}" y1="${py}" x2="${W-R}" y2="${py}" stroke="#F1EDE2"/>
      <text x="${L-8}" y="${py+4}" text-anchor="end" font-size="10.5" fill="#8A918A">¥${Math.pow(10,lv)>=1e4?(Math.pow(10,lv)/1e4).toFixed(0)+'万':Math.round(Math.pow(10,lv))}</text>`;
  }
  const dots=pts.map(c=>{const g=state.groups[c.groupIdx];
    return `<circle cx="${X(c.R??0)}" cy="${Y(Math.max(1,c.M))}" r="3.4" fill="${g.color}"
      opacity="${state.legendOff[g.name]?0.12:0.62}"><title>${c.id}｜${g.name}｜R${c.R}天 F${c.F}笔 ${fmtMoney(c.M)}</title></circle>`}).join('');
  $('#scatter').innerHTML=svgEl(W,H)+
    grid+`<line x1="${L}" y1="${T}" x2="${L}" y2="${H-B}" stroke="#C9C2B2"/>
    <line x1="${L}" y1="${H-B}" x2="${W-R}" y2="${H-B}" stroke="#C9C2B2"/>${dots}</svg>`;
}

function renderRadar(){
  const gs=state.groups.filter(g=>!state.legendOff[g.name]);
  const W=560,H=330,cx=170,cy=168,R=118;
  const axes=['近期活跃','消费频次','消费金额','客单价','忠诚度'];
  const pt=(dim,i,rr)=>{const ang=-Math.PI/2+i*2*Math.PI/5;
    return [cx+Math.cos(ang)*rr*dim,cy+Math.sin(ang)*rr*dim]};
  let s='';
  for(let ring=1;ring<=4;ring++){
    s+='<polygon points="'+axes.map((_,i)=>pt(ring/4,i,R).join(',')).join(' ')+
      `" fill="${ring===4?'#FBF8EF':'none'}" stroke="#E6DFCE" stroke-width="1"/>`;
  }
  axes.forEach((a,i)=>{const[x,y]=pt(1,i,R);
    s+=`<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="#E6DFCE"/>`;
    const[lx,ly]=pt(1.16,i,R);
    s+=`<text x="${lx}" y="${ly+4}" text-anchor="middle" font-size="11.5" fill="#4A554F">${a}</text>`});
  gs.forEach(g=>{
    const p=axes.map((_,i)=>pt(g.radar[i],i,R).join(',')).join(' ');
    s+=`<polygon points="${p}" fill="${g.color}" fill-opacity=".1" stroke="${g.color}" stroke-width="2"/>`;
    g.radar.forEach((v,i)=>{const[x,y]=pt(v,i,R);s+=`<circle cx="${x}" cy="${y}" r="2.8" fill="${g.color}"/>`});
  });
  s+=`<circle cx="${cx}" cy="${cy}" r="2.6" fill="#1B2420"/></svg>`;
  // 右侧图例+均值
  let info=gs.map((g,i)=>`<g transform="translate(350,${30+i*34})">
    <rect width="10" height="10" rx="2" y="2" fill="${g.color}"/>
    <text x="17" y="12" font-size="12.5" fill="#1B2420">${g.name}</text>
    <text x="200" y="12" font-size="11" text-anchor="end" fill="#8A918A">R${g.Ravg.toFixed(0)} · F${g.Favg.toFixed(1)} · ${fmtMoney(g.Mavg)}</text>
  </g>`).join('');
  $('#radar').innerHTML=svgEl(W,H)+s+info;
  $('#radar-legend').innerHTML=state.groups.map(g=>
    `<span data-n="${g.name}" class="${state.legendOff[g.name]?'off':''}"><i style="background:${g.color}"></i>${g.name}</span>`).join('');
}

function renderTrend(){
  // 月份轴：以数据中最新订单为基准，近6个月
  const cs=state.customers;
  let maxD=state.refD;
  const months=[];
  for(let i=5;i>=0;i--){const d=new Date(maxD.getFullYear(),maxD.getMonth()-i,1);
    months.push(d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0'))}
  const gs=state.groups;
  const series=gs.map(g=>{
    const mm=new Array(6).fill(0);
    for(const c of g.members){
      for(const[m,v]of Object.entries(c.monthMoney||{})){const idx=months.indexOf(m);if(idx>=0)mm[idx]+=v}
    }
    return mm;
  });
  const W=620,H=300,L=56,R=16,T=16,B=30;
  const maxV=Math.max(1,...series.flat())*1.12;
  const X=i=>L+i*(W-L-R)/5,Y=v=>T+(1-v/maxV)*(H-T-B);
  let s='';
  for(let i=0;i<=4;i++){const v=maxV*i/4,py=Y(v);
    s+=`<line x1="${L}" y1="${py}" x2="${W-R}" y2="${py}" stroke="#F1EDE2"/>
      <text x="${L-8}" y="${py+4}" text-anchor="end" font-size="10" fill="#8A918A">${v>=1e4?(v/1e4).toFixed(0)+'万':Math.round(v)}</text>`}
  months.forEach((m,i)=>{s+=`<text x="${X(i)}" y="${H-8}" text-anchor="middle" font-size="10.5" fill="#8A918A">${m.slice(5)}月</text>`});
  gs.forEach((g,gi)=>{
    if(state.legendOff[g.name])return;
    const d=series[gi].map((v,i)=>(i?'L':'M')+X(i).toFixed(1)+' '+Y(v).toFixed(1)).join(' ');
    const area=`M${X(0)} ${H-B} L`+series[gi].map((v,i)=>X(i).toFixed(1)+' '+Y(v).toFixed(1)).join(' L ')+` L${X(5)} ${H-B} Z`;
    s+=`<path d="${area}" fill="${g.color}" fill-opacity=".07"/>
      <path d="${d}" fill="none" stroke="${g.color}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>`;
    series[gi].forEach((v,i)=>{s+=`<circle cx="${X(i)}" cy="${Y(v)}" r="3" fill="#FFFDF7" stroke="${g.color}" stroke-width="1.8"><title>${months[i]} ${g.name}：${fmtMoney(v)}</title></circle>`});
  });
  $('#trend').innerHTML=svgEl(W,H)+s+'</svg>';
  $('#trend-legend').innerHTML=gs.map(g=>
    `<span data-n="${g.name}" class="${state.legendOff[g.name]?'off':''}"><i style="background:${g.color}"></i>${g.name}</span>`).join('');
}

function renderSegCards(){
  const tot=state.customers.length,revTot=state.groups.reduce((s,g)=>s+g.revenue,0);
  $('#segcards').innerHTML=state.groups.map((g,i)=>{
    const traits=[];
    if(g.cent[2]>.5)traits.push(['消费力强','good']);
    if(g.cent[1]>.5)traits.push(['高频复购','good']);
    if(g.cent[0]<-.4)traits.push(['近期活跃','good']);
    if(g.aovAvg>state.groups.reduce((m,x)=>Math.max(m,x.aovAvg),0)*.85&&g.cent[2]>0)traits.push(['高客单价','good']);
    if(g.tenAvg>=4)traits.push(['忠诚度高','good']);
    if(g.cent[0]>.4)traits.push(['沉睡流失风险','warn']);
    if(g.cent[1]<-.4)traits.push(['低频待培育','warn']);
    if(g.cent[2]<-.4)traits.push(['低消费力','warn']);
    if(!traits.length)traits.push(['普通大众客群','']);
    return `<div class="seg reveal" style="animation-delay:${i*60}ms">
      <div class="bar" style="background:${g.color}"></div>
      <div class="seg-head"><div class="nm">${g.name}</div>
        <div class="cnt">${g.size} 人 · 占比 ${(100*g.size/tot).toFixed(1)}%</div></div>
      <div class="share-line"><i style="width:${100*g.revenue/revTot}%;background:${g.color}"></i></div>
      <div class="seg-stats">
        <div><b>${g.Ravg.toFixed(0)}<span>平均R · 天</span></b></div>
        <div><b>${g.Favg.toFixed(1)}<span>平均F · 笔</span></b></div>
        <div><b>${fmtMoney(g.Mavg)}<span>人均M</span></b></div>
        <div><b>${(100*g.revenue/revTot).toFixed(1)}%<span>营收贡献</span></b></div>
      </div>
      <div class="chips">${traits.map(([t,c])=>`<span class="chip ${c}">${t}</span>`).join('')}</div>
      <div class="strategy">${g.strategy}</div>
    </div>`}).join('');
}

/* --- 客户表 --- */
function renderTable(){
  const kw=$('#search').value.trim().toLowerCase(),fg=$('#filter-group').value,fr=$('#filter-risk').value;
  let rows=state.customers.filter(c=>
    (!kw||c.id.toLowerCase().includes(kw))&&
    (!fg||c.groupIdx===+fg)&&
    (!fr||c.risk===fr));
  const {key,dir}=state.sort;
  const val=c=>key==='group'?c.groupIdx:key==='risk'?({高:2,中:1,低:0,'—':-1}[c.risk]):c[key];
  rows.sort((a,b)=>(typeof val(a)==='string'?val(a).localeCompare(val(b),'zh'):val(a)-val(b))*dir);
  $('#rowcount').textContent='共 '+fmtInt(rows.length)+' 位客户';
  const show=rows.slice(0,state.shown);
  $('#tbody').innerHTML=show.map(c=>{
    const g=state.groups[c.groupIdx];
    const riskCls={高:'risk-h',中:'risk-m',低:'risk-l'}[c.risk]||'';
    return `<tr class="crow" data-id="${c.id}">
      <td style="font-weight:500">${c.id}</td>
      <td><span class="dot" style="background:${g.color}"></span>${g.name}</td>
      <td>${c.R??'—'}</td><td>${c.F}</td><td>${fmtMoney(c.M)}</td><td>¥${c.aov.toFixed(0)}</td>
      <td style="color:var(--ink2)">${c.topCat||'—'}</td>
      <td>${c.tags.slice(0,3).map(t=>`<span class="tagmini">${t}</span>`).join('')||'—'}</td>
      <td class="${riskCls}">${c.risk==='—'?'—':c.risk+'风险'}</td>
      <td style="color:var(--ink3)">展开 ⌄</td>
    </tr>
    <tr class="detail" data-detail="${c.id}" style="display:none"><td colspan="10">${detailHTML(c,g)}</td></tr>`;
  }).join('');
  $('#more').style.display=rows.length>state.shown?'block':'none';
  $('#more').textContent=rows.length>state.shown?'显示更多（剩余 '+fmtInt(rows.length-state.shown)+' 位）':'已全部显示';
}
function detailHTML(c,g){
  const bars=[['近期活跃',5-(c.rs-1),5,c.R+' 天前消费'],['消费频次',c.fs,5,c.F+' 笔订单'],
    ['消费金额',c.ms,5,fmtMoney(c.M)],['忠诚度',Math.min(5,Math.round(c.activeMonths/2)),5,c.activeMonths+' 个活跃月']];
  const catEntries=Object.entries(c.cat).sort((a,b)=>b[1]-a[1]).slice(0,4);
  const catMax=catEntries[0]?.[1]||1;
  const advice=personalAdvice(c,g);
  return `<div class="detail-grid">
    <div><h5>RFM 五维评分</h5>
      ${bars.map(([k,v,m,t])=>`<div class="dbar"><span class="k">${k}</span>
        <span class="track"><i style="width:${v/m*100}%"></i></span><span class="v">${t}</span></div>`).join('')}
    </div>
    <div><h5>品类偏好（按消费额）</h5>
      ${catEntries.length?catEntries.map(([k,v])=>`<div class="dbar"><span class="k" style="width:70px">${k}</span>
        <span class="track"><i style="width:${v/catMax*100}%;background:var(--gold)"></i></span>
        <span class="v">${fmtMoney(v)}</span></div>`).join(''):'<p style="font-size:12px;color:var(--ink3)">导入数据未包含品类字段</p>'}
    </div>
    <div><h5>千人千面运营建议</h5><div class="advice">${advice}</div></div>
  </div>`;
}
function personalAdvice(c,g){
  const bits=[];
  bits.push(`客户 <b>${c.id}</b> 属于「<b>${g.name}</b>」客群`);
  bits.push(`最近一次消费在 <b>${c.R??'—'} 天前</b>，累计 ${c.F} 笔、${fmtMoney(c.M)}，${c.topCat?'偏好品类为「'+c.topCat+'」':'暂无品类偏好数据'}`);
  if(c.risk==='高')bits.push(`当前<b>流失风险较高</b>，建议立即执行：${g.strategy.replace(/<b>.*?<\/b>/,'')}`);
  else if(c.tags.includes('高净值'))bits.push('作为高净值客户，匹配 VIP 权益与专属服务，优先安排人工触达');
  else if(c.tags.includes('新客'))bits.push('处于新客培育期，建议在首单后 7 / 15 / 30 天阶梯式发放复购激励');
  else if(c.tags.includes('高频客'))bits.push('消费频次高，适合积分加倍、会员任务与社群裂变玩法提升黏性');
  else bits.push('按客群策略执行：'+g.strategy.replace(/<[^>]+>/g,''));
  return bits.join('；')+'。';
}

/* --- 交互 --- */
function bindLegend(elId){
  $('#'+elId).addEventListener('click',e=>{
    const sp=e.target.closest('span[data-n]');if(!sp)return;
    const n=sp.dataset.n;
    if(state.legendOff[n])delete state.legendOff[n];else state.legendOff[n]=1;
    renderDonut();renderScatter();renderRadar();renderTrend();
  });
}
bindLegend('donut-legend');bindLegend('radar-legend');bindLegend('trend-legend');
$('#search').oninput=()=>{state.shown=60;renderTable()};
$('#filter-group').onchange=()=>{state.shown=60;renderTable()};
$('#filter-risk').onchange=()=>{state.shown=60;renderTable()};
$('#more').onclick=()=>{state.shown+=80;renderTable()};
$('#tbody').addEventListener('click',e=>{
  const tr=e.target.closest('tr.crow');if(!tr)return;
  const d=$('#tbody').querySelector(`tr[data-detail="${tr.dataset.id}"]`);
  d.style.display=d.style.display==='none'?'table-row':'none';
});
document.addEventListener('click',e=>{
  const th=e.target.closest('table.cust th[data-sort]');if(!th)return;
  const k=th.dataset.sort;
  if(state.sort.key===k)state.sort.dir*=-1;else state.sort={key:k,dir:-1};
  renderTable();
});
$('#tab-km').onclick=()=>switchMode('km');
$('#tab-rfm').onclick=()=>switchMode('rf');
function switchMode(m){
  state.mode=m;state.legendOff={};
  $('#tab-km').classList.toggle('active',m==='km');
  $('#tab-rfm').classList.toggle('active',m==='rf');
  $('#kctl').style.visibility=m==='km'?'visible':'hidden';
  if(m==='km'){$('#krange').value=state.k;$('#kval').textContent=state.k}
  buildGroupsAndRender();
}
$('#krange').oninput=e=>{
  state.k=+e.target.value;$('#kval').textContent=state.k;
  state.legendOff={};buildGroupsAndRender();
};
$('#btn-reimport').onclick=()=>location.reload();
$('#btn-export').onclick=()=>{
  const rows=state.customers.map(c=>{const g=state.groups[c.groupIdx];
    return [c.id,g.name,c.R,c.F,c.M.toFixed(2),c.aov.toFixed(2),
      c.minD?c.minD.toISOString().slice(0,10):'',c.maxD?c.maxD.toISOString().slice(0,10):'',
      c.topCat,c.tags.join(' / '),c.risk==='—'?'':c.risk+'风险',
      personalAdvice(c,g).replace(/<[^>]+>/g,'')]});
  download('客户分群结果_'+new Date().toISOString().slice(0,10)+'.csv',
    toCSV([['客户ID','客群名称','R最近消费间隔天','F消费频次','M累计消费额','客单价','首次消费','最近消费','偏好品类','个性化标签','流失风险','运营建议'],...rows]));
  toast('已导出 '+fmtInt(rows.length)+' 位客户的分群结果');
};
function download(name,text){
  const b=new Blob([text],{type:'text/csv;charset=utf-8'});
  const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download=name;a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),3000);
}

/* ---------- 总渲染 ---------- */
function renderAll(){
  renderKPIs();renderDonut();renderScatter();renderRadar();renderTrend();renderSegCards();
  const fg=$('#filter-group');
  fg.innerHTML='<option value="">全部客群</option>'+state.groups.map((g,i)=>`<option value="${i}">${g.name}</option>`).join('');
  renderTable();
}
