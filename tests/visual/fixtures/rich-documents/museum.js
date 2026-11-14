import { setup } from './shared.js';
import { edges, linked } from './models.js';
setup();
const rects={1:[60,30,120,70],2:[60,100,120,190],3:[180,30,120,160],4:[180,190,120,100],5:[300,30,120,100],6:[300,130,120,75],7:[300,205,120,85]};
const centers={1:[120,65],2:[120,220],3:[240,110],4:[240,240],5:[360,80],6:[360,167],7:[360,248]};
const doors={'1-2':[120,100,'h'],'1-3':[180,65,'v'],'2-3':[180,145,'v'],'2-4':[180,235,'v'],'3-4':[240,190,'h'],'3-5':[300,70,'v'],'4-7':[300,235,'v'],'5-6':[360,130,'h'],'6-7':[360,205,'h']};
const main=document.querySelector('main'); let path=[2], message='';
main.innerHTML='<svg viewBox="0 0 500 315" aria-label="Denah museum dengan pintu dan jejak" role="group"></svg><div class="controls"><button data-undo>Mundur</button><button data-reset>Ulangi</button><span data-path></span></div><p role="status" aria-live="polite"></p>';
const svg=main.querySelector('svg'), undo=main.querySelector('[data-undo]'), status=main.querySelector('[role="status"]');
function draw(focus) {
  const current=path.at(-1), available=edges.filter(e=>e.includes(current)).map(e=>e[0]===current?e[1]:e[0]).filter(n=>!path.includes(n));
  let shapes=Object.entries(rects).map(([n,[x,y,w,h]])=>`<g role="button" tabindex="0" data-room="${n}" ${+n===current?'aria-current="location"':''} aria-label="Ruang ${n}${+n===current?', posisi sekarang':path.includes(+n)?', sudah dilalui':''}"><rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${+n===current?'var(--primary)':path.includes(+n)?'var(--muted)':'var(--background)'}" stroke="var(--foreground)" stroke-width="2"/><text x="${x+20}" y="${y+29}" fill="${+n===current?'var(--primary-foreground)':'var(--foreground)'}">${n}</text></g>`).join('');
  shapes+=edges.map(([a,b])=>{const [x,y,d]=doors[`${a}-${b}`];return `<line x1="${x-(d==='h'?15:0)}" y1="${y-(d==='v'?15:0)}" x2="${x+(d==='h'?15:0)}" y2="${y+(d==='v'?15:0)}" stroke="var(--background)" stroke-width="7"/>`}).join('');
  shapes+=path.slice(1).map((n,i)=>{const prev=path[i],door=doors[[Math.min(prev,n),Math.max(prev,n)].join('-')];return `<polyline points="${centers[prev]} ${door[0]},${door[1]} ${centers[n]}" fill="none" stroke="var(--accent)" stroke-width="6" pointer-events="none"/>`}).join('');
  shapes+=`<line x1="60" y1="205" x2="60" y2="240" stroke="var(--background)" stroke-width="7"/><line x1="420" y1="64" x2="420" y2="96" stroke="var(--background)" stroke-width="7"/><text x="0" y="235" font-size="20">Masuk</text><text x="425" y="85" font-size="20">Keluar</text>`;
  svg.innerHTML=shapes;
  undo.disabled=path.length===1;
  main.querySelector('[data-path]').textContent=path.join(' > ');
  status.textContent=message || (path.length===7 ? current===5?'Semua ruang dilalui satu kali hingga pintu keluar.':`Semua ruang dilalui, tetapi ruang ${current} bukan pintu keluar. Pintu keluar berada di ruang 5.`:available.length?`Pintu berikutnya: ${available.join(', ')}.`:'Tidak ada ruang baru yang dapat dicapai.');
  if(focus) main.querySelector(focus==='[data-undo]' && undo.disabled?`[data-room="${current}"]`:focus)?.focus();
}
function select(n){const prev=path.at(-1);if(path.includes(n))message=`Ruang ${n} sudah dilalui.`;else if(!linked(prev,n))message=`Tidak ada pintu dari ruang ${prev} ke ruang ${n}.`;else {path.push(n);message='';}draw(`[data-room="${n}"]`)}
main.addEventListener('click',e=>{const room=e.target.closest('[data-room]');if(room) select(+room.dataset.room);else if(e.target.closest('[data-undo]')){if(path.length>1)path.pop();message='';draw('[data-undo]')}else if(e.target.closest('[data-reset]')){path=[2];message='';draw('[data-reset]')}});
main.addEventListener('keydown',e=>{const room=e.target.closest('[data-room]');if(room&&(e.key==='Enter'||e.key===' ')){e.preventDefault();select(+room.dataset.room)}});
draw();
