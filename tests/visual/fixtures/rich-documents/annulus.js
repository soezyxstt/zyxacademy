import { setup } from './shared.js';
import { mountAnnulus3D } from './annulus-3d-view.mjs';
setup();
const main=document.querySelector('main'),host=document.createElement('div');main.append(host);
mountAnnulus3D(host,{innerDiameterM:.025,outerDiameterM:.1,massFlowKgS:.05,cpJkgK:4186,hWm2K:64.2,inletC:25,targetOutletC:95,wallC:125,probeFraction:1});
main.insertAdjacentHTML('beforeend','<style>.ann3{color:var(--foreground)} .ann3 canvas,.ann3 svg{background:var(--background)} .ann3-fields label{font-size:14px}.ann3 input{font-size:14px;color:var(--foreground);background:var(--background);border-color:var(--border)} .ann3-summary{font-size:14px}</style><p>Panjang gambar dipadatkan; rasio diameter dipertahankan. Warna menunjukkan suhu curah sepanjang aliran, bukan medan suhu radial. Model memakai sifat dan koefisien konstan.</p>');
