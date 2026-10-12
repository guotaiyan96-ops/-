/* =========================================================
   千面 - 客户消费数据智能分群
   ========================================================= */
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const PAL=[
 {m:'#1F6F6B',r:'#7FC4BC'},{m:'#C0442C',r:'#E89B88'},
 {m:'#C0932B',r:'#E6C87E'},{m:'#3D4D8A',r:'#93A0D2'},
 {m:'#7A8450',r:'#BCC994'},{m:'#8A4A68',r:'#C996B2'},
 {m:'#4E7E9C',r:'#9CC0D5'},{m:'#B5703D',r:'#E0AF8A'}];
const state={rows:null,cols:[],map:{},customers:null,mode:'km',k:null,kBest:null,kmCache:{},
  groups:null,shown:60,sort:{key:'M',dir:-1},legendOff:{}};

const MSG=['正在读取消费流水…','正在聚合客户 RFM 特征…','K-Means++ 初始化聚类中心…','迭代优化簇划分…','计算轮廓系数并选择最优 K…','生成客户标签与运营策略…'];

/* ---------- 工具 ---------- */
function toast(t){const el=$('#toast');el.textContent=t;el.classList.add('show');clearTimeout(el._t);el._t=setTimeout(()=>el.classList.remove('show'),2400)}
function fmtMoney(v){if(v>=1e8)return '¥'+(v/1e8).toFixed(2)+'亿';if(v>=1e4)return '¥'+(v/1e4).toFixed(1)+'万';return '¥'+Math.round(v).toLocaleString()}
function fmtInt(v){return Math.round(v).toLocaleString()}
function norm(s){return (''+s).toLowerCase().replace(/[\s_\-\(\)（）:：]/g,'')}
function mulberry(seed){return function(){seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}

/* ---------- CSV 解析 / 序列化 ---------- */
function parseCSV(text){
  text=text.replace(/^﻿/,'');
  const delim=(text.slice(0,2000).split('\t').length>text.slice(0,2000).split(',').length)?'\t':',';
  const rows=[],rows2=[];let cur=[],f='',q=false;
  const push=()=>{cur.push(f);f=''};
  for(let i=0;i<text.length;i++){
    const c=text[i];
    if(q){ if(c==='"'){if(text[i+1]==='"'){f+='"';i++}else q=false}else f+=c }
    else{ if(c==='"')q=true;else if(c===delim)push();else if(c==='\n'){push();rows.push(cur);cur=[]}else if(c==='\r'){}else f+=c }
  }
  if(f||cur.length){push();rows.push(cur)}
  const clean=rows.filter(r=>r.some(x=>(''+x).trim()!==''));
  if(clean.length<2)throw new Error('未解析到有效数据行（至少需要表头 + 1 行数据）');
  const headers=clean[0].map(h=>(''+h).trim());
  return {headers,data:clean.slice(1).map(r=>Object.fromEntries(headers.map((h,i)=>[h,r[i]??'']))) ,delim};
}
function toCSV(rows){return '﻿'+rows.map(r=>r.map(v=>{v=v==null?'':''+v;return /[",\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v}).join(',')).join('\r\n')}

/* ---------- 示例数据 ---------- */
function genSample(){
  const rnd=mulberry(20261012);
  const cats=['美妆护肤','服饰鞋包','食品生鲜','数码家电','家居生活','母婴用品'];
  const arch=[
    {w:.14,R:[0,25],  F:[8,28], aov:[320,1100],cf:['数码家电','服饰鞋包','美妆护肤']},
    {w:.11,R:[0,30],  F:[1,3],  aov:[500,1900],cf:['数码家电','服饰鞋包']},
    {w:.10,R:[60,140],F:[6,20], aov:[260,850], cf:['美妆护肤','家居生活']},
    {w:.09,R:[160,360],F:[5,18],aov:[300,1400],cf:['数码家电','服饰鞋包','母婴用品']},
    {w:.13,R:[0,40],  F:[5,14], aov:[80,260],  cf:['食品生鲜','美妆护肤']},
    {w:.16,R:[0,20],  F:[1,2],  aov:[50,200],  cf:['食品生鲜','家居生活'],newbie:true},
    {w:.12,R:[60,150],F:[3,10], aov:[60,240],  cf:['食品生鲜','服饰鞋包']},
    {w:.15,R:[180,400],F:[1,8], aov:[40,220],  cf:['食品生鲜','家居生活','母婴用品']}
  ];
  const now=new Date(2026,9,12); // 固定基准 2026-10-12
  const rows=[];let oid=100000;
  const N=600;
  for(let i=1;i<=N;i++){
    let x=rnd(),a=arch[arch.length-1],acc=0;
    for(const t of arch){acc+=t.w;if(x<=acc){a=t;break}}
    const cid='C'+String(i).padStart(4,'0');
    const F=Math.round(a.F[0]+rnd()*(a.F[1]-a.F[0]));
    let last=new Date(now.getTime()-(a.R[0]+rnd()*(a.R[1]-a.R[0]))*864e5);
    if(a.newbie){last=new Date(now.getTime()-rnd()*20*864e5)}
    let d=new Date(last);
    for(let f=0;f<F;f++){
      const cat=a.cf[Math.floor(rnd()*a.cf.length)];
      const amt=Math.round((a.aov[0]+rnd()*(a.aov[1]-a.aov[0]))*(.55+rnd()*.9))+0.0;
      rows.push({'客户ID':cid,'订单号':'SO'+(oid++),'消费日期':d.toISOString().slice(0,10),
        '消费金额':amt.toFixed(2),'商品品类':cat});
      const gap=(6+rnd()*(a.newbie?14:48))*864e5*(f<F/3?1.6:1);
      d=new Date(d.getTime()-gap);
      if(a.newbie && d<now-45*864e5) break;
    }
  }
  rows.sort((p,q)=>p.消费日期<q.消费日期?1:-1);
  return rows;
}
function rowsToText(rows,cols){return cols.join(',')+'\n'+rows.map(r=>cols.map(c=>r[c]).join(',')).join('\n')}

/* ---------- 字段识别 ---------- */
const ALIAS={
  id:['客户id','会员id','用户id','客户编号','会员号','会员编号','customerid','userid','customer编号','客户','姓名'],
  date:['消费日期','订单日期','交易日期','下单时间','下单日期','日期','交易时间','date','orderdate','transdate','time'],
  amount:['消费金额','实付金额','支付金额','订单金额','成交金额','交易金额','金额','交易额','amount','price','money','gmv','sales'],
  orderid:['订单号','订单编号','订单id','orderid','orderno','ordercode','交易号'],
  category:['品类','商品类别','商品分类','类目','类别','分类','商品类目','品类名称','category','cat','producttype']
};
function detectMap(cols){
  const map={id:null,date:null,amount:null,orderid:null,category:null};
  for(const key of Object.keys(ALIAS)){
    let best=null,bs=0;
    for(const c of cols){const n=norm(c);
      for(const a of ALIAS[key]){const na=norm(a);let s=0;
        if(n===na)s=100;else if(n.includes(na)&&na.length>=2)s=na.length;
        if(s>bs){bs=s;best=c}}}
    if(bs>=2)map[key]=best;
  }
  return map;
}
function showMapping(){
  const labels={id:'客户ID',date:'消费日期',amount:'消费金额',orderid:'订单号（选填）',category:'商品品类（选填）'};
  $('#mapping-rows').innerHTML=Object.keys(labels).map(k=>`
    <div class="map-row"><label>${labels[k]}</label>
      <select data-k="${k}"><option value="">（未识别 / 不使用）</option>
      ${state.cols.map(c=>`<option value="${c}" ${state.map[k]===c?'selected':''}>${c}</option>`).join('')}
      </select></div>`).join('');
  $('#mapping-panel').style.display='block';
  $('#map-alert').style.display='none';
  $('#mapping-panel').scrollIntoView({behavior:'smooth',block:'nearest'});
}

/* ---------- 解析入口 ---------- */
function ingest(rows,cols){
  state.rows=rows;state.cols=cols;state.map=detectMap(cols);
  showMapping();
}
function ingestText(text){
  const {headers,data}=parseCSV(text);
  if(headers.length<2)throw new Error('至少需要 2 列（客户ID、消费金额）');
  ingest(data,headers);
  toast('已解析 '+fmtInt(data.length)+' 行数据，请确认字段映射');
}
$('#btn-file').onclick=()=>$('#file').click();
$('#drop').onclick=e=>{if(e.target.tagName!=='BUTTON')$('#file').click()};
$('#file').onchange=e=>{
  const f=e.target.files[0];if(!f)return;
  const rd=new FileReader();
  rd.onload=()=>{try{ingestText(rd.result)}catch(err){toast('解析失败：'+err.message)}};
  rd.readAsText(f,'UTF-8');
};
['dragover','dragenter'].forEach(ev=>$('#drop').addEventListener(ev,e=>{e.preventDefault();$('#drop').classList.add('over')}));
['dragleave','drop'].forEach(ev=>$('#drop').addEventListener(ev,e=>{e.preventDefault();$('#drop').classList.remove('over')}));
$('#drop').addEventListener('drop',e=>{
  const f=e.dataTransfer.files[0];if(!f)return;
  const rd=new FileReader();
  rd.onload=()=>{try{ingestText(rd.result)}catch(err){toast('解析失败：'+err.message)}};
  rd.readAsText(f,'UTF-8');
});
$('#btn-paste').onclick=()=>{const t=$('#paste').value.trim();if(!t)return toast('请先粘贴 CSV 内容');try{ingestText(t)}catch(e){toast('解析失败：'+e.message)}};
$('#btn-sample').onclick=()=>{
  const rows=genSample();
  ingest(rows,['客户ID','订单号','消费日期','消费金额','商品品类']);
  toast('已载入 600 位客户、'+fmtInt(rows.length)+' 笔模拟订单');
};
$('#btn-template').onclick=()=>{
  const tpl='客户ID,订单号,消费日期,消费金额,商品品类\nC0001,SO20260001,2026-09-28,368.00,美妆护肤\nC0001,SO20260045,2026-08-30,259.00,食品生鲜\nC0002,SO20260002,2026-09-15,4299.00,数码家电';
  download('客户消费流水模板.csv',tpl);
};
$('#btn-cancel-map').onclick=()=>{$('#mapping-panel').style.display='none'};
document.addEventListener('change',e=>{
  const sel=e.target.closest && e.target.closest('.map-row select');
  if(sel)state.map[sel.dataset.k]=sel.value||null;
});

/* ---------- 特征工程 ---------- */
function parseDate(v){
  v=(''+v).trim();if(!v)return null;
  if(/^\d{8}$/.test(v))return new Date(+v.slice(0,4),+v.slice(4,6)-1,+v.slice(6,8));
  const n=Number(v);if(!isNaN(n)&&n>1e11)return new Date(n>1e13?n:n*1000);
  const d=new Date(v.replace(/[./]/g,'-').replace(/['"]/g,''));
  return isNaN(d)?null:d;
}
function parseAmount(v){
  if(typeof v==='number')return v;
  const n=parseFloat((''+v).replace(/[¥￥,，\s]/g,''));
  return isNaN(n)?null:n;
}
function buildCustomers(){
  const m=state.map;
  const skipDate=!m.date;
  const custMap=new Map();
  let dropped=0;
  for(const r of state.rows){
    const id=(r[m.id]??'').toString().trim();
    const amt=parseAmount(r[m.amount]);
    if(!id||amt==null){dropped++;continue}
    const dt=skipDate?null:parseDate(r[m.date]);
    if(!skipDate&&!dt){dropped++;continue}
    if(!custMap.has(id))custMap.set(id,{id,orders:0,oids:new Set(),M:0,minD:null,maxD:null,months:new Set(),cat:{},monthMoney:{}});
    const c=custMap.get(id);
    c.orders++;c.M+=amt;
    if(m.orderid&&r[m.orderid])c.oids.add((''+r[m.orderid]).trim());
    if(dt){
      if(!c.minD||dt<c.minD)c.minD=dt;
      if(!c.maxD||dt>c.maxD)c.maxD=dt;
      const mk=dt.getFullYear()+'-'+String(dt.getMonth()+1).padStart(2,'0');
      c.months.add(mk);
      c.monthMoney[mk]=(c.monthMoney[mk]||0)+amt;
    }
    if(m.category){const cat=(''+(r[m.category]??'')).trim();if(cat)c.cat[cat]=(c.cat[cat]||0)+amt}
  }
  const ref=new Date();let refD=ref;
  if(!skipDate){refD=new Date(0);for(const c of custMap.values())if(c.maxD>refD)refD=c.maxD}
  const arr=[];
  for(const c of custMap.values()){
    c.F=m.orderid?c.oids.size||c.orders:c.orders;
    c.aov=c.M/c.orders;
    c.R=c.maxD?Math.floor((refD-c.maxD)/864e5):null;
    c.tenure=c.minD?Math.max(1,Math.floor((c.maxD-c.minD)/30.4)+1):1;
    c.activeMonths=c.months.size;
    let topCat='',tv=-1;for(const[k,v]of Object.entries(c.cat))if(v>tv){tv=v;topCat=k}
    c.topCat=topCat;c.catShare=tv>0?tv/c.M:0;
    arr.push(c);
  }
  // 全局时间序列：每月总额
  const monthMap=new Map();
  if(!skipDate)for(const c of arr){/* 每月按客户需在分组后重算，此处仅准备月份轴 */}
  return {customers:arr,dropped,skipDate,refD};
}
function quintileScores(vals,rev=false){
  const idx=vals.map((v,i)=>[v,i]).sort((a,b)=>a[0]-b[0]);
  const n=idx.length,score=new Array(n);
  for(let r=0;r<n;r++){
    let s=Math.floor(r/n*5)+1;if(s>5)s=5;
    score[idx[r][1]]=rev?6-s:s;
  }
  return score;
}

/* ---------- K-Means ---------- */
function standardize(mat){
  const n=mat.length,d=mat[0].length,mean=Array(d).fill(0),sd=Array(d).fill(0);
  for(const r of mat)for(let j=0;j<d;j++)mean[j]+=r[j];
  mean.forEach((v,i)=>mean[i]=v/n);
  for(const r of mat)for(let j=0;j<d;j++)sd[j]+=(r[j]-mean[j])**2;
  sd.forEach((v,i)=>sd[i]=Math.sqrt(v/n)||1);
  return mat.map(r=>r.map((v,j)=>(v-mean[j])/sd[j]));
}
function dist2(a,b){let s=0;for(let i=0;i<a.length;i++)s+=(a[i]-b[i])**2;return s}
function kmeans(z,k,restarts=10){
  const n=z.length,d=z[0].length;let best=null;
  for(let run=0;run<restarts;run++){
    const cent=[z[Math.floor(Math.random()*n)].slice()];
    while(cent.length<k){
      const ds=z.map(p=>Math.min(...cent.map(c=>dist2(p,c))));
      let sum=ds.reduce((a,b)=>a+b,0),x=Math.random()*sum,acc=0,pick=0;
      for(let i=0;i<n;i++){acc+=ds[i];if(acc>=x){pick=i;break}}
      cent.push(z[pick].slice());
    }
    let lab=new Array(n).fill(-1);
    for(let it=0;it<80;it++){
      const nl=new Array(n);let changed=0;
      for(let i=0;i<n;i++){
        let bi=0,bd=Infinity;
        for(let c=0;c<k;c++){const dd=dist2(z[i],cent[c]);if(dd<bd){bd=dd;bi=c}}
        nl[i]=bi;if(bi!==lab[i])changed++;
      }
      lab=nl;if(!changed&&it>0)break;
      const sums=Array.from({length:k},()=>Array(d).fill(0)),cnt=Array(k).fill(0);
      for(let i=0;i<n;i++){cnt[lab[i]]++;for(let j=0;j<d;j++)sums[lab[i]][j]+=z[i][j]}
      for(let c=0;c<k;c++){if(cnt[c]===0){cent[c]=z[Math.floor(Math.random()*n)].slice();continue}
        for(let j=0;j<d;j++)cent[c][j]=sums[c][j]/cnt[c]}
    }
    let sse=0;for(let i=0;i<n;i++)sse+=dist2(z[i],cent[lab[i]]);
    if(!best||sse<best.sse)best={lab:lab.slice(),cent:cent.map(c=>c.slice()),sse};
  }
  return best;
}
function silhouette(z,lab,k){
  const n=z.length;
  if(n>420){ // 采样加速
    const idxs=[];const rnd=mulberry(77);const per=Math.floor(420/k);
    for(let c=0;c<k;c++){const mm=z.map((_,i)=>i).filter(i=>lab[i]===c);
      for(let j=0;j<Math.min(per,mm.length);j++)idxs.push(mm[Math.floor(rnd()*mm.length)])}
    var sample=idxs;
  }else sample=z.map((_,i)=>i);
  let tot=0;
  for(const i of sample){
    let same=[],other=Array.from({length:k},()=>[]);
    for(const j of sample){if(i===j)continue;(lab[j]===lab[i]?same:other[lab[j]]).push(j)}
    if(!same.length){tot+=0;continue}
    const a=same.reduce((s,j)=>s+Math.sqrt(dist2(z[i],z[j])),0)/same.length;
    let b=Infinity;
    for(let c=0;c<k;c++){if(c===lab[i]||!other[c].length)continue;
      const v=other[c].reduce((s,j)=>s+Math.sqrt(dist2(z[i],z[j])),0)/other[c].length;
      if(v<b)b=v}
    if(!isFinite(b)){tot+=0;continue}
    tot+=(b-a)/Math.max(a,b);
  }
  return tot/sample.length;
}

/* ---------- 分群命名与策略 ---------- */
const SEG_NAME={
 '111':'重要价值客户','101':'重要发展客户','011':'重要保持客户','001':'重要挽留客户',
 '110':'一般价值客户','100':'一般发展客户','010':'一般保持客户','000':'一般挽留客户'};
const STRATEGY={
 '111':'<b>VIP 专属维护：</b>会员等级升级、新品优先体验、1对1专属顾问，驱动推荐裂变与口碑传播。',
 '101':'<b>提频培养：</b>周期性复购券、组合套餐与积分任务，把高客单新客培育为高频忠诚客户。',
 '011':'<b>兴趣焕新：</b>专属导购回访、新品/满赠活动触达，趁其尚未流失重建消费习惯。',
 '001':'<b>高价值召回：</b>大额召回券 + 短信/人工关怀，调研流失原因，优先分配营销预算。',
 '110':'<b>交叉销售：</b>推荐高价值品类、升级满减门槛，提升单笔金额与钱包份额。',
 '100':'<b>新客转化：</b>首单后 7/15/30 天跟进，种草内容 + 第二单优惠，完成新客到熟客跃迁。',
 '010':'<b>促销激活：</b>限时折扣、社群签到与拼团活动，以低成本重新建立到店频次。',
 '000':'<b>低成本触达：</b>清仓福利与节日普发，控制单客营销成本，等待自然回流。'};
function comboName(rHi,fHi,mHi){return SEG_NAME[(rHi?1:0)+''+(fHi?1:0)+(mHi?1:0)]}
function comboKey(rHi,fHi,mHi){return (rHi?1:0)+''+(fHi?1:0)+(mHi?1:0)}
