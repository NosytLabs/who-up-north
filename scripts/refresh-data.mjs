import{mkdir,writeFile}from'node:fs/promises';
import{ACTIVITIES,AGE_15_PLUS_SHARE,VERIFIED_POPULATION}from'../src/model.js';

const OUT=new URL('../public/data/',import.meta.url);
await mkdir(OUT,{recursive:true});

const TF='https://www150.statcan.gc.ca/t1/wds/sdmx/statcan/rest/data/DF_45100105';
const POP='https://www150.statcan.gc.ca/t1/wds/rest/getDataFromCubePidCoordAndLatestNPeriods';
const AGE='https://www150.statcan.gc.ca/t1/wds/sdmx/statcan/rest/data/DF_17100005/1.1.1+7+13+19?lastNObservations=1';
const WEATHER='https://api.weather.gc.ca/collections/weather-alerts/items?f=json&limit=16';
const OG='https://open.canada.ca/data/en/api/3/action/recently_changed_packages_activity_list?limit=10';
const BANK='https://www.bankofcanada.ca/valet/observations/FXUSDCAD/json?recent=1';
const STATCAN_IND='https://www150.statcan.gc.ca/n1/dai-quo/ssi/homepage/ind-econ.json';
const STATCAN_SCHEDULE='https://www150.statcan.gc.ca/n1/dai-quo/ssi/homepage/schedule-key_indicators-eng.json';
const STATCAN_CHANGED='https://www150.statcan.gc.ca/t1/wds/rest/getChangedCubeList';

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
function openSnapshot(o){
  return{
    status:o?.success?'ready':'error',
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
async function changedTables(){
  let day=easternDate();
  for(let i=0;i<8;i++,day=addDays(day,-1)){
    const r=await fetch(`${STATCAN_CHANGED}/${day}`,{headers:{accept:'application/json'}});
    if(r.status===409||r.status===404)continue;
    if(!r.ok)throw new Error(`StatCan changed cube list ${day} -> ${r.status}`);
    const j=await r.json();
    const rows=Array.isArray(j?.object)?j.object.flat(Infinity).filter(x=>x&&Number.isFinite(Number(x.productId))):[];
    return{
      status:'ready',
      date:day,
      count:rows.length,
      releaseTime:rows[0]?.releaseTime||null,
      productIds:rows.slice(0,40).map(x=>Number(x.productId))
    };
  }
  return{status:'empty',date:null,count:0,productIds:[]};
}

async function live(){
  const all=await Promise.allSettled([
    fetch(WEATHER).then(r=>{if(!r.ok)throw new Error(r.status);return r.json()}),
    fetch(OG).then(r=>{if(!r.ok)throw new Error(r.status);return r.json()}),
    fetch(BANK).then(r=>{if(!r.ok)throw new Error(r.status);return r.json()}),
    fetch(STATCAN_IND).then(r=>{if(!r.ok)throw new Error(r.status);return r.json()}),
    fetch(STATCAN_SCHEDULE).then(r=>{if(!r.ok)throw new Error(r.status);return r.json()}),
    changedTables()
  ]);
  const val=i=>all[i].status==='fulfilled'?all[i].value:null;
  const w=val(0),o=val(1),b=val(2),ind=val(3),sched=val(4),changed=val(5);

  const out={
    generatedAt:new Date().toISOString(),
    weather:weatherSnapshot(w),
    openGovernment:openSnapshot(o),
    bank:bankSnapshot(b),
    statcan:{
      status:ind||sched||changed?'ready':'error',
      indicators:statcanIndicators(ind),
      schedule:statcanSchedule(sched),
      changed:changed||{status:'error',date:null,count:0,productIds:[]},
      source:{
        indicators:STATCAN_IND,
        schedule:STATCAN_SCHEDULE,
        changedTables:STATCAN_CHANGED
      }
    }
  };

  await writeFile(new URL('live-signals.json',OUT),JSON.stringify(out));
  console.log(`signals: ok; StatCan indicators=${out.statcan.indicators.length}, upcoming=${out.statcan.schedule.length}, changed=${out.statcan.changed.count}`);
}

await Promise.all([timeUse(),population(),live()]);
