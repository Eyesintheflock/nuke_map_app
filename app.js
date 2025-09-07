/* ===================== helpers ===================== */
const $ = s => document.querySelector(s);
const toRad = d => d * Math.PI / 180, toDeg = r => r * 180 / Math.PI;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const bearingToCardinal = b => ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'][Math.round(((b%360)+360)%360/22.5)%16];
const getCSS = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
function lsGet(k, def){ try{ const v = localStorage.getItem(k); return v ? JSON.parse(v) : def; } catch { return def; } }
function lsSet(k, v){ try{ localStorage.setItem(k, JSON.stringify(v)); } catch {} }
const showErr = msg => { const e = $('#err'); if(!e) return; e.textContent = msg; e.style.display='block'; setTimeout(()=>e.style.display='none', 4000); };
const showHint = msg => { const e=$('#hint'); if(!e) return; e.textContent=msg; e.style.display='block'; setTimeout(()=>e.style.display='none',4000); };

/* ===================== globals ===================== */
let useML=false, mlmap, lmap, addMode=false;
let uiState = lsGet('uiState', {});
let windDeg = uiState.windDeg ?? lsGet('windDeg',90),
    windSpd = uiState.windSpd ?? lsGet('windSpd',10);
let effects=[], myPos=null, popHeatLayer=null, shelterMarkers=[], lastBurst=null, counties=null;
let bursts=[];

// apply persisted UI state to controls
$('#basemap').value = uiState.basemap ?? 'auto';
$('#terrainOn').checked = uiState.terrainOn ?? true;
$('#hillshadeOn').checked = uiState.hillshadeOn ?? true;
$('#exagg').value = uiState.exagg ?? 1.4; $('#exVal').textContent=$('#exagg').value;
$('#wx').value = uiState.wx ?? 'dry';
$('#popHeat').checked = uiState.popHeatOn ?? false;
const pht = $('#popHeatTop'); if(pht) pht.checked = uiState.popHeatOn ?? false;

function getFlag(name){ return new URLSearchParams(location.search).has(name); }
function webglOk(){
  try{
    if(getFlag('leaf')) return false;
    const c=document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (c.getContext('webgl')||c.getContext('experimental-webgl')));
  }catch{ return false; }
}

/* ===================== map init ===================== */
function initMap(){
  const start = uiState.camera?.center ? [uiState.camera.center[0], uiState.camera.center[1]] : [45.85,-123.49];
  const startZoom = uiState.camera?.zoom ?? 8.6;
  const startPitch = uiState.camera?.pitch ?? 0;
  const startBearing = uiState.camera?.bearing ?? 0;

  if(webglOk()){
    useML=true; $('#map').style.display='none';
    mlmap=new maplibregl.Map({
      container:'mlmap',
      style:{
        "version":8,
        "sources":{
          "osm":{"type":"raster","tiles":["https://a.tile.openstreetmap.org/{z}/{x}/{y}.png","https://b.tile.openstreetmap.org/{z}/{x}/{y}.png","https://c.tile.openstreetmap.org/{z}/{x}/{y}.png"],"tileSize":256,"attribution":"© OSM"},
          "esriSat":{"type":"raster","tiles":["https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],"tileSize":256,"attribution":"ESRI"},
          "esriHill":{"type":"raster","tiles":["https://services.arcgisonline.com/ArcGIS/rest/services/Elevation/World_Hillshade/MapServer/tile/{z}/{y}/{x}"],"tileSize":256},
          "terrain-dem":{"type":"raster-dem","tiles":["https://demotiles.maplibre.org/terrain-tiles/{z}/{x}/{y}.png"],"tileSize":256}
        },
        "layers":[
          {"id":"baseraster","type":"raster","source":"osm","minzoom":0,"maxzoom":19},
          {"id":"hillshade","type":"raster","source":"esriHill","paint":{"raster-opacity":0.55}}
        ]
      },
      center:[start[1],start[0]], zoom:startZoom, pitch:startPitch, bearing:startBearing
    });
    mlmap.addControl(new maplibregl.NavigationControl({visualizePitch:true}),'top-left');
    mlmap.addControl(new maplibregl.ScaleControl({maxWidth:120,unit:'imperial'}));

    mlmap.on('click', e=>{
      if(pinsHandleMapClick(e.lngLat.lat, e.lngLat.lng)) return;
      if(addMode){ placeBurst([e.lngLat.lat, e.lngLat.lng]); addMode=false; $('#add').classList.remove('active'); }
    });
    mlmap.on('load',()=>{ refreshTiles(); toggleTerrain(); toggleHillshade(); updateStatus(); loadPins(); setPopHeat($('#popHeat').checked); });
    mlmap.on('move', updateStatus);
    mlmap.on('moveend', saveUIState);

  } else {
    useML=false; $('#mlmap').style.display='none';
    lmap=L.map('map').setView(start, startZoom);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OSM'}).addTo(lmap);
    L.tileLayer('https://services.arcgisonline.com/ArcGIS/rest/services/Elevation/World_Hillshade/MapServer/tile/{z}/{y}/{x}',{opacity:0.55}).addTo(lmap);

    lmap.on('click', e=>{
      if(pinsHandleMapClick(e.latlng.lat, e.latlng.lng)) return;
      if(addMode){ placeBurst([e.latlng.lat, e.latlng.lng]); addMode=false; $('#add').classList.remove('active'); }
    });
    refreshTiles(); toggleTerrain(); toggleHillshade(); updateStatus(); loadPins(); setPopHeat($('#popHeat').checked);
    lmap.on('move', updateStatus);
    lmap.on('moveend', saveUIState);
  }
}
initMap();

let resizeTimer;
function mapResizeSoon(){
  clearTimeout(resizeTimer);
  resizeTimer=setTimeout(()=>{ if(useML) mlmap.resize(); else lmap.invalidateSize(); },100);
}

function saveUIState(){
  uiState={
    basemap: $('#basemap').value,
    terrainOn: $('#terrainOn').checked,
    hillshadeOn: $('#hillshadeOn').checked,
    exagg: +$('#exagg').value,
    windDeg, windSpd,
    wx: $('#wx').value,
    popHeatOn: $('#popHeat').checked,
    camera: useML ? {center:[mlmap.getCenter().lat, mlmap.getCenter().lng], zoom:mlmap.getZoom(), pitch:mlmap.getPitch(), bearing:mlmap.getBearing()} : {center:[lmap.getCenter().lat, lmap.getCenter().lng], zoom:lmap.getZoom(), pitch:0, bearing:0}
  };
  lsSet('uiState', uiState);
}

function updateStatus(){
  const zoom = useML ? mlmap.getZoom() : lmap.getZoom();
  const pitch = useML ? mlmap.getPitch() : 0;
  const baseSel = $('#basemap').value;
  const baseLabel = baseSel==='sat' ? 'ESRI Sat + Hillshade' : 'OSM';
  $('#status').textContent = `Z ${zoom.toFixed(1)} • pitch ${pitch.toFixed(0)}° • ${baseLabel}`;
}

/* ===================== panel folding ===================== */
for(const h of document.querySelectorAll('.panel header')){
  h.addEventListener('click',()=>{ h.parentElement.classList.toggle('open'); mapResizeSoon(); });
}
window.addEventListener('resize', mapResizeSoon);

/* ===================== top bar handlers ===================== */
$('#preset').onchange=e=>{ if(e.target.value!=='custom') $('#yield').value=e.target.value; };
$('#add').onclick=()=>{ addMode=!addMode; $('#add').classList.toggle('active',addMode); if(addMode){ pinMode=false; $('#pinMode').classList.remove('active'); } };
$('#clear').onclick=()=>clearMap();
$('#refreshTiles').onclick=refreshTiles;
$('#btnRefresh2').onclick=refreshTiles;
$('#bmSel').onchange=e=>{ $('#basemap').value=e.target.value; refreshTiles(); saveUIState(); updateStatus(); };
$('#basemap').onchange=()=>{ refreshTiles(); saveUIState(); updateStatus(); };
$('#precip').oninput=e=>$('#precipVal').textContent=e.target.value;
$('#humid').oninput=e=>$('#humidVal').textContent=e.target.value;
$('#calcPop').onclick=calcPopulation;

$('#terrainOn').onchange=()=>{ toggleTerrain(); saveUIState(); };
$('#hillshadeOn').onchange=()=>{ toggleHillshade(); saveUIState(); };
$('#exagg').oninput=e=>{ $('#exVal').textContent=e.target.value; if($('#terrainOn').checked) setExaggeration(+e.target.value); saveUIState(); };
$('#wx').onchange=saveUIState;

function refreshTiles(){
  if(useML){
    const sel=$('#basemap').value;
    const src = sel==='sat' ? 'esriSat' : 'osm';
    try{ if(mlmap.getLayer('baseraster')) mlmap.removeLayer('baseraster'); }catch{}
    mlmap.addLayer({"id":"baseraster","type":"raster","source":src,"minzoom":0,"maxzoom":19}, 'hillshade');
  }else{
    lmap.eachLayer(l=>{ if(l._url) l.remove(); });
    const sel=$('#basemap').value;
    if(sel==='sat'){ L.tileLayer('https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',{maxZoom:19}).addTo(lmap); }
    else{ L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19}).addTo(lmap); }
    L.tileLayer('https://services.arcgisonline.com/ArcGIS/rest/services/Elevation/World_Hillshade/MapServer/tile/{z}/{y}/{x}',{opacity:0.55}).addTo(lmap);
  }
}
function toggleTerrain(){
  if(!useML) return;
  if($('#terrainOn').checked){
    mlmap.setTerrain({source:'terrain-dem',exaggeration:+$('#exagg').value});
    if(mlmap.getPitch()<30) mlmap.easeTo({pitch:45});
    if(!lsGet('tiltHintShown',false)){ showHint('Two-finger drag up/down to tilt'); lsSet('tiltHintShown',true); }
  } else {
    mlmap.setTerrain(null);
  }
}
function toggleHillshade(){ if(useML) try{ mlmap.setLayoutProperty('hillshade','visibility',$('#hillshadeOn').checked?'visible':'none'); }catch{} }
function setExaggeration(x){ if(useML) try{ mlmap.setTerrain({source:'terrain-dem',exaggeration:x}); }catch{} }

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
function addFill(gj,id,color,fop,line=true,meta=null){
  if(useML){
    mlmap.addSource(id,{type:'geojson',data:gj});
    mlmap.addLayer({id, type:'fill', source:id, paint:{'fill-color':color,'fill-opacity':fop}});
    if(line) mlmap.addLayer({id:id+'l', type:'line', source:id, paint:{'line-color':color,'line-width':2,'line-opacity':0.9}});
    if(meta){ const handler=e=>showEffectPopup(e.lngLat, meta); mlmap.on('click', id, handler); if(line) mlmap.on('click', id+'l', handler); }
    layersML.push(id);
  }else{
    const lay=L.geoJSON(gj,{style:{color,weight:2,fillColor:color,fillOpacity:fop}}).addTo(lmap);
    if(meta) lay.on('click',e=>showEffectPopup(e.latlng, meta));
    if(meta && meta.label==='Fallout plume') lay._plume=true;
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
  effects=[];
  bursts=[];
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
  shelterMarkers.forEach(m=>m.remove && m.remove()); shelterMarkers=[];
  $('#popRead').textContent='Population in current effects: —';
  $('#shelterRead').textContent='—';
}

function showEffectPopup(ll, meta){
  let size = meta.radius?`Radius ${meta.radius.toFixed(2)} km`:`Len ${meta.len.toFixed(1)} km, width ${meta.width.toFixed(1)} km`;
  let pop='—';
  if(counties){
    let total=0;
    counties.features.forEach(c=>{
      try{
        const inter=turf.intersect(meta.gj, c);
        if(inter){ const frac=turf.area(inter)/turf.area(c); total+=Math.round(c.properties.pop*frac); }
      }catch{}
    });
    pop=total.toLocaleString();
  }
  const html=`<strong>${meta.label}</strong><br>Yield ${meta.y} kt, Alt ${meta.alt} m, WX ${meta.wx}<br>${size}<br>Population: ${pop}`;
  if(useML){ new maplibregl.Popup().setLngLat([ll.lng,ll.lat]).setHTML(html).addTo(mlmap); }
  else{ L.popup().setLatLng(ll).setContent(html).openOn(lmap); }
}

/* ===================== bursts ===================== */
function placeBurst(latlng){
  lastBurst=latlng; const [lat,lng]=latlng;
  const y=+$('#yield').value, a=+$('#alt').value, wx=$('#wx').value;
  const precip=+$('#precip').value, humid=+$('#humid').value;

  addMarker(lat,lng);
  const r20=turf.circle([lng,lat], ringKm(y,20), {steps:128});
  const r5 =turf.circle([lng,lat], ringKm(y,5), {steps:128});
  const r1 =turf.circle([lng,lat], ringKm(y,1), {steps:128});
  const th =turf.circle([lng,lat], thermalKm(y), {steps:128});
  addFill(r20,'r20_'+Math.random(), getCSS('--psi20'), .28,true,{label:'20 psi',y,alt:a,wx,radius:ringKm(y,20),gj:r20});
  addFill(r5 ,'r5_' +Math.random(), getCSS('--psi5') , .25,true,{label:'5 psi',y,alt:a,wx,radius:ringKm(y,5),gj:r5});
  addFill(r1 ,'r1_' +Math.random(), getCSS('--psi1') , .22,true,{label:'1 psi',y,alt:a,wx,radius:ringKm(y,1),gj:r1});
  addFill(th ,'rT_' +Math.random(), getCSS('--therm'), .15,true,{label:'Thermal 3rd°',y,alt:a,wx,radius:thermalKm(y),gj:th});

  if($('#fallout').checked){
    const p=plumeParams(y,wx,a,precip,humid);
    const plume=plumeGJ([lng,lat], windDeg, p.len, p.width);
    addFill(plume,'pl_'+Math.random(), getCSS('--fall'), .22,false,{label:'Fallout plume',y,alt:a,wx,len:p.len,width:p.width,gj:plume});
    effects.push({gj:plume,label:'Fallout plume'});
  }
  effects.push({gj:r20,label:'20 psi'}); effects.push({gj:r5,label:'5 psi'}); effects.push({gj:r1,label:'1 psi'}); effects.push({gj:th,label:'Thermal 3rd°'});
  bursts.push({lat,lng,y,a,wx,precip,humid});
  calcPopulation(); if(myPos) updateETA([lat,lng], windDeg);
}

function recalcPlumes(){
  if(useML){
    layersML = layersML.filter(id=>{
      if(id.startsWith('pl_')){
        try{ mlmap.removeLayer(id+'l'); }catch{}; try{ mlmap.removeLayer(id); }catch{}; try{ mlmap.removeSource(id); }catch{};
        return false;
      }
      return true;
    });
  }else{
    layersLF = layersLF.filter(l=>{ if(l._plume){ try{ l.remove(); }catch{}; return false;} return true; });
  }
  effects = effects.filter(e=>e.label!=='Fallout plume');
  bursts.forEach(b=>{
    if($('#fallout').checked){
      const p=plumeParams(b.y,b.wx,b.a,b.precip,b.humid);
      const plume=plumeGJ([b.lng,b.lat], windDeg, p.len, p.width);
      addFill(plume,'pl_'+Math.random(), getCSS('--fall'), .22,false,{label:'Fallout plume',y:b.y,alt:b.a,wx:b.wx,len:p.len,width:p.width,gj:plume});
      effects.push({gj:plume,label:'Fallout plume'});
    }
  });
  calcPopulation();
}

/* ===================== population ===================== */
async function loadCounties(){
  try{ const r=await fetch('counties.json',{cache:'no-store'}); if(r.ok){ counties=await r.json(); return; } }catch{}
  const tag=document.getElementById('countiesData'); if(tag) counties = JSON.parse(tag.textContent);
}
function setPopHeat(on){
  if(!counties){ alert('Counties still loading'); $('#popHeat').checked=false; const t=$('#popHeatTop'); if(t) t.checked=false; return; }
  if(on){
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
  saveUIState();
}
$('#popHeat').onchange=e=>{ const t=$('#popHeatTop'); if(t) t.checked=e.target.checked; setPopHeat(e.target.checked); };
$('#popHeatTop')?.addEventListener('change',e=>{ $('#popHeat').checked=e.target.checked; setPopHeat(e.target.checked); });
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

/* ===================== wind HUD + ETA ===================== */
const HUD=$('#windHUD'), Hhead=$('#windHead'), Hrez=$('#windResize');
(function(){
  if(!HUD) return;
  const s=lsGet('HUDpos',{left:'10px',bottom:'70px',w:300,h:210});
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
}
function compDrag(ev){
  const rect=comp.getBoundingClientRect();
  const x=ev.clientX-rect.left-rect.width/2, y=ev.clientY-rect.top-rect.height/2;
  windDeg=(toDeg(Math.atan2(x,-y))+360)%360; drawCompass(); updateETAFromLast(); recalcPlumes(); saveUIState();
}
comp?.addEventListener('pointerdown',ev=>{compDrag(ev); comp.setPointerCapture(ev.pointerId);});
comp?.addEventListener('pointermove',ev=>{ if(ev.buttons) compDrag(ev);});
$('#wind').addEventListener('input',e=>{ windDeg=+e.target.value; drawCompass(); updateETAFromLast(); saveUIState(); });
$('#windNum').addEventListener('input',e=>{ windDeg=+e.target.value; drawCompass(); updateETAFromLast(); saveUIState(); });
$('#windSpd').addEventListener('input',e=>{ windSpd=+e.target.value; drawCompass(); updateETAFromLast(); saveUIState(); });
$('#windNumSpd').addEventListener('input',e=>{ windSpd=+e.target.value; drawCompass(); updateETAFromLast(); saveUIState(); });
$('#wind').addEventListener('change',recalcPlumes); $('#windNum').addEventListener('change',recalcPlumes);
$('#windSpd').addEventListener('change',recalcPlumes); $('#windNumSpd').addEventListener('change',recalcPlumes);
drawCompass();

$('#btnGPS')?.addEventListener('click', async ()=>{
  try{
    const pos = await new Promise((res,rej)=>navigator.geolocation.getCurrentPosition(p=>res(p),e=>rej(e),{enableHighAccuracy:true,timeout:10000}));
    myPos=[pos.coords.latitude,pos.coords.longitude];
    addMarker(myPos[0],myPos[1],{color:'#22c55e'});
    updateETAFromLast();
  }catch{
    showErr('GPS failed – allow Location for eyesintheflock.github.io');
    try{
      const pos = await new Promise((res,rej)=>navigator.geolocation.getCurrentPosition(p=>res(p),e=>rej(e),{enableHighAccuracy:false,timeout:10000,maximumAge:60000}));
      myPos=[pos.coords.latitude,pos.coords.longitude];
      addMarker(myPos[0],myPos[1],{color:'#22c55e'});
      updateETAFromLast();
    }catch{ showErr('GPS still unavailable'); }
  }
});
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
  const mins = Math.max(0, Math.round((distKm*1000)/windSpd/60));
  $('#hudEta').textContent = `ETA to you: ${mins} min`;
  $('#hudLeave').textContent = `Leave-shelter est: ~${mins+420} min (rule-of-7/10)`;
}

/* ===================== shelter finder ===================== */
async function getElevation(lat,lng){ if(!useML) return null; try{ return mlmap.queryTerrainElevation({lng,lat}); }catch{ return null; } }
function dotMarker(lat,lng,ok=true){
  if(useML){
    const el=document.createElement('div'); el.style.width='10px'; el.style.height='10px'; el.style.borderRadius='50%';
    el.style.border='2px solid #0f172a'; el.style.background= ok?'#22c55e':'#f59e0b';
    return new maplibregl.Marker({element:el}).setLngLat([lng,lat]).addTo(mlmap);
  }else{
    const c= ok?'#22c55e':'#f59e0b'; return L.circleMarker([lat,lng],{radius:6,color:'#0f172a',fillColor:c,fillOpacity:1,weight:2}).addTo(lmap);
  }
}
function clearShelters(){ shelterMarkers.forEach(m=>m.remove && m.remove()); shelterMarkers=[]; $('#shelterRead').textContent='—'; }
$('#clearShelter')?.addEventListener('click', clearShelters);
$('#findShelter')?.addEventListener('click', async ()=>{
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
});

/* ===================== pins / waypoints ===================== */
let pinMode=false, pins=[], pinIdCounter=1, pinsSelectedId=null;
$('#pinMode')?.addEventListener('click', ()=>{ pinMode=!pinMode; $('#pinMode').classList.toggle('active',pinMode); if(pinMode){ addMode=false; $('#add').classList.remove('active'); } });
$('#pinAddNow')?.addEventListener('click', ()=>{ const c = getMapCenter(); addPin(c.lat,c.lng); });
$('#pinClearAll')?.addEventListener('click', ()=>{ pins.forEach(p=>p.marker.remove()); pins=[]; savePins(); renderPinList(); });
$('#homeCenter')?.addEventListener('click', ()=>centerOnPinType('home'));
$('#workCenter')?.addEventListener('click', ()=>centerOnPinType('work'));
$('#goSelected')?.addEventListener('click', ()=>{ const p=pins.find(x=>x.id===pinsSelectedId); if(!p) return alert('Select a pin in the list first.'); flyTo(p.lat,p.lng); });

function getMapCenter(){ if(useML){ const c=mlmap.getCenter(); return {lat:c.lat,lng:c.lng}; } else { const c=lmap.getCenter(); return {lat:c.lat,lng:c.lng}; } }
function pinsHandleMapClick(lat,lng){ if(!pinMode) return false; addPin(lat,lng); return true; }

function addPin(lat,lng){
  const type=$('#pinType').value, color=$('#pinColor').value;
  const id=pinIdCounter++; const label=prompt('Label for pin?', type)||type;
  const m = addMarker(lat,lng,{color});
  const pin={id,lat,lng,type,color,label,marker:m,notes:'',locked:false}; pins.push(pin);
  attachPinHandlers(pin);
  renderPinList(true); savePins();
}
function attachPinHandlers(pin){
  const m=pin.marker;
  if(useML){
    m._m.setDraggable(!pin.locked);
    const popup=new maplibregl.Popup({offset:25}).setHTML(pinPopupHTML(pin));
    m._m.setPopup(popup);
    m._m.on('dragend',ev=>{ const ll=ev.target.getLngLat(); pin.lng=ll.lng; pin.lat=ll.lat; renderPinList(false); savePins();});
  }else{
    if(!pin.locked) m._m.dragging.enable(); else m._m.dragging.disable();
    m._m.bindPopup(pinPopupHTML(pin));
    m._m.on('dragend',ev=>{ const ll=ev.target.getLatLng(); pin.lat=ll.lat; pin.lng=ll.lng; renderPinList(false); savePins();});
  }
}
function pinPopupHTML(p){
  return `<strong>${p.label}</strong><br>${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}${p.notes?`<br>${p.notes}`:''}`;
}
function editPin(id){
  const p = pins.find(x=>x.id===id); if(!p) return;
  const lbl = prompt('Edit label:', p.label); if(lbl!=null) p.label=lbl;
  const nt  = prompt('Notes (free text):', p.notes??''); if(nt!=null) p.notes=nt;
  attachPinHandlers(p);
  renderPinList(false); savePins();
}
function deletePin(id){
  const i=pins.findIndex(x=>x.id===id); if(i<0) return; pins[i].marker.remove(); pins.splice(i,1); savePins(); renderPinList(true);
}
function centerOnPinType(t){
  const p = pins.find(x=>x.type===t);
  if(!p){ alert(`No ${t} pin yet.`); return; }
  flyTo(p.lat,p.lng);
}
function renderPinList(scrollBottom=true){
  const box=$('#pinList'); if(!box) return;
  if(pins.length===0){ box.innerHTML='<div class="note">No pins yet.</div>'; return; }
  box.innerHTML=pins.map(p=>`
    <div class="pin-item" data-id="${p.id}">
      <div>
        <span class="pin-swatch" style="background:${p.color}"></span>
        <strong>${p.label}</strong> <span class="meta">(${p.type})</span>
        <div class="meta">${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}</div>
      </div>
      <div>
        <button class="smallbtn" data-act="go">Go</button>
        <button class="smallbtn" data-act="edit">Edit</button>
        <button class="smallbtn" data-act="del">Del</button>
        <button class="smallbtn" data-act="lock">${p.locked?'Unlock':'Lock'}</button>
      </div>
    </div>`).join('');
  box.querySelectorAll('.pin-item').forEach(el=>{
    const id=+el.dataset.id;
    el.addEventListener('click',()=>{ pinsSelectedId=id; });
    el.querySelector('[data-act="go"]').onclick=(e)=>{ e.stopPropagation(); const p=pins.find(x=>x.id===id); flyTo(p.lat,p.lng); };
    el.querySelector('[data-act="edit"]').onclick=(e)=>{ e.stopPropagation(); editPin(id); };
    el.querySelector('[data-act="del"]').onclick=(e)=>{ e.stopPropagation(); deletePin(id); };
    el.querySelector('[data-act="lock"]').onclick=(e)=>{ e.stopPropagation(); togglePinLock(id); };
  });
  if(scrollBottom) box.scrollTop=box.scrollHeight;
}
function togglePinLock(id){
  const p=pins.find(x=>x.id===id); if(!p) return; p.locked=!p.locked; attachPinHandlers(p); renderPinList(false); savePins();
}
function savePins(){ lsSet('pins', pins.map(p=>({id:p.id,lat:p.lat,lng:p.lng,type:p.type,color:p.color,label:p.label,notes:p.notes,locked:p.locked}))); }
function loadPins(){
  const data=lsGet('pins',[]);
  data.forEach(d=>{ const m=addMarker(d.lat,d.lng,{color:d.color}); const pin={...d,marker:m}; pins.push(pin); attachPinHandlers(pin); pinIdCounter=Math.max(pinIdCounter,d.id+1); });
  renderPinList(false);
}

/* ===================== LIVE WIND (Open-Meteo) ===================== */
async function fetchLiveWind(lat, lng) {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(4)}` +
    `&longitude=${lng.toFixed(4)}&current=wind_speed_10m,wind_direction_10m`;

  let r, j;
  try {
    r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    j = await r.json();
  } catch (err) {
    $('#windSrc').innerHTML =
      `<span class="src-err">Live wind failed</span> – ${String(err).slice(0,80)}`;
    return false;
  }

  const cur = j.current;
  if (!cur || typeof cur.wind_direction_10m !== 'number' || typeof cur.wind_speed_10m !== 'number') {
    $('#windSrc').innerHTML = `<span class="src-err">Live wind: missing fields</span>`;
    return false;
  }

  // Open-Meteo gives wind FROM; our plume travels TO:
  const dirTo = (cur.wind_direction_10m + 180) % 360;
  const spd   = Math.max(0, cur.wind_speed_10m);

  applyLiveWind(dirTo, spd, `Open-Meteo`);
  return true;
}

function applyLiveWind(deg, spd, whereText) {
  windDeg = deg;
  windSpd = spd;
  drawCompass();
  updateETAFromLast();
  const now = new Date();
  const hh = String(now.getHours()).padStart(2,'0');
  const mm = String(now.getMinutes()).padStart(2,'0');
  $('#windSrc').innerHTML =
    `<span class="src-ok">Live wind</span> ${deg.toFixed(0)}° (${bearingToCardinal(deg)}), ` +
    `${spd.toFixed(1)} m/s • ${whereText} • ${hh}:${mm}`;
  recalcPlumes();
  saveUIState();
}

$('#liveWind')?.addEventListener('click', async () => {
  const c = myPos ? {lat:myPos[0],lng:myPos[1]} : getMapCenter();
  await fetchLiveWind(c.lat, c.lng);
});

/* ===================== boot small tasks ===================== */
(async function(){ await loadCounties(); })();
