/* ===== Utilities & state ===== */
const $=s=>document.querySelector(s);
const getCSS=v=>getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const toRad=d=>d*Math.PI/180,toDeg=r=>r*180/Math.PI;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const bearingToCardinal=b=>['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'][Math.round(((b%360)+360)%360/22.5)%16];
const lsGet=(k,def)=>{try{const v=localStorage.getItem(k);return v?JSON.parse(v):def;}catch{return def}};
const lsSet=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v));}catch{}};
const showErr=msg=>{const e=$('#err');e.textContent=msg;e.style.display='block';setTimeout(()=>e.style.display='none',3500);};

let useML=false, mlmap, lmap;
let addMode=false, windDeg=lsGet('windDeg',90), windSpd=lsGet('windSpd',10);
let effects=[]; let lastBurst=null;
let counties=null, popHeatLayer=null, riskPaint={};
let myPos=null, shelterMarkers=[];
let pins=lsGet('pins',[]), addPinMode=false;

/* ===== WebGL gate + map init ===== */
function getFlag(name){return new URLSearchParams(location.search).has(name);}
function webglOk(){try{if(getFlag('leaf'))return false;const c=document.createElement('canvas');return !!(window.WebGLRenderingContext&&(c.getContext('webgl')||c.getContext('experimental-webgl')));}catch{return false}}
function initMap() {
  const start=[45.85,-123.49];
  if(webglOk()){
    useML=true; $('#map').style.display='none';
    mlmap=new maplibregl.Map({
      container:'mlmap',
      style:{
        version:8,
        sources:{
          osm:{type:'raster',tiles:[
            'https://a.tile.openstreetmap.org/{z}/{x}/{y}.png',
            'https://b.tile.openstreetmap.org/{z}/{x}/{y}.png',
            'https://c.tile.openstreetmap.org/{z}/{x}/{y}.png'],tileSize:256,attribution:'© OSM'},
          'terrain-dem':{type:'raster-dem',tiles:['https://demotiles.maplibre.org/terrain-tiles/{z}/{x}/{y}.png'],tileSize:256}
        },
        layers:[
          {id:'baseraster',type:'raster',source:'osm',minzoom:0,maxzoom:19},
          {id:'hillshade',type:'hillshade',source:'terrain-dem',layout:{visibility:'none'},paint:{'hillshade-exaggeration':0.6}}
        ]
      },
      center:[start[1],start[0]],zoom:8.6,pitch:0
    });
    mlmap.addControl(new maplibregl.NavigationControl({visualizePitch:true}),'top-left');
    mlmap.addControl(new maplibregl.ScaleControl({maxWidth:120,unit:'imperial'}));
    mlmap.on('click',e=>{
      if(addMode){ placeBurst([e.lngLat.lat,e.lngLat.lng]); addMode=false; $('#add').classList.remove('active'); }
      if(addPinMode){ addPinAt([e.lngLat.lat,e.lngLat.lng]); }
    });
  }else{
    useML=false; $('#mlmap').style.display='none';
    lmap=L.map('map',{tap: true}).setView(start,9);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OSM'}).addTo(lmap);
    L.tileLayer('https://tiles.wmflabs.org/hillshading/{z}/{x}/{y}.png',{opacity:0.5}).addTo(lmap);
    lmap.on('click',e=>{
      if(addMode){ placeBurst([e.latlng.lat,e.latlng.lng]); addMode=false; $('#add').classList.remove('active'); }
      if(addPinMode){ addPinAt([e.latlng.lat,e.latlng.lng]); }
    });
  }
}
initMap();

/* Panel toggles */
for(const h of document.querySelectorAll('.panel header')) h.addEventListener('click',()=>h.parentElement.classList.toggle('open'));

/* ===== Controls ===== */
$('#preset').onchange=e=>{ if(e.target.value!=='custom') $('#yield').value=e.target.value; };
$('#add').onclick=()=>{ addMode=!addMode; $('#add').classList.toggle('active',addMode); if(addMode) addPinMode=false; };
$('#clear').onclick=clearMap;
$('#refreshTiles').onclick=refreshTiles; $('#btnRefresh2').onclick=refreshTiles;
$('#bmSel').onchange=e=>{ $('#basemap').value=e.target.value; refreshTiles(); };
$('#basemap').onchange=refreshTiles;
$('#precip').oninput=e=>$('#precipVal').textContent=e.target.value;
$('#humid').oninput=e=>$('#humidVal').textContent=e.target.value;
$('#calcPop').onclick=calcPopulation;
$('#terrainOn').onchange=()=>toggleTerrain();
$('#hillshadeOn').onchange=()=>toggleHillshade();
$('#exagg').oninput=e=>{ $('#exVal').textContent=e.target.value; setExaggeration(+e.target.value); };

$('#riskLevel').onchange=()=>{ if(!counties) return; showErr($('#riskLevel').value? 'Risk paint ON: tap counties' : 'Risk paint OFF'); };
$('#riskClear').onclick=()=>{ riskPaint={}; renderRiskPaint(); lsSet('riskPaint',riskPaint); };

function refreshTiles(){
  if(useML){
    const sel=$('#basemap').value;
    // (osm/sat selection kept simple; demo sat uses osm)
    try{ if(mlmap.getLayer('baseraster')) mlmap.removeLayer('baseraster'); }catch{}
    mlmap.addLayer({id:'baseraster',type:'raster',source:'osm',minzoom:0,maxzoom:19},'hillshade');
  }else{
    let base=null, shade=null;
    lmap.eachLayer(l=>{ if(l._url){ if(l._url.includes('openstreetmap')) base=l; else shade=l; } });
    if(base) base.redraw();
    if(shade) shade.redraw();
  }
}
function toggleTerrain(){ if(useML) mlmap.setTerrain($('#terrainOn').checked?{source:'terrain-dem',exaggeration:+$('#exagg').value}:null); }
function toggleHillshade(){ if(useML) try{ mlmap.setLayoutProperty('hillshade','visibility',$('#hillshadeOn').checked?'visible':'none'); }catch{} }
function setExaggeration(x){ if(useML) try{ mlmap.setTerrain({source:'terrain-dem',exaggeration:x}); }catch{} }

/* ===== Effects models ===== */
function ringKm(y,psi){ const W=Math.cbrt(Math.max(0.1,y)); if(psi===20) return 0.9*W; if(psi===5) return 1.9*W; if(psi===1) return 4.2*W; return 0; }
function thermalKm(y){ return 7.0*Math.cbrt(Math.max(0.1,y)); }
function plumeParams(y,wx,alt,precip,humid){ const base=Math.sqrt(Math.max(0.1,y)); let len=25*base,width=6*base; if(wx==='rain'){len*=0.82;width*=0.72;} if(wx==='snow'){len*=0.90;width*=0.80;} len*=(1-0.25*(precip/100)); width*=(1-0.25*(precip/100)); len*=(1-0.1*(humid/100)); if(alt>300){len*=0.6;width*=0.6;} return {len,width}; }

/* ===== Geometry helpers ===== */
function offsetOnEarth(lat,lng, fwdM, brgDeg, rightM){
  const R=6371000,b=toRad(brgDeg),d=fwdM/R,lat1=toRad(lat),lon1=toRad(lng);
  const lat2=Math.asin(Math.sin(lat1)*Math.cos(d)+Math.cos(lat1)*Math.sin(d)*Math.cos(b));
  const lon2=lon1+Math.atan2(Math.sin(b)*Math.sin(d)*Math.cos(lat1),Math.cos(d)-Math.sin(lat1)*Math.sin(lat2));
  const b2=b+Math.PI/2,d2=rightM/R;
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

/* ===== Draw & interactivity ===== */
let layersML=[], layersLF=[];
function addFill(gj,id,color,fop,line=true,meta={}){
  if(useML){
    mlmap.addSource(id,{type:'geojson',data:gj});
    mlmap.addLayer({id, type:'fill', source:id, paint:{'fill-color':color,'fill-opacity':fop}});
    if(line) mlmap.addLayer({id:id+'l', type:'line', source:id, paint:{'line-color':color,'line-width':2,'line-opacity':0.9}});
    mlmap.on('click',id,(e)=> ringPopup(meta, gj, [e.lngLat.lng,e.lngLat.lat]));
    layersML.push(id);
  }else{
    const lay=L.geoJSON(gj,{style:{color,weight:2,fillColor:color,fillOpacity:fop}})
      .addTo(lmap)
      .on('click',e=> ringPopup(meta, gj, [e.latlng.lng,e.latlng.lat]));
    layersLF.push(lay);
  }
}
function clearMap(){
  effects=[]; if(useML){ layersML.forEach(id=>{try{mlmap.removeLayer(id+'l');}catch{} try{mlmap.removeLayer(id);}catch{} try{mlmap.removeSource(id);}catch{} }); layersML=[]; }
  else { layersLF.forEach(l=>{try{l.remove();}catch{}}); layersLF=[]; }
  if(popHeatLayer){ if(useML){try{mlmap.removeLayer('popHeat');mlmap.removeSource('popHeat');}catch{}} else {try{lmap.removeLayer(popHeatLayer);}catch{} } popHeatLayer=null;
  shelterMarkers.forEach(m=>m.remove && m.remove()); shelterMarkers=[];
  $('#popRead').textContent='Population in current effects: —'; $('#shelterRead').textContent='—';
}

/* ===== Bursts ===== */
function placeBurst(latlng){
  lastBurst=latlng;
  const [lat,lng]=latlng;
  const y=+$('#yield').value, a=+$('#alt').value, wx=$('#wx').value;
  const precip=+$('#precip').value, humid=+$('#humid').value;

  // marker
  if(useML) new maplibregl.Marker().setLngLat([lng,lat]).addTo(mlmap); else L.marker([lat,lng]).addTo(lmap);

  // rings
  const r20=ringKm(y,20), r5=ringKm(y,5), r1=ringKm(y,1), th=thermalKm(y);
  const c20=turf.circle([lng,lat], r20, {steps:128});
  const c5=turf.circle([lng,lat], r5, {steps:128});
  const c1=turf.circle([lng,lat], r1, {steps:128});
  const cT=turf.circle([lng,lat], th, {steps:128});
  addFill(c20,'r20_'+Math.random(), getCSS('--psi20'), .28,true,{name:'20 psi',km:r20});
  addFill(c5 ,'r5_' +Math.random(), getCSS('--psi5') , .25,true,{name:'5 psi',km:r5});
  addFill(c1 ,'r1_' +Math.random(), getCSS('--psi1') , .22,true,{name:'1 psi',km:r1});
  addFill(cT ,'rT_' +Math.random(), getCSS('--therm'), .15,true,{name:'Thermal 3rd°',km:th});

  // fallout plume
  if($('#fallout').checked){
    const p=plumeParams(y,wx,a,precip,humid);
    const plume=plumeGJ([lng,lat], windDeg, p.len, p.width);
    addFill(plume,'pl_'+Math.random(), getCSS('--fall'), .22,false,{name:'Fallout plume',len:p.len,width:p.width});
    effects.push({gj:plume,label:'Fallout plume'});
  }
  effects.push({gj:c20,label:'20 psi'}); effects.push({gj:c5,label:'5 psi'}); effects.push({gj:c1,label:'1 psi'}); effects.push({gj:cT,label:'Thermal 3rd°'});

  calcPopulation(); if(myPos) updateETA([lat,lng], windDeg);
}

/* Ring popup content */
function ringPopup(meta, gj, atLngLat){
  let areaKm2 = turf.area(gj)/1e6;
  let radTxt = meta.km? `${meta.km.toFixed(1)} km (${(meta.km*0.621).toFixed(1)} mi)` : '';
  let cas = estimateCasualties(gj);
  let html = `<div class="map-popup"><h4>${meta.name||'Effect'}</h4>
  <div class="sub">${radTxt} • Area ${(areaKm2).toFixed(1)} km²</div>
  <div>Est. affected pop: <b>${cas.total.toLocaleString()}</b></div>
  ${cas.top? `<div class="sub">${cas.top.join(' • ')}</div>`:''}
  <div class="sub">${meta.name==='Fallout plume'?'Downwind dose plume — avoid centerline; cross-wind escape preferred.':'Overpressure/thermal guidance varies by construction; seek hard cover.'}</div></div>`;

  if(useML){
    new maplibregl.Popup({closeButton:true,maxWidth:'280px'})
      .setLngLat(atLngLat).setHTML(html).addTo(mlmap);
  }else{
    L.popup({className:'map-popup'})
      .setLatLng([atLngLat[1]?atLngLat[1]:atLngLat[0], atLngLat[1]?atLngLat[0]:atLngLat[1]]) // tolerate both
      .setContent(html).openOn(lmap);
  }
}

/* ===== Population, counties, risk paint ===== */
async function loadCounties(){
  try{ const r=await fetch('counties.json',{cache:'no-store'}); if(r.ok){ counties=await r.json(); } }catch{}
  if(!counties){
    // tiny OR/WA sample fallback (same one you used earlier)
    counties = JSON.parse(document.getElementById('countiesData')?.textContent || '{"type":"FeatureCollection","features":[]}');
  }
  riskPaint = lsGet('riskPaint', {});
  renderRiskPaint();
  // enable risk painting
  const setRisk=(lng,lat)=>{
    const lvl=$('#riskLevel').value; if(!lvl) return;
    for(const f of counties.features){
      try{
        if(turf.booleanPointInPolygon([lng,lat],f)){
          riskPaint[f.properties.name]=+lvl;
          lsSet('riskPaint',riskPaint);
          renderRiskPaint(); break;
        }
      }catch{}
    }
  };
  if(useML){ mlmap.on('click',(e)=> setRisk(e.lngLat.lng,e.lngLat.lat)); }
  else { lmap.on('click',(e)=> setRisk(e.latlng.lng,e.latlng.lat)); }
}
loadCounties();

function renderRiskPaint(){
  if(!counties) return;
  // merge risk color into a layer
  const colored = JSON.parse(JSON.stringify(counties));
  colored.features.forEach(f=>{
    const r = riskPaint[f.properties.name]||0;
    f.properties._risk = r;
  });
  if(useML){
    try{ mlmap.removeLayer('risk'); mlmap.removeSource('risk'); }catch{}
    mlmap.addSource('risk',{type:'geojson',data:colored});
    mlmap.addLayer({id:'risk',type:'fill',source:'risk',
      paint:{'fill-color':['match',['get','_risk'],0,'#00000000',1,'#22c55e55',2,'#f59e0b55',3,'#ef444455','#0000'],
             'fill-opacity':1}});
  }else{
    if(window._riskLayer) { try{ lmap.removeLayer(window._riskLayer);}catch{} }
    window._riskLayer = L.geoJSON(colored,{style:(f)=>({
      color:'#444',weight:1,fillColor: f.properties._risk===3?'#ef444455':f.properties._risk===2?'#f59e0b55':f.properties._risk===1?'#22c55e55':'#0000',
      fillOpacity:1
    })}).addTo(lmap);
  }
}

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

function estimateCasualties(gj){
  if(!counties) return {total:0, top:[]};
  let total=0, parts=[];
  for(const c of counties.features){
    try{
      const inter=turf.intersect(gj,c); if(!inter) continue;
      const frac = turf.area(inter)/turf.area(c);
      const ppl = Math.round(c.properties.pop*frac);
      if(ppl>0){ total+=ppl; parts.push(`${c.properties.name}: ${ppl.toLocaleString()}`); }
    }catch{}
  }
  parts.sort((a,b)=>parseInt(b.split(':')[1])-parseInt(a.split(':')[1]));
  return {total, top: parts.slice(0,3)};
}
async function calcPopulation(){
  if(!counties||effects.length===0){ $('#popRead').textContent= effects.length? 'Population: (loading counties…)':'Population in current effects: —'; return; }
  let union=effects[0].gj; for(let i=1;i<effects.length;i++){ try{union=turf.union(union,effects[i].gj);}catch{} }
  const est=estimateCasualties(union); $('#popRead').textContent=`Population in effects: ${est.total.toLocaleString()}${est.top.length? ' — '+est.top.join(' • ') : ''}`;
}

/* ===== Wind HUD + ETA ===== */
const HUD=$('#windHUD'), Hhead=$('#windHead'), Hrez=$('#windResize');
(function(){ // drag + resize + persist
  const s=lsGet('HUDpos',{left:'10px',bottom:'10px',w:300,h:210});
  HUD.style.left=s.left; HUD.style.bottom=s.bottom||'10px'; HUD.style.width=s.w+'px'; HUD.style.height=s.h+'px';
  let drag=false,sx=0,sy=0,ox=0,oy=0;
  Hhead.addEventListener('pointerdown',ev=>{drag=true;sx=ev.clientX;sy=ev.clientY;const r=HUD.getBoundingClientRect();ox=r.left;oy=r.top;Hhead.setPointerCapture(ev.pointerId);});
  Hhead.addEventListener('pointermove',ev=>{if(!drag)return;const dx=ev.clientX-sx,dy=ev.clientY-sy;HUD.style.left=(ox+dx)+'px';HUD.style.top=(oy+dy)+'px';HUD.style.bottom='auto';});
  Hhead.addEventListener('pointerup',()=>{drag=false;save();});
  let rez=false,rsx=0,rsy=0,rw=0,rh=0;
  Hrez.addEventListener('pointerdown',ev=>{rez=true;rsx=ev.clientX;rsy=ev.clientY;const r=HUD.getBoundingClientRect();rw=r.width;rh=r.height;Hrez.setPointerCapture(ev.pointerId);});
  Hrez.addEventListener('pointermove',ev=>{if(!rez)return;const dx=ev.clientX-rsx,dy=ev.clientY-rsy;HUD.style.width=Math.max(220,rw+dx)+'px';HUD.style.height=Math.max(160,rh+dy)+'px';});
  Hrez.addEventListener('pointerup',()=>{rez=false;save();});
  function save(){const r=HUD.getBoundingClientRect();lsSet('HUDpos',{left:HUD.style.left||r.left+'px',bottom:HUD.style.bottom||'10px',w:r.width,h:r.height});}
  $('#windCenter').onclick=()=>{HUD.style.left='10px';HUD.style.bottom='10px';HUD.style.top='auto';save();};
  $('#windHide').onclick=()=>{HUD.style.display='none';};
})();
const comp=$('#windCompass'), ctx=comp.getContext('2d');
function drawCompass(){
  const w=comp.width, h=comp.height, r=Math.min(w,h)/2-8, cx=w/2, cy=h/2;
  ctx.clearRect(0,0,w,h);
  ctx.save(); ctx.beginPath(); ctx.arc(cx,cy,r,0,Math.PI*2); ctx.fillStyle='#0b0e12'; ctx.fill(); ctx.lineWidth=2; ctx.strokeStyle='#1d2633'; ctx.stroke();
  ctx.translate(cx,cy);
  for(let i=0;i<36;i++){ ctx.save(); ctx.rotate(i*10*Math.PI/180); ctx.beginPath(); ctx.moveTo(0,-r+4); ctx.lineTo(0,-r+(i%9===0?14:8)); ctx.strokeStyle=i%9===0?'#fff':'#586275'; ctx.lineWidth=i%9===0?2:1; ctx.stroke(); ctx.restore(); }
  ctx.save(); ctx.rotate(toRad(windDeg)); ctx.beginPath(); ctx.moveTo(0,10); ctx.lineTo(0,-r+16); ctx.strokeStyle:'#22d3ee'; ctx.lineWidth=4; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0,-r+16); ctx.lineTo(7,-r+34); ctx.lineTo(-7,-r+34); ctx.closePath(); ctx.fillStyle='#22d3ee'; ctx.fill();
  ctx.restore(); ctx.restore();
  $('#windRead').textContent=`${Math.round(windDeg)}° (${bearingToCardinal(windDeg)}), ${windSpd} m/s`;
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
['wind','windNum'].forEach(id=>$( '#'+id ).addEventListener('input',e=>{windDeg=+e.target.value;drawCompass();updateETAFromLast();}));
['windSpd','windNumSpd'].forEach(id=>$( '#'+id ).addEventListener('input',e=>{windSpd=+e.target.value;drawCompass();updateETAFromLast();}));
drawCompass();

$('#btnGPS').onclick=async ()=>{
  try{
    const pos=await new Promise((res,rej)=>navigator.geolocation.getCurrentPosition(res,rej,{enableHighAccuracy:true,timeout:10000}));
    myPos=[pos.coords.latitude,pos.coords.longitude];
    if(useML) new maplibregl.Marker({color:'#22c55e'}).setLngLat([myPos[1],myPos[0]]).addTo(mlmap);
    else L.marker(myPos).addTo(lmap);
    updateETAFromLast();
  }catch{ showErr('GPS failed (permissions or no fix)'); }
};

function updateETAFromLast(){ if(lastBurst && myPos) updateETA(lastBurst, windDeg); }
function updateETA(burstLatLng, brgDeg){
  const [bLat,bLng]=burstLatLng; if(!myPos) return;
  const [uLat,uLng]=myPos;
  const dest=offsetOnEarth(bLat,bLng, 1000000, brgDeg, 0);
  const line=turf.lineString([[bLng,bLat],[dest[1],dest[0]]]);
  const pt=turf.point([uLng,uLat]);
  const snapped=turf.nearestPointOnLine(line,pt);
  const distKm=snapped.properties.location*111.32;
  if(windSpd<=0){ $('#hudEta').textContent='ETA to you: wind=0'; return; }
  const mins=Math.max(0,Math.round((distKm*1000)/windSpd/60));
  $('#hudEta').textContent=`ETA to you: ${mins} min`;
  $('#hudLeave').textContent=`Leave-shelter est: ~${mins+420} min (rule-of-7/10)`;
}

/* ===== Shelter finder ===== */
async function getElevation(lat,lng){ if(!useML) return null; try{return mlmap.queryTerrainElevation({lng,lat});}catch{return null} }
function dotMarker(lat,lng,ok=true){
  if(useML){ const el=document.createElement('div'); el.style.width='10px';el.style.height='10px';el.style.borderRadius='50%';el.style.border='2px solid #0f172a';el.style.background= ok?'#22c55e':'#f59e0b'; return new maplibregl.Marker({element:el}).setLngLat([lng,lat]).addTo(mlmap);}
  else return L.circleMarker([lat,lng],{radius:6,color:'#0f172a',fillColor: ok?'#22c55e':'#f59e0b',fillOpacity:1,weight:2}).addTo(lmap);
}
function clearShelters(){ shelterMarkers.forEach(m=>m.remove && m.remove()); shelterMarkers=[]; $('#shelterRead').textContent='—'; }
$('#clearShelter').onclick=clearShelters;
$('#findShelter').onclick=async ()=>{
  if(!myPos){ alert('Tap “My Position” first.'); return; }
  clearShelters();
  const R=+$('#radius').value, samples=36;
  let best=null,bestScore=-1;
  const centerEl=await getElevation(myPos[0],myPos[1]);
  for(let i=0;i<samples;i++){
    const brg=i*360/samples; const pt=offsetOnEarth(myPos[0],myPos[1], R, brg, 0); const lat=pt[0],lng=pt[1];
    const el=await getElevation(lat,lng);
    let score=0,why=[];
    if(centerEl!=null && el!=null){ const delta=el-centerEl; if(delta<-3){score+=2;why.push('lower');} if(delta>4){score-=1;why.push('ridge');}}
    const rel=Math.abs((((brg-windDeg+540)%360)-180));
    if(rel<100){score+=2;why.push('leeward');} if(rel<15){score-=2;why.push('downwind');}
    const m=dotMarker(lat,lng,score>=2); shelterMarkers.push(m);
    if(score>bestScore){bestScore=score;best={lat,lng,why};}
  }
  $('#shelterRead').textContent=best?(`Best nearby: ${best.lat.toFixed(5)}, ${best.lng.toFixed(5)} — ${best.why.join(', ')}`):'No terrain advantage; use hard cover and cross-wind routes.';
};

/* ===== Waypoints (Home/Work/… ) ===== */
function pinColor(type){
  return {home:'#38bdf8',work:'#a78bfa',cache:'#22c55e',family:'#f43f5e',checkpoint:'#f59e0b',op:'#eab308',shelter:'#10b981',threat:'#ef4444',poi:'#94a3b8'}[type]||'#94a3b8';
}
function addPinAt(latlng){
  const type=$('#pinType').value, label=$('#pinLabel').value||type, score=+$('#pinScore').value||0;
  const pin={id:'p'+Date.now(),type,label,score,lat:latlng[0],lng:latlng[1]};
  pins.push(pin); lsSet('pins',pins); addPinMode=false; $('#pinAdd').classList.remove('active'); drawPin(pin,true);
  if(type==='home') lsSet('home',pin), showErr('Home set.'); if(type==='work') lsSet('work',pin), showErr('Work set.');
}
function drawPin(p,center){
  const color=pinColor(p.type), el= useML? (()=>{const e=document.createElement('div');e.style.background=color;e.style.width='14px';e.style.height='14px';e.style.borderRadius='50%';e.style.border='2px solid #0f172a';e.title=p.label+(p.type==='shelter'?` (${p.score}/10)`:'');return e;})() : null;
  let marker; if(useML) marker=new maplibregl.Marker({element:el}).setLngLat([p.lng,p.lat]).addTo(mlmap); else marker=L.circleMarker([p.lat,p.lng],{radius:7,weight:2,color:'#0f172a',fillColor:color,fillOpacity:1}).addTo(lmap).bindTooltip(p.label+(p.type==='shelter'?` (${p.score}/10)`:''));
  p._m=marker;
  if(center){ if(useML) mlmap.flyTo({center:[p.lng,p.lat],zoom:11}); else lmap.setView([p.lat,p.lng],11); }
}
function redrawPins(){ pins.forEach(p=> drawPin(p,false)); }
$('#pinAdd').onclick=()=>{ addPinMode=!addPinMode; $('#pinAdd').classList.toggle('active',addPinMode); if(addPinMode) addMode=false; };
$('#pinList').onclick=()=> alert(pins.length? pins.map(p=>`${p.type.toUpperCase()}: ${p.label} @ ${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}${p.type==='shelter'?` [${p.score}/10]`:''}`).join('\n') : 'No pins yet.');
$('#homeCenter').onclick=()=>{ const c = centerLngLat(); const p={id:'home',type:'home',label:'Home',lat:c[1],lng:c[0]}; pins=pins.filter(x=>x.type!=='home'); pins.push(p); lsSet('pins',pins); drawPin(p,true); lsSet('home',p); };
$('#workCenter').onclick=()=>{ const c = centerLngLat(); const p={id:'work',type:'work',label:'Work',lat:c[1],lng:c[0]}; pins=pins.filter(x=>x.type!=='work'); pins.push(p); lsSet('pins',pins); drawPin(p,true); lsSet('work',p); };
$('#goHome').onclick=()=>{ const p=lsGet('home',null); if(!p) return showErr('No Home set'); if(useML) mlmap.flyTo({center:[p.lng,p.lat],zoom:11}); else lmap.setView([p.lat,p.lng],11); };
$('#goWork').onclick=()=>{ const p=lsGet('work',null); if(!p) return showErr('No Work set'); if(useML) mlmap.flyTo({center:[p.lng,p.lat],zoom:11}); else lmap.setView([p.lat,p.lng],11); };
$('#goSelected').onclick=()=>{ if(!pins.length) return; const p=pins[pins.length-1]; if(useML) mlmap.flyTo({center:[p.lng,p.lat],zoom:12}); else lmap.setView([p.lat,p.lng],12); };

function centerLngLat(){ if(useML){ const c=mlmap.getCenter(); return [c.lng,c.lat]; } const c=lmap.getCenter(); return [c.lng,c.lat]; }

/* restore pins on load */
setTimeout(redrawPins,1200);

/* ===== Adversary timer ===== */
let advInt=null, advUntil=0;
function tickAdv(){
  const left=Math.max(0,Math.round((advUntil - Date.now())/1000));
  if(left<=0){ $('#advShow').textContent='ARRIVED'; clearInterval(advInt); advInt=null; return; }
  const m=Math.floor(left/60), s=left%60; $('#advShow').textContent=`T– ${m}:${s.toString().padStart(2,'0')}`;
}
$('#advStart').onclick=()=>{ const mins=+$('#advMins').value||60; advUntil=Date.now()+mins*60*1000; if(advInt) clearInterval(advInt); advInt=setInterval(tickAdv,1000); tickAdv(); };
$('#advStop').onclick=()=>{ if(advInt) clearInterval(advInt); advInt=null; $('#advShow').textContent='—'; };

/* ===== Counties inline fallback (only if no file available) ===== */
