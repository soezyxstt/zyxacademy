import { setup } from './shared.js';
import { milkMachine } from './models.js';
setup();
const main=document.querySelector('main'); let a=false,b=false,width=0;
const word=v=>v?'Putih':'Cokelat', color=v=>v?'#fff2c4':'#9c663e';
const pipe=(d,v)=>`<path d="${d}" fill="none" stroke="var(--muted-foreground)" stroke-width="13" stroke-linejoin="round"/><path d="${d}" fill="none" stroke="${color(v)}" stroke-width="8" stroke-linejoin="round"/>`;
const machine=(x,y,label)=>`<rect x="${x-42}" y="${y}" width="84" height="52" rx="8" fill="var(--muted)" stroke="var(--foreground)"/><text x="${x}" y="${y+21}" text-anchor="middle" style="font-size:13px"><tspan x="${x}">Mesin</tspan><tspan x="${x}" dy="17">${label}</tspan></text>`;
const input=(x,id,value,label)=>`<g role="button" tabindex="0" data-milk="${id}" aria-label="Susu masukan ${label}: ${word(value)}. Ganti warna" aria-pressed="${value}"><rect x="${x-46}" y="3" width="92" height="32" rx="6" fill="${color(value)}" stroke="var(--foreground)" stroke-width="2"/><text x="${x-8}" y="24" text-anchor="middle" style="font-size:13px" fill="${value?'#22332d':'white'}">${word(value)}</text><path data-change-icon d="M${x+25} 13h12l-4 -4m4 4l-4 4 M${x+37} 25h-12l4 -4m-4 4l4 4" fill="none" stroke="${value?'#22332d':'white'}" stroke-width="1.5" pointer-events="none"/></g>`;
main.innerHTML=`<style>@media print{[data-change-icon]{display:none} [data-milk] text{transform:translateX(8px)}}</style><svg role="group" aria-label="Dua masukan susu bercabang ke mesin atas lalu ke mesin akhir"></svg><div class="controls"><button data-reset>Ulangi</button></div><p>Setiap mesin menghasilkan putih jika kedua masukannya cokelat. Pasangan lainnya menghasilkan cokelat.</p><p role="status" aria-live="polite" style="position:absolute;width:1px;height:1px;padding:0;overflow:hidden;clip-path:inset(50%)"></p>`;
const svg=main.querySelector('svg'), status=main.querySelector('[role="status"]');
function draw(focus){if(!width)return;const left=48,right=width-48,center=width/2,l=milkMachine(a,a),r=milkMachine(b,b),out=milkMachine(l,r);
svg.setAttribute('viewBox',`0 0 ${width} 336`);
svg.innerHTML=`${pipe(`M${left} 35V62H${left-20}V86`,a)}${pipe(`M${left} 62H${left+20}V86`,a)}${pipe(`M${right} 35V62H${right-20}V86`,b)}${pipe(`M${right} 62H${right+20}V86`,b)}${machine(left,86,'kiri')}${machine(right,86,'kanan')}${pipe(`M${left} 138V162H${center-20}V217`,l)}${pipe(`M${right} 138V162H${center+20}V217`,r)}<text x="${left}" y="190" text-anchor="middle" style="font-size:13px">${word(l)}</text><text x="${right}" y="190" text-anchor="middle" style="font-size:13px">${word(r)}</text>${machine(center,217,'akhir')}${pipe(`M${center} 269V290`,out)}<rect x="${center-46}" y="290" width="92" height="36" rx="6" fill="${color(out)}" stroke="var(--foreground)"/><text x="${center}" y="313" text-anchor="middle" style="font-size:13px" fill="${out?'#22332d':'white'}">${word(out)}</text>${input(left,'a',a,'kiri')}${input(right,'b',b,'kanan')}`;
status.textContent=`Masukan kiri ${word(a)}, kanan ${word(b)}. Mesin kiri ${word(l)}, kanan ${word(r)}. Hasil akhir ${word(out)}.`;
if(focus) main.querySelector(focus)?.focus();
}
function toggle(id){if(id==='a')a=!a;else b=!b;draw(`[data-milk="${id}"]`)}
main.addEventListener('click',e=>{const target=e.target.closest('[data-milk]');if(target)toggle(target.dataset.milk);else if(e.target.closest('[data-reset]')){a=false;b=false;draw('[data-reset]')}});
main.addEventListener('keydown',e=>{const target=e.target.closest('[data-milk]');if(target&&(e.key==='Enter'||e.key===' ')){e.preventDefault();toggle(target.dataset.milk)}});
const observer=new ResizeObserver(entries=>{const next=Math.min(620,entries[0].contentRect.width);if(next>0 && next!==width){const focused=document.activeElement?.dataset.milk;width=next;draw(focused?`[data-milk="${focused}"]`:undefined)}});
observer.observe(main);addEventListener('pagehide',()=>observer.disconnect(),{once:true});
