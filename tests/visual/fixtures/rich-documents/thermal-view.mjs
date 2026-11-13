import { thermalCreateModel } from './thermal.mjs';
// Continuous values stay exact; keyboard movement keeps the teaching increment.
function thermalViewRange(input, increment) {
  input.step = 'any';
  input.dataset.increment = increment;
  input.onkeydown = event => {
    const direction = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1, PageUp: 10, PageDown: -10 }[event.key];
    if (direction === undefined && event.key !== 'Home' && event.key !== 'End') return;
    event.preventDefault();
    const min = Number(input.min), max = Number(input.max);
    input.value = event.key === 'Home' ? min : event.key === 'End' ? max : Math.max(min, Math.min(max, Number((Number(input.value) + direction * Number(input.dataset.increment)).toPrecision(15))));
    input.dispatchEvent(new Event('input', { bubbles: true }));
  };
}

// Surface cells sample the unchanged 3D model; clipping changes visibility only.
export function thermalViewMesh(dimensionsM, { axis = 2, positionM = 0, cut = false, slice = false, resolution = 24 } = {}) {
  const bounds = dimensionsM.map(v => [-v / 2, v / 2]);
  if (cut) bounds[axis][1] = positionM;
  const cells = [];
  for (let a = 0; a < 3; a++) for (let side = 0; side < 2; side++) {
    if (slice && (a !== axis || side !== 1)) continue;
    const [u, v] = [0, 1, 2].filter(i => i !== a), face = slice ? positionM : bounds[a][side];
    const n = Math.max(1, Math.ceil(resolution * (bounds[u][1] - bounds[u][0]) / Math.max(...dimensionsM)));
    const m = Math.max(1, Math.ceil(resolution * (bounds[v][1] - bounds[v][0]) / Math.max(...dimensionsM)));
    if (bounds[u][1] <= bounds[u][0] || bounds[v][1] <= bounds[v][0]) continue;
    for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) {
      const vertices = [[i,j],[i+1,j],[i+1,j+1],[i,j+1]].map(([s,t]) => {
        const p = [0,0,0]; p[a] = face;
        p[u] = bounds[u][0] + (bounds[u][1] - bounds[u][0]) * s/n;
        p[v] = bounds[v][0] + (bounds[v][1] - bounds[v][0]) * t/m; return p;
      });
      const pointM = vertices[0].map((_,k) => vertices.reduce((sum,p) => sum+p[k],0)/4);
      const normal = [0,0,0]; normal[a] = side ? 1 : -1;
      cells.push({ vertices, pointM, normal, axis:a, side, section: slice || (cut && a === axis && side === 1) });
    }
  }
  return { bounds, cells };
}

export function thermalViewRotation(point, yawDeg, pitchDeg) {
  const yaw = yawDeg*Math.PI/180, pitch = pitchDeg*Math.PI/180;
  const depth = point[0]*Math.sin(yaw)+point[1]*Math.cos(yaw);
  return [point[0]*Math.cos(yaw)-point[1]*Math.sin(yaw), depth*Math.sin(pitch)-point[2]*Math.cos(pitch), depth*Math.cos(pitch)+point[2]*Math.sin(pitch)];
}

export function thermalViewProbeOnSurface(pointM, bounds, visibleCells) {
  return pointM.every((v,a)=>v>=bounds[a][0]-1e-10&&v<=bounds[a][1]+1e-10)
    && visibleCells.some(cell=>Math.abs(pointM[cell.axis]-cell.pointM[cell.axis])<1e-10);
}

export function mountThermal(host, params = {}) {
  const model = thermalCreateModel(params), mode = params.mode ?? 'volume';
  if (!['volume','slice','geometry'].includes(mode)) throw new RangeError('Unsupported thermal view mode');
  const geometry = mode === 'geometry', flat = mode === 'slice', dims = model.params.dimensionsM, half = dims.map(v=>v/2);
  const maxTimeS = params.maxTimeS ?? Math.max(...half.map(v=>v*v/model.alphaM2S))*2;
  if (!Number.isFinite(maxTimeS) || maxTimeS <= 0) throw new RangeError('maxTimeS must be positive and finite');
  const initialTimeS = params.initialTimeS ?? 0;
  if (!Number.isFinite(initialTimeS) || initialTimeS < 0 || initialTimeS > maxTimeS) throw new RangeError('initialTimeS must be within the physical time range');
  const state = { mode, timeS:initialTimeS, probeM:[0,0,0], sliceZM:0, sliceAxis:2, sliceM:0, view:flat?'slice':geometry?'whole':'cut', yawDeg:35, pitchDeg:24 };
  const names = ['x','y','z'], fmt = n => Number(n.toPrecision(4)).toLocaleString('id-ID', { maximumFractionDigits:6 }), temp = n => n.toLocaleString('id-ID', { minimumFractionDigits:1, maximumFractionDigits:1 });
  const low = Math.min(model.params.initialC,model.params.ambientC), high = Math.max(model.params.initialC,model.params.ambientC);
  host.innerHTML = `<style>
  .thermal{font:14px/1.4 system-ui,sans-serif;color:#1d2938;max-width:900px;margin:auto}.thermal *{box-sizing:border-box}.thermal [hidden]{display:none!important}.thermal :focus-visible{outline:2px solid #3676c7;outline-offset:2px}.thermal .stage{position:relative}.thermal canvas{display:block;width:100%;touch-action:none;cursor:grab}.thermal canvas:active{cursor:grabbing}.thermal .controls{display:flex;align-items:center;flex-wrap:wrap;gap:8px 16px;margin:8px 0}.thermal label{display:flex;align-items:center;gap:8px;min-width:0;flex:1 1 220px}.thermal .caption{display:flex;align-items:center;gap:6px;white-space:nowrap;font-size:12px}.thermal output{font-variant-numeric:tabular-nums}.thermal input{min-height:32px;min-width:60px;width:100%;margin:0;accent-color:#2869b5}.thermal .axis-field{flex:0 0 auto}.thermal select{font:inherit;color:inherit;border:1px solid #c9d2dc;border-radius:5px;background:white;min-height:32px;padding:3px 6px}.thermal .metrics{display:flex;align-items:center;flex-wrap:wrap;gap:8px 24px}.thermal .legend{flex:1 1 240px}.thermal .scale{height:6px;background:linear-gradient(90deg,#233f91,#128cba,#42bfa6,#f3d45a,#ec873e,#bf302e)}.thermal .ticks{display:flex;justify-content:space-between;font-size:12px;margin-top:3px}.thermal .readouts{display:flex;flex-wrap:wrap;gap:8px 16px;font-size:12px;font-variant-numeric:tabular-nums}.thermal .readouts strong{font-size:14px;margin-left:5px}.thermal .history{display:block;width:100%;max-width:620px;height:auto;margin:4px auto}.thermal .history text{font:12px system-ui;fill:currentColor}.thermal .tip{position:absolute;pointer-events:none;white-space:pre-line;background:white;border:1px solid #c9d2dc;border-radius:4px;padding:4px 6px;font-size:12px;max-width:240px}@media(max-width:440px){.thermal label{flex-basis:180px}.thermal .metrics{gap:8px}.thermal .readouts{width:100%;justify-content:flex-end}}
  </style><section class="thermal" aria-label="${geometry?'Geometri balok':'Konduksi transien 3D pada balok'}">
    <div class="stage"><canvas tabindex="0" role="img" aria-label="${flat?'Irisan suhu':'Balok 3D'}"></canvas><div class="tip" hidden></div></div>
    <div class="controls"></div><svg class="history" viewBox="0 0 520 132" role="img" aria-label="Riwayat suhu pusat dan sudut terhadap waktu" ${geometry?'hidden':''}></svg><div class="print-time" hidden></div><div class="metrics" ${geometry?'hidden':''}><div class="legend"><div class="scale"></div><div class="ticks"></div></div><div class="readouts" aria-live="polite"></div></div>
  </section>`;
  const root = host.querySelector('.thermal'), canvas = root.querySelector('canvas'), ctx = canvas.getContext('2d'), inputs = {};
  let width=640,height=380,dpr=1,scale=1,mesh,drawn=[],cacheKey='',diagnostics,sampleBuilds=0,frame=0,drag=null,renderRevision=0,renderState=null;
  const wrapYaw = a => ((a+180)%360+360)%360-180;
  const rotate = p => thermalViewRotation(p,state.yawDeg,state.pitchDeg);
  const project = p => {
    if (flat) { const [u,v]=[0,1,2].filter(i=>i!==state.sliceAxis); return [width/2+p[u]*scale,height/2-p[v]*scale,0]; }
    const q=rotate(p); return [width/2+q[0]*scale,height/2+q[1]*scale,q[2]];
  };
  const color = t => {
    const stops=[[35,63,145],[18,140,186],[66,191,166],[243,212,90],[236,135,62],[191,48,46]];
    const p=(high===low?0:Math.max(0,Math.min(1,(t-low)/(high-low))))*5,i=Math.min(4,Math.floor(p));
    return `rgb(${stops[i].map((v,k)=>Math.round(v+(stops[i+1][k]-v)*(p-i))).join(',')})`;
  };
  const addSlider = (container,key,label,min,max,value,unit,update) => {
    const el=document.createElement('label'); el.innerHTML=`<span class="caption">${key==='time'?'<span>Waktu</span>':''}<output></output></span><input type="range" aria-label="${label}">`; container.append(el);
    const input=el.querySelector('input'),output=el.querySelector('output'); input.min=min;input.max=max;input.dataset.param=key;thermalViewRange(input,key==='time'?1:(max-min)/1000);input.value=value;
    inputs[key]={input,el,output,unit};input.addEventListener('input',()=>{update(+input.value);sync();});return inputs[key];
  };
  const controls=root.querySelector('.controls');
  if (!geometry) {
    addSlider(controls,'time','Waktu pemanasan (menit)',0,maxTimeS/60,initialTimeS/60,'menit',v=>state.timeS=v*60);
    const field=document.createElement('label');field.className='axis-field';field.innerHTML='<select aria-label="Arah irisan"><option value="0">x</option><option value="1">y</option><option value="2">z</option></select>';controls.append(field);
    field.querySelector('select').addEventListener('change',e=>setAxis(+e.target.value));
    addSlider(controls,'slice','Posisi irisan',-half[2],half[2],0,'%',setPosition);
  }
  root.querySelector('.ticks').innerHTML=[low,(low+high)/2,high].map(v=>`<span>${fmt(v)} °C</span>`).join('');
  function setPosition(v, attached=Math.abs(state.probeM[state.sliceAxis]-state.sliceM)<1e-12) {
    state.sliceM=v;if(state.sliceAxis===2)state.sliceZM=v;
    if(flat||attached||state.probeM[state.sliceAxis]>v)state.probeM[state.sliceAxis]=v;
    if(!flat&&!geometry)state.view=v===half[state.sliceAxis]?'whole':'cut';
  }
  function setAxis(v) { const attached=Math.abs(state.probeM[state.sliceAxis]-state.sliceM)<1e-12, fraction=(state.sliceM+half[state.sliceAxis])/dims[state.sliceAxis];state.sliceAxis=v;const position=-half[v]+fraction*dims[v];setPosition(position,attached);sync(); }
  function samples() {
    const key=JSON.stringify([state.timeS,state.view,state.sliceAxis,state.sliceM]);
    if(key===cacheKey)return; cacheKey=key;sampleBuilds++;
    diagnostics=geometry?{model:'rectangular-solid-geometry',converged:true}:model.diagnostics(state.timeS);
    mesh=thermalViewMesh(dims,{axis:state.sliceAxis,positionM:state.sliceM,cut:!geometry&&state.view==='cut',slice:flat,resolution:32});
    if(!geometry&&diagnostics.converged)for(const cell of mesh.cells){cell.temperatureC=model.temperatureAt(cell.pointM,state.timeS);cell.fill=color(cell.temperatureC);}
  }
  function outline(bounds,ghost=false) {
    const corners=Array.from({length:8},(_,i)=>bounds.map((b,a)=>b[(i>>a)&1]));
    ctx.save();ctx.strokeStyle=ghost?'#8798aa':'#263d57';ctx.globalAlpha=ghost?.45:.65;ctx.lineWidth=ghost?1:1.2;ctx.setLineDash(ghost?[4,5]:[]);
    for(let i=0;i<8;i++)for(let a=0;a<3;a++){const j=i^(1<<a);if(j<=i)continue;if(!ghost&&!flat){const visible=[0,1,2].filter(k=>k!==a).some(k=>{const n=[0,0,0];n[k]=(i>>k)&1?1:-1;return rotate(n)[2]>1e-8;});if(!visible)continue;}const p=project(corners[i]),q=project(corners[j]);ctx.beginPath();ctx.moveTo(p[0],p[1]);ctx.lineTo(q[0],q[1]);ctx.stroke();}
    ctx.restore();
  }
  function draw() {
    frame=0;samples();ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,width,height);
    const full=half.map(v=>[-v,v]),corners=Array.from({length:8},(_,i)=>half.map((v,a)=>((i>>a)&1?1:-1)*v));
    if(flat){const [u,v]=[0,1,2].filter(i=>i!==state.sliceAxis);scale=Math.min((width-82)/dims[u],(height-78)/dims[v]);}
    else {const rotated=corners.map(rotate);scale=Math.min((width-92)/(Math.max(...rotated.map(p=>p[0]))-Math.min(...rotated.map(p=>p[0]))),(height-86)/(Math.max(...rotated.map(p=>p[1]))-Math.min(...rotated.map(p=>p[1]))));}
    if(!flat&&!geometry&&state.view==='cut')outline(full,true);
    drawn=mesh.cells.filter(c=>flat||rotate(c.normal)[2]>1e-8).map(cell=>({cell,poly:cell.vertices.map(project),depth:project(cell.pointM)[2]})).sort((a,b)=>a.depth-b.depth);
    if(geometry||diagnostics.converged)for(const {cell,poly} of drawn){ctx.beginPath();poly.forEach((p,i)=>i?ctx.lineTo(p[0],p[1]):ctx.moveTo(p[0],p[1]));ctx.closePath();ctx.fillStyle=geometry?['#abc9dd','#c5dce8','#e0ebf2'][cell.axis]:cell.fill;ctx.fill();ctx.strokeStyle=ctx.fillStyle;ctx.lineWidth=.7;ctx.stroke();}
    if(flat){const b=full.map(a=>[...a]);b[state.sliceAxis]=[state.sliceM,state.sliceM];outline(b);}else outline(mesh.bounds);
    const probeVisible=!geometry&&diagnostics.converged&&thermalViewProbeOnSurface(state.probeM,mesh.bounds,drawn.map(({cell})=>cell));
    if(probeVisible){const q=project(state.probeM);ctx.beginPath();ctx.arc(q[0],q[1],5,0,2*Math.PI);ctx.fillStyle='#fff';ctx.fill();ctx.strokeStyle='#172d48';ctx.lineWidth=2;ctx.stroke();const reference=[[0,0,0],half].some(p=>p.every((v,i)=>Math.abs(v-state.probeM[i])<1e-12));if(!reference){ctx.font='12px system-ui';ctx.fillStyle='#1d2938';ctx.textAlign='left';const label=fmt(model.temperatureAt(state.probeM,state.timeS))+' °C',tx=Math.max(6,Math.min(width-76,q[0]+10)),ty=Math.max(16,q[1]-10);ctx.save();ctx.strokeStyle='#fff';ctx.lineWidth=3;ctx.strokeText(label,tx,ty);ctx.fillText(label,tx,ty);ctx.restore();}}
    ctx.font='13px system-ui,sans-serif';ctx.fillStyle=getComputedStyle(host).getPropertyValue('--foreground').trim() || '#526276';
    if(flat){const [u,v]=[0,1,2].filter(i=>i!==state.sliceAxis);ctx.textAlign='center';ctx.fillText(names[u]+' (m)',width/2,height-14);ctx.textAlign='left';ctx.fillText(names[v]+' (m)',12,22);ctx.fillText(fmt(-half[u]),width/2-half[u]*scale,height/2+half[v]*scale+18);ctx.textAlign='right';ctx.fillText(fmt(half[u]),width/2+half[u]*scale,height/2+half[v]*scale+18);}
    else {for(let a=0;a<3;a++){const p=[0,0,0];p[a]=1;const r=rotate(p);ctx.beginPath();ctx.moveTo(40,height-38);ctx.lineTo(40+r[0]*23,height-38+r[1]*23);ctx.strokeStyle=getComputedStyle(host).getPropertyValue('--foreground').trim() || '#526276';ctx.stroke();ctx.fillText(names[a],40+r[0]*31,height-34+r[1]*31);}ctx.textAlign='right';ctx.fillText(dims.map((v,i)=>names[i]+': '+fmt(v)+' m').join(' · '),width-12,height-10);}
    readouts();
    renderRevision++;renderState={timeS:state.timeS,view:state.view,sliceAxis:state.sliceAxis,sliceM:state.sliceM,yawDeg:state.yawDeg,pitchDeg:state.pitchDeg,probeM:[...state.probeM]};
    root.dataset.rendered='true';root.dataset.renderRevision=String(renderRevision);root.dataset.visibleCells=String(drawn.length);
  }
  function schedule(){if(!frame)frame=requestAnimationFrame(draw);}
  const history=root.querySelector('.history');
  const historyTimes=[0];for(let t=maxTimeS*1e-8;t<maxTimeS;t*=1.08)historyTimes.push(t);historyTimes.push(maxTimeS);
  const historySamples=geometry?[]:[[0,0,0],half].map(point=>historyTimes.map(time=>model.evaluate(point,time)));
  const historyX=t=>38+(Math.min(620,width)-50)*t/maxTimeS;
  const historyY=t=>140-108*(high===low?0:(t-low)/(high-low));
  function drawHistory(){
    if(geometry)return;
    const w=Math.min(620,width),right=w-12;
    history.setAttribute('viewBox',`0 0 ${w} 176`);
    const curves=historySamples.map((samples,index)=>{
      let open=false;
      const path=samples.map((result,i)=>{if(!result.converged){open=false;return '';}const command=open?'L':'M';open=true;return `${command}${historyX(historyTimes[i]).toFixed(6)} ${historyY(result.temperatureC).toFixed(6)}`;}).join(' ');
      return `<path data-history-curve="${index?'corner':'center'}" d="${path}" fill="none" stroke="${index?'var(--accent)':'var(--primary)'}" stroke-width="2"/>`;
    }).join('');
    history.innerHTML=`<path d="M38 32V140H${right}" fill="none" stroke="currentColor"/>${curves}<path data-history-marker stroke="currentColor" stroke-dasharray="3 3"/><circle data-history-center r="3" fill="var(--primary)"/><circle data-history-corner r="3" fill="var(--accent)"/><text x="38" y="18">${fmt(high)} \u00b0C</text><text x="34" y="144" text-anchor="end">${fmt(low)}</text><text x="38" y="162">0</text><text x="${right}" y="162" text-anchor="end">${fmt(maxTimeS/60)} menit</text><path d="M${w-125} 14h10" stroke="var(--primary)" stroke-width="2"/><text x="${w-110}" y="18">Pusat</text><path d="M${w-70} 14h10" stroke="var(--accent)" stroke-width="2"/><text x="${w-55}" y="18">Sudut</text>`;
    history.querySelectorAll('text').forEach(label=>{label.style.fontSize='13px'});
    updateHistory();
  }
  function updateHistory(){
    if(geometry)return;
    const x=historyX(state.timeS);
    history.querySelector('[data-history-marker]').setAttribute('d',`M${x} 32V140`);
    for(const [selector,point] of [['[data-history-center]',[0,0,0]],['[data-history-corner]',half]]){
      const marker=history.querySelector(selector),result=model.evaluate(point,state.timeS);
      marker.setAttribute('visibility',result.converged?'visible':'hidden');
      if(result.converged){marker.setAttribute('cx',x);marker.setAttribute('cy',historyY(result.temperatureC));marker.setAttribute('data-temperature',String(result.temperatureC));}
    }
  }
  drawHistory();
  function readouts(){
    const occluded=!geometry&&diagnostics.converged&&!thermalViewProbeOnSurface(state.probeM,mesh.bounds,mesh.cells.filter(c=>flat||rotate(c.normal)[2]>1e-8));
    root.querySelector('.readouts').innerHTML=geometry?'':diagnostics.converged?[['Pusat',[0,0,0]],['Sudut',half]].map(([label,p])=>`<span>${label}<strong>${temp(model.temperatureAt(p,state.timeS))} °C</strong></span>`).join('')+`<span>Probe (${state.probeM.map(fmt).join(', ')}) m<strong>${temp(model.temperatureAt(state.probeM,state.timeS))} °C</strong></span>`+(occluded?'<span data-probe-occluded role="status">Probe tertutup arah pandang</span>':''):'<span role="status">Deret belum konvergen</span>';
    canvas.setAttribute('aria-label',geometry?'Balok dengan dimensi fisik. Panah memutar kamera, Home mengembalikan kondisi awal.':`${flat?'Irisan suhu 2D':'Balok 3D'}, irisan ${names[state.sliceAxis]} ${fmt(state.sliceM)} m, waktu ${fmt(state.timeS)} s, probe ${state.probeM.map(fmt).join(', ')} m: ${diagnostics.converged?temp(model.temperatureAt(state.probeM,state.timeS))+' derajat Celsius':'belum konvergen'}. ${occluded?'Probe tertutup arah pandang. ':''}${flat?'':'Panah memutar kamera. '}Shift dan panah menggeser probe, Home mengembalikan kondisi awal.`);
  }
  function sync(){
    samples();root.querySelector('.print-time').textContent='Waktu '+fmt(state.timeS/60)+' menit; irisan '+names[state.sliceAxis]+' = '+fmt(state.sliceM)+' m';const values={time:state.timeS/60,slice:state.sliceM};
    for(const [key,item]of Object.entries(inputs)){if(key==='slice'){item.input.min=-half[state.sliceAxis];item.input.max=half[state.sliceAxis];item.input.dataset.increment=dims[state.sliceAxis]/1000;item.input.setAttribute("aria-label",`Posisi irisan ${names[state.sliceAxis]} (meter)`);item.input.setAttribute("aria-valuetext",`${names[state.sliceAxis]} ${fmt(state.sliceM)} meter`);}item.input.value=values[key];item.output.textContent=key==='slice'?'Irisan '+names[state.sliceAxis]+' = '+fmt(state.sliceM)+' m':fmt(values[key])+' '+item.unit;}
    const axisField=root.querySelector('.axis-field');if(axisField)axisField.querySelector('select').value=state.sliceAxis;
    root.querySelector('.tip').hidden=true;readouts();updateHistory();schedule();
  }
  const api={getState:()=>({...state,probeM:[...state.probeM],dimensionsM:[...dims],...(!geometry?{probeTemperatureC:diagnostics.converged?model.temperatureAt(state.probeM,state.timeS):null}:{})}),getDiagnostics:()=>({...diagnostics,view:{representation:geometry?'solid-geometry':flat?'temperature-section':'sampled-surfaces-and-cutaway',sampleBuilds,cells:mesh.cells.length,visibleCells:drawn.length,probeOnRenderedSurface:!geometry&&diagnostics.converged&&thermalViewProbeOnSurface(state.probeM,mesh.bounds,drawn.map(({cell})=>cell))},render:{revision:renderRevision,pending:!!frame,state:renderState?{...renderState,probeM:[...renderState.probeM]}:null,axis:state.sliceAxis,view:state.view,canvasScale:dpr,probeScreen:project(state.probeM).slice(0,2),tiles:drawn.map(({cell,poly})=>({verticesM:cell.vertices.map(p=>[...p]),pointM:[...cell.pointM],screenPoints:poly.map(p=>p.slice(0,2)),temperatureC:cell.temperatureC,color:cell.fill,section:cell.section}))}}),actions:{
    setTime(v){if(geometry||!Number.isFinite(v)||v<0||v>maxTimeS)throw new RangeError('Invalid time');state.timeS=v;sync();},
    setProbe(p){if(geometry)throw new RangeError('Geometry has no thermal probe');model.evaluate(p,state.timeS);state.probeM=[...p];if(flat)setPosition(p[state.sliceAxis]);sync();},
    setSlice(v){if(geometry||!Number.isFinite(v)||Math.abs(v)>half[state.sliceAxis])throw new RangeError('Invalid slice');setPosition(v);sync();},
    setAxis(axis){if(geometry)throw new RangeError('Geometry has no thermal slice');const a=typeof axis==='string'?names.indexOf(axis):axis;if(!Number.isInteger(a)||a<0||a>2)throw new RangeError('Invalid slice axis');setAxis(a);},
    setView(view){if(mode!=='volume'||!['whole','cut'].includes(view))throw new RangeError('Invalid view');setPosition(view==='whole'?half[state.sliceAxis]:0);sync();},
    rotate(yaw,pitch=state.pitchDeg){if(![yaw,pitch].every(Number.isFinite)||Math.abs(yaw)>180||Math.abs(pitch)>70)throw new RangeError('Invalid camera');state.yawDeg=yaw;state.pitchDeg=pitch;schedule();},
    reset(){Object.assign(state,{timeS:initialTimeS,probeM:[0,0,0],sliceZM:0,sliceM:0,sliceAxis:2,view:flat?'slice':geometry?'whole':'cut',yawDeg:35,pitchDeg:24});sync();}
  }};
  function camera(dy,dp){api.actions.rotate(wrapYaw(state.yawDeg+dy),Math.max(-70,Math.min(70,state.pitchDeg+dp)));}
  canvas.addEventListener('dblclick',()=>api.actions.reset());
  canvas.addEventListener('keydown',e=>{
    if(e.key==='Home'){e.preventDefault();api.actions.reset();return;}
    const moves={ArrowLeft:[-15,0],ArrowRight:[15,0],ArrowUp:[0,10],ArrowDown:[0,-10]};
    if(!moves[e.key])return;
    e.preventDefault();
    if(e.shiftKey&&!geometry){const [u,v]=[0,1,2].filter(i=>i!==state.sliceAxis),a=moves[e.key][0]?u:v,sign=['ArrowLeft','ArrowDown'].includes(e.key)?-1:1,p=[...state.probeM];p[state.sliceAxis]=state.sliceM;p[a]=Math.max(-half[a],Math.min(half[a],p[a]+sign*dims[a]/100));api.actions.setProbe(p);}
    else if(!flat)camera(...moves[e.key]);
  });
  const pointIn=(poly,x,y)=>{let inside=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const a=poly[i],b=poly[j];if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])inside=!inside;}return inside;};
  function pick(e){if(geometry||!diagnostics.converged)return;const r=canvas.getBoundingClientRect(),x=e.clientX-r.left,y=e.clientY-r.top;for(let i=drawn.length-1;i>=0;i--)if(pointIn(drawn[i].poly,x,y))return drawn[i].cell;}
  canvas.addEventListener('pointerdown',e=>{if(e.button!==0)return;drag={id:e.pointerId,x:e.clientX,y:e.clientY,yaw:state.yawDeg,pitch:state.pitchDeg,moved:false};canvas.setPointerCapture(e.pointerId);root.querySelector('.tip').hidden=true;});
  canvas.addEventListener('pointermove',e=>{const tip=root.querySelector('.tip');if(drag){const dx=e.clientX-drag.x,dy=e.clientY-drag.y;if(Math.hypot(dx,dy)>4)drag.moved=true;if(drag.moved&&!flat){state.yawDeg=wrapYaw(drag.yaw+dx*.4);state.pitchDeg=Math.max(-70,Math.min(70,drag.pitch+dy*.3));schedule();}return;}const hit=pick(e);tip.hidden=!hit;if(hit){tip.textContent=`${fmt(hit.temperatureC)} °C\n${hit.pointM.map(fmt).join(', ')} m`;const r=canvas.getBoundingClientRect();tip.style.left=Math.max(4,Math.min(width-tip.offsetWidth-4,e.clientX-r.left+12))+'px';tip.style.top=Math.max(4,Math.min(height-tip.offsetHeight-4,e.clientY-r.top-60))+'px';}});
  canvas.addEventListener('pointerup',e=>{if(!drag)return;if(!drag.moved){const hit=pick(e);if(hit){state.probeM=[...hit.pointM];sync();}}drag=null;if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);});
  canvas.addEventListener('pointercancel',()=>drag=null);canvas.addEventListener('pointerleave',()=>root.querySelector('.tip').hidden=true);
  function resize(){
    const nextWidth=Math.max(1,canvas.getBoundingClientRect().width),nextHeight=Math.max(270,Math.min(420,nextWidth*.61)),nextDpr=Math.min(window.devicePixelRatio||1,2);
    if(width===nextWidth&&height===nextHeight&&dpr===nextDpr&&canvas.width===Math.round(width*dpr)&&canvas.height===Math.round(height*dpr))return;
    width=nextWidth;height=nextHeight;dpr=nextDpr;canvas.style.height=height+'px';canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);drawHistory();schedule();
  }
  const observer = new ResizeObserver(resize); observer.observe(root);
  addEventListener('message',event=>{if(event.source===parent && event.data?.type==='zyx:preferences')schedule()});
  addEventListener('pagehide',()=>{ observer.disconnect(); if(frame)cancelAnimationFrame(frame); },{once:true});
  sync();resize();return api;
}
