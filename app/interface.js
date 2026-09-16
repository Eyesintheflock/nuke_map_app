/* Drawer/visibility state only; no effect-model calculations. */
(() => {
 const byId=id=>document.getElementById(id), app=byId('app');
 const read=AppPlatform.storage.get('mapDisplay',{});
 const state={weather:read.weather===true,buttons:read.buttons!==false,scale:read.scale!==false,focus:false};
 const panels=[...document.querySelectorAll('#stack .panel')];
 function persist(){AppPlatform.storage.set('mapDisplay',{weather:state.weather,buttons:state.buttons,scale:state.scale});}
 function render(){
  app.classList.toggle('map-only',state.focus);
  app.classList.toggle('hide-map-buttons',!state.buttons||state.focus);
  app.classList.toggle('hide-map-scale',!state.scale||state.focus);
  byId('restoreUI').hidden=!state.focus;
  byId('weatherChip').hidden=!state.weather||state.focus;
  byId('showWeatherChip').checked=state.weather;byId('showMapButtons').checked=state.buttons;byId('showScale').checked=state.scale;
  byId('mapOnly').setAttribute('aria-pressed',String(state.focus));
  requestAnimationFrame(resizeMap);
 }
 function closeDrawers(){for(const id of ['bar','stack'])byId(id).hidden=true;for(const id of ['toggleControls','togglePanels','openWeather'])byId(id).setAttribute('aria-expanded','false');}
 function closeHud(){byId('windHUD').style.display='none';byId('toggleWindHud').setAttribute('aria-expanded','false');}
 function selectPanel(id){for(const p of panels){const open=p.id===id;p.classList.toggle('open',open);p.querySelector('header').setAttribute('aria-expanded',String(open));}}
 function openDrawer(kind,panel){closeHud();closeDrawers();state.focus=false;render();byId(kind).hidden=false;if(panel)selectPanel(panel);byId(kind).scrollTop=0;}
 byId('toggleControls').onclick=()=>{if(!byId('bar').hidden){closeDrawers();return;}openDrawer('bar');byId('toggleControls').setAttribute('aria-expanded','true');};
 byId('togglePanels').onclick=()=>{if(!byId('stack').hidden&&byId('togglePanels').getAttribute('aria-expanded')==='true'){closeDrawers();return;}openDrawer('stack','pDisplay');byId('drawerTitle').textContent='Layers & pins';byId('togglePanels').setAttribute('aria-expanded','true');};
 byId('openWeather').onclick=()=>{if(!byId('stack').hidden&&byId('openWeather').getAttribute('aria-expanded')==='true'){closeDrawers();return;}openDrawer('stack','pWeather');byId('drawerTitle').textContent='Weather';byId('openWeather').setAttribute('aria-expanded','true');};
 document.querySelectorAll('[data-close-drawer]').forEach(b=>b.onclick=closeDrawers);
 for(const p of panels){const h=p.querySelector('header');h.tabIndex=0;h.setAttribute('role','button');h.setAttribute('aria-expanded','false');const toggle=()=>selectPanel(p.classList.contains('open')?null:p.id);h.onclick=toggle;h.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();toggle();}};}
 byId('mapOnly').onclick=()=>{closeDrawers();closeHud();addMode=false;pinMode=false;byId('add').classList.remove('active');byId('pinMode').classList.remove('active');state.focus=true;render();};
 byId('restoreUI').onclick=()=>{state.focus=false;render();};
 for(const [id,key]of [['showWeatherChip','weather'],['showMapButtons','buttons'],['showScale','scale']])byId(id).onchange=e=>{state[key]=e.target.checked;persist();render();};
 byId('toggleWindHud').onclick=()=>{closeDrawers();const hud=byId('windHUD');hud.style.display='block';hud.style.left='8px';hud.style.top='8px';hud.style.bottom='auto';hud.style.width='min(320px, calc(100% - 16px))';hud.style.height='auto';byId('toggleWindHud').setAttribute('aria-expanded','true');};
 byId('windHide').onclick=closeHud;
 byId('seasonalLink').onclick=()=>{const c=getMapCenter();byId('seasonalLink').href='climate.html?lat='+c.lat.toFixed(2)+'&lng='+c.lng.toFixed(2);};
 const source=byId('weatherStatus');new MutationObserver(()=>{byId('weatherChip').textContent=source.textContent.startsWith('Open-Meteo')?`${byId('tb-temp').textContent} · wind ${byId('tb-wind-speed').textContent} · modeled`:source.textContent;}).observe(source,{childList:true,characterData:true,subtree:true});
 // Pin mode closes its drawer once armed, leaving the full map touchable.
 byId('pinMode').addEventListener('click',()=>{if(pinMode)closeDrawers();});
 byId('add').addEventListener('click',()=>{if(addMode)closeDrawers();});
 document.addEventListener('keydown',e=>{if(e.key==='Escape'){closeDrawers();closeHud();state.focus=false;render();}});
 render();
})();
