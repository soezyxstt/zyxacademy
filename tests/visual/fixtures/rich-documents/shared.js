export function setup() {
  const root = document.querySelector('main');
  let last = 0, queued = false, frame = 0;
  const send = () => {
    queued = false;
    const height = Math.ceil(root.getBoundingClientRect().height);
    if (height !== last) { last = height; parent.postMessage({ type: 'zyx:resize', height }, '*'); }
  };
  const observer=new ResizeObserver(() => { if (!queued) { queued = true; frame=requestAnimationFrame(send); } });
  observer.observe(root);
  addEventListener('pagehide',()=>{observer.disconnect();cancelAnimationFrame(frame)}, {once:true});
  addEventListener('message', event => {
    if (event.source !== parent || event.data?.type !== 'zyx:preferences') return;
    if (event.data.theme === 'light' || event.data.theme === 'dark') document.documentElement.dataset.theme = event.data.theme;
    if (typeof event.data.reducedMotion === 'boolean') document.documentElement.dataset.reducedMotion = String(event.data.reducedMotion);
  });
}

export const playbackAllowed = (hidden, active, reduced) => !hidden && active && !reduced;

export function playbackGuard(button, pause) {
  const media=matchMedia('(prefers-reduced-motion: reduce)');
  const notice=document.createElement('span');notice.dataset.reducedNotice='';notice.hidden=true;notice.textContent='Gerak dikurangi. Gunakan penggeser waktu.';button.after(notice);
  let active=true, hostReduced=false, disposed=false;
  const update=()=>{
    const reduced=media.matches || hostReduced;
    button.disabled=reduced || !active || document.hidden;
    notice.hidden=!reduced;
    button.title=reduced?'Gerak dikurangi. Gunakan penggeser waktu.':'';
    if(disposed || !playbackAllowed(document.hidden,active,reduced)) pause();
  };
  const message=event=>{
    if(event.source!==parent) return;
    if(event.data?.type==='zyx:preferences' && typeof event.data.reducedMotion==='boolean') hostReduced=event.data.reducedMotion;
    if(event.data?.type==='zyx:visibility' && typeof event.data.active==='boolean') active=event.data.active;
    if(event.data?.type==='zyx:preferences' && typeof event.data.active==='boolean') active=event.data.active;
    update();
  };
  addEventListener('message',message);
  document.addEventListener('visibilitychange',update);
  media.addEventListener('change',update);
  addEventListener('pagehide',()=>{disposed=true;update();removeEventListener('message',message);document.removeEventListener('visibilitychange',update);media.removeEventListener('change',update)}, {once:true});
  update();
  return ()=>!disposed && playbackAllowed(document.hidden,active,media.matches || hostReduced);
}
