import{mkdir,writeFile}from'node:fs/promises';
import{ACTIVITIES,AGE_15_PLUS_SHARE,VERIFIED_POPULATION}from'../src/model.js';

const OUT=new URL('../public/data/',import.meta.url);
await mkdir(OUT,{recursive:true});

const TF='https://www150.statcan.gc.ca/t1/wds/sdmx/statcan/rest/data/DF_45100105';
const POP='https://www150.statcan.gc.ca/t1/wds/rest/getDataFromCubePidCoordAndLatestNPeriods';
const AGE='https://www150.statcan.gc.ca/t1/wds/sdmx/statcan/rest/data/DF_17100005/1.1.1+7+13+19?lastNObservations=1';
const WEATHER='https://api.weather.gc.ca/collections/weather-alerts/items?f=json&limit=16';
const OG='https://open.canada.ca/data/en/api/3/action/recently_changed_packages_activity_list?limit=10';
const OG_RECENT_COUNT='https://open.canada.ca/data/en/api/3/action/package_search?rows=0&fq=metadata_modified%3A%5BNOW-1DAY%20TO%20NOW%5D';
const BANK='https://www.bankofcanada.ca/valet/observations/FXUSDCAD/json?recent=1';
const STATCAN_IND='https://www150.statcan.gc.ca/n1/dai-quo/ssi/homepage/ind-econ.json';
const STATCAN_SCHEDULE='https://www150.statcan.gc.ca/n1/dai-quo/ssi/homepage/schedule-key_indicators-eng.json';
const STATCAN_CHANGED='https://www150.statcan.gc.ca/t1/wds/rest/getChangedCubeList';
const STATCAN_META='https://www150.statcan.gc.ca/t1/wds/rest/getCubeMetadata';
const STATCAN_BOUNDARIES='https://geo.statcan.gc.ca/geo_wa/rest/services/2021/Digital_boundary_files/MapServer/0/query?where=1%3D1&outFields=PRUID%2CPRNAME%2CPREABBR&returnGeometry=true&outSR=4326&geometryPrecision=3&maxAllowableOffset=0.05&f=geojson';
const GOV_MB_BOUNDARIES='https://geoportal.gov.mb.ca/api/download/v1/items/e46938cbb3e84c3688d03b8622d8f212/geojson?layers=0';

const POP_PRODUCT_ID=17100009;
const V={canada:1,nl:2,pe:3,ns:4,nb:5,qc:6,on:7,mb:8,sk:9,ab:10,bc:11,yt:12,nt:14,nu:15};

async function get(url,opt){
  const r=await fetch(url,opt);
  if(!r.ok)throw new Error(`${url} -> ${r.status}`);
  return r;
}
function blocks(xml){return xml.match(/<generic:Series>[\s\S]*?<\/generic:Series>/g)||[]}
function fld(b,id){return b.match(new RegExp(`id="${id}" value="([^"]+)"`,'i'))?.[1]}
function complete(s){return ACTIVITIES.every(a=>Number.isFinite(s?.[a.key]))}
function fillIncomplete(bucket,meta){
  const ok=[];
  for(let i=1;i<=288;i++)if(complete(bucket[String(i)]))ok.push(i);
  if(!ok.length)throw new Error('No complete official time-use vectors');
  for(let i=1;i<=288;i++){
    if(complete(bucket[String(i)]))continue;
    const from=ok.reduce((best,j)=>{
      const d=Math.min(Math.abs(i-j),288-Math.abs(i-j));
      const bd=Math.min(Math.abs(i-best),288-Math.abs(i-best));
      return d<bd?j:best;
    },ok[0]);
    bucket[String(i)]={...bucket[String(from)]};
    meta[String(i)]=from;
  }
  return Object.keys(meta).length;
}
function easternDate(date=new Date()){
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Toronto',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date);
  const p=Object.fromEntries(parts.filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}
function addDays(iso,days){
  const d=new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate()+days);
  return d.toISOString().slice(0,10);
}

async function timeUse(){
  const times=Array.from({length:288},(_,i)=>i+1).join('+');
  const acts=ACTIVITIES.map(a=>a.code).join('+');
  const url=`${TF}/1.${acts}.${times}.2+3.1.1`;
  const xml=await(await get(url,{headers:{accept:'application/vnd.sdmx.genericdata+xml;version=2.1, application/xml'}})).text();
  const out={
    generatedAt:new Date().toISOString(),
    source:{
      agency:'Statistics Canada',
      table:'45-10-0105-01',
      dataflow:'DF_45100105',
      survey:'2022 Time Use Survey',
      scope:'Non-institutionalized persons aged 15+ in the ten provinces',
      url:'https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=4510010501'
    },
    gapFill:{
      method:'nearest-complete-official-vector',
      note:'If StatCan suppresses any component in a five-minute slot, the entire displayed vector is copied from the nearest complete official slot in the same weekday/weekend series.',
      weekdays:{},weekends:{}
    },
    weekdays:{},weekends:{}
  };
  const key=Object.fromEntries(ACTIVITIES.map(a=>[a.code,a.key]));

  for(const b of blocks(xml)){
    const a=key[fld(b,'Activity_group')],t=fld(b,'Time_of_day'),d=fld(b,'Type_of_day');
    const v=Number(b.match(/<generic:ObsValue value="([^"]+)"/i)?.[1]);
    if(!a||!t||!Number.isFinite(v))continue;
    const bucket=d==='2'?out.weekdays:d==='3'?out.weekends:null;
    if(bucket)(bucket[t]||={})[a]=v;
  }

  for(const n of['weekdays','weekends']){
    if(Object.keys(out[n]).length!==288)throw new Error(`${n} has ${Object.keys(out[n]).length}/288 raw slots`);
    const filled=fillIncomplete(out[n],out.gapFill[n]);
    for(let i=1;i<=288;i++)if(!complete(out[n][String(i)]))throw new Error(`${n} ${i} remains incomplete`);
    console.log(`${n}: ${filled} suppressed/incomplete slots mapped to nearest complete official vector`);
  }

  await writeFile(new URL('time-use-profile.json',OUT),JSON.stringify(out));
  console.log('time-use: ok');
}

async function ageShare(){
  const xml=await(await get(AGE,{headers:{accept:'application/vnd.sdmx.genericdata+xml;version=2.1, application/xml'}})).text();
  const vals={};
  for(const b of blocks(xml)){
    const c=fld(b,'Age_group'),v=Number(b.match(/<generic:ObsValue value="([^"]+)"/i)?.[1]);
    if(c&&Number.isFinite(v))vals[c]=v;
  }
  for(const c of['1','7','13','19'])if(!Number.isFinite(vals[c]))throw new Error('age table missing '+c);
  return{share:(vals['1']-vals['7']-vals['13']-vals['19'])/vals['1'],allAges:vals['1'],under15:vals['7']+vals['13']+vals['19']};
}

async function population(){
  try{
    const geographyCodes=Object.values(V);
    const body=JSON.stringify(geographyCodes.map(code=>({
      productId:POP_PRODUCT_ID,
      coordinate:`${code}.0.0.0.0.0.0.0.0.0`,
      latestN:1
    })));
    const rows=await(await get(POP,{method:'POST',headers:{accept:'application/json','content-type':'application/json'},body})).json();
    const byGeo=new Map(Object.entries(V).map(([id,code])=>[Number(code),id])),values={},periods=new Set;

    for(const row of rows){
      const obj=row?.object;
      if(obj&&Number(obj.productId)!==POP_PRODUCT_ID)throw new Error(`population coordinate resolved to unexpected product ${obj.productId}`);
      const geoCode=Number(String(obj?.coordinate||'').split('.')[0]);
      const id=byGeo.get(geoCode);
      const p=obj?.vectorDataPoint?.filter(x=>Number.isFinite(Number(x?.value)))?.sort((a,b)=>String(b.refPer).localeCompare(String(a.refPer)))?.[0];
      if(id&&p){values[id]=Number(p.value);periods.add(String(p.refPer))}
    }

    for(const id of Object.keys(V))if(!Number.isFinite(values[id]))throw new Error('missing population '+id);
    const age=await ageShare(),canada=values.canada;
    delete values.canada;

    const sumRegions=Object.values(values).reduce((sum,value)=>sum+value,0);
    if(sumRegions<canada*.98||sumRegions>canada*1.02)throw new Error(`province/territory sum ${sumRegions} does not reconcile with Canada ${canada}`);

    const out={
      strategy:'live-wds-coordinate',
      generatedAt:new Date().toISOString(),
      asOf:[...periods].sort().at(-1),
      canada,values,
      age15PlusShare:age.share,
      ageDenominator:age,
      source:{
        agency:'Statistics Canada',
        populationTable:'17-10-0009-01',
        populationProductId:POP_PRODUCT_ID,
        ageTable:'17-10-0005-01',
        method:'getDataFromCubePidCoordAndLatestNPeriods'
      }
    };
    await writeFile(new URL('population.json',OUT),JSON.stringify(out));
    console.log('population: ok');
  }catch(e){
    await writeFile(new URL('population.json',OUT),JSON.stringify({...VERIFIED_POPULATION,generatedAt:new Date().toISOString(),age15PlusShare:AGE_15_PLUS_SHARE,fallbackReason:String(e.message||e)}));
    console.warn('population fallback:',e.message);
  }
}
function weatherSnapshot(w){
  return{
    status:w?'ready':'error',
    numberMatched:w?.numberMatched??w?.features?.length??0,
    items:(w?.features||[]).slice(0,10).map(f=>({
      id:f.id,
      name:f.properties?.alert_short_name_en||f.properties?.alert_name_en,
      feature:f.properties?.feature_name_en,
      province:f.properties?.province,
      risk:f.properties?.risk_colour_en,
      published:f.properties?.publication_datetime
    }))
  };
}
function openSnapshot(o,recent){
  return{
    status:o?.success?'ready':'error',
    changedLast24h:Number.isFinite(Number(recent?.result?.count))?Number(recent.result.count):null,
    items:(o?.result||[]).slice(0,10).map(r=>({
      timestamp:r.timestamp,
      id:r.object_id,
      title:r.data?.package?.title_translated?.en||r.data?.package?.title||r.data?.package?.name||'Updated dataset',
      organization:r.data?.package?.organization?.title||r.data?.package?.owner_org||'',
      url:`https://open.canada.ca/data/en/dataset/${r.object_id}`
    }))
  };
}
function bankSnapshot(b){
  const row=b?.observations?.at(-1);
  return{
    status:row?.FXUSDCAD?.v?'ready':'error',
    date:row?.d||null,
    value:Number(row?.FXUSDCAD?.v)||null,
    description:b?.seriesDetail?.FXUSDCAD?.description||'Daily average USD/CAD'
  };
}
function statcanIndicators(data){
  const seen=new Set;
  return(data?.results?.indicators||[])
    .filter(x=>String(x.geo_code)==='0'&&x.title?.en&&x.value?.en&&x.release_date)
    .sort((a,b)=>String(b.release_date).localeCompare(String(a.release_date)))
    .filter(x=>{const k=x.title.en.toLowerCase();if(seen.has(k))return false;seen.add(k);return true})
    .slice(0,8)
    .map(x=>({
      title:x.title.en,
      value:x.value.en,
      reference:x.refper?.en||'',
      releaseDate:x.release_date,
      growth:x.growth_rate?.growth?.en||'',
      growthDetail:x.growth_rate?.details?.en||'',
      direction:x.growth_rate?.arrow_direction||'0',
      url:x.daily_url?.en?new URL(x.daily_url.en,'https://www150.statcan.gc.ca/n1').href:null
    }));
}
const INDICATOR_GEO={
  '1':'nl','2':'pe','3':'ns','4':'nb','5':'qc','6':'on','7':'mb',
  '8':'sk','9':'ab','10':'bc','11':'yt','12':'nt','13':'nu'
};
const PROVINCE_INDICATOR_MATCHERS=[
  ['unemployment',title=>title==='unemployment rate'],
  ['employment',title=>title==='employment level'],
  ['earnings',title=>title.startsWith('average weekly earnings')],
  ['building',title=>title.startsWith('building permits')],
  ['retail',title=>title.startsWith('retail sales')],
  ['gdp',title=>title.startsWith('annual real gross domestic product by industry')]
];
function statcanProvincialIndicators(data){
  const output={};
  const rows=(data?.results?.indicators||[])
    .filter(row=>INDICATOR_GEO[String(row.geo_code)]&&row.title?.en&&row.release_date)
    .sort((a,b)=>String(b.release_date).localeCompare(String(a.release_date)));

  for(const row of rows){
    const title=String(row.title.en).trim(),normalized=title.toLowerCase();
    const match=PROVINCE_INDICATOR_MATCHERS.find(([,test])=>test(normalized));
    const value=String(row.value?.en??'').trim();
    if(!match||!value)continue;

    const id=INDICATOR_GEO[String(row.geo_code)],key=match[0];
    output[id]||={geoCode:String(row.geo_code),indicators:{}};
    if(output[id].indicators[key])continue;

    output[id].indicators[key]={
      key,
      title,
      value,
      reference:row.refper?.en||'',
      releaseDate:row.release_date,
      growth:row.growth_rate?.growth?.en||'',
      growthDetail:row.growth_rate?.details?.en||'',
      direction:row.growth_rate?.arrow_direction||'0',
      url:row.daily_url?.en?new URL(row.daily_url.en,'https://www150.statcan.gc.ca/n1').href:null
    };
  }

  return output;
}
function statcanSchedule(data){
  const today=easternDate();
  return(data||[])
    .filter(x=>x?.date&&String(x.date).slice(0,10)>=today&&x.title)
    .sort((a,b)=>String(a.date).localeCompare(String(b.date)))
    .slice(0,12)
    .map(x=>({
      date:String(x.date).slice(0,10),
      title:x.title,
      description:x.description||'',
      url:x.url?new URL(x.url,'https://www150.statcan.gc.ca/n1').href:null
    }));
}
async function cubeMetadata(productIds){
  if(!productIds.length)return[];
  const response=await get(STATCAN_META,{
    method:'POST',
    headers:{accept:'application/json','content-type':'application/json'},
    body:JSON.stringify(productIds.map(productId=>({productId})))
  });
  const rows=await response.json();
  return(rows||[]).map(row=>row?.object).filter(Boolean).map(meta=>({
    productId:Number(meta.productId),
    title:meta.cubeTitleEn||`Statistics Canada table ${meta.productId}`,
    releaseTime:meta.releaseTime||null,
    url:`https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=${String(meta.productId).length===8?String(meta.productId)+'01':String(meta.productId)}`
  }));
}
async function changedTables(){
  let day=easternDate();
  for(let i=0;i<8;i++,day=addDays(day,-1)){
    const r=await fetch(`${STATCAN_CHANGED}/${day}`,{headers:{accept:'application/json'}});
    if(r.status===409||r.status===404)continue;
    if(!r.ok)throw new Error(`StatCan changed cube list ${day} -> ${r.status}`);
    const j=await r.json();
    const rows=Array.isArray(j?.object)?j.object.flat(Infinity).filter(x=>x&&Number.isFinite(Number(x.productId))):[];
    const productIds=rows.slice(0,40).map(x=>Number(x.productId));
    const items=await cubeMetadata(productIds.slice(0,6)).catch(()=>[]);
    return{
      status:'ready',
      date:day,
      count:rows.length,
      releaseTime:rows[0]?.releaseTime||null,
      productIds,
      items
    };
  }
  return{status:'empty',date:null,count:0,productIds:[],items:[]};
}

async function live(){
  const all=await Promise.allSettled([
    fetch(WEATHER).then(r=>{if(!r.ok)throw new Error(r.status);return r.json()}),
    fetch(OG).then(r=>{if(!r.ok)throw new Error(r.status);return r.json()}),
    fetch(OG_RECENT_COUNT).then(r=>{if(!r.ok)throw new Error(r.status);return r.json()}),
    fetch(BANK).then(r=>{if(!r.ok)throw new Error(r.status);return r.json()}),
    fetch(STATCAN_IND).then(r=>{if(!r.ok)throw new Error(r.status);return r.json()}),
    fetch(STATCAN_SCHEDULE).then(r=>{if(!r.ok)throw new Error(r.status);return r.json()}),
    changedTables()
  ]);
  const val=i=>all[i].status==='fulfilled'?all[i].value:null;
  const w=val(0),o=val(1),recentOpen=val(2),b=val(3),ind=val(4),sched=val(5),changed=val(6);

  const out={
    generatedAt:new Date().toISOString(),
    weather:weatherSnapshot(w),
    openGovernment:openSnapshot(o,recentOpen),
    bank:bankSnapshot(b),
    statcan:{
      status:ind||sched||changed?'ready':'error',
      indicators:statcanIndicators(ind),
      provinces:statcanProvincialIndicators(ind),
      schedule:statcanSchedule(sched),
      changed:changed||{status:'error',date:null,count:0,productIds:[],items:[]},
      source:{
        indicators:STATCAN_IND,
        schedule:STATCAN_SCHEDULE,
        changedTables:STATCAN_CHANGED
      }
    }
  };

  await writeFile(new URL('live-signals.json',OUT),JSON.stringify(out));
  console.log(`signals: ok; StatCan indicators=${out.statcan.indicators.length}, province snapshots=${Object.keys(out.statcan.provinces).length}, upcoming=${out.statcan.schedule.length}, changed=${out.statcan.changed.count}`);
}


function sqSegDist(p,a,b){
  let x=a[0],y=a[1],dx=b[0]-x,dy=b[1]-y;
  if(dx!==0||dy!==0){
    const t=((p[0]-x)*dx+(p[1]-y)*dy)/(dx*dx+dy*dy);
    if(t>1){x=b[0];y=b[1]}else if(t>0){x+=dx*t;y+=dy*t}
  }
  dx=p[0]-x;dy=p[1]-y;return dx*dx+dy*dy;
}
function simplifyRing(points,tolerance=.035){
  if(!Array.isArray(points)||points.length<=5)return points;
  const closed=points[0][0]===points.at(-1)[0]&&points[0][1]===points.at(-1)[1],core=closed?points.slice(0,-1):points.slice(),sq=tolerance*tolerance;
  const markers=new Uint8Array(core.length);markers[0]=markers[core.length-1]=1;
  const stack=[[0,core.length-1]];
  while(stack.length){
    const [first,last]=stack.pop();let max=sq,index=-1;
    for(let i=first+1;i<last;i++){const d=sqSegDist(core[i],core[first],core[last]);if(d>max){index=i;max=d}}
    if(index>0){markers[index]=1;stack.push([first,index],[index,last])}
  }
  const out=core.filter((_,i)=>markers[i]);
  if(out.length<3)return points;
  if(closed)out.push([...out[0]]);
  return out;
}
function simplifyGeometry(geometry){
  if(geometry?.type==='Polygon')return{...geometry,coordinates:geometry.coordinates.map(r=>simplifyRing(r))};
  if(geometry?.type==='MultiPolygon')return{...geometry,coordinates:geometry.coordinates.map(poly=>poly.map(r=>simplifyRing(r)))};
  return geometry;
}
function webMercatorPoint([x,y]){
  const lon=x/20037508.34*180;
  const merc=y/20037508.34*180;
  const lat=180/Math.PI*(2*Math.atan(Math.exp(merc*Math.PI/180))-Math.PI/2);
  return[+lon.toFixed(5),+lat.toFixed(5)];
}
function reprojectWebMercator(geometry){
  if(geometry?.type==='Polygon')return{...geometry,coordinates:geometry.coordinates.map(r=>r.map(webMercatorPoint))};
  if(geometry?.type==='MultiPolygon')return{...geometry,coordinates:geometry.coordinates.map(poly=>poly.map(r=>r.map(webMercatorPoint)))};
  return geometry;
}
async function boundaries(){
  const allowed=new Set(['10','11','12','13','24','35','46','47','48','59','60','61','62']);
  const postalToPr={NL:'10',PE:'11',NS:'12',NB:'13',QC:'24',ON:'35',MB:'46',SK:'47',AB:'48',BC:'59',YT:'60',NT:'61',NU:'62'};
  let geo,source;
  try{
    geo=await(await get(STATCAN_BOUNDARIES,{headers:{accept:'application/geo+json, application/json'}})).json();
    if(geo?.type!=='FeatureCollection'||!Array.isArray(geo.features)||geo.features.length!==13)throw new Error('Unexpected Statistics Canada province boundary response');
    source={
      agency:'Statistics Canada',
      layer:'2021 Digital boundary files — provinces and territories',
      url:'https://geo.statcan.gc.ca/geo_wa/rest/services/2021/Digital_boundary_files/MapServer/0'
    };
  }catch(primaryError){
    const fallback=await(await get(GOV_MB_BOUNDARIES,{headers:{accept:'application/geo+json, application/json'}})).json();
    if(fallback?.type!=='FeatureCollection'||!Array.isArray(fallback.features))throw primaryError;
    geo={
      type:'FeatureCollection',
      features:fallback.features.filter(f=>postalToPr[String(f?.properties?.postal||'').toUpperCase()]).map(f=>{
        const postal=String(f.properties.postal).toUpperCase(),pruid=postalToPr[postal];
        return{
          type:'Feature',
          properties:{PRUID:pruid,PRNAME:f.properties.Name_EN||postal,PREABBR:postal},
          geometry:reprojectWebMercator(f.geometry)
        };
      })
    };
    source={
      agency:'Government of Manitoba',
      layer:'Canada Provincial boundaries, April 2022',
      url:GOV_MB_BOUNDARIES,
      catalogue:'https://open.canada.ca/data/en/dataset/85efc01b-163f-ebba-2378-c43eadfb3b3f',
      fallbackFor:'Statistics Canada 2021 Digital Boundary Files',
      fallbackReason:String(primaryError?.message||primaryError)
    };
    console.warn('StatCan boundaries unavailable; using official Government of Manitoba fallback:',primaryError?.message||primaryError);
  }

  if(geo.features.length!==13)throw new Error(`Boundary source returned ${geo.features.length}/13 regions`);
  const features=geo.features.map(feature=>{
    const id=String(feature?.properties?.PRUID||'');
    if(!allowed.has(id)||!feature.geometry)throw new Error('Invalid province/territory boundary feature');
    return{...feature,geometry:simplifyGeometry(feature.geometry)};
  });
  await writeFile(new URL('canada-provinces.geojson',OUT),JSON.stringify({
    type:'FeatureCollection',features,source,generatedAt:new Date().toISOString()
  }));
  console.log(`boundaries: ok (${source.agency})`);
}

await Promise.all([timeUse(),population(),live(),boundaries()]);
