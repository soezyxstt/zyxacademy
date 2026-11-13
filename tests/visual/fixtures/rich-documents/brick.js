import { setup, playbackGuard } from './shared.js';
import { mountThermal } from './thermal-view.mjs';
setup();
const main=document.querySelector('main'), host=document.createElement('div');main.append(host);
const thermal=mountThermal(host,{dimensionsM:[.06,.10,.20],initialC:30,ambientC:1200,hWm2K:80,kWmK:1.9,rhoKgM3:2400,cpJkgK:1130,initialTimeS:1800,maxTimeS:5400});
main.insertAdjacentHTML('beforeend','<style>.thermal{color:var(--foreground)} .thermal .caption,.thermal .ticks,.thermal .readouts{font-size:14px}.thermal select,.thermal .tip{color:var(--foreground);background:var(--background);border-color:var(--border)} .thermal input{accent-color:var(--primary)} @media print{.thermal .controls,.thermal .tip,[data-playback-note]{display:none!important}.thermal .print-time[hidden]{display:block!important}}</style><p>Konduksi tiga dimensi, sifat konstan dan konveksi sama di enam sisi. Radiasi dan perubahan fase tidak dimodelkan.</p>');

const button=document.createElement('button');
button.type='button';button.dataset.play='';button.textContent='Putar';
host.querySelector('.controls').prepend(button);
let timer=0, previous=0;
function pause(){if(timer)clearInterval(timer);timer=0;previous=0;button.textContent='Putar';button.setAttribute('aria-pressed','false')}
pause();
const canPlay=playbackGuard(button,pause);
button.addEventListener('click',()=>{
  if(timer){pause();return;}
  if(!canPlay())return;
  if(thermal.getState().timeS>=5400)thermal.actions.setTime(0);
  button.textContent='Jeda';button.setAttribute('aria-pressed','true');previous=performance.now();
  timer=setInterval(()=>{const now=performance.now(), next=Math.min(5400,thermal.getState().timeS+(now-previous)*.06);previous=now;thermal.actions.setTime(next);if(next>=5400)pause()},250);
});
host.querySelector('[data-param="time"]').addEventListener('input',pause);
main.insertAdjacentHTML('beforeend','<p data-playback-note>Putar: 1 detik tayang = 60 detik pemanasan.</p>');
