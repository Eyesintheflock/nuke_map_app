(() => {
 const el=id=>document.getElementById(id),months=['January','February','March','April','May','June','July','August','September','October','November','December'];
 months.forEach((name,i)=>{const option=document.createElement('option');option.value=String(i+1);option.textContent=name;el('climateMonth').appendChild(option);});
 const params=new URLSearchParams(location.search);
 el('climateLat').value=params.get('lat')||'45.85';el('climateLng').value=params.get('lng')||'-123.49';el('climateMonth').value=String(new Date().getMonth()+1);
 let active=null;
 const fmt=(x,unit='')=>Number.isFinite(x)?x.toFixed(1)+unit:'Unavailable';
 function render(r,cached){
  el('climateResults').hidden=false;el('climateCache').textContent=cached?'Saved summary · no new request':'Fetched archive data';
  const part={all:'',early:'Early ',middle:'Mid ',late:'Late '}[r.part];el('climatePeriod').textContent=`${part}${months[r.month-1]} · ${r.startYear}–${r.endYear}`;
  el('climateLocation').textContent=`Requested location ${r.lat.toFixed(2)}, ${r.lng.toFixed(2)} · ${r.provider} · Grid ${fmt(r.gridLatitude)}°, ${fmt(r.gridLongitude)}°`;
  el('climateSpeed').textContent=fmt(r.meanSpeed,' m/s');el('climateSpeedRange').textContent=`Middle 80%: ${fmt(r.speedP10)}–${fmt(r.speedP90)} m/s`;
  el('climateTemp').textContent=fmt(r.meanTemperature,' °C');el('climateTempRange').textContent=`Middle 80%: ${fmt(r.temperatureP10)}–${fmt(r.temperatureP90)} °C`;
  el('climateHumidity').textContent=fmt(r.meanHumidity,'%');el('climateWet').textContent=fmt(r.wetPercent,'%');
  const host=el('climateDirections');host.replaceChildren();['N','NE','E','SE','S','SW','W','NW'].forEach((name,i)=>{const pct=r.sectors[i]/r.validWind*100,row=document.createElement('div'),label=document.createElement('span'),track=document.createElement('div'),bar=document.createElement('div'),value=document.createElement('output');row.className='direction';label.textContent=name;track.className='track';bar.className='bar';bar.style.width=pct+'%';value.textContent=fmt(pct,'%');track.append(bar);row.append(label,track,value);host.append(row);});
  el('climateCalm').textContent=`Calm hours: ${fmt(r.calm/r.validWind*100,'%')}. No single prevailing direction is assumed.`;
  el('climateCoverage').textContent=`Coverage: ${r.validWind.toLocaleString()} valid wind hours of ${r.expected.toLocaleString()} expected (${fmt(r.validWind/r.expected*100,'%')}). Temperature ${r.samples.temperature.toLocaleString()}, humidity ${r.samples.humidity.toLocaleString()}, precipitation ${r.samples.precipitation.toLocaleString()} valid samples. UTC calendar windows.`;
  el('climateFetched').textContent=`Archive fetched ${new Date(r.fetched).toLocaleString()}. Source: ${r.provider}.`;
 }
 el('cancelClimate').onclick=()=>active?.abort();
 el('climateForm').onsubmit=async e=>{
  e.preventDefault();if(active)return;const query={lat:+el('climateLat').value,lng:+el('climateLng').value,month:+el('climateMonth').value,part:el('climatePart').value,years:+el('climateYears').value};
  const key='climate-summary-v1:'+JSON.stringify({...query,end:new Date().getUTCFullYear()-1});
  el('climateStatus').classList.remove('error');el('climateResults').hidden=true;
  try{const raw=localStorage.getItem(key);if(raw){const cached=JSON.parse(raw);if(cached.validWind>0&&Array.isArray(cached.sectors)&&cached.sectors.length===8&&cached.samples&&cached.years===query.years){render(cached,true);el('climateStatus').textContent='Showing the saved summary for this exact location and period.';return;}}}catch{}
  active=new AbortController();el('loadClimate').disabled=true;el('cancelClimate').hidden=false;el('climateStatus').textContent=`Loading ${query.years} yearly archive windows…`;
  try{
   const summary=await ClimateData.fetchPeriod(query,active.signal,(n,total)=>{el('climateStatus').textContent=`Loaded ${n} of ${total} yearly windows…`;});
   active.signal.throwIfAborted();render(summary,false);el('climateStatus').textContent='Historical summary ready.';
   try{
    const keys=Object.keys(localStorage).filter(k=>k.startsWith('climate-summary-v1:'));while(keys.length>=8)localStorage.removeItem(keys.shift());localStorage.setItem(key,JSON.stringify(summary));
   }catch{el('climateStatus').textContent+=' Device storage unavailable; this result will not be saved.';}
  }catch(error){el('climateStatus').classList.add('error');el('climateStatus').textContent=active.signal.aborted?'Loading canceled. No partial summary was used.':'Could not load the complete archive: '+error.message+' No partial summary was used.';}
  finally{active=null;el('loadClimate').disabled=false;el('cancelClimate').hidden=true;}
 };
})();
