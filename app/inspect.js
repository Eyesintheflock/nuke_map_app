/* Read-only map explanations and user-selected destination bearings. */
let infoPopup;
function showMapInfo(lat,lng,title,body,note,actions=[]){
  infoPopup?.remove();
  const box=document.createElement('section');box.className='map-info';
  for(const [tag,value]of [['h3',title],['p',body],['p',note]]){const el=document.createElement(tag);el.textContent=value;box.append(el);}
  for(const action of actions){const b=document.createElement('button');b.textContent=action.label;b.onclick=action.run;box.append(b);}
  if(useML)infoPopup=new maplibregl.Popup({maxWidth:'290px'}).setLngLat([lng,lat]).setDOMContent(box).addTo(mlmap);
  else {const popup=L.popup({maxWidth:290}).setLatLng([lat,lng]).setContent(box).openOn(lmap);infoPopup={remove:()=>lmap.closePopup(popup)};}
  return box;
}
function showPinInfo(pin){
  showMapInfo(pin.lat,pin.lng,pin.label,`${pin.type} · ${pin.lat.toFixed(5)}, ${pin.lng.toFixed(5)}\n${pin.notes||'No notes yet.'}`,
    `${pin.locked?'Locked':'Draggable'} · User-saved location; shelter status and access are unverified.`,[
    {label:'Edit details',run:()=>{editPin(pin.id);showPinInfo(pin);}},
    {label:'Direction from GPS',run:()=>showDestinationBearing(pin)}]);
}
function showDestinationBearing(pin){
  if(!myPos){showErr('Use My Position first. Direction needs a GPS fix.');return;}
  const from=turf.point([myPos[1],myPos[0]]),to=turf.point([pin.lng,pin.lat]);
  const distance=turf.distance(from,to),bearing=(turf.bearing(from,to)+360)%360;
  const box=showMapInfo(pin.lat,pin.lng,pin.label,`${distance.toFixed(2)} km straight line · ${Math.round(bearing)}° ${bearingToCardinal(bearing)} from your last GPS fix.`,
    'User-selected destination. This is not a safe route, evacuation recommendation, or live navigation. Roads, obstructions and hazards are not checked. Arrow is north-up, not phone-relative.');
  const arrow=document.createElement('div');arrow.className='destination-arrow';arrow.style.transform=`rotate(${bearing}deg)`;arrow.innerHTML='<span>↑</span>';box.append(arrow);
}
function inspectMapPoint(lat,lng){
  if(!document.getElementById('inspectEnabled').checked)return;
  const point=turf.point([lng,lat]);
  const hits=effects.filter(e=>turf.booleanPointInPolygon(point,e.gj));
  const labels=[...new Set(hits.map(e=>e.label))];
  const text=labels.length?`Illustrative overlays at this point: ${labels.join(', ')}. Overlapping scenarios may contribute multiple shapes.`:'No drawn effect polygon covers this point. This does not establish that the location is safe.';
  const countyHits=document.getElementById('popHeat').checked&&counties?counties.features.filter(f=>turf.booleanPointInPolygon(point,f)):[];
  showMapInfo(lat,lng,'Map location',`${lat.toFixed(5)}, ${lng.toFixed(5)}\n${text}${countyHits.length?' Population layer here uses bundled DEMO polygons, not reliable local population data.':''}`,
    'Effect geometry is unvalidated and illustrative. It does not measure radiation, verify building damage, or establish shelter protection. Tap saved pins or numbered terrain points for their details.');
}
(() => {
  const enabled=document.getElementById('animateWind'),motion=document.getElementById('windMotion');
  const render=()=>{motion.style.transform=`rotate(${windDeg}deg)`;motion.classList.toggle('paused',!enabled.checked||windSpd<=0);motion.title=`Wind FROM ${Math.round((windDeg+180)%360)}° / TO ${Math.round(windDeg)}° · ${windSpd} m/s`;};
  enabled.checked=AppPlatform.storage.get('animateWind',true)!==false;
  enabled.onchange=()=>{AppPlatform.storage.set('animateWind',enabled.checked);render();};
  new MutationObserver(render).observe(document.getElementById('tb-wind-deg'),{childList:true,subtree:true,characterData:true});
  new MutationObserver(render).observe(document.getElementById('tb-wind-speed'),{childList:true,subtree:true,characterData:true});render();
})();
