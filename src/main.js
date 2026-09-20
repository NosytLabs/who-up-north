import{ACTIVITIES,buildCanadaSnapshot,deterministicFact,factCandidates}from'./model.js';

const $=id=>document.getElementById(id);
const DATA={
  profile:new URL('../data/time-use-profile.json',import.meta.url),
  population:new URL('../data/population.json',import.meta.url),
  jev:new URL('../data/jev-fact.json',import.meta.url),
  live:new URL('../data/live-signals.json',import.meta.url),
  boundaries:new URL('../data/canada-provinces.geojson',import.meta.url)
};
const LIVE={
  weather:'https://api.weather.gc.ca/collections/weather-alerts/items?f=json&limit=12',
  open:'https://open.canada.ca/data/en/api/3/action/recently_changed_packages_activity_list?limit=8',
  openCount:'https://open.canada.ca/data/en/api/3/action/package_search?rows=0&fq=metadata_modified%3A%5BNOW-1DAY%20TO%20NOW%5D',
  bank:'https://www.bankofcanada.ca/valet/observations/FXUSDCAD/json?recent=1',
  search:'https://open.canada.ca/data/en/api/3/action/package_search'
};
const CLOCKS=[
  ['VANCOUVER','America/Vancouver'],['CALGARY','America/Edmonton'],['WINNIPEG','America/Winnipeg'],
  ['TORONTO','America/Toronto'],['HALIFAX','America/Halifax'],["ST. JOHN'S",'America/St_Johns']
];
const state={profile:null,pop:null,geo:null,mapGeometry:null,snapshot:null,fact:null,factTemplate:null,focus:null,shift:0,live:null,lastCheckAt:null,directOk:0,directExpected:0,w:0,o:0,toast:null,provinceOpen:{},provinceRequest:0};
const colours=Object.fromEntries(ACTIVITIES.map(a=>[a.key,a.colour]));
const GEO_ID={'10':'nl','11':'pe','12':'ns','13':'nb','24':'qc','35':'on','46':'mb','47':'sk','48':'ab','59':'bc','60':'yt','61':'nt','62':'nu'};
const LABEL_COORDS={
  bc:[-124.5,54.4],ab:[-114.5,54.9],sk:[-106.1,54.8],mb:[-98.8,54.7],on:[-84.2,50.6],qc:[-71.5,52.5],
  nb:[-66.5,46.6],ns:[-63.0,45.0],pe:[-63.35,46.35],nl:[-58.7,53.2],yt:[-135.2,64.3],nt:[-121.5,66.2],nu:[-96.0,67.4]
};
const PROVINCE_STAT_ORDER=['unemployment','employment','earnings','building','retail','gdp'];
const PROVINCE_STAT_LABELS={
  unemployment:'UNEMPLOYMENT RATE',
  employment:'EMPLOYMENT LEVEL',
  earnings:'AVG WEEKLY EARNINGS',
  building:'BUILDING PERMITS',
  retail:'RETAIL SALES',
  gdp:'REAL GDP'
};

const num=n=>Number.isFinite(n)?Math.round(n).toLocaleString('en-CA'):'—';
const pct=n=>Number.isFinite(n)?Number(n).toFixed(1)+'%':'—';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const orgName=value=>String(value||'').split(' | ')[0].trim();
const instant=()=>new Date(Date.now()+state.shift*36e5);

async function json(url){
  const c=new AbortController(),t=setTimeout(()=>c.abort(),9000);
  try{
    const r=await fetch(url,{cache:'no-store',signal:c.signal});
    if(!r.ok)throw new Error(String(r.status));
    return await r.json();
  }finally{clearTimeout(t)}
}
function toast(message,error=false){
  const el=$('toast');el.textContent=message;el.className='toast show'+(error?' error':'');
  clearTimeout(state.toast);state.toast=setTimeout(()=>el.className='toast',3400);
}
function chip(status,message){
  const el=$('source-chip');el.className='chip '+status;el.querySelector('span').textContent=message;
}
function local(tz,date=instant(),seconds=false){
  return new Intl.DateTimeFormat('en-CA',{timeZone:tz,hour:'2-digit',minute:'2-digit',second:seconds?'2-digit':undefined,hour12:false}).format(date);
}
function ageLabel(value){
  const d=value?new Date(value):null;
  if(!d||Number.isNaN(d.getTime()))return'—';
  const s=Math.max(0,Math.round((Date.now()-d.getTime())/1000));
  if(s<45)return'JUST NOW';
  if(s<3600)return Math.floor(s/60)+'M AGO';
  if(s<86400)return Math.floor(s/3600)+'H AGO';
  return Math.floor(s/86400)+'D AGO';
}
function dateLabel(iso){
  if(!iso)return'—';
  const d=new Date(String(iso).slice(0,10)+'T12:00:00Z');
  return d.toLocaleDateString('en-CA',{timeZone:'UTC',weekday:'short',month:'short',day:'numeric',year:'numeric'});
}
function zonedInstant(date,hour,minute,tz){
  const [y,m,d]=date.split('-').map(Number),desired=Date.UTC(y,m-1,d,hour,minute);
  let guess=new Date(desired);
  const f=new Intl.DateTimeFormat('en-CA',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false});
  for(let i=0;i<3;i++){
    const p=Object.fromEntries(f.formatToParts(guess).filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));
    const actual=Date.UTC(Number(p.year),Number(p.month)-1,Number(p.day),Number(p.hour)%24,Number(p.minute));
    guess=new Date(guess.getTime()+desired-actual);
  }
  return guess;
}
function countdown(ms){
  if(!Number.isFinite(ms)||ms<=0)return'RELEASING TODAY';
  const minutes=Math.floor(ms/60000),days=Math.floor(minutes/1440),hours=Math.floor(minutes%1440/60),mins=minutes%60;
  if(days)return`IN ${days}D ${hours}H`;
  if(hours)return`IN ${hours}H ${mins}M`;
  return`IN ${Math.max(1,mins)}M`;
}

async function init(){
  chip('','LOADING VERIFIED DATA');
  try{
    [state.profile,state.pop]=await Promise.all([json(DATA.profile),json(DATA.population)]);
    if(Object.keys(state.profile.weekdays||{}).length!==288||Object.keys(state.profile.weekends||{}).length!==288)throw new Error('time-use profile incomplete');
    chip('ready','STATCAN // VERIFIED');
    recompute();
    if(state.focus)loadProvinceOpenData(state.focus);
  }catch(e){
    chip('error','CORE DATA UNAVAILABLE');
    $('awake-percent').textContent='—';
    $('awake-count').textContent='No substitute numbers shown.';
    $('activity-list').innerHTML='<div class="loading">VERIFIED CORE DATA UNAVAILABLE</div>';
    toast('Verified time-use data bundle unavailable.',true);
  }

  try{
    state.geo=await json(DATA.boundaries);
    state.mapGeometry=null;
    renderMap();
  }catch{
    state.geo={features:[],error:true};
    state.mapGeometry=null;
    renderMap();
    toast('Map boundaries are temporarily unavailable; use the region selector or cards.',true);
  }

  try{
    state.live=await json(DATA.live);
    renderLive();
    renderStatCan();
  }catch{
    $('live-status').textContent='BUILD SNAPSHOT UNAVAILABLE // CHECKING SOURCES';
  }
  loadLive();
}
function recompute(){
  if(!state.profile||!state.pop)return;
  try{
    state.snapshot=buildCanadaSnapshot(state.profile,state.pop,instant());
    renderCore();
    if(state.shift===0)loadFact();else{state.fact=deterministicFact(state.snapshot);renderFact()}
  }catch(e){toast(e.message||String(e),true)}
}
function renderCore(){
  const s=state.snapshot;
  const leading=ACTIVITIES.filter(a=>a.key!=='sleep').map(a=>({...a,value:s.national.activities[a.key]})).sort((a,b)=>b.value-a.value)[0];
  $('awake-percent').textContent=pct(s.national.awakePercent);
  $('awake-count').textContent=`~${num(s.national.awakeCount)} people in the modelled survey scope`;
  $('pulse-updated').textContent=String(state.pop.strategy||'').startsWith('live-wds')?'STATCAN WDS POP SNAPSHOT':'VERIFIED POP SNAPSHOT';
  $('hero-leading').textContent=leading?`${leading.short.toUpperCase()} // ${pct(leading.value)}`:'—';
  $('activity-note').textContent=`Official five-minute participation rates · population snapshot ${state.pop.asOf||'verified'} · survey scope 15+.`;
  renderTicker();
  renderActivities();
  renderModelPath();
  renderRegionSelect();
  renderProvinces();
  renderTerritories();
  renderMap();
  renderFocus();
  renderProvinceData();
}
function renderTicker(){
  const d=instant();
  $('pulse-instant').textContent=d.toLocaleTimeString('en-CA',{timeZone:'UTC',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false})+' UTC';
  const set=CLOCKS.map(([name,tz])=>`<span>${name} ${local(tz,d,true)}</span>`).join('');
  $('clock-ticker').innerHTML=set+set;
  $('map-clock').textContent=d.toLocaleTimeString('en-CA',{timeZone:'UTC',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false})+' UTC';
  renderReleaseClock();
  renderFreshness();
}
function renderActivities(){
  const s=state.snapshot;
  const rows=ACTIVITIES.map(a=>({a,value:s.national.activities[a.key],count:s.national.counts[a.key]})).sort((x,y)=>y.value-x.value);
  $('activity-list').innerHTML=rows.map(({a,value,count},i)=>`<div class="activity-row" style="--activity:${a.colour};--w:${Math.min(100,Math.max(0,value))}%"><i></i><div class="activity-name">${String(i+1).padStart(2,'0')} · ${esc(a.label)}</div><div class="activity-track"><span></span></div><div class="activity-pct">${pct(value)}</div><div class="activity-count">~${num(count)} people</div></div>`).join('');
}
function renderModelPath(){
  if(!state.profile||!state.pop)return;
  const base=instant(),steps=[0,3,6,9].map(hours=>{
    const at=new Date(base.getTime()+hours*36e5),snapshot=buildCanadaSnapshot(state.profile,state.pop,at);
    const lead=ACTIVITIES.filter(a=>a.key!=='sleep').map(a=>({...a,value:snapshot.national.activities[a.key]})).sort((a,b)=>b.value-a.value)[0];
    return{hours,at,snapshot,lead};
  });
  $('model-path').innerHTML=steps.map(({hours,at,snapshot,lead})=>`<article class="model-step"><small>${hours===0?(state.shift===0?'NOW':'SHIFTED BASE'):'+'+hours+'H'} // TORONTO ${local('America/Toronto',at)}</small><strong>${pct(snapshot.national.awakePercent)}</strong><span>modelled awake</span><em style="color:${colours[lead.key]}">● ${esc(lead.short)} · ${pct(lead.value)}</em></article>`).join('');
}

function renderRegionSelect(){
  const select=$('region-select');
  if(!select||!state.snapshot)return;
  if(select.options.length===1){
    const regions=[...state.snapshot.regions,...state.snapshot.territories];
    select.insertAdjacentHTML('beforeend',regions.map(region=>`<option value="${region.id}">${esc(region.name)}</option>`).join(''));
  }
  select.value=state.focus||'';
}
function renderProvinces(){
  $('province-grid').innerHTML=state.snapshot.regions.map(r=>`<button class="province-card ${state.focus===r.id?'active':''}" data-r="${r.id}" type="button" aria-pressed="${state.focus===r.id?'true':'false'}" title="Inspect ${esc(r.name)}"><div class="top"><span>${esc(r.abbr)}</span><span>${esc(r.clockLabel)} CLOCK</span></div><div class="province-name">${esc(r.name)}</div><div class="time">${esc(r.localTime)}</div><div class="awake">${pct(r.awakePercent)} awake · ~${num(r.awakeCount)}</div><div class="dom" style="color:${colours[r.dominant]}">● ${esc(ACTIVITIES.find(a=>a.key===r.dominant)?.short||r.dominant)}</div></button>`).join('');
  document.querySelectorAll('[data-r]').forEach(b=>b.onclick=()=>focus(b.dataset.r));
}
function renderTerritories(){
  const grid=$('territory-grid');
  if(!grid||!state.snapshot)return;
  grid.innerHTML=state.snapshot.territories.map(r=>{
    const indicators=state.live?.statcan?.provinces?.[r.id]?.indicators||{};
    const headline=indicators.retail||indicators.building||indicators.earnings||indicators.gdp;
    const signal=headline?`${PROVINCE_STAT_LABELS[headline.key]||headline.title} · ${headline.value}`:'Official indicators available in drilldown';
    return`<button class="territory-card ${state.focus===r.id?'active':''}" data-t="${r.id}" type="button" aria-pressed="${state.focus===r.id?'true':'false'}" title="Inspect ${esc(r.name)}"><div class="top"><span>${esc(r.abbr)}</span><span>${esc(r.clockLabel)} CLOCK</span></div><div class="province-name">${esc(r.name)}</div><div class="time">${esc(r.localTime)}</div><div class="awake">${num(r.population)} population</div><div class="dom">${esc(signal)}</div></button>`;
  }).join('');
  grid.querySelectorAll('[data-t]').forEach(button=>button.onclick=()=>focus(button.dataset.t));
}
function focus(id,commit=true){
  const all=state.snapshot?[...state.snapshot.regions,...state.snapshot.territories]:[];
  state.focus=id&&all.some(region=>region.id===id)?id:null;
  state.provinceRequest+=1;
  if(commit){
    const url=new URL(location.href);
    state.focus?url.searchParams.set('region',state.focus):url.searchParams.delete('region');
    history.replaceState(null,'',url);
  }
  renderMap();
  renderFocus();
  renderRegionSelect();
  renderProvinces();
  renderTerritories();
  renderProvinceData();
  if(state.focus)loadProvinceOpenData(state.focus);
}
function renderFocus(){
  const all=[...state.snapshot.regions,...state.snapshot.territories],r=all.find(x=>x.id===state.focus);
  if(!r){
    $('focus-kicker').textContent='SELECT A REGION';
    $('focus-name').textContent='Canada';
    $('focus-time').textContent='—';
    $('focus-awake').textContent=pct(state.snapshot.national.awakePercent);
    $('focus-dominant').textContent='—';
    $('focus-copy').textContent='Choose a province or territory to inspect its local clock, model context, and official data.';
    return;
  }
  $('focus-kicker').textContent=r.surveyIncluded===false?'TIME-ZONE CONTEXT':'LOCAL MODEL SLICE';
  $('focus-name').textContent=r.name;
  $('focus-time').textContent=r.localTime;
  if(r.surveyIncluded===false){
    $('focus-awake').textContent='NOT MODELLED';$('focus-dominant').textContent='—';
    $('focus-copy').textContent=`The time-use model excludes territories. ${r.clockLabel} is used only as a reference clock; official population and economic indicators are available below.`;
  }else{
    $('focus-awake').textContent=pct(r.awakePercent);
    $('focus-dominant').textContent=ACTIVITIES.find(a=>a.key===r.dominant)?.short||r.dominant;
    $('focus-copy').textContent=`Canada-level survey profile evaluated on the ${r.clockLabel} reference clock at ${r.localTime} and population-scaled to ${r.name}. This is not a province-specific diary estimate.`;
  }
}
function focusedRegion(){
  if(!state.snapshot||!state.focus)return null;
  return[...state.snapshot.regions,...state.snapshot.territories].find(region=>region.id===state.focus)||null;
}
function growthMarkup(indicator){
  if(!indicator?.growth)return'';
  const cls=indicator.direction==='2'?'down':indicator.direction==='1'?'up':'flat';
  const arrow=indicator.direction==='2'?'↓':indicator.direction==='1'?'↑':'•';
  const growth=esc(indicator.growth),detail=esc(indicator.growthDetail||'');
  if(indicator.value===indicator.growth)return`<em class="${cls}">${detail||'LATEST RELEASE'}</em>`;
  return`<em class="${cls}">${arrow} ${growth} ${detail}</em>`;
}
function renderProvinceOpenData(region,record){
  $('province-open-title').textContent=`Open Government datasets for ${region.name}`;
  if(!record){
    $('province-open-status').textContent='SEARCHING OPEN CANADA…';
    $('province-open-results').innerHTML='<div class="province-open-empty">Loading recent catalogue matches…</div>';
    return;
  }
  if(record.error){
    $('province-open-status').textContent='SEARCH UNAVAILABLE';
    $('province-open-results').innerHTML='<div class="province-open-empty">Open Government catalogue search is unavailable right now.</div>';
    return;
  }
  $('province-open-title').textContent=record.mode==='TITLE MATCHES'
    ?`Datasets with ${region.name} in the title`
    :`Catalogue matches for ${region.name}`;
  $('province-open-status').textContent=`${num(record.count)} ${record.mode||'MATCHES'}`;
  $('province-open-results').innerHTML=record.items.length?record.items.map(item=>`<a href="${esc(item.url)}" target="_blank" rel="noreferrer"><small>${esc(item.organization||'Open Government')} · ${esc(item.modified||'')}</small><strong>${esc(item.title)}</strong></a>`).join(''):'<div class="province-open-empty">No recent catalogue matches found.</div>';
}
function renderProvinceData(){
  const panel=$('province-data'),region=focusedRegion();
  if(!panel||!region){
    if(panel)panel.hidden=true;
    return;
  }
  panel.hidden=false;
  $('province-data-title').textContent=region.name;
  const indicators=state.live?.statcan?.provinces?.[region.id]?.indicators||{};
  const indicatorCount=Object.keys(indicators).length;
  $('province-data-status').textContent=state.live?.generatedAt
    ?`STATCAN · ${indicatorCount} INDICATOR${indicatorCount===1?'':'S'} · ${ageLabel(state.live.generatedAt)}`
    :'STATCAN DATA LOADING';
  const populationShare=Number.isFinite(Number(state.pop?.canada))?region.population/Number(state.pop.canada)*100:null;
  const cards=[{
    key:'population',
    label:'QUARTERLY POPULATION',
    value:num(region.population),
    reference:state.pop?.asOf||'latest official estimate',
    growth:populationShare==null?'':`${populationShare.toFixed(1)}% of Canada total`,
    url:'https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=1710000901'
  }];

  for(const key of PROVINCE_STAT_ORDER){
    const indicator=indicators[key];
    if(indicator)cards.push({...indicator,label:PROVINCE_STAT_LABELS[key]||indicator.title});
  }

  $('province-stat-grid').innerHTML=cards.map(card=>{
    const source=card.url||'https://www.statcan.gc.ca/en/subjects-start';
    const growth=card.key==='population'
      ?`<em class="flat">${esc(card.growth)}</em>`
      :growthMarkup(card);
    return`<a class="province-stat-card" href="${esc(source)}" target="_blank" rel="noreferrer"><small>${esc(card.label||card.title)}</small><strong>${esc(card.value)}</strong><span>${esc(card.reference||card.releaseDate||'Latest release')}</span>${growth}</a>`;
  }).join('');

  renderProvinceOpenData(region,state.provinceOpen[region.id]);
}
async function loadProvinceOpenData(id){
  const region=[...state.snapshot.regions,...state.snapshot.territories].find(item=>item.id===id);
  if(!region)return;
  if(state.provinceOpen[id]){
    if(state.focus===id)renderProvinceOpenData(region,state.provinceOpen[id]);
    return;
  }

  const request=++state.provinceRequest;
  if(state.focus===id)renderProvinceOpenData(region,null);
  try{
    const exactQuery=`title:"${region.name.replaceAll('"','')}"`;
    const activeFilter=encodeURIComponent('-title:inactive');
    let response=await json(`${LIVE.search}?rows=4&sort=metadata_modified%20desc&fq=${activeFilter}&q=${encodeURIComponent(exactQuery)}`);
    let result=response?.result||{},rows=result.results||[];
    let mode='TITLE MATCHES';
    if(!rows.length){
      response=await json(`${LIVE.search}?rows=4&sort=metadata_modified%20desc&fq=${activeFilter}&q=${encodeURIComponent(region.name)}`);
      result=response?.result||{};rows=result.results||[];mode='FULL-TEXT FALLBACK';
    }
    const record={
      count:Number(result.count)||0,
      mode,
      items:rows.map(item=>({
        id:item.id,
        title:item.title_translated?.en||item.title||item.name||'Dataset',
        organization:orgName(item.organization?.title)||'Open Government',
        modified:item.metadata_modified?new Date(item.metadata_modified).toLocaleDateString('en-CA'):'',
        url:`https://open.canada.ca/data/en/dataset/${item.id}`
      }))
    };
    state.provinceOpen[id]=record;
    if(state.focus===id&&request===state.provinceRequest)renderProvinceOpenData(region,record);
  }catch{
    const record={error:true,items:[],count:0};
    state.provinceOpen[id]=record;
    if(state.focus===id&&request===state.provinceRequest)renderProvinceOpenData(region,record);
  }
}

function projectCanada(lon,lat){
  const rad=Math.PI/180,phi=lat*rad,lambda=lon*rad,phi1=50*rad,phi2=70*rad,phi0=40*rad,lambda0=-96*rad;
  const n=.5*(Math.sin(phi1)+Math.sin(phi2)),C=Math.cos(phi1)**2+2*n*Math.sin(phi1);
  const rho=Math.sqrt(Math.max(0,C-2*n*Math.sin(phi)))/n,rho0=Math.sqrt(C-2*n*Math.sin(phi0))/n,theta=n*(lambda-lambda0);
  return[rho*Math.sin(theta),rho0-rho*Math.cos(theta)];
}
function geoRings(geometry){
  if(!geometry)return[];
  if(geometry.type==='Polygon')return geometry.coordinates;
  if(geometry.type==='MultiPolygon')return geometry.coordinates.flat();
  return[];
}
function prepareMapGeometry(){
  if(state.mapGeometry)return state.mapGeometry;
  if(!state.geo?.features?.length)return null;

  const projected=[];
  for(const feature of state.geo.features){
    for(const ring of geoRings(feature.geometry)){
      for(const [lon,lat] of ring)projected.push(projectCanada(lon,lat));
    }
  }

  const xs=projected.map(point=>point[0]),ys=projected.map(point=>point[1]);
  const minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
  const pad=42,W=1200,H=720;
  const scale=Math.min((W-pad*2)/(maxX-minX),(H-pad*2)/(maxY-minY));
  const tx=x=>pad+(x-minX)*scale,ty=y=>H-pad-(y-minY)*scale;
  const pt=(lon,lat)=>{const [x,y]=projectCanada(lon,lat);return[tx(x),ty(y)]};
  const pathFor=geometry=>geoRings(geometry).map(ring=>ring.map(([lon,lat],i)=>{
    const [x,y]=pt(lon,lat);
    return(i?'L':'M')+x.toFixed(1)+' '+y.toFixed(1);
  }).join(' ')+' Z').join(' ');

  const paths=state.geo.features.map(feature=>({
    id:GEO_ID[String(feature.properties?.PRUID||'')],
    d:pathFor(feature.geometry)
  })).filter(item=>item.id);

  const labels={};
  for(const [id,coord] of Object.entries(LABEL_COORDS)){
    const [x,y]=pt(...coord);
    labels[id]={x,y};
  }

  const grid=Array.from({length:7},(_,i)=>`<line class="map-grid-line" x1="${80+i*170}" y1="30" x2="${80+i*170}" y2="690"/>`).join('')
    +Array.from({length:5},(_,i)=>`<line class="map-grid-line" x1="30" y1="${100+i*125}" x2="1170" y2="${100+i*125}"/>`).join('');

  state.mapGeometry={paths,labels,grid};
  return state.mapGeometry;
}
function renderMap(){
  if(!state.snapshot)return;
  const shapeLayer=$('map-shapes'),labelLayer=$('map-labels'),grid=$('map-grid');
  const geometry=prepareMapGeometry();
  if(!geometry){
    const message=state.geo?.error
      ?'MAP BOUNDARIES TEMPORARILY UNAVAILABLE · USE REGION SELECTOR OR CARDS'
      :'LOADING VERIFIED CANADA BOUNDARIES…';
    shapeLayer.innerHTML=`<text x="600" y="360" text-anchor="middle" fill="#68736e" font-family="ui-monospace,monospace" font-size="14">${message}</text>`;
    labelLayer.innerHTML='';
    return;
  }

  grid.innerHTML=geometry.grid;
  const all=[...state.snapshot.regions,...state.snapshot.territories];
  const byId=Object.fromEntries(all.map(region=>[region.id,region]));

  shapeLayer.innerHTML=geometry.paths.map(item=>{
    const region=byId[item.id];
    if(!region)return'';
    const territory=region.surveyIncluded===false;
    const fill=territory?'#53645d':colours[region.dominant]||'#78c7d3';
    return`<path class="province-shape ${territory?'territory':''} ${state.focus===item.id?'active':''}" data-m="${item.id}" d="${item.d}" fill="${fill}" aria-label="${esc(region.name)}" aria-pressed="${state.focus===item.id?'true':'false'}"><title>${esc(region.name)} · ${esc(region.localTime)}${territory?' · time-zone context':` · ${pct(region.awakePercent)} awake`}</title></path>`;
  }).join('');

  labelLayer.innerHTML=all.map(region=>{
    const point=geometry.labels[region.id];
    if(!point)return'';
    const territory=region.surveyIncluded===false;
    return`<g><text class="map-label ${territory?'territory':''}" x="${point.x.toFixed(1)}" y="${point.y.toFixed(1)}">${esc(region.abbr)}</text><text class="map-sub-label" x="${point.x.toFixed(1)}" y="${(point.y+14).toFixed(1)}">${esc(region.localTime)}</text></g>`;
  }).join('');

  shapeLayer.querySelectorAll('[data-m]').forEach(path=>{
    path.addEventListener('click',()=>focus(path.dataset.m));
    path.addEventListener('keydown',event=>{
      if(event.key==='Enter'||event.key===' '){
        event.preventDefault();
        focus(path.dataset.m);
      }
    });
    path.setAttribute('tabindex','0');
    path.setAttribute('role','button');
  });
  $('map-legend').innerHTML=ACTIVITIES.filter(activity=>activity.key!=='sleep').map(activity=>`<span><i style="--legend:${activity.colour}"></i>${esc(activity.label)}</span>`).join('');
}

async function loadFact(){
  if(!state.factTemplate){
    try{
      state.factTemplate=await json(DATA.jev);
    }catch{
      state.factTemplate={mode:'deterministic',selected:{id:'top'}};
    }
  }
  const candidates=factCandidates(state.snapshot);
  const selected=candidates.find(candidate=>candidate.id===state.factTemplate?.selected?.id)
    ||candidates[1]||candidates[0];
  state.fact={...state.factTemplate,snapshotInstant:state.snapshot.instant,selected,clientRefreshed:true};
  renderFact();
}
function renderFact(){
  const f=state.fact;
  if(!f?.selected)return;
  $('fact-mode').textContent=f.mode==='jev'?'JEV // FACT TYPE SELECTOR':'VERIFIED DATA NOTE';
  $('fact-title').textContent=f.selected.title;
  $('fact-detail').textContent=f.selected.detail;
}

function weather(j){
  const features=j?.features||[],seen=new Set,items=[];
  for(const q of features){
    const name=q.properties?.alert_short_name_en||q.properties?.alert_name_en||'Weather alert';
    const province=q.properties?.province||'CA';
    const key=`${province}|${name}`;
    if(seen.has(key))continue;
    seen.add(key);
    items.push({name,feature:q.properties?.feature_name_en,province,published:q.properties?.publication_datetime});
    if(items.length===8)break;
  }
  return{live:true,checkedAt:new Date().toISOString(),numberMatched:j?.numberMatched??features.length,items};
}
function openGov(j,count){return{live:true,checkedAt:new Date().toISOString(),changedLast24h:Number.isFinite(Number(count?.result?.count))?Number(count.result.count):null,items:(j?.result||[]).slice(0,8).map(q=>({timestamp:q.timestamp,id:q.object_id,title:q.data?.package?.title_translated?.en||q.data?.package?.title||q.data?.package?.name||'Updated dataset',organization:orgName(q.data?.package?.organization?.title),url:`https://open.canada.ca/data/en/dataset/${q.object_id}`}))}}
function bank(j){const r=j?.observations?.at(-1),v=Number(r?.FXUSDCAD?.v);return{live:true,checkedAt:new Date().toISOString(),date:r?.d,value:Number.isFinite(v)?v:null,description:j?.seriesDetail?.FXUSDCAD?.description||'Daily average USD/CAD'}}

async function loadLive(options={}){
  const auto=options?.auto===true,includeBank=options?.includeBank!==false;
  if(!state.live){
    try{state.live=await json(DATA.live);renderLive();renderStatCan()}catch{}
  }
  if(!auto){
    $('live-status').textContent='CHECKING PUBLIC SOURCES DIRECTLY…';
    $('live-refresh').disabled=true;
  }
  const bankRequest=includeBank?json(LIVE.bank):Promise.resolve(null);
  const [w,o,oc,b]=await Promise.allSettled([json(LIVE.weather),json(LIVE.open),json(LIVE.openCount),bankRequest]);
  const previous=state.live||{weather:{items:[]},openGovernment:{items:[]},bank:{},statcan:{}};
  const checkedAt=new Date();
  const failed=source=>({...source,live:false,checkFailedAt:checkedAt.toISOString()});
  state.live={
    ...previous,
    weather:w.status==='fulfilled'?weather(w.value):failed(previous.weather||{items:[]}),
    openGovernment:o.status==='fulfilled'?openGov(o.value,oc.status==='fulfilled'?oc.value:null):failed(previous.openGovernment||{items:[]}),
    bank:includeBank?(b.status==='fulfilled'&&b.value?bank(b.value):failed(previous.bank||{})):previous.bank
  };
  const direct=[w,o,...(includeBank?[b]:[])];
  state.lastCheckAt=checkedAt;
  state.directExpected=direct.length;
  state.directOk=direct.filter(x=>x.status==='fulfilled'&&x.value).length;
  renderLive();renderStatCan();
  if(!auto)$('live-refresh').disabled=false;
}
function renderFreshness(){
  if(!state.live)return;
  const snap=state.live.generatedAt;
  $('hero-freshness').textContent=state.lastCheckAt?`${state.directOk}/${state.directExpected} · ${ageLabel(state.lastCheckAt)}`:snap?'SNAPSHOT · '+ageLabel(snap):'OFFLINE';
  $('weather-source-state').textContent=state.live.weather?.live?'DIRECT API':'BUILD SNAPSHOT';
  $('open-source-state').textContent=state.live.openGovernment?.live?'DIRECT API':'BUILD SNAPSHOT';
  $('bank-source-state').textContent=state.live.bank?.live?'DIRECT CHECK':'BUILD SNAPSHOT';
  $('weather-freshness').textContent=state.live.weather?.checkedAt?ageLabel(state.live.weather.checkedAt):ageLabel(snap);
  $('open-data-freshness').textContent=state.live.openGovernment?.checkedAt?ageLabel(state.live.openGovernment.checkedAt):ageLabel(snap);
  $('fx-freshness').textContent=state.live.bank?.checkedAt?ageLabel(state.live.bank.checkedAt):ageLabel(snap);
  $('indicator-freshness').textContent=snap?'SNAPSHOT '+ageLabel(snap):'STATCAN SNAPSHOT';
}
function renderLive(){
  const w=state.live?.weather||{},o=state.live?.openGovernment||{},b=state.live?.bank||{};
  const weatherItems=w.items||[],openItems=o.items||[];
  if(state.w>=weatherItems.length)state.w=0;
  if(state.o>=openItems.length)state.o=0;
  const wi=weatherItems[state.w],oi=openItems[state.o];
  $('weather-count').textContent=Number.isFinite(w.numberMatched)?num(w.numberMatched):'—';
  $('weather-caption').textContent=Number.isFinite(w.numberMatched)?'current alert records':'feed unavailable';
  $('weather-detail').textContent=wi?`${wi.name||'Weather alert'} · ${wi.feature||wi.province||'Canada'}`:'No current alert detail.';
  $('weather-list').innerHTML=weatherItems.slice(0,4).map((q,i)=>`<button class="${i===state.w?'active':''}" data-w="${i}" type="button" title="${esc((q.name||'Weather alert')+' · '+(q.feature||q.province||'Canada'))}">${esc(q.province||'CA')} · ${esc(q.name||'alert')}</button>`).join('');
  document.querySelectorAll('[data-w]').forEach(button=>button.onclick=()=>{state.w=+button.dataset.w;renderLive()});
  $('weather-card').classList.toggle('live',!!w.live);

  $('open-updated-count').textContent=Number.isFinite(o.changedLast24h)?num(o.changedLast24h):'—';
  $('open-data-title').textContent=oi?.title||'Open Government feed unavailable';
  $('open-data-org').textContent=oi?.organization||'Federal Open Government catalogue';
  $('open-data-time').textContent=oi?.timestamp?new Date(oi.timestamp).toLocaleString('en-CA'):'—';
  $('open-data-link').href=oi?.url||'https://open.canada.ca/data/en/';
  $('open-data-list').innerHTML=openItems.slice(0,4).map((q,i)=>`<button class="${i===state.o?'active':''}" data-o="${i}" type="button" title="${esc((q.title||q.organization||'dataset'))}">${String(i+1).padStart(2,'0')} · ${esc(q.title||q.organization||'dataset')}</button>`).join('');
  document.querySelectorAll('[data-o]').forEach(button=>button.onclick=()=>{state.o=+button.dataset.o;renderLive()});
  $('open-card').classList.toggle('live',!!o.live);

  $('fx-rate').textContent=Number.isFinite(b.value)?b.value.toFixed(4):'—';
  $('fx-date').textContent=b.date?'Published '+b.date:'—';
  $('fx-description').textContent=b.description||'Official daily USD/CAD average.';
  $('bank-card').classList.toggle('daily',!!b.live);

  $('live-status').textContent=state.lastCheckAt?`${state.directOk}/${state.directExpected} PUBLIC APIS RESPONDED · ${ageLabel(state.lastCheckAt)}`:`BUILD SNAPSHOT · ${state.live.generatedAt?ageLabel(state.live.generatedAt):'NO TIMESTAMP'}`;
  renderFreshness();
}
function nextRelease(){
  const schedule=state.live?.statcan?.schedule||[],now=new Date();
  for(const item of schedule){
    const target=zonedInstant(item.date,8,30,'America/Toronto');
    if(target.getTime()>now.getTime()-30*60000)return{item,target};
  }
  return schedule[0]?{item:schedule[0],target:zonedInstant(schedule[0].date,8,30,'America/Toronto')}:null;
}
function renderReleaseClock(){
  const next=nextRelease();
  if(!next)return;
  const delta=next.target.getTime()-Date.now();
  $('statcan-countdown').textContent=countdown(delta);
}
function renderStatCan(){
  const s=state.live?.statcan;
  if(!s)return;
  const next=nextRelease();
  if(next){
    $('statcan-next-date').textContent=dateLabel(next.item.date)+' // 08:30 ET';
    $('statcan-next-title').textContent=next.item.title;
    $('statcan-next-description').textContent=next.item.description||'Major Statistics Canada release';
    $('statcan-next-link').href=next.item.url||'https://www150.statcan.gc.ca/n1/dai-quo/index-eng.html';
  }
  const changed=s.changed||{};
  $('statcan-updated-count').textContent=Number.isFinite(changed.count)?num(changed.count):'—';
  $('statcan-updated-date').textContent=changed.date?`${dateLabel(changed.date)} · WDS changed-table list`:'No recent release-day list available.';
  const changedItems=(changed.items||[]).slice(0,4);
  $('statcan-changed-list').innerHTML=changedItems.map(item=>`<a href="${esc(item.url||'https://www.statcan.gc.ca/en/subjects-start')}" target="_blank" rel="noreferrer"><span>${esc(String(item.productId))}</span><strong>${esc(item.title)}</strong></a>`).join('');
  const rows=(s.indicators||[]).slice(0,6);
  $('indicator-grid').innerHTML=rows.length?rows.map(i=>{
    const cls=i.direction==='2'?'down':i.direction==='1'?'':'flat';
    const arrow=i.direction==='2'?'↓':i.direction==='1'?'↑':'•';
    return`<a class="indicator-card" href="${esc(i.url||'https://www.statcan.gc.ca/en/subjects-start')}" target="_blank" rel="noreferrer"><small>${esc(i.releaseDate)} // ${esc(i.reference)}</small><strong>${esc(i.value)}</strong><span>${esc(i.title)}</span><em class="${cls}">${arrow} ${esc(i.growth||'LATEST')} ${esc(i.growthDetail||'')}</em></a>`;
  }).join(''):'<div class="loading">INDICATOR SNAPSHOT UNAVAILABLE</div>';
  renderReleaseClock();renderFreshness();
  if(state.snapshot){
    renderProvinces();
    renderTerritories();
  }
  if(state.focus)renderProvinceData();
}

async function search(query){
  const q=String(query||'').trim();if(!q)return;
  $('data-search-input').value=q;$('data-search-results').innerHTML='<div class="search-empty">SEARCHING…</div>';
  try{
    const j=await json(`${LIVE.search}?rows=6&q=${encodeURIComponent(q)}`),rows=j?.result?.results||[];
    $('data-search-results').innerHTML=rows.length?rows.map(r=>`<a class="result" target="_blank" rel="noreferrer" href="https://open.canada.ca/data/en/dataset/${r.id}"><small>${esc(r.organization?.title||'Open Government')}</small><strong>${esc(r.title_translated?.en||r.title||r.name)}</strong></a>`).join(''):'<div class="search-empty">NO MATCHES.</div>';
  }catch{$('data-search-results').innerHTML='<div class="search-empty">SEARCH UNAVAILABLE.</div>'}
}
function setShift(value,commit=false){
  state.shift=Number(value);$('time-shift').value=state.shift;
  $('time-shift-label').textContent=state.shift===0?'LIVE':(state.shift>0?'+':'−')+Math.abs(state.shift)+'H';
  $('pulse-mode').innerHTML=state.shift===0?'<i></i> LIVE CLOCK':'TIME MACHINE';
  if(commit){
    const u=new URL(location.href);state.shift?u.searchParams.set('shift',state.shift):u.searchParams.delete('shift');history.replaceState(null,'',u);
  }
  recompute();
}

$('focus-reset').onclick=()=>focus(null);
$('region-select').onchange=e=>focus(e.target.value||null);
$('time-shift').onchange=e=>setShift(e.target.value,true);
$('time-shift').oninput=e=>{$('time-shift-label').textContent=e.target.value==0?'LIVE':(e.target.value>0?'+':'−')+Math.abs(e.target.value)+'H'};
$('now-button').onclick=()=>setShift(0,true);
$('share-button').onclick=async()=>{
  const text=state.snapshot?`Who Up North? ${pct(state.snapshot.national.awakePercent)} of the modelled Canadian 15+ survey scope is awake right now.`:'Who Up North? Canada, right now.';
  try{
    if(navigator.share)await navigator.share({title:'Who Up North?',text,url:location.href});
    else{await navigator.clipboard.writeText(text+' '+location.href);toast('Snapshot link copied.')}
  }catch{}
};
$('live-refresh').onclick=()=>loadLive();
$('data-search-form').onsubmit=e=>{e.preventDefault();search($('data-search-input').value)};
document.querySelectorAll('[data-search-query]').forEach(b=>b.onclick=()=>search(b.dataset.searchQuery));
const initialUrl=new URL(location.href);
const sh=Number(initialUrl.searchParams.get('shift')||0);
if(Number.isFinite(sh)&&Math.abs(sh)<=12)state.shift=sh;
const initialRegion=String(initialUrl.searchParams.get('region')||'').toLowerCase();
if(/^(bc|ab|sk|mb|on|qc|nb|ns|pe|nl|yt|nt|nu)$/.test(initialRegion))state.focus=initialRegion;
setInterval(renderTicker,1000);
setInterval(()=>{if(state.shift===0&&state.profile)recompute()},60000);
setInterval(()=>{if(document.visibilityState==='visible')loadLive({auto:true,includeBank:false})},300000);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&(!state.lastCheckAt||Date.now()-state.lastCheckAt.getTime()>300000))loadLive({auto:true,includeBank:false})});
init();
