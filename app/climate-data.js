/* Standalone descriptive climate statistics. No simulation dependencies. */
window.ClimateData = (() => {
 const finite=x=>typeof x==='number' && Number.isFinite(x);
 const mean=a=>a.length?a.reduce((s,x)=>s+x,0)/a.length:null;
 const percentile=(a,p)=>{if(!a.length)return null;const sorted=[...a].sort((x,y)=>x-y),i=(sorted.length-1)*p,lo=Math.floor(i);return sorted[lo]+(sorted[Math.ceil(i)]-sorted[lo])*(i-lo);};
 function range(year,month,part){
  const last=new Date(Date.UTC(year,month,0)).getUTCDate();
  const [first,end]=part==='early'?[1,10]:part==='middle'?[11,20]:part==='late'?[21,last]:[1,last];
  const date=d=>`${year}-${String(month).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
  return {start:date(first),end:date(end),hours:(end-first+1)*24};
 }
 function summarize(records){
  const temps=[],humidity=[],speed=[],precip=[],sectors=Array(8).fill(0);let calm=0,validWind=0,expected=0;
  const cover=[];
  for(const record of records){
   const h=record.data.hourly,u=record.data.hourly_units;
   if(!h||!Array.isArray(h.time)||u?.wind_speed_10m!=='m/s'||u?.temperature_2m!=='°C'||u?.precipitation!=='mm')throw Error('The archive returned unexpected fields or units.');
   expected+=record.expected;
   let windN=0;
   for(let i=0;i<h.time.length;i++){
    const t=h.temperature_2m?.[i],rh=h.relative_humidity_2m?.[i],p=h.precipitation?.[i],v=h.wind_speed_10m?.[i],d=h.wind_direction_10m?.[i];
    if(finite(t))temps.push(t);if(finite(rh)&&rh>=0&&rh<=100)humidity.push(rh);if(finite(p)&&p>=0)precip.push(p);
    if(finite(v)&&v>=0&&finite(d)&&d>=0&&d<=360){speed.push(v);validWind++;windN++;if(v<.5)calm++;else sectors[Math.round((d%360)/45)%8]++;}
   }
   cover.push({year:record.year,windHours:windN,expected:record.expected});
  }
  if(!validWind)throw Error('No valid wind samples were returned.');
  return {meanTemperature:mean(temps),temperatureP10:percentile(temps,.1),temperatureP90:percentile(temps,.9),meanHumidity:mean(humidity),meanSpeed:mean(speed),speedP10:percentile(speed,.1),speedP90:percentile(speed,.9),wetPercent:precip.length?precip.filter(p=>p>=.1).length/precip.length*100:null,meanPrecipPerHour:mean(precip),calm,sectors,validWind,expected,coverage:cover,samples:{temperature:temps.length,humidity:humidity.length,precipitation:precip.length}};
 }
 async function fetchPeriod({lat,lng,month,part,years},signal,progress=()=>{}){
  if(!finite(lat)||!finite(lng)||Math.abs(lat)>90||Math.abs(lng)>180||!Number.isInteger(month)||month<1||month>12||![3,5,10].includes(years)||!['all','early','middle','late'].includes(part))throw Error('Choose valid coordinates and a supported period.');
  const endYear=new Date().getUTCFullYear()-1,startYear=endYear-years+1,records=[];
  for(let year=startYear;year<=endYear;year++){
   signal?.throwIfAborted();const r=range(year,month,part);
   const q=new URLSearchParams({latitude:String(lat),longitude:String(lng),start_date:r.start,end_date:r.end,models:'era5',timezone:'GMT',wind_speed_unit:'ms',hourly:'temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m,wind_direction_10m'});
   const controller=new AbortController(),cancel=()=>controller.abort();signal?.addEventListener('abort',cancel,{once:true});const timeout=setTimeout(cancel,30000);
   try{
    const response=await fetch('https://archive-api.open-meteo.com/v1/archive?'+q,{signal:controller.signal});
    if(!response.ok)throw Error(response.status===429?'Archive rate limit reached. Try again later.':'Archive request failed (HTTP '+response.status+').');
    const data=await response.json();if(data.error)throw Error(data.reason||'Archive error');
    records.push({year,expected:r.hours,data});progress(records.length,years);
   }finally{clearTimeout(timeout);signal?.removeEventListener('abort',cancel);}
  }
  return {...summarize(records),lat,lng,month,part,startYear,endYear,years,fetched:new Date().toISOString(),provider:'Open-Meteo / ERA5',gridLatitude:records[0].data.latitude,gridLongitude:records[0].data.longitude};
 }
 return {range,summarize,fetchPeriod};
})();
