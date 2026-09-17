/* ===================== helpers ===================== */
const $ = s => document.querySelector(s);
const toRad = d => d * Math.PI / 180, toDeg = r => r * 180 / Math.PI;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const bearingToCardinal = b => ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'][Math.round(((b%360)+360)%360/22.5)%16];
const getCSS = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const lsGet = AppPlatform.storage.get;
function lsSet(k,v){ if(!AppPlatform.storage.set(k,v)) showErr('Storage unavailable or full. Changes may not survive reload.'); }
const showErr = msg => { const e = $('#err'); if(!e) return; e.textContent = msg; e.style.display='block'; setTimeout(()=>e.style.display='none', 4000); };
if ('serviceWorker' in navigator) {navigator.serviceWorker.register('./sw.js', {updateViaCache:'none'}).then(r=>r.update()).catch(e=>console.warn('Offline shell unavailable',e));}

// Throttle utility for smooth drag/HUD sync
function throttle(fn, ms = 50) {
  let last = 0, raf = null, queuedArgs = null;
  return (...args) => {
    const now = performance.now();
    queuedArgs = args;
    const run = () => { last = now; raf = null; fn(...queuedArgs); queuedArgs = null; };
    if (now - last >= ms) { if (raf) cancelAnimationFrame(raf); run(); }
    else if (!raf) { raf = requestAnimationFrame(run); }
  };
}
/* ===================== globals ===================== */
let useML=false, mlmap, lmap, addMode=false;
let windDeg=lsGet('windDeg',90), windSpd=lsGet('windSpd',10);
let burstMarkers=[];
let effects=[], myPos=null, popHeatLayer=null, shelterMarkers=[], lastBurst=null, counties=null;

function updateTopbar(){
  const degEl=document.getElementById('tb-wind-deg');
  const spdEl=document.getElementById('tb-wind-speed');
  if(degEl) degEl.textContent=`${Math.round(windDeg)}°`;
  if(spdEl) spdEl.textContent=`${windSpd} m/s`;
  const arrow=document.getElementById('tb-wind-arrow');
  if(arrow) arrow.style.transform=`rotate(${windDeg}deg)`;
}

function getFlag(name){ return new URLSearchParams(location.search).has(name); }
function webglOk(){
  try{
    if(getFlag('leaf')) return false;
    const c=document.createElement('canvas');
    return !!(window.maplibregl && window.WebGLRenderingContext && (c.getContext('webgl')||c.getContext('experimental-webgl')));
  }catch{ return false; }
}

/* ===================== map init ===================== */
function initMap(){
  const view=lsGet('mapView',null);
  const valid=view && Number.isFinite(view.lat) && Number.isFinite(view.lng) && Math.abs(view.lat)<=85 && Math.abs(view.lng)<=180;
  const start=valid?[view.lat,view.lng]:[45.85,-123.49];
  const startZoom=valid&&Number.isFinite(view.zoom)?clamp(view.zoom,2,18):9;

  if(webglOk()){
    try {
    useML=true; $('#map').style.display='none';
    mlmap=new maplibregl.Map({
      container:'mlmap',
      style:{
        "version":8,
        "sources":{
          "osm":{"type":"raster","tiles":["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],"tileSize":256,"attribution":"© OSM"},
          "sat":{"type":"raster","tiles":["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],"tileSize":256,"attribution":"Tiles © Esri — Esri, Maxar, Earthstar Geographics and GIS User Community"},
          "topo":{"type":"raster","tiles":["https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}"],"tileSize":256,"attribution":"Tiles © Esri and contributors"},
          "terrain-dem":{"type":"raster-dem","tiles":["https://demotiles.maplibre.org/terrain-tiles/{z}/{x}/{y}.png"],"tileSize":256}
        },
        "layers":[
          {"id":"baseraster","type":"raster","source":"osm","minzoom":0,"maxzoom":19},
          {"id":"hillshade","type":"hillshade","source":"terrain-dem","layout":{"visibility":"none"},"paint":{"hillshade-exaggeration":0.6}}
        ]
      },
      center:[start[1],start[0]], zoom:startZoom, pitch:0
    });
    mlmap.addControl(new maplibregl.NavigationControl({visualizePitch:true}),'top-left');
    mlmap.addControl(new maplibregl.ScaleControl({maxWidth:120,unit:'imperial'}));

    mlmap.on('click', e=>{
      if(pinsHandleMapClick(e.lngLat.lat, e.lngLat.lng)) return;
      if(addMode){ placeBurst([e.lngLat.lat,e.lngLat.lng]);addMode=false;$('#add').classList.remove('active');return;} inspectMapPoint(e.lngLat.lat,e.lngLat.lng);
    });

    } catch(error) { console.warn('WebGL startup failed; using Leaflet',error); try{mlmap?.remove();}catch{} useML=false; }
  }
  if(!useML){
    $('#map').style.display='block';
    useML=false; $('#mlmap').style.display='none';
    lmap=L.map('map', { renderer: L.canvas() }).setView(start,startZoom);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OSM'}).addTo(lmap);


    lmap.on('click', e=>{
      if(pinsHandleMapClick(e.latlng.lat, e.latlng.lng)) return;
      if(addMode){placeBurst([e.latlng.lat,e.latlng.lng]);addMode=false;$('#add').classList.remove('active');return;} inspectMapPoint(e.latlng.lat,e.latlng.lng);
    });
  }
}
// Map startup occurs after state and controls have initialized.

/* ===================== top bar handlers ===================== */
$('#preset').onchange=e=>{ if(e.target.value!=='custom') $('#yield').value=e.target.value; };
$('#add').onclick=()=>{ addMode=!addMode; $('#add').classList.toggle('active',addMode); if(addMode){ pinMode=false; $('#pinMode').classList.remove('active'); } };
$('#clear').onclick=()=>clearMap();
$('#refreshTiles').onclick=refreshTiles;
$('#btnRefresh2').onclick=refreshTiles;
$('#bmSel').onchange=e=>{ $('#basemap').value=e.target.value; refreshTiles(); };
$('#basemap').onchange=refreshTiles;
$('#precip').oninput=e=>$('#precipVal').textContent=e.target.value;
$('#humid').oninput=e=>$('#humidVal').textContent=e.target.value;
$('#calcPop').onclick=calcPopulation;

$('#terrainOn').onchange=()=>toggleTerrain();
$('#hillshadeOn').onchange=()=>toggleHillshade();
$('#exagg').oninput=e=>{ $('#exVal').textContent=e.target.value; setExaggeration(+e.target.value); };

function refreshTiles(){
  const sel=$('#basemap').value; $('#bmSel').value=sel;
  if(useML){
    if(!mlmap.isStyleLoaded()) { mlmap.once('load',refreshTiles); return; }
    if(mlmap.getLayer('baseraster')) mlmap.removeLayer('baseraster');
    if(sel!=='grid') mlmap.addLayer({id:'baseraster',type:'raster',source:sel==='sat'?'sat':sel==='topo'?'topo':'osm'}, 'hillshade');
  }else{
    lmap.eachLayer(l=>{ if(l instanceof L.TileLayer) l.remove(); });
    const urls={sat:'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',topo:'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',osm:'https://tile.openstreetmap.org/{z}/{x}/{y}.png'};
    if(sel!=='grid') L.tileLayer(urls[sel]||urls.osm,{maxZoom:19,attribution:sel==='sat'||sel==='topo'?'Tiles © Esri and contributors':'© OpenStreetMap contributors'}).addTo(lmap);
  }
}
function toggleTerrain(){ if(useML && mlmap.isStyleLoaded()) mlmap.setTerrain($('#terrainOn').checked?{source:'terrain-dem',exaggeration:+$('#exagg').value}:null); }
function toggleHillshade(){ if(useML && mlmap.isStyleLoaded()) mlmap.setLayoutProperty('hillshade','visibility',$('#hillshadeOn').checked?'visible':'none'); }
function setExaggeration(x){ if($('#terrainOn').checked) toggleTerrain(); }

/* ===================== effects model ===================== */
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
function offsetOnEarth(lat,lng,fwdM,brgDeg,rightM){
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

/* ===================== drawing helpers ===================== */
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
function addMarker(lat,lng,opts={}){
  if(useML){
    const m = new maplibregl.Marker(opts).setLngLat([lng,lat]).addTo(mlmap);
    return {remove:()=>m.remove(), _m:m, setLngLat:(p)=>m.setLngLat([p[1],p[0]]), on:(ev,fn)=>m.getElement().addEventListener(ev,fn)};
  }else{
    const m=L.marker([lat,lng],opts).addTo(lmap);
    return {remove:()=>lmap.removeLayer(m), _m:m, setLngLat:(p)=>m.setLatLng(p), on:(ev,fn)=>m.on(ev,fn)};
  }
}
function flyTo(lat,lng){ if(useML) mlmap.flyTo({center:[lng,lat], zoom:12}); else lmap.setView([lat,lng],12); }

function clearMap(){
  effects=[];lastBurst=null;burstMarkers.forEach(m=>m.remove());burstMarkers=[];
  if(useML){
    layersML.forEach(id=>{ try{ mlmap.removeLayer(id+'l'); }catch{} try{ mlmap.removeLayer(id); }catch{} try{ mlmap.removeSource(id);}catch{} });
    layersML=[];
  }else{
    layersLF.forEach(l=>{ try{ l.remove(); }catch{} }); layersLF=[];
  }
  if(popHeatLayer){
    if(useML){ try{ mlmap.removeLayer('popHeat'); mlmap.removeSource('popHeat'); }catch{} }
    else { try{ lmap.removeLayer(popHeatLayer);}catch{} }
    popHeatLayer=null;
  }
  clearShelters();
  $('#popRead').textContent='Population in current effects: —';
  $('#shelterRead').textContent='—';
}

/* ===================== bursts ===================== */
function placeBurst(latlng){
  if(useML && !mlmap.isStyleLoaded()){showErr('Map is still loading. Try again shortly.');return;}
  lastBurst=latlng; const [lat,lng]=latlng;
  const y=+$('#yield').value, a=+$('#alt').value, wx=$('#wx').value;
  const precip=+$('#precip').value, humid=+$('#humid').value;

  burstMarkers.push(addMarker(lat,lng));
  const r20=turf.circle([lng,lat], ringKm(y,20), {steps:128});
  const r5 =turf.circle([lng,lat], ringKm(y,5), {steps:128});
  const r1 =turf.circle([lng,lat], ringKm(y,1), {steps:128});
  const th =turf.circle([lng,lat], thermalKm(y), {steps:128});
  addFill(r20,'r20_'+Math.random(), getCSS('--psi20'), .28);
  addFill(r5 ,'r5_' +Math.random(), getCSS('--psi5') , .25);
  addFill(r1 ,'r1_' +Math.random(), getCSS('--psi1') , .22);
  addFill(th ,'rT_' +Math.random(), getCSS('--therm'), .15);

  if($('#fallout').checked){
    const p=plumeParams(y,wx,a,precip,humid);
    const plume=plumeGJ([lng,lat], windDeg, p.len, p.width);
    addFill(plume,'pl_'+Math.random(), getCSS('--fall'), .22,false);
    effects.push({gj:plume,label:'Fallout plume'});
  }
  effects.push({gj:r20,label:'20 psi'}); effects.push({gj:r5,label:'5 psi'}); effects.push({gj:r1,label:'1 psi'}); effects.push({gj:th,label:'Thermal 3rd°'});
  calcPopulation(); if(myPos) updateETA([lat,lng], windDeg);
}

/* ===================== population ===================== */
async function loadCounties(){
  // Only the bundled demo polygons are available in this revision.
  const tag=document.getElementById('countiesData'); if(tag) counties = JSON.parse(tag.textContent);
}
$('#popHeat').onchange=()=>{
  if(useML && !mlmap.isStyleLoaded()){showErr('Map still loading');$('#popHeat').checked=false;return;}
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
    else { try{ lmap.removeLayer(popHeatLayer);}catch{} popHeatLayer=null; }
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
  $('#popRead').textContent = `DEMO population (unvalidated polygons): ${total.toLocaleString()}` + (details.length? ` — ${details.join(' • ')}`:'');
}

/* ===================== wind HUD + ETA ===================== */
const HUD=$('#windHUD'), Hhead=$('#windHead'), Hrez=$('#windResize');
(function(){
  if(!HUD) return;
  const s=lsGet('HUDpos',{left:'10px',bottom:'10px',w:300,h:210});
  HUD.style.left=s.left; HUD.style.bottom=s.bottom||'10px'; HUD.style.width=s.w+'px'; HUD.style.height=s.h+'px';
  let drag=false,sx=0,sy=0,ox=0,oy=0;
  Hhead.addEventListener('pointerdown',ev=>{drag=true;sx=ev.clientX;sy=ev.clientY; const r=HUD.getBoundingClientRect(); const parent=HUD.parentElement.getBoundingClientRect();ox=r.left-parent.left;oy=r.top-parent.top; Hhead.setPointerCapture(ev.pointerId);});
  Hhead.addEventListener('pointermove',ev=>{if(!drag)return; const dx=ev.clientX-sx, dy=ev.clientY-sy; HUD.style.left=clamp(ox+dx,0,Math.max(0,HUD.parentElement.clientWidth-HUD.offsetWidth))+'px'; HUD.style.top=clamp(oy+dy,0,Math.max(0,HUD.parentElement.clientHeight-HUD.offsetHeight))+'px'; HUD.style.bottom='auto';});
  Hhead.addEventListener('pointerup',()=>{drag=false; save();});
  let rez=false, rsx=0,rsy=0,rw=0,rh=0;
  Hrez.addEventListener('pointerdown',ev=>{rez=true;rsx=ev.clientX;rsy=ev.clientY; const r=HUD.getBoundingClientRect(); rw=r.width; rh=r.height; Hrez.setPointerCapture(ev.pointerId);});
  Hrez.addEventListener('pointermove',ev=>{ if(!rez)return; const dx=ev.clientX-rsx, dy=ev.clientY-rsy; HUD.style.width=Math.max(220,rw+dx)+'px'; HUD.style.height=Math.max(160,rh+dy)+'px'; });
  Hrez.addEventListener('pointerup',()=>{rez=false; save();});
  function save(){ const r=HUD.getBoundingClientRect(); lsSet('HUDpos',{left:HUD.style.left||r.left+'px',bottom:HUD.style.bottom||'10px',w:r.width,h:r.height}); }
  $('#windCenter').onclick=()=>{ HUD.style.left='10px'; HUD.style.bottom='10px'; HUD.style.top='auto'; save(); };

})();
const comp=$('#windCompass'), ctx=comp?.getContext('2d');
function drawCompass(){
  if(!comp || !ctx) return;
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
  updateTopbar();
}
function compDrag(ev){
  const rect=comp.getBoundingClientRect();
  const x=ev.clientX-rect.left-rect.width/2, y=ev.clientY-rect.top-rect.height/2;
  windDeg=(toDeg(Math.atan2(x,-y))+360)%360; drawCompass(); updateETAFromLast();
}
comp?.addEventListener('pointerdown',ev=>{compDrag(ev); comp.setPointerCapture(ev.pointerId);});
comp?.addEventListener('pointermove',ev=>{ if(ev.buttons) compDrag(ev);});
$('#wind').addEventListener('input',e=>{ windDeg=+e.target.value; drawCompass(); updateETAFromLast(); });
$('#windNum').addEventListener('input',e=>{ windDeg=+e.target.value; drawCompass(); updateETAFromLast(); });
$('#windSpd').addEventListener('input',e=>{ windSpd=+e.target.value; drawCompass(); updateETAFromLast(); });
$('#windNumSpd').addEventListener('input',e=>{ windSpd=+e.target.value; drawCompass(); updateETAFromLast(); });
drawCompass();

let locationMarker=null;
async function requestLocation(){
  try { const pos=await AppPlatform.locate(); myPos=[pos.coords.latitude,pos.coords.longitude];
    if(locationMarker)locationMarker.remove(); locationMarker=addMarker(...myPos,{color:'#22c55e'}); flyTo(...myPos);
    $('#weatherStatus').textContent='GPS fix · accuracy about '+Math.round(pos.coords.accuracy)+' m'; return true;
  } catch(e){showErr(e.message);return false;}
}
$('#btnGPS').onclick=requestLocation;
$('#locationTop').onclick=requestLocation;
function updateETAFromLast(){ /* Arrival model awaits scientific validation. */ }
function updateETA(){
  $('#hudEta').textContent='Fallout arrival model not validated';
  $('#hudLeave').textContent='No safe-to-leave time can be determined here.';
}

/* ===================== shelter finder ===================== */
async function getElevation(lat,lng){ if(!useML) return null; try{ return mlmap.queryTerrainElevation({lng,lat}); }catch{ return null; } }
let terrainGeneration=0;
function dotMarker(lat,lng,detail){
  const el=document.createElement('button');el.className='terrain-dot';el.textContent=detail.number;
  el.title='Terrain sample '+detail.number;el.setAttribute('aria-label',el.title);
  el.onclick=e=>{e.stopPropagation();showMapInfo(lat,lng,'Terrain sample '+detail.number,
    `Elevation: ${Math.round(detail.elevation)} m. Difference from search origin: ${detail.delta>=0?'+':''}${Math.round(detail.delta)} m. Sample distance: ${detail.distance} m.`,
    'Source: loaded map DEM. Elevation alone cannot establish shielding, fallout protection, a building, or public access. This is not a recommended destination.');};
  return new maplibregl.Marker({element:el}).setLngLat([lng,lat]).addTo(mlmap);
}
function clearShelters(){ terrainGeneration++;shelterMarkers.forEach(m=>m.remove());shelterMarkers=[];$('#shelterRead').textContent='—'; }
$('#clearShelter')?.addEventListener('click',clearShelters);
$('#findShelter')?.addEventListener('click',async()=>{
  clearShelters();const generation=terrainGeneration;
  if(!useML||!$('#terrainOn').checked){showErr('Enable 3D terrain to inspect loaded elevation samples.');return;}
  const c=getMapCenter(),origin=myPos||[c.lat,c.lng],R=+$('#radius').value;
  const centerEl=await getElevation(...origin);
  if(!Number.isFinite(centerEl)){showErr('Elevation is unavailable here. Try again after terrain loads.');return;}
  let missing=0;
  for(let i=0;i<12;i++){
    const pt=offsetOnEarth(origin[0],origin[1],R,i*30,0),el=await getElevation(...pt);
    if(generation!==terrainGeneration)return;
    if(!Number.isFinite(el)){missing++;continue;}
    shelterMarkers.push(dotMarker(...pt,{number:i+1,elevation:el,delta:el-centerEl,distance:R}));
  }
  $('#shelterRead').textContent=`${shelterMarkers.length} numbered samples around ${myPos?'last GPS fix':'map center'}; ${missing} unavailable. Tap a number for elevation and limitations. No safety ranking.`;
});

/* ===================== pins / waypoints ===================== */
let pinMode=false, pins=[], pinIdCounter=1, pinsSelectedId=null;
$('#pinMode')?.addEventListener('click', ()=>{ pinMode=!pinMode; $('#pinMode').classList.toggle('active',pinMode); if(pinMode){ addMode=false; $('#add').classList.remove('active'); } });
$('#pinAddNow')?.addEventListener('click', ()=>{ const c = getMapCenter(); addPin(c.lat,c.lng); });
$('#pinClearAll')?.addEventListener('click', ()=>{ if(!confirm('Delete all saved pins on this device?'))return; pins.forEach(p=>p.marker.remove()); pins=[]; renderPinList(); });
$('#homeCenter')?.addEventListener('click', ()=>centerOnPinType('home'));
$('#workCenter')?.addEventListener('click', ()=>centerOnPinType('work'));
$('#goSelected')?.addEventListener('click', ()=>{ const p=pins.find(x=>x.id===pinsSelectedId); if(!p) return alert('Select a pin in the list first.'); flyTo(p.lat,p.lng); });

function getMapCenter(){ if(useML){ const c=mlmap.getCenter(); return {lat:c.lat,lng:c.lng}; } else { const c=lmap.getCenter(); return {lat:c.lat,lng:c.lng}; } }
function pinsHandleMapClick(lat,lng){ if(!pinMode) return false; addPin(lat,lng); return true; }

function addPin(lat,lng){
  const type=$('#pinType').value, color=$('#pinColor').value;
  const label=prompt('Label for pin?',type); if(label===null)return;
  createSavedPin({lat,lng,type,color,label:label||type,notes:'',locked:true});
  renderPinList(true);
}
function createSavedPin(data){
  const id=pinIdCounter++, lat=data.lat,lng=data.lng,color=/^#[0-9a-f]{6}$/i.test(data.color)?data.color:'#22c55e';
  const m=addMarker(lat,lng,{color});
  const pin={...data,id,color,label:String(data.label||'Pin'),type:String(data.type||'custom'),notes:String(data.notes||''),locked:data.locked!==false,marker:m};pins.push(pin);

  if(useML){
    m._m.setDraggable(!pin.locked);
    m._m.on('dragend',ev=>{ const ll=ev.target.getLngLat(); pin.lng=ll.lng; pin.lat=ll.lat; renderPinList(false); });
    m.on('click',e=>{e.stopPropagation();showPinInfo(pin);});
  }else{
    if(!pin.locked)m._m.dragging.enable();
    m._m.on('dragend',ev=>{ const ll=ev.target.getLatLng(); pin.lat=ll.lat; pin.lng=ll.lng; renderPinList(false); });
    m._m.on('click',e=>{e.stopPropagation();showPinInfo(pin);});
  }
  renderPinList(true);
}
function editPin(id){
  const p = pins.find(x=>x.id===id); if(!p) return;
  const lbl = prompt('Edit label:', p.label); if(lbl!=null) p.label=lbl;
  const nt  = prompt('Notes (free text):', p.notes??''); if(nt!=null) p.notes=nt;
  renderPinList(false);
}
function deletePin(id){
  const i=pins.findIndex(x=>x.id===id); if(i<0) return; pins[i].marker.remove(); pins.splice(i,1); renderPinList(true);
}
function centerOnPinType(t){
  const p = pins.find(x=>x.type===t);
  if(!p){ alert(`No ${t} pin yet.`); return; }
  flyTo(p.lat,p.lng);
}
function escapeHTML(v){return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function renderPinList(scrollBottom=true){
  const box=$('#pinList'); if(!box) return;
  lsSet('pins',pins.map(({marker,...data})=>data));
  if(pins.length===0){ box.innerHTML='<div class="note">No pins yet.</div>'; return; }
  box.innerHTML=pins.map(p=>`
    <div class="pin-item" data-id="${p.id}">
      <div>
        <span class="pin-swatch" style="background:${p.color}"></span>
        <strong>${escapeHTML(p.label)}</strong> <span class="meta">(${escapeHTML(p.type)})</span>
        <div class="meta">${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}</div>
      </div>
      <div>
        <button class="smallbtn" data-act="go">Go</button>
        <button class="smallbtn" data-act="edit">Edit</button><button class="smallbtn" data-act="lock">${p.locked?"Unlock":"Lock"}</button>
        <button class="smallbtn" data-act="del">Del</button>
      </div>
    </div>`).join('');
  box.querySelectorAll('.pin-item').forEach(el=>{
    const id=+el.dataset.id;
    el.addEventListener('click',()=>{ pinsSelectedId=id; });
    el.querySelector('[data-act="go"]').onclick=(e)=>{ e.stopPropagation(); const p=pins.find(x=>x.id===id); flyTo(p.lat,p.lng); };
    el.querySelector('[data-act="edit"]').onclick=(e)=>{ e.stopPropagation(); editPin(id); };
    el.querySelector('[data-act="lock"]').onclick=e=>{e.stopPropagation();const p=pins.find(p=>p.id===id);p.locked=!p.locked;if(useML)p.marker._m.setDraggable(!p.locked);else p.marker._m.dragging[p.locked?'disable':'enable']();renderPinList(false);};
    el.querySelector('[data-act="del"]').onclick=(e)=>{ e.stopPropagation(); deletePin(id); };
  });
  if(scrollBottom) box.scrollTop=box.scrollHeight;
}

/* ===================== weather controls ===================== */
let weatherGeneration=0, weatherTimer=null;
async function refreshWeather(){
  const generation=++weatherGeneration;
  const c=myPos?{lat:myPos[0],lng:myPos[1]}:getMapCenter();
  $('#weatherStatus').textContent='Fetching Open-Meteo modeled weather…';
  try{
    const w=await AppPlatform.weather(c.lat,c.lng); if(generation!==weatherGeneration)return;
    windDeg=w.to;windSpd=w.speed;drawCompass();
    const d=w.current;
    $('#tb-temp').textContent=d.temperature_2m+'°C';$('#tb-humidity').textContent=d.relative_humidity_2m+'%';$('#tb-precip').textContent=d.precipitation+' mm';
    const message=`Open-Meteo modeled weather · ${d.time} UTC · ${myPos?'GPS':'Map center'} ${c.lat.toFixed(3)}, ${c.lng.toFixed(3)} · wind FROM ${w.from}° / TO ${w.to}° · ${w.speed} m/s · gusts ${d.wind_gusts_10m} m/s`;
    $('#weatherStatus').textContent=message;$('#windSrc').textContent=message;
  }catch(e){if(generation!==weatherGeneration)return;$('#weatherStatus').textContent='Weather update failed; wind values retained (not refreshed). '+e.message;$('#windSrc').textContent='Weather stale / unavailable';}
}
$('#liveWindNow').onclick=refreshWeather;
$('#weatherAuto').onchange=e=>{clearInterval(weatherTimer);if(e.target.checked){refreshWeather();weatherTimer=setInterval(()=>{if(!document.hidden)refreshWeather();},600000);}};
function manualWeather(){++weatherGeneration;clearInterval(weatherTimer);$('#weatherAuto').checked=false;$('#weatherStatus').textContent='Manual wind TO '+Math.round(windDeg)+'° · '+windSpd+' m/s';$('#windSrc').textContent='Manual wind';for(const id of ['tb-temp','tb-humidity','tb-precip'])$('#'+id).textContent='—';}
for(const id of ['wind','windNum','windSpd','windNumSpd'])$('#'+id).addEventListener('input',manualWeather);
comp?.addEventListener('pointerdown',manualWeather);

/* ===================== startup and layout ===================== */
function resizeMap(){if(useML)mlmap?.resize();else lmap?.invalidateSize();}
new ResizeObserver(resizeMap).observe($('#mapwrap'));
window.addEventListener('orientationchange',()=>setTimeout(resizeMap,200));
function connection(){ $('#connectionStatus').textContent=navigator.onLine?'Online':'Offline · map tiles/weather may be unavailable'; }
window.addEventListener('online',connection);window.addEventListener('offline',connection);connection();
function restorePins(){
 const saved=lsGet('pins',[]);if(!Array.isArray(saved))return;
 for(const p of saved){if(!Number.isFinite(p.lat)||!Number.isFinite(p.lng)||Math.abs(p.lat)>90||Math.abs(p.lng)>180)continue;createSavedPin(p);}
 renderPinList(false);
}
(async function(){
 try{initMap(); if(useML){mlmap.on('load',()=>{toggleTerrain();toggleHillshade();});mlmap.on('error',()=>{showErr('A map source failed. Try Streets, disable terrain, or use 2D fallback in Controls.');});}else{for(const id of ['terrainOn','hillshadeOn','exagg'])$('#'+id).disabled=true;} await loadCounties();restorePins();resizeMap();
 const engine=useML?mlmap:lmap;engine.on('moveend',()=>{const c=getMapCenter();lsSet('mapView',{...c,zoom:engine.getZoom()});});}
 catch(e){showErr('Startup failed: '+e.message);console.error(e);}
})();
