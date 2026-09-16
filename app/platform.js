/* General application services; independent of simulation calculations. */
window.AppPlatform = (() => {
  const BUILD = '2026-09-16-1';
  const storage = {
    get(key, fallback) { try { const value = localStorage.getItem(key); return value === null ? fallback : JSON.parse(value); } catch { return fallback; } },
    set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; } }
  };
  async function locate() {
    if (!navigator.geolocation) throw new Error('Location is unavailable in this browser. Weather can use map center.');
    const attempt = options => new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject, options));
    try { return await attempt({enableHighAccuracy:true, timeout:8000, maximumAge:30000}); }
    catch (error) {
      if (error.code === 1) throw new Error('Location permission denied. In Chrome: site controls → Permissions → Location; also check Android location services. On iPad, check Safari location permissions. Weather can use map center.');
      try { return await attempt({enableHighAccuracy:false, timeout:12000, maximumAge:300000}); }
      catch { throw new Error('No location fix. Try outdoors with device location enabled. Weather can use map center.'); }
    }
  }
  async function weather(lat, lng) {
    const params = new URLSearchParams({latitude:lat.toFixed(4),longitude:lng.toFixed(4),wind_speed_unit:'ms',timezone:'GMT',current:'wind_speed_10m,wind_direction_10m,wind_gusts_10m,temperature_2m,relative_humidity_2m,precipitation,weather_code,pressure_msl,cloud_cover'});
    const controller = new AbortController(); const timer = setTimeout(()=>controller.abort(),12000);
    try {
      const r = await fetch('https://api.open-meteo.com/v1/forecast?'+params,{signal:controller.signal,cache:'no-store'});
      if(!r.ok) throw new Error('Weather provider returned HTTP '+r.status);
      const j=await r.json(), c=j.current;
      if(!c || !Number.isFinite(c.wind_speed_10m) || !Number.isFinite(c.wind_direction_10m) || j.current_units?.wind_speed_10m!=='m/s') throw new Error('Weather response missing valid wind/units.');
      return {current:c,from:c.wind_direction_10m,to:(c.wind_direction_10m+180)%360,speed:c.wind_speed_10m,lat,lng,received:Date.now()};
    } finally { clearTimeout(timer); }
  }
  return {BUILD,storage,locate,weather};
})();
