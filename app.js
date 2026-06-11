/* ====================================================================
   StravaStats — lógica do dashboard
   ==================================================================== */

/* ---------- agrupamento de esportes ---------- */
const SPORT_MAP = {Run:'run',TrailRun:'run',VirtualRun:'run',
  Ride:'ride',VirtualRide:'ride',GravelRide:'ride',MountainBikeRide:'ride',EBikeRide:'ride',
  Swim:'swim'};
const GLABEL = {run:'corrida',ride:'pedal',swim:'natação',strength:'musculação',other:'outros',all:'tudo'};
const GCOLOR = {run:'#ff5b2e',ride:'#38c7c0',swim:'#5b8cff',strength:'#c0418a',other:'#9a948a',all:'#ff5b2e'};
const GICON  = {run:'🏃',ride:'🚴',swim:'🏊',strength:'🏋️',other:'•'};

DATA.forEach(a=>{
  a.g = SPORT_MAP[a.sport_type] || 'other';
  if(/Weight|Workout|Strength/i.test(a.sport_type||'')) a.g = 'strength';
  a.d = new Date(a.start_date_local);
  a.year = a.d.getFullYear();
});

/* ---------- formatação ---------- */
const pad = n => String(n).padStart(2,'0');
const nf = (n,d=0)=>Number(n).toLocaleString('pt-BR',{minimumFractionDigits:d,maximumFractionDigits:d});
const fmtDate = d => `${pad(d.getDate())}/${pad(d.getMonth()+1)}/${String(d.getFullYear()).slice(2)}`;
const fmtDateLong = d => `${['JAN','FEV','MAR','ABR','MAI','JUN','JUL','AGO','SET','OUT','NOV','DEZ'][d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
const km = (m,d=0)=>nf(m/1000,d)+' km';
function hms(s){s=Math.round(s);const h=Math.floor(s/3600),m=Math.floor((s%3600)/60),x=s%60;
  return h>0?`${h}:${pad(m)}:${pad(x)}`:`${m}:${pad(x)}`;}
function dur(s){s=Math.round(s);const h=Math.floor(s/3600),m=Math.round((s%3600)/60);
  return h>0?`${h}h ${pad(m)}m`:`${m}m`;}
function hours(s){return nf(s/3600)+' h';}
function mss(sec){const m=Math.floor(sec/60),s=Math.round(sec%60);return `${m}:${pad(s)}`;}
const paceRun  = sp=>sp>0?mss(1000/sp)+'/km':'–';
const paceSwim = sp=>sp>0?mss(100/sp)+'/100m':'–';
const kmh = sp=>nf(sp*3.6,1)+' km/h';
function ritmo(a){
  if(a.g==='run')  return paceRun(a.average_speed);
  if(a.g==='swim') return paceSwim(a.average_speed);
  if(a.g==='ride') return kmh(a.average_speed);
  return '–';
}

/* ====================================================================
   HERO — totais grandes + frases curiosas
   ==================================================================== */
(function hero(){
  const T = {n:DATA.length, dist:0, time:0, elev:0};
  DATA.forEach(a=>{ T.dist+=a.distance||0; T.time+=a.moving_time||0; T.elev+=a.total_elevation_gain||0; });
  const distKm = T.dist/1000, h = T.time/3600;
  const restThisYear = (()=>{
    const y = new Date().getFullYear();
    const days = new Set(DATA.filter(a=>a.year===y).map(a=>a.start_date_local.slice(0,10)));
    const start = new Date(y,0,1), today = new Date();
    const elapsed = Math.floor((today-start)/864e5)+1;
    return Math.max(0, elapsed - days.size);
  })();
  const cards = [
    {v:nf(T.n), l:'atividades', note:`<b>${restThisYear}</b> dias de descanso em ${new Date().getFullYear()}`},
    {v:nf(distKm), l:'quilômetros', note:`<b>${nf(distKm/40075,2)}</b> voltas na Terra`},
    {v:nf(h), l:'horas', note:`<b>${nf(h*60/92.7,0)}</b> órbitas da ISS`},
    {v:nf(T.elev), l:'m escalados', note:`<b>${nf(T.elev/8849,1)}</b> vezes o Everest`},
  ];
  document.getElementById('bignums').innerHTML = cards.map(c=>
    `<div class="bignum"><div class="v">${c.v}</div><div class="l">${c.l}</div><div class="note">${c.note}</div></div>`).join('');
})();

/* ====================================================================
   Chart.js padrões
   ==================================================================== */
Chart.defaults.font.family = "'Archivo', sans-serif";
Chart.defaults.color = '#8a8a86';
Chart.defaults.borderColor = 'rgba(255,255,255,.10)';
const GRID = {color:'rgba(255,255,255,.07)'};
const charts = {};
function mk(id,cfg){ if(charts[id]) charts[id].destroy(); charts[id]=new Chart(document.getElementById(id),cfg); }

/* ====================================================================
   decodificar polyline do Strava (algoritmo do Google)
   ==================================================================== */
function decodePolyline(str){
  if(!str) return [];
  let index=0,lat=0,lng=0,coords=[];
  while(index<str.length){
    let b,shift=0,result=0;
    do{ b=str.charCodeAt(index++)-63; result|=(b&0x1f)<<shift; shift+=5; }while(b>=0x20);
    lat += (result&1)?~(result>>1):(result>>1);
    shift=0;result=0;
    do{ b=str.charCodeAt(index++)-63; result|=(b&0x1f)<<shift; shift+=5; }while(b>=0x20);
    lng += (result&1)?~(result>>1):(result>>1);
    coords.push([lat/1e5,lng/1e5]);
  }
  return coords;
}

/* ====================================================================
   NOTABLE — melhores por distância / mais longas / elevação + mapa
   ==================================================================== */
const RUN_DISTS = [
  {label:'1 km',  m:1000},
  {label:'5 km',  m:5000},
  {label:'10 km', m:10000},
  {label:'15 km', m:15000},
  {label:'Meia',  m:21097},
  {label:'30 km', m:30000},
  {label:'Maratona', m:42195},
];
let notState = {sport:'run', mode:'pb'};
let nmap=null, ntrack=null;

const BE_LABELS = {"400m":"400 m","1k":"1 km","5k":"5 km","10k":"10 km",
  "15k":"15 km","20k":"20 km","Half-Marathon":"Meia","30k":"30 km","Marathon":"Maratona"};
const BY_ID = {}; DATA.forEach(a=>{ if(a.id!=null) BY_ID[String(a.id)]=a; });

function notableData(){
  const list = DATA.filter(a=>a.g===notState.sport && a.distance>0);
  if(notState.mode==='power'){
    const pc = (EXTRA&&EXTRA.power_curve)||{};
    const rows = Object.keys(pc).map(Number).sort((a,b)=>a-b).map(s=>{
      const e=pc[String(s)], a=BY_ID[e.id];
      const lab = s<60? s+' s' : s<3600? (s/60)+' min' : s===3600?'1 h':'1h30';
      return a?{label:lab, time:Math.round(e.w)+' W', date:a.d, act:a}:null;
    }).filter(Boolean);
    return {cols:['Duração','Data','Potência'], rows, kind:'pb'};
  }
  if(notState.mode==='pb' && notState.sport==='run'){
    const be = (EXTRA&&EXTRA.best_efforts)||{};
    const rows = Object.entries(be)
      .filter(([n,e])=>BE_LABELS[n]&&BY_ID[e.id])
      .map(([n,e])=>({label:BE_LABELS[n], time:hms(e.t), date:BY_ID[e.id].d,
        act:BY_ID[e.id], sortVal:e.d||0, eff:{t:e.t, d:e.d}}))
      .sort((a,b)=>a.sortVal-b.sortVal);
    if(rows.length) return {cols:['Distância','Data','Tempo'], rows, kind:'pb'};
    // fallback (enriquecimento ainda em andamento): estimativa, só treinos com GPS
    const gps = list.filter(a=>a.polyline);
    const est=[];
    RUN_DISTS.forEach(d=>{
      const cand = gps.filter(a=>a.distance>=d.m && a.average_speed>0);
      if(!cand.length) return;
      const best = cand.reduce((b,a)=>a.average_speed>b.average_speed?a:b);
      est.push({label:d.label, time:hms(d.m/best.average_speed), date:best.d, act:best, eff:{t:d.m/best.average_speed, d:d.m}});
    });
    return {cols:['Distância','Data','Tempo'], rows:est, kind:'pb'};
  }
  if(notState.mode==='pb' && notState.sport==='swim'){
    const dists=[{label:'400 m',m:400},{label:'750 m',m:750},{label:'1 km',m:1000},{label:'1.9 km',m:1900},{label:'3.8 km',m:3800}];
    const rows=[];
    dists.forEach(d=>{
      const cand=list.filter(a=>a.distance>=d.m && a.average_speed>0);
      if(!cand.length) return;
      const best=cand.reduce((b,a)=>a.average_speed>b.average_speed?a:b);
      rows.push({label:d.label,time:hms(d.m/best.average_speed),date:best.d,act:best,eff:{t:d.m/best.average_speed,d:d.m}});
    });
    return {cols:['Distância','Data','Tempo'], rows, kind:'pb'};
  }
  if(notState.mode==='long'){
    const top=[...list].sort((a,b)=>b.distance-a.distance).slice(0,10);
    return {cols:['#','Data','Distância'], rows:top.map((a,i)=>({rank:i+1,date:a.d,dist:km(a.distance,1),act:a})), kind:'long'};
  }
  // elevação
  const top=[...list].filter(a=>a.total_elevation_gain>0).sort((a,b)=>b.total_elevation_gain-a.total_elevation_gain).slice(0,10);
  return {cols:['#','Data','Elevação'], rows:top.map((a,i)=>({rank:i+1,date:a.d,elev:nf(a.total_elevation_gain)+' m',act:a})), kind:'elev'};
}

function renderNotable(){
  document.getElementById('notSport').textContent = GLABEL[notState.sport];
  // sub-abas conforme esporte
  const hasPower = EXTRA && EXTRA.power_curve && Object.keys(EXTRA.power_curve).length;
  const modes = notState.sport==='ride'
    ? [['long','Mais longas'],['elev','Elevação'],...(hasPower?[['power','Potência']]:[])]
    : notState.sport==='swim'
    ? [['pb','Melhores'],['long','Mais longas']]
    : [['pb','Melhores'],['long','Mais longas'],['elev','Elevação']];
  if(!modes.some(m=>m[0]===notState.mode)) notState.mode = modes[0][0];
  document.getElementById('notModeTabs').innerHTML = modes.map(([v,t])=>
    `<button class="tab ${v===notState.mode?'on':''}" data-accent data-m="${v}">${t}</button>`).join('');
  document.querySelectorAll('#notModeTabs .tab').forEach(b=>b.onclick=()=>{notState.mode=b.dataset.m;renderNotable();});
  const subtxt = {pb:'melhores marcas por distância',long:'as mais longas do histórico',elev:'as com mais elevação',power:'máxima potência média por duração (medida)'};
  document.getElementById('notSub').textContent = subtxt[notState.mode]||'';

  const D = notableData();
  let head = '<thead><tr>'+D.cols.map(c=>`<th>${c}</th>`).join('')+'</tr></thead>';
  let body = '<tbody>';
  D.rows.forEach((r,i)=>{
    let cells;
    if(D.kind==='pb') cells=`<td class="dist">${r.label}</td><td>${fmtDate(r.date)}</td><td>${r.time}</td>`;
    else if(D.kind==='long') cells=`<td>#${r.rank}</td><td>${fmtDate(r.date)}</td><td class="dist">${r.dist}</td>`;
    else cells=`<td>#${r.rank}</td><td>${fmtDate(r.date)}</td><td class="dist">${r.elev}</td>`;
    body+=`<tr data-i="${i}">${cells}</tr>`;
  });
  body+='</tbody>';
  document.getElementById('notTable').innerHTML = head+body;

  if(!D.rows.length){
    document.getElementById('notDetail').innerHTML='<div class="date">sem dados</div>';
    document.getElementById('nmap').innerHTML='';
    return;
  }
  const rows = document.querySelectorAll('#notTable tbody tr');
  if(!rows.length) return;
  rows.forEach(tr=>tr.onclick=()=>selectNotable(D.rows[+tr.dataset.i], tr, rows));
  selectNotable(D.rows[0], rows[0], rows);
}

function selectNotable(r, tr, allRows){
  allRows.forEach(x=>x.classList.remove('sel')); tr.classList.add('sel');
  const a = r.act;
  let prPace = '';
  if(r.eff && r.eff.t && r.eff.d){
    const spd = r.eff.d/r.eff.t;   // m/s do trecho da marca
    const p = notState.sport==='swim' ? paceSwim(spd) : paceRun(spd);
    prPace = `<div class="nstat" style="grid-column:1/-1;border-top:1px solid var(--line);padding-top:10px">
      <div class="v" style="color:var(--orange)">${r.label} em ${r.time} · ${p}</div>
      <div class="l">ritmo da marca</div></div>`;
  }
  document.getElementById('notDetail').innerHTML = `
    <div class="date">${fmtDateLong(a.d)}</div>
    <div class="nm">${a.name||''}</div>
    <div class="nstats">
      <div class="nstat"><div class="v">${km(a.distance,1)}</div><div class="l">distância</div></div>
      <div class="nstat"><div class="v">${dur(a.moving_time)}</div><div class="l">tempo</div></div>
      <div class="nstat"><div class="v">${ritmo(a)}</div><div class="l">${a.g==='ride'?'vel. média':'ritmo médio'}</div></div>
      <div class="nstat"><div class="v">${a.total_elevation_gain?nf(a.total_elevation_gain)+' m':'–'}</div><div class="l">elevação</div></div>
      ${a.average_heartrate?`<div class="nstat"><div class="v">${Math.round(a.average_heartrate)}</div><div class="l">FC média (bpm)</div></div>`:''}
      ${(a.device_watts&&a.average_watts)?`<div class="nstat"><div class="v">${Math.round(a.average_watts)} W</div><div class="l">potência média</div></div>`:''}
      ${prPace}
    </div>`;
  drawMap(a.polyline);
}

function drawMap(poly){
  const coords = decodePolyline(poly);
  const host = document.getElementById('nmap');
  if(!coords.length){
    if(nmap){nmap.remove();nmap=null;}
    host.innerHTML='<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#8a857c;font-family:DM Mono,monospace;font-size:.78rem">sem rota gravada</div>';
    return;
  }
  if(!nmap){
    host.innerHTML='';
    nmap = L.map(host,{zoomControl:false,attributionControl:false,scrollWheelZoom:false});
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png',{maxZoom:18}).addTo(nmap);
  }
  if(ntrack) ntrack.remove();
  ntrack = L.polyline(coords,{color:'#ff5b2e',weight:3.5,opacity:.95}).addTo(nmap);
  nmap.fitBounds(ntrack.getBounds(),{padding:[20,20]});
  setTimeout(()=>nmap.invalidateSize(),100);
}

document.querySelectorAll('#notSportTabs .tab').forEach(b=>b.onclick=()=>{
  document.querySelectorAll('#notSportTabs .tab').forEach(x=>x.classList.remove('on'));
  b.classList.add('on'); notState.sport=b.dataset.v;
  notState.mode = b.dataset.v==='ride' ? 'long' : 'pb'; renderNotable();
});
renderNotable();

/* ====================================================================
   STATISTICS — filtro por esporte recalcula 6-8 gráficos
   ==================================================================== */
let statSport='all';
function statList(){ return statSport==='all'?DATA:DATA.filter(a=>a.g===statSport); }

function rolling(v,w){return v.map((_,i)=>{const s=v.slice(Math.max(0,i-w+1),i+1);return s.reduce((a,b)=>a+b,0)/s.length;});}
function kde(values, grid, bw){
  return grid.map(x=>{
    let s=0; values.forEach(v=>{const u=(x-v)/bw; s+=Math.exp(-0.5*u*u);});
    return s/(values.length*bw*Math.sqrt(2*Math.PI));
  });
}

function buildStats(){
  const list = statList();
  document.getElementById('statSport').textContent = GLABEL[statSport];

  /* --- distância anual --- */
  const byYear={};
  list.forEach(a=>{byYear[a.year]=(byYear[a.year]||0)+(a.distance||0)/1000;});
  const years=Object.keys(byYear).sort();
  mk('cAnnual',{type:'bar',
    data:{labels:years,datasets:[{data:years.map(y=>byYear[y]),
      backgroundColor:statSport==='all'?'#ff5b2e':GCOLOR[statSport],borderRadius:3}]},
    options:{responsive:true,maintainAspectRatio:false,
      plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>nf(c.parsed.y)+' km'}}},
      scales:{x:{grid:{display:false}},y:{grid:GRID,ticks:{callback:v=>nf(v)}}}}});

  /* --- atividade por hora (polar) --- */
  const hours24=new Array(24).fill(0);
  list.forEach(a=>hours24[a.d.getHours()]++);
  mk('cHour',{type:'radar',
    data:{labels:['0h','','','3h','','','6h','','','9h','','','12h','','','15h','','','18h','','','21h','',''],
      datasets:[{data:hours24,backgroundColor:GCOLOR[statSport]+'33',borderColor:GCOLOR[statSport],
        borderWidth:1.5,pointRadius:0}]},
    options:{responsive:true,maintainAspectRatio:false,
      plugins:{legend:{display:false},tooltip:{callbacks:{title:i=>(i&&i[0]&&i[0].label)||'',label:c=>c.parsed.r+' atividades'}}},
      scales:{r:{grid:GRID,angleLines:{color:'#efece4'},ticks:{display:false,backdropColor:'transparent'},pointLabels:{font:{size:9}}}}}});

  /* --- distância média por dia da semana (radar) --- */
  const DOW=['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
  const dsum=new Array(7).fill(0), dcnt=new Array(7).fill(0);
  list.forEach(a=>{if(!(a.distance>0))return;const w=a.d.getDay();dsum[w]+=a.distance/1000;dcnt[w]++;});
  const davg=dsum.map((s,i)=>dcnt[i]?s/dcnt[i]:0);
  mk('cDow',{type:'radar',
    data:{labels:DOW,datasets:[{data:davg,backgroundColor:GCOLOR[statSport]+'33',borderColor:GCOLOR[statSport],borderWidth:1.5,pointRadius:2}]},
    options:{responsive:true,maintainAspectRatio:false,
      plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>nf(c.parsed.r,1)+' km/treino'}}},
      scales:{r:{grid:GRID,angleLines:{color:'#efece4'},ticks:{display:false},pointLabels:{font:{size:10}}}}}});

  /* --- distribuição de distância (barras horizontais) --- */
  const isSwim = statSport==='swim';
  const bins = isSwim
    ? [[0,1,'0–1 km'],[1,2,'1–2 km'],[2,3,'2–3 km'],[3,5,'3–5 km'],[5,99,'5 km+']]
    : [[0,20,'0–20 km'],[20,40,'20–40 km'],[40,60,'40–60 km'],[60,80,'60–80 km'],[80,120,'80–120 km'],[120,9999,'120 km+']];
  const binCounts=bins.map(()=>0);
  list.forEach(a=>{if(!(a.distance>0))return;const d=a.distance/1000;const i=bins.findIndex(b=>d>=b[0]&&d<b[1]);if(i>=0)binCounts[i]++;});
  mk('cDistHist',{type:'bar',
    data:{labels:bins.map(b=>b[2]),datasets:[{data:binCounts,backgroundColor:GCOLOR[statSport==='all'?'run':statSport],borderRadius:3}]},
    options:{indexAxis:'y',responsive:true,maintainAspectRatio:false,
      plugins:{legend:{display:false}},scales:{x:{grid:GRID},y:{grid:{display:false}}}}});

  /* --- virtual vs outdoor (rosca) — só faz sentido para ride/run --- */
  const pV=document.getElementById('pVirtual');
  if(statSport==='swim'){ pV.classList.add('hidden'); }
  else{
    pV.classList.remove('hidden');
    const virt=list.filter(a=>a.trainer===1||/Virtual/i.test(a.sport_type||'')).length;
    const out=list.length-virt;
    mk('cVirtual',{type:'doughnut',
      data:{labels:['Ao ar livre','Virtual'],datasets:[{data:[out,virt],
        backgroundColor:[GCOLOR[statSport==='all'?'run':statSport],'#2b2b31'],borderWidth:0}]},
      options:{responsive:true,maintainAspectRatio:false,cutout:'62%',
        plugins:{legend:{position:'bottom',labels:{boxWidth:10,font:{size:11}}},
          tooltip:{callbacks:{label:c=>c.label+': '+c.parsed+' ('+nf(c.parsed/list.length*100)+'%)'}}}}});
  }

  /* --- distribuição de velocidade/ritmo (curva) --- */
  const speedTitle=document.getElementById('speedTitle'), speedSub=document.getElementById('speedSub');
  const moving = list.filter(a=>a.average_speed>0);
  if(statSport==='ride'){
    speedTitle.textContent='Distribuição de velocidade (km/h)';
    const vals=moving.map(a=>a.average_speed*3.6);
    drawDensity('cSpeed',vals,10,45,v=>nf(v)+' km/h',speedSub);
  } else if(statSport==='swim'){
    speedTitle.textContent='Distribuição de pace (/100m)';
    const vals=moving.map(a=>100/a.average_speed/60);
    drawDensity('cSpeed',vals,1,3.5,v=>mss(v*60),speedSub,true);
  } else {
    speedTitle.textContent='Distribuição de pace (/km)';
    const vals=moving.filter(a=>a.g==='run').map(a=>1000/a.average_speed/60);
    drawDensity('cSpeed',vals,3,8,v=>mss(v*60),speedSub,true);
  }

  /* --- distribuição de potência (só pedal) --- */
  const pPow=document.getElementById('pPower');
  const watts=list.filter(a=>a.g==='ride'&&a.device_watts&&a.average_watts>0).map(a=>a.average_watts);
  if(statSport!=='ride'||watts.length<3){ pPow.classList.add('hidden'); }
  else{
    pPow.classList.remove('hidden');
    const lo=Math.max(0,Math.min(...watts)-20), hi=Math.max(...watts)+20;
    drawDensity('cPower',watts,lo,hi,v=>nf(v)+' W',document.getElementById('powSub'));
  }

  /* --- zonas de FC (barras coloridas) --- */
  const pHr=document.getElementById('pHrZones');
  const withHr=list.filter(a=>a.average_heartrate>0);
  if(withHr.length<5){ pHr.classList.add('hidden'); }
  else{
    pHr.classList.remove('hidden');
    const edges=[0,120,140,160,180,300];
    const zlabels=['Recuperação','Leve','Tempo','Limiar','Máx'];
    const zcolors=['#0e8a7d','#7cb342','#cddc39','#fbc02d','#fc4c02'];
    const zc=new Array(5).fill(0);
    withHr.forEach(a=>{const h=a.average_heartrate;for(let i=0;i<5;i++){if(h>=edges[i]&&h<edges[i+1]){zc[i]++;break;}}});
    mk('cHrZones',{type:'bar',
      data:{labels:zlabels,datasets:[{data:zc,backgroundColor:zcolors,borderRadius:3}]},
      options:{responsive:true,maintainAspectRatio:false,
        plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>c.parsed.y+' treinos'}}},
        scales:{x:{grid:{display:false}},y:{grid:GRID}}}});
  }

  /* --- velocidade × FC (scatter) — unidade e faixa por esporte --- */
  const pShr=document.getElementById('pSpeedHr');
  // 'tudo' mistura unidades incompatíveis; usa só corrida nesse caso
  const shrBase = statSport==='all' ? list.filter(a=>a.g==='run') : list;
  const isRideS=statSport==='ride', isSwimS=statSport==='swim';
  const toX = a => isRideS ? a.average_speed*3.6
                 : isSwimS ? 100/a.average_speed/60      // min/100m
                 : 1000/a.average_speed/60;              // min/km
  const inRange = x => isRideS ? (x>=8&&x<=60) : isSwimS ? (x>=1&&x<=4) : (x>=2.5&&x<=10);
  const shrData=shrBase.filter(a=>a.average_heartrate>0&&a.average_speed>0)
    .map(a=>({x:toX(a), y:a.average_heartrate, a})).filter(p=>inRange(p.x));
  if(shrData.length<5){ pShr.classList.add('hidden'); }
  else{
    pShr.classList.remove('hidden');
    document.getElementById('shrTitle').textContent=isRideS?'Velocidade × FC':'Ritmo × FC';
    const fmtX = v => isRideS ? nf(v)+' km/h' : isSwimS ? mss(v*60)+'/100m' : mss(v*60)+'/km';
    mk('cSpeedHr',{type:'scatter',
      data:{datasets:[{data:shrData,pointBackgroundColor:GCOLOR[statSport==='all'?'run':statSport]+'55',pointRadius:3,pointBorderWidth:0}]},
      options:{responsive:true,maintainAspectRatio:false,
        plugins:{legend:{display:false},tooltip:{callbacks:{
          label:c=>{const p=c.raw;return [p.a.name, fmtX(p.x)+' · '+Math.round(p.y)+' bpm'];}}}},
        scales:{x:{grid:GRID,reverse:!isRideS,ticks:{callback:v=>isRideS?nf(v):mss(v*60)}},
          y:{grid:GRID,ticks:{callback:v=>v+' bpm'}}}}});
  }
}

function drawDensity(id, vals, lo, hi, fmt, subEl, reverse=false){
  if(vals.length<3){ if(charts[id])charts[id].destroy(); return; }
  const mean = vals.reduce((a,b)=>a+b,0)/vals.length;
  if(subEl) subEl.textContent = 'média: '+fmt(mean);
  const grid=[]; const step=(hi-lo)/60; for(let x=lo;x<=hi;x+=step)grid.push(x);
  const sd=Math.sqrt(vals.reduce((s,v)=>s+(v-mean)**2,0)/vals.length);
  const bw=Math.max(1.06*sd*Math.pow(vals.length,-0.2), step);
  const dens=kde(vals,grid,bw);
  mk(id,{type:'line',
    data:{labels:grid,datasets:[{data:dens,borderColor:'#ff5b2e',borderWidth:2,fill:true,
      backgroundColor:'rgba(255,91,46,.14)',pointRadius:0,tension:.4}]},
    options:{responsive:true,maintainAspectRatio:false,
      plugins:{legend:{display:false},tooltip:{enabled:false}},
      scales:{x:{grid:GRID,reverse,ticks:{maxTicksLimit:8,callback:(v,i)=>i%8===0?fmt(grid[i]):''}},
        y:{display:false}}}});
}

document.querySelectorAll('#statSportTabs .tab').forEach(b=>b.onclick=()=>{
  document.querySelectorAll('#statSportTabs .tab').forEach(x=>x.classList.remove('on'));
  b.classList.add('on'); statSport=b.dataset.v; buildStats();
});
buildStats();

/* ====================================================================
   PROGRESSION — heatmap anual + seletor de ano + rest days
   ==================================================================== */
const ALL_YEARS = [...new Set(DATA.map(a=>a.year))].sort((a,b)=>b-a);
let progYear = 'last365';
(function yearTabs(){
  const tabs=[['last365','Últimos 365'], ...ALL_YEARS.map(y=>[String(y),String(y)])];
  document.getElementById('yearTabs').innerHTML = tabs.map(([v,t],i)=>
    `<button class="tab ${i===0?'on':''}" data-accent data-y="${v}">${t}</button>`).join('');
  document.querySelectorAll('#yearTabs .tab').forEach(b=>b.onclick=()=>{
    document.querySelectorAll('#yearTabs .tab').forEach(x=>x.classList.remove('on'));
    b.classList.add('on'); progYear=b.dataset.y; drawHeatmap();
  });
})();

function drawHeatmap(){
  const byDay={};
  DATA.forEach(a=>{const k=a.start_date_local.slice(0,10);byDay[k]=(byDay[k]||0)+(a.moving_time||0);});
  let start,end;
  if(progYear==='last365'){ end=new Date();end.setHours(0,0,0,0); start=new Date(end);start.setDate(start.getDate()-364); }
  else{ start=new Date(+progYear,0,1); end=new Date(+progYear,11,31); }
  const gridStart=new Date(start); gridStart.setDate(gridStart.getDate()-gridStart.getDay());
  const cell=12,gap=3,top=18,left=28;
  const weeks=Math.ceil(((end-gridStart)/864e5+1)/7);
  const colors=['#1d1d22','#46210f','#8a3a18','#d24f1e','#ff5b2e'];
  const lvl=s=>s===0?0:s<1800?1:s<3600?2:s<5400?3:4;
  const MON=['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
  const DOW=['','seg','','qua','','sex',''];
  let svg=`<svg width="${left+weeks*(cell+gap)}" height="${top+7*(cell+gap)+4}" font-family="DM Mono,monospace" font-size="9" fill="#8a857c">`;
  DOW.forEach((t,i)=>{if(t)svg+=`<text x="0" y="${top+i*(cell+gap)+10}">${t}</text>`;});
  let lastMon=-1, active=0;
  for(let w=0;w<weeks;w++)for(let dow=0;dow<7;dow++){
    const d=new Date(gridStart);d.setDate(gridStart.getDate()+w*7+dow);
    if(d<start||d>end)continue;
    if(dow===0&&d.getMonth()!==lastMon){lastMon=d.getMonth();svg+=`<text x="${left+w*(cell+gap)}" y="11">${MON[lastMon]}</text>`;}
    const k=`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
    const sec=byDay[k]||0; if(sec>0)active++;
    svg+=`<rect x="${left+w*(cell+gap)}" y="${top+dow*(cell+gap)}" width="${cell}" height="${cell}" rx="2" fill="${colors[lvl(sec)]}" data-tip="${fmtDate(d)} — ${sec?dur(sec):'descanso'}"></rect>`;
  }
  svg+='</svg>';
  const hm=document.getElementById('heatmap');
  hm.innerHTML=svg;
  // tooltip instantâneo
  let tip=document.getElementById('hmtip');
  if(!tip){ tip=document.createElement('div'); tip.id='hmtip';
    tip.style.cssText='position:fixed;z-index:99;background:#1c1a17;color:#fff;font:11px "DM Mono",monospace;padding:4px 8px;border-radius:5px;pointer-events:none;display:none;white-space:nowrap';
    document.body.appendChild(tip); }
  hm.onmousemove=e=>{ const t=e.target.getAttribute&&e.target.getAttribute('data-tip');
    if(t){ tip.textContent=t; tip.style.display='block';
      tip.style.left=(e.clientX+12)+'px'; tip.style.top=(e.clientY-28)+'px'; }
    else tip.style.display='none'; };
  hm.onmouseleave=()=>{ tip.style.display='none'; };
  // rest days
  let totalDays;
  if(progYear==='last365') totalDays=365;
  else{ const today=new Date(); const ye=(+progYear===today.getFullYear())?today:end;
        totalDays=Math.floor((ye-start)/864e5)+1; }
  document.getElementById('restN').textContent = Math.max(0,totalDays-active);
}
drawHeatmap();

/* ====================================================================
   RECENT — lista + breakdown de tempo (rosca)
   ==================================================================== */
let recPeriod='lastweek';
function recRange(){
  const now=new Date(); const d=new Date(now); d.setHours(0,0,0,0);
  if(recPeriod==='week'){const s=new Date(d);s.setDate(d.getDate()-((d.getDay()+6)%7));return[s,now];}
  if(recPeriod==='lastweek'){const s=new Date(d);s.setDate(d.getDate()-((d.getDay()+6)%7)-7);const e=new Date(s);e.setDate(s.getDate()+7);return[s,e];}
  if(recPeriod==='month'){return[new Date(now.getFullYear(),now.getMonth(),1),now];}
  if(recPeriod==='60'){const s=new Date(d);s.setDate(d.getDate()-60);return[s,now];}
  if(recPeriod==='ytd'){return[new Date(now.getFullYear(),0,1),now];}
  return[new Date(0),now];
}
function buildRecent(){
  const [s,e]=recRange();
  const list=DATA.filter(a=>a.d>=s&&a.d<=e).sort((a,b)=>b.d-a.d);
  const ul=document.getElementById('recList');
  ul.innerHTML = list.length? list.slice(0,12).map(a=>`
    <li class="rrow">
      <div class="ic">${GICON[a.g]||'•'}</div>
      <div class="meta"><div class="rn">${a.name||''}</div><div class="rd">${a.start_date_local.slice(0,10)}</div></div>
      <div class="rv">${a.distance?km(a.distance,1):'–'} · ${dur(a.moving_time||0)}</div>
    </li>`).join('') : '<li class="rrow"><div class="meta"><div class="rd">nenhuma atividade no período</div></div></li>';

  let tt=0,td=0; const byG={};
  list.forEach(a=>{tt+=a.moving_time||0;td+=a.distance||0;
    if(!byG[a.g])byG[a.g]={t:0,d:0,n:0}; byG[a.g].t+=a.moving_time||0;byG[a.g].d+=a.distance||0;byG[a.g].n++;});
  document.getElementById('recTime').textContent=dur(tt);
  document.getElementById('recDist').textContent=km(td,0);

  const order=Object.keys(byG).sort((a,b)=>byG[b].t-byG[a].t);
  mk('cRecBreak',{type:'doughnut',
    data:{labels:order.map(g=>GLABEL[g]),datasets:[{data:order.map(g=>byG[g].t),
      backgroundColor:order.map(g=>GCOLOR[g]),borderWidth:2,borderColor:'#16161a'}]},
    options:{responsive:true,maintainAspectRatio:false,cutout:'60%',
      plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>GLABEL[order[c.dataIndex]]+': '+dur(byG[order[c.dataIndex]].t)}}}}});
  document.getElementById('recBreak').innerHTML = order.map(g=>`
    <div class="bl"><span class="sw" style="background:${GCOLOR[g]}"></span>${GLABEL[g]}
      <span class="pct">${tt?nf(byG[g].t/tt*100):0}%</span>
      <span class="ext">${dur(byG[g].t)} · ${km(byG[g].d,0)}</span></div>`).join('');
}
document.querySelectorAll('#recTabs .tab').forEach(b=>b.onclick=()=>{
  document.querySelectorAll('#recTabs .tab').forEach(x=>x.classList.remove('on'));
  b.classList.add('on'); recPeriod=b.dataset.v; buildRecent();
});
buildRecent();
