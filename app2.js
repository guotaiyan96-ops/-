/* ---------- 执行分析 ---------- */
function runAnalysis(){
  $('#stage-import').style.display='none';
  $('#stage-dash').style.display='none';
  $('#stage-loading').style.display='block';
  let mi=0;$('#loadmsg').textContent=MSG[0];
  const timer=setInterval(()=>{mi=Math.min(mi+1,MSG.length-1);$('#loadmsg').textContent=MSG[mi]},420);
  setTimeout(()=>{
    try{
      const {customers,dropped,skipDate,refD}=buildCustomers();
      if(customers.length<8){throw new Error('有效客户数过少（'+customers.length+'），至少需要 8 位客户才能聚类')}
      state.customers=customers;state.dropped=dropped;state.skipDate=skipDate;state.refD=refD;
      // R/F/M 五分位得分（R 反向）
      const rs=quintileScores(customers.map(c=>c.R??0),true);
      const fs=quintileScores(customers.map(c=>c.F),false);
      const ms=quintileScores(customers.map(c=>c.M),false);
      customers.forEach((c,i)=>{c.rs=rs[i];c.fs=fs[i];c.ms=ms[i]});
      // 全局标签（与分群无关）
      const Msort=[...customers].map(c=>c.M).sort((a,b)=>a-b);
      const Fsort=[...customers].map(c=>c.F).sort((a,b)=>a-b);
      const AOVsort=[...customers].map(c=>c.aov).sort((a,b)=>a-b);
      const p=(arr,q)=>arr[Math.min(arr.length-1,Math.floor(arr.length*q))];
      const m90=p(Msort,.9),f90=p(Fsort,.9),a90=p(AOVsort,.9);
      const medM=p(Msort,.5);
      for(const c of customers){
        const t=[];
        if(c.M>=m90)t.push('高净值');
        if(c.F>=f90)t.push('高频客');
        if(c.aov>=a90)t.push('大额单');
        if(c.R!=null&&c.R<=30)t.push('近期活跃');
        if(c.tenure<=1.5&&(c.R==null||c.R<=45))t.push('新客');
        if(c.R!=null&&c.R>180)t.push('沉睡流失');else if(c.R!=null&&c.R>90)t.push('流失预警');
        if(c.topCat&&c.catShare>=.55)t.push(c.topCat+'爱好者');
        c.tags=t;
        if(c.R==null)c.risk='—';
        else if(c.R>180||(c.R>120&&c.F<=3))c.risk='高';
        else if(c.R>90||(c.R>60&&c.F<=2))c.risk='中';
        else c.risk='低';
      }
      // 特征矩阵：log1p(R/F/M) → 标准化
      const raw=customers.map(c=>[Math.log1p(c.R??0),Math.log1p(c.F),Math.log1p(c.M)]);
      state.Z=standardize(raw);
      // 自动选 K
      state.kmCache={};
      let bestK=4,bestS=-2;
      const maxK=Math.min(8,customers.length-1);
      for(let k=2;k<=maxK;k++){
        const km=kmeans(state.Z,k,k===maxK?12:8);
        km.sil=silhouette(state.Z,km.lab,k);
        state.kmCache[k]=km;
        if(km.sil>bestS){bestS=km.sil;bestK=k}
      }
      state.kBest=bestK;state.k=bestK;state.silBest=bestS;
      clearInterval(timer);
      $('#stage-loading').style.display='none';
      $('#stage-dash').style.display='block';
      $('#s1').className='step done';$('#s2').className='step done';
      $('#s3').className='step done';$('#s4').className='step on';
      $('#krange').value=bestK;$('#krange').max=maxK;$('#kval').textContent=bestK;
      $('#kauto').textContent='自动最优 K='+bestK+' · 轮廓系数 '+bestS.toFixed(2);
      buildGroupsAndRender();
      if(dropped>0)toast('已跳过 '+dropped+' 行缺字段/无法解析的数据');
    }catch(err){
      clearInterval(timer);
      $('#stage-loading').style.display='none';
      $('#stage-import').style.display='block';
      toast('分析失败：'+err.message);
    }
  },350);
}
$('#btn-analyze').onclick=()=>{
  $$('.map-row select').forEach(sel=>state.map[sel.dataset.k]=sel.value||null);
  if(!state.map.id||!state.map.amount){
    const a=$('#map-alert');a.style.display='block';
    a.textContent='客户ID 与 消费金额为必填字段，请完成映射后再开始分析。';return;
  }
  runAnalysis();
};

/* ---------- 构建客群 ---------- */
function buildGroupsAndRender(){
  const cs=state.customers;
  let groups;
  if(state.mode==='km'){
    const km=state.kmCache[state.k];
    const k=state.k;
    groups=Array.from({length:k},(_,c)=>{
      const members=cs.filter(x=>x._lab===c);
      const cent=km.cent[c];
      return {raw:c,members,cent,
        rHi:cent[0]<0,fHi:cent[1]>0,mHi:cent[2]>0,
        value:cent[2]*.5+cent[1]*.3-cent[0]*.2};
    });
    cs.forEach((c,i)=>c._lab=km.lab[i]);
    groups.forEach(g=>{g.members=cs.filter(x=>x._lab===g.raw)});
    groups.sort((a,b)=>b.value-a.value);
  }else{
    const avg=3;
    cs.forEach(c=>{c._lab=comboKey(c.rs>=avg,c.fs>=avg,c.ms>=avg)});
    const keys=['111','101','011','001','110','100','010','000'];
    groups=keys.map(k=>{
      const rHi=k[0]==='1',fHi=k[1]==='1',mHi=k[2]==='1';
      const members=cs.filter(x=>x._lab===k);
      const zavg=(arr)=>arr.reduce((s,x)=>s+x,0)/(arr.length||1);
      return {raw:k,members,
        cent:[rHi?-0.55:0.55,fHi?0.55:-0.55,mHi?0.55:-0.55],
        rHi,fHi,mHi,
        value:(mHi?0.5:0)+(fHi?0.3:0)-(rHi?-0.2:0.2)};
    }).filter(g=>g.members.length>0);
  }
  // 命名（去重）
  const used={};
  const mod=['',' · 高潜',' · 次级',' · 边缘'];
  groups.forEach(g=>{
    const key=comboKey(g.rHi,g.fHi,g.mHi);
    let nm=SEG_NAME[key];
    used[nm]=(used[nm]??-1)+1;
    if(used[nm]>0)nm+=mod[used[nm]]||('·'+used[nm]);
    g.name=nm;g.combo=key;g.strategy=STRATEGY[key];
  });
  groups.forEach((g,i)=>{g.color=PAL[i%PAL.length].m;g.light=PAL[i%PAL.length].r;
    g.size=g.members.length;
    g.revenue=g.members.reduce((s,c)=>s+c.M,0);
    g.Ravg=g.members.reduce((s,c)=>s+(c.R??0),0)/g.size;
    g.Favg=g.members.reduce((s,c)=>s+c.F,0)/g.size;
    g.Mavg=g.revenue/g.size;
    g.aovAvg=g.revenue/g.members.reduce((s,c)=>s+c.orders,0);
    g.tenAvg=g.members.reduce((s,c)=>s+Math.min(c.activeMonths,12),0)/g.size;
    g.members.forEach(c=>c.groupIdx=i);
  });
  state.groups=groups;
  // 雷达维度（组内均值 / 理论上限）
  const maxAOV=Math.max(...groups.map(g=>g.aovAvg));
  groups.forEach(g=>{g.radar=[
    g.members.reduce((s,c)=>s+c.rs,0)/g.size/5,
    g.members.reduce((s,c)=>s+c.fs,0)/g.size/5,
    g.members.reduce((s,c)=>s+c.ms,0)/g.size/5,
    g.aovAvg/maxAOV,
    Math.min(g.tenAvg/6,1)
  ]});
  renderAll();
}
