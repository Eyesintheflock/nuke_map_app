/* === Utilities === */
const $=s=>document.querySelector(s);
const toRad=d=>d*Math.PI/180, toDeg=r=>r*180/Math.PI;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const bearingToCardinal=b=>['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'][Math.round(((b%360)+360)%360/22.5)%16];
const getCSS=v=>getComputedStyle(document.documentElement).getPropertyValue(v).trim();
function lsGet(k,def){ try{const v=localStorage.getItem(k); return v?JSON.parse(v):def;}catch{return def} }
function lsSet(k,v){ try{localStorage.setItem(k,JSON.stringify(v));}catch{} }
const showErr=msg=>{ const e=$('#err'); e.textContent=msg; e.style.display='block'; };

/* === Map globals === */
let useML=false, mlmap, lmap;
let addMode=false, windDeg=lsGet('windDeg',90), windSpd=lsGet('windSpd',10);
let effects=[]; let myPos=null; let popHeatLayer=null; let shelterMarkers=[]; let lastBurst=null; let counties=null;

/* === Boot flags / feature tests === */
function getFlag(name){ return new URLSearchParams(location.search).has(name); }
function webglOk(){
  try {
    if (getFlag('leaf')) return false;
    const c = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (c.getContext('webgl') || c.getContext('experimental-webgl')));
  } catch { return false; }
}

/* === Map init with robust fallback === */
function initMap(){
  const start=[45.85,-123.49];

  const bootLeaflet = () => {
    useML = false;
    $('#mlmap').style.display='none';
    lmap = L.map('map', { zoomControl: true }).setView(start, 9);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {maxZoom: 19, attribution: '© OSM'}).addTo(lmap);
    L.tileLayer('https://tiles.wmflabs.org/hillshading/{z}/{x}/{y}.png', {opacity:0.5}).addTo(lmap);
    lmap.on('click', e => { if(addMode){ placeBurst([e.latlng.lat,e.latlng.lng]); addMode=false; $('#add').classList.remove('active'); }});
  };

  if (!webglOk()) return bootLeaflet();

  try {
    useML = true;
    $('#map').style.display='none';

    mlmap = new maplibregl.Map({
      container:'mlmap',
      style:{
        "version":8,
        "sources":{
          "osm":{"type":"raster","tiles":[
            "https://a.tile.openstreetmap.org/{z}/{x}/{y}.png",
            "https://b.tile.openstreetmap.org/{z}/{x}/{y}.png",
            "https://c.tile.openstreetmap.org/{z}/{x}/{y}.png"
          ],"tileSize":256,"attribution":"© OSM"},
          "terrain-dem":{"type":"raster-dem","tiles":["https://demotiles.maplibre.org/terrain-tiles/{z}/{x}/{y}.png"],"tileSize":256}
        },
        "layers":[
          {"id":"baseraster","type":"raster","source":"osm","minzoom":0,"maxzoom":19},
          {"id":"hillshade","type":"hillshade","source":"terrain-dem","layout":{"visibility":"none"},"paint":{"hillshade-exaggeration":0.6}}
        ]
      },
      center:[start[1],start[0]], zoom:9, pitch:0, antialias:false
    });

    mlmap.addControl(new maplibregl.NavigationControl({visualizePitch:true}),'top-left');
    mlmap.addControl(new maplibregl.ScaleControl({maxWidth:120,unit:'imperial'}));
    mlmap.on('error', e => console.warn('MapLibre error:', e && e.error));
    mlmap.on('click', e => {
      if(addMode){
        placeBurst([e.lngLat.lat,e.lngLat.lng]);
        addMode=false; $('#add').classList.remove('active');
      }
    });
  } catch (e) {
    console.warn('MapLibre init failed, falling back to Leaflet:', e);
    bootLeaflet();
  }
}
window.addEventListener('load', initMap);

/* === Panels === */
for(const p of document.querySelectorAll('.panel header')){
  p.addEventListener('click',()=>p.parentElement.classList.toggle('open'));
}

/* === Top bar === */
$('#preset').onchange=e=>{ if(e.target.value!=='custom') $('#yield').value=e.target.value; };
$('#add').onclick=()=>{ addMode=!addMode; $('#add').classList.toggle('active',addMode); };
$('#clear').onclick=()=>{ clearMap(); };
$('#refreshTiles').onclick=()=>{ refreshTiles(); };
$('#btnRefresh2').onclick=()=>{ refreshTiles(); };
$('#bmSel').onchange=e=>{ $('#basemap').value=e.target.value; refreshTiles(); };
$('#basemap').onchange=()=>{ refreshTiles(); };
$('#precip').oninput=e=>{ $('#precipVal').textContent=e.target.value; };
$('#humid').oninput=e=>{ $('#humidVal').textContent=e.target.value; };
$('#calcPop').onclick=calcPopulation;

$('#terrainOn').onchange=()=>toggleTerrain();
$('#hillshadeOn').onchange=()=>toggleHillshade();
$('#exagg').oninput=e=>{ $('#exVal').textContent=e.target.value; setExaggeration(+e.target.value); };

/* === Basemap switching === */
function ensureSatSource(){
  if (!useML) return;
  if (!mlmap.getSource('sat')) {
    mlmap.addSource('sat', {
      type:'raster',
      tiles:['https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
      tileSize:256,
      attribution:'Imagery © Esri'
    });
  }
}
function refreshTiles(){
  if(useML){
    const sel=$('#basemap').value;
    if (mlmap.getLayer('baseraster')) mlmap.removeLayer('baseraster');
    if (sel==='sat'){ ensureSatSource(); mlmap.addLayer({id:'baseraster',type:'raster',source:'sat'}, 'hillshade'); }
    else { mlmap.addLayer({id:'baseraster',type:'raster',source:'osm'}, 'hillshade'); }
    toggleHillshade();
  }else{
    lmap.eachLayer(l=>{ if(l._url) l.remove(); });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19}).addTo(lmap);
    L.tileLayer('https://tiles.wmflabs.org/hillshading/{z}/{x}/{y}.png',{opacity:0.5}).addTo(lmap);
  }
}
function toggleTerrain(){ if(useML) mlmap.setTerrain($('#terrainOn').checked?{source:'terrain-dem',exaggeration:+$('#exagg').value}:null); }
function toggleHillshade(){ if(!useML) return; const vis=$('#hillshadeOn').checked?'visible':'none'; try{ mlmap.setLayoutProperty('hillshade','visibility',vis);}catch{} }
function setExaggeration(x){ if(useML) try{ mlmap.setTerrain({source:'terrain-dem',exaggeration:x}); }catch{} }

/* === Effects models (approximate, for planning only) === */
function ringKm(y,psi){ const W=Math.cbrt(Math.max(0.1,y)); if(psi===20) return 0.9*W; if(psi===5) return 1.9*W; if(psi===1) return 4.2*W; return 0; }
function thermalKm(y){ return 7.0*Math.cbrt(Math.max(0.1,y)); }
function plumeParams(y, wx, alt, precipPct, humidPct){
  const base=Math.sqrt(Math.max(0.1,y)); let len=25*base, width=6*base;
  if(wx==='rain'){ len*=0.82; width*=0.72; }
  if(wx==='snow'){ len*=0.90; width*=0.80; }
  const p = clamp(precipPct/100,0,1); len *= (1-0.25*p); width *= (1-0.25*p);
  const h = clamp(humidPct/100,0,1); len *= (1-0.1*h);
  if(alt>300){ len*=0.6; width*=0.6; }
  return {len,width};
}

/* === Geo helpers === */
function offsetOnEarth(lat,lng, fwdM, brgDeg, rightM){
  const R=6371000, b=toRad(brgDeg), d=fwdM/R, lat1=toRad(lat), lon1=toRad(lng);
  const lat2=Math.asin(Math.sin(lat1)*Math.cos(d)+Math.cos(lat1)*Math.sin(d)*Math.cos(b));
  const lon2=lon1+Math.atan2(Math.sin(b)*Math.sin(d)*Math.cos(lat1),Math.cos(d)-Math.sin(lat1)*Math.sin(lat2));
  const b2=b+Math.PI/2, d2=rightM/R;
  const lat3=Math.asin(Math.sin(lat2)*Math.cos(d2)+Math.cos(lat2)*Math.sin(d2)*Math.cos(b2));
  const lon3=lon2+Math.atan2(Math.sin(b2)*Math.sin(d2)*Math.cos(lat2),Math.cos(d2)-Math.sin(lat2)*Math.sin(lat3));
  return [toDeg(lat3),toDeg(lon3)];
}
function plumeGJ(center, brgDeg, lenKm, widthKm){
  const [lng0,lat0]=center, coords=[], N=120, lenM=lenKm*1000, halfW=widthKm*500;
  for(let i=0;i<=N;i++){ const t=i/N, dist=t*lenM, w=Math.sin(Math.PI*Math.min(1,t))*halfW; coords.push(offsetOnEarth(lat0,lng0,dist,brgDeg, w).reverse()); }
  for(let i=N;i>=0;i--){ const t=i/N, dist=t*lenM, w=Math.sin(Math.PI*Math.min(1,t))*halfW; coords.push(offsetOnEarth(lat0,lng0,dist,brgDeg,-w).reverse()); }
  return turf.polygon([coords]);
}

/* === Drawing === */
let layersML=[], layersLF=[];
function addFill(gj,id,color,fop,line=true){
  if(useML){
    mlmap.addSource(id,{type:'geojson',data:gj});
    mlmap.addLayer({id, type:'fill', source:id, paint:{'fill-color':color,'fill-opacity':fop}});
    if(line) mlmap.addLayer({id:id+'l', type:'line', source:id, paint:{'line-color':color,'line-width':2,'line-opacity':0.9}});
    layersML.push(id);
  }else{
    const lay=L.geoJSON(gj,{style:{color,weight:2,fillColor:color,fillOpacity:fop}}).addTo(lmap);
    layersLF.push(lay);
  }
}
function addMarker(lat,lng){ if(useML){ new maplibregl.Marker().setLngLat([lng,lat]).addTo(mlmap); } else { L.marker([lat,lng]).addTo(lmap); } }
function clearMap(){
  effects=[]; document.querySelectorAll('.ring-label').forEach(e=>e.remove());
  if(useML){
    layersML.forEach(id=>{ try{ mlmap.removeLayer(id+'l'); }catch{} try{ mlmap.removeLayer(id); }catch{} try{ mlmap.removeSource(id);}catch{} });
    layersML=[];
  }else{ layersLF.forEach(l=>{ try{ l.remove(); }catch{} }); layersLF=[]; }
  if(popHeatLayer){ if(useML){ try{ mlmap.removeLayer('popHeat'); mlmap.removeSource('popHeat'); }catch{} } else { try{ lmap.removeLayer(popHeatLayer);}catch{} } popHeatLayer=null; }
  shelterMarkers.forEach(m=>m.remove && m.remove()); shelterMarkers=[];
  $('#popRead').textContent='Population in current effects: —';
  $('#shelterRead').textContent='—';
}

/* === Bursts === */
function placeBurst(latlng){
  lastBurst=latlng;
  const [lat,lng]=latlng;
  const y=+$('#yield').value, a=+$('#alt').value, wx=$('#wx').value;
  const precip=+$('#precip').value, humid=+$('#humid').value;
  addMarker(lat,lng);
  const r20=turf.circle([lng,lat], ringKm(y,20), {steps:128});
  const r5 =turf.circle([lng,lat], ringKm(y,5),  {steps:128});
  const r1 =turf.circle([lng,lat], ringKm(y,1),  {steps:128});
  const rT =turf.circle([lng,lat], thermalKm(y), {steps:128});
  addFill(r20,'r20_'+Math.random(), getCSS('--psi20'), .28);
  addFill(r5 ,'r5_' +Math.random(), getCSS('--psi5') , .25);
  addFill(r1 ,'r1_' +Math.random(), getCSS('--psi1') , .22);
  addFill(rT ,'rT_' +Math.random(), getCSS('--therm'), .15);
  if($('#fallout').checked){
    const p=plumeParams(y,wx,a,precip,humid);
    const plume=plumeGJ([lng,lat], windDeg, p.len, p.width);
    addFill(plume,'pl_'+Math.random(), getCSS('--fall'), .22,false);
    effects.push({gj:plume,label:'Fallout plume'});
  }
  effects.push({gj:r20,label:'20 psi'}); effects.push({gj:r5,label:'5 psi'}); effects.push({gj:r1,label:'1 psi'}); effects.push({gj:rT,label:'Thermal 3rd°'});
  calcPopulation(); if(myPos) updateETA([lat,lng], windDeg);
}

/* === Population overlay === */
async function loadCounties(){
  try{ const r=await fetch('counties.json',{cache:'no-store'}); if(r.ok){ counties=await r.json(); return; } }catch{}
  counties = JSON.parse(document.getElementById('countiesData').textContent);
}
loadCounties();

$('#popHeat').onchange=()=>{
  if(!counties){ alert('Counties still loading'); $('#popHeat').checked=false; return; }
  if($('#popHeat').checked){
    if(useML){
      mlmap.addSource('popHeat',{type:'geojson',data:counties});
      mlmap.addLayer({id:'popHeat',type:'fill',source:'popHeat',
        paint:{'fill-color':['interpolate',['linear'],['get','pop'],0,'#0f172a',50000,'#475569',300000,'#ef4444'],'fill-opacity':0.25}});
    }else{
      popHeatLayer = L.geoJSON(counties,{style:f=>({color:'#444',weight:1,fillColor: f.properties.pop>300000?'#ef4444':(f.properties.pop>100000?'#f59e0b':'#475569'),fillOpacity:0.25})}).addTo(lmap);
    }
  }else{
    if(useML){ try{ mlmap.removeLayer('popHeat'); mlmap.removeSource('popHeat'); }catch{} }
    else{ try{ lmap.removeLayer(popHeatLayer);}catch{} popHeatLayer=null; }
  }
};

async function calcPopulation(){
  if(!counties){ $('#popRead').textContent='Population: (loading counties…)'; return; }
  if(effects.length===0){ $('#popRead').textContent='Population in current effects: —'; return; }
  let union = effects[0].gj;
  for(let i=1;i<effects.length;i++){ try{ union = turf.union(union, effects[i].gj); }catch{} }
  let total=0, details=[];
  counties.features.forEach(c=>{
    try{
      const inter = turf.intersect(union, c);
      if(inter){
        const frac = turf.area(inter) / turf.area(c);
        const ppl = Math.round(c.properties.pop * frac);
        total += ppl;
        details.push(`${c.properties.name}: ${ppl.toLocaleString()}`);
      }
    }catch{}
  });
  $('#popRead').textContent = `Population in effects: ${total.toLocaleString()}` + (details.length? ` — ${details.join(' • ')}`:'');
}

/* === Wind HUD (drag/resize + ETA) === */
const HUD=$('#windHUD'), Hhead=$('#windHead'), Hrez=$('#windResize'); (function(){
  const s=lsGet('HUDpos',{left:'10px',bottom:'10px',w:300,h:210});
  HUD.style.left=s.left; HUD.style.bottom=s.bottom||'10px'; HUD.style.width=s.w+'px'; HUD.style.height=s.h+'px';
  let drag=false,sx=0,sy=0,ox=0,oy=0;
  Hhead.addEventListener('pointerdown',ev=>{drag=true;sx=ev.clientX;sy=ev.clientY; const r=HUD.getBoundingClientRect(); ox=r.left; oy=r.top; Hhead.setPointerCapture(ev.pointerId);});
  Hhead.addEventListener('pointermove',ev=>{if(!drag)return; const dx=ev.clientX-sx, dy=ev.clientY-sy; HUD.style.left=(ox+dx)+'px'; HUD.style.top=(oy+dy)+'px'; HUD.style.bottom='auto';});
  Hhead.addEventListener('pointerup',()=>{drag=false; save();});
  let rez=false, rsx=0,rsy=0,rw=0,rh=0;
  Hrez.addEventListener('pointerdown',ev=>{rez=true;rsx=ev.clientX;rsy=ev.clientY; const r=HUD.getBoundingClientRect(); rw=r.width; rh=r.height; Hrez.setPointerCapture(ev.pointerId);});
  Hrez.addEventListener('pointermove',ev=>{ if(!rez)return; const dx=ev.clientX-rsx, dy=ev.clientY-rsy; HUD.style.width=Math.max(220,rw+dx)+'px'; HUD.style.height=Math.max(160,rh+dy)+'px'; });
  Hrez.addEventListener('pointerup',()=>{rez=false; save();});
  function save(){ const r=HUD.getBoundingClientRect(); lsSet('HUDpos',{left:HUD.style.left||r.left+'px',bottom:HUD.style.bottom||'10px',w:r.width,h:r.height}); }
  $('#windCenter').onclick=()=>{ HUD.style.left='10px'; HUD.style.bottom='10px'; HUD.style.top='auto'; save(); };
  $('#windHide').onclick=()=>{ HUD.style.display='none'; };
})();
const comp=$('#windCompass'), ctx=comp.getContext('2d');
function drawCompass(){
  const w=comp.width, h=comp.height, r=Math.min(w,h)/2-8, cx=w/2, cy=h/2;
  ctx.clearRect(0,0,w,h);
  ctx.save(); ctx.beginPath(); ctx.arc(cx,cy,r,0,Math.PI*2); ctx.fillStyle='#0b0e12'; ctx.fill(); ctx.lineWidth=2; ctx.strokeStyle='#1d2633'; ctx.stroke();
  ctx.translate(cx,cy);
  for(let i=0;i<36;i++){ ctx.save(); ctx.rotate(i*10*Math.PI/180); ctx.beginPath(); ctx.moveTo(0,-r+4); ctx.lineTo(0,-r+(i%9===0?14:8)); ctx.strokeStyle=i%9===0?'#fff':'#586275'; ctx.lineWidth=i%9===0?2:1; ctx.stroke(); ctx.restore(); }
  ctx.save(); ctx.rotate(toRad(windDeg)); ctx.beginPath(); ctx.moveTo(0,10); ctx.lineTo(0,-r+16); ctx.strokeStyle='#22d3ee'; ctx.lineWidth=4; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0,-r+16); ctx.lineTo(7,-r+34); ctx.lineTo(-7,-r+34); ctx.closePath(); ctx.fillStyle='#22d3ee'; ctx.fill(); ctx.restore(); ctx.restore();
  $('#windRead').textContent = `${Math.round(windDeg)}° (${bearingToCardinal(windDeg)}), ${windSpd} m/s`;
  $('#wind').value=Math.round(windDeg); $('#windNum').value=Math.round(windDeg);
  $('#windSpd').value=windSpd; $('#windNumSpd').value=windSpd;
  lsSet('windDeg',windDeg); lsSet('windSpd',windSpd);
}
function compDrag(ev){
  const rect=comp.getBoundingClientRect();
  const x=ev.clientX-rect.left-rect.width/2, y=ev.clientY-rect.top-rect.height/2;
  windDeg=(toDeg(Math.atan2(x,-y))+360)%360; drawCompass(); updateETAFromLast();
}
comp.addEventListener('pointerdown',ev=>{compDrag(ev); comp.setPointerCapture(ev.pointerId);});
comp.addEventListener('pointermove',ev=>{ if(ev.buttons) compDrag(ev);});
$('#wind').addEventListener('input',e=>{ windDeg=+e.target.value; drawCompass(); updateETAFromLast(); });
$('#windNum').addEventListener('input',e=>{ windDeg=+e.target.value; drawCompass(); updateETAFromLast(); });
$('#windSpd').addEventListener('input',e=>{ windSpd=+e.target.value; drawCompass(); updateETAFromLast(); });
$('#windNumSpd').addEventListener('input',e=>{ windSpd=+e.target.value; drawCompass(); updateETAFromLast(); });
drawCompass();

/* === GPS + ETA === */
$('#btnGPS').onclick=async ()=>{
  try{
    const pos = await new Promise((res,rej)=>navigator.geolocation.getCurrentPosition(p=>res(p),e=>rej(e),{enableHighAccuracy:true,timeout:10000}));
    myPos=[pos.coords.latitude,pos.coords.longitude];
    if(useML){ new maplibregl.Marker({color:'#22c55e'}).setLngLat([myPos[1],myPos[0]]).addTo(mlmap); }
    else{ L.marker(myPos).addTo(lmap); }
    updateETAFromLast();
  }catch{ showErr('GPS failed (permissions or no fix)'); }
};
function updateETAFromLast(){ if(lastBurst && myPos) updateETA(lastBurst, windDeg); }
function updateETA(burstLatLng, brgDeg){
  const [bLat,bLng]=burstLatLng; if(!myPos) return;
  const [uLat,uLng]=myPos;
  const dest = offsetOnEarth(bLat,bLng, 1000000, brgDeg, 0);
  const line = turf.lineString([[bLng,bLat],[dest[1],dest[0]]]);
  const pt = turf.point([uLng,uLat]);
  const snapped = turf.nearestPointOnLine(line, pt);
  const distKm = snapped.properties.location * 111.32;
  if(windSpd<=0){ $('#hudEta').textContent='ETA to you: wind=0'; return; }
  const secs = (distKm*1000)/(windSpd);
  const mins = Math.max(0, Math.round(secs/60));
  $('#hudEta').textContent = `ETA to you: ${mins} min`;
  $('#hudLeave').textContent = `Leave-shelter est: ~${mins+420} min (rule-of-7/10)`;
}

/* === Shelter finder (terrain-aware when MapLibre terrain is on) === */
async function getElevation(lat,lng){ if(!useML) return null; try{ return mlmap.queryTerrainElevation({lng,lat}); }catch{ return null; } }
function dotMarker(lat,lng,ok=true){
  if(useML){
    const el=document.createElement('div'); el.style.cssText='width:10px;height:10px;border-radius:50%;background:'+(ok?'#22c55e':'#f59e0b')+';border:2px solid #0f172a';
    return new maplibregl.Marker({element:el}).setLngLat([lng,lat]).addTo(mlmap);
  }else{
    const c= ok?'#22c55e':'#f59e0b'; return L.circleMarker([lat,lng],{radius:6,color:'#0f172a',fillColor:c,fillOpacity:1,weight:2}).addTo(lmap);
  }
}
function clearShelters(){ shelterMarkers.forEach(m=>m.remove && m.remove()); shelterMarkers=[]; $('#shelterRead').textContent='—'; }
$('#clearShelter').onclick=clearShelters;
$('#findShelter').onclick=async ()=>{
  if(!myPos){ alert('Tap “My Position (GPS)” first.'); return; }
  clearShelters();
  const R=+$('#radius').value; const samples=36;
  let best=null, bestScore=-1;
  const centerEl = await getElevation(myPos[0],myPos[1]);
  for(let i=0;i<samples;i++){
    const brg=i*360/samples; const pt=offsetOnEarth(myPos[0],myPos[1], R, brg, 0); const lat=pt[0], lng=pt[1];
    const el = await getElevation(lat,lng);
    let score=0, why=[];
    if(centerEl!=null && el!=null){ const delta = el-centerEl; if(delta<-3){ score+=2; why.push('lower ground'); } if(delta>4){ score-=1; why.push('ridge'); } }
    const rel = Math.abs((((brg - windDeg + 540)%360)-180));
    if(rel<100){ score+=2; why.push('leeward'); }
    if(rel<15){ score-=2; why.push('downwind centerline'); }
    const m = dotMarker(lat,lng,score>=2); shelterMarkers.push(m);
    if(score>bestScore){ bestScore=score; best={lat,lng,why}; }
  }
  $('#shelterRead').textContent = best?(`Best nearby: ${best.lat.toFixed(5)}, ${best.lng.toFixed(5)} — ${best.why.join(', ')}`):('No strong terrain advantage; use hard cover and cross-wind routes.');
};

/* === Add-burst via taps is wired in map init; load counties immediately === */
(async function(){ await loadCounties(); })();