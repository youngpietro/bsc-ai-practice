/* Graphs and tables for Psychology questions (SVG, coloured by theme tokens in style.css). */
(function () {
function rng(seed){let a=seed>>>0;return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
function gauss(r){let u=0,v=0;while(u===0)u=r();while(v===0)v=r();return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v)}
function esc(s){return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")}
function mean(a){return a.reduce((s,x)=>s+x,0)/a.length}
function stdz(a){const m=mean(a);const sd=Math.sqrt(mean(a.map(x=>(x-m)**2)))||1;return a.map(x=>(x-m)/sd)}
function perm(n,seed){const r=rng(seed);const p=[...Array(n).keys()];for(let i=n-1;i>0;i--){const j=Math.floor(r()*(i+1));[p[i],p[j]]=[p[j],p[i]]}return p}

// ---------- charts (SVG, coloured by theme tokens) ----------
const W=480,H=300,PL=56,PR=20,PT=24,PB=50;
function frame(xl,yl,extra){
  return `<line class="ax" x1="${PL}" y1="${H-PB}" x2="${W-PR}" y2="${H-PB}"/><line class="ax" x1="${PL}" y1="${PT}" x2="${PL}" y2="${H-PB}"/>`+
  (xl?`<text class="lbl" x="${(PL+W-PR)/2}" y="${H-12}" text-anchor="middle">${esc(xl)}</text>`:"")+
  (yl?`<text class="lbl" transform="translate(16 ${(PT+H-PB)/2}) rotate(-90)" text-anchor="middle">${esc(yl)}</text>`:"")+(extra||"")}
function svg(inner,h){return `<svg viewBox="0 0 ${W} ${h||H}" role="img" aria-label="chart">${inner}</svg>`}
function sx(v,lo,hi){return PL+10+(v-lo)/(hi-lo)*(W-PR-PL-20)}
function sy(v,lo,hi){return H-PB-10-(v-lo)/(hi-lo)*(H-PB-PT-20)}

function scatter(c){
  const r=rng(c.seed||11), n=c.n||45; let X=[],Y=[];
  const shape=c.shape||"linear";
  if(shape==="curve"){for(let i=0;i<n;i++){const x=-2+4*i/(n-1)+gauss(r)*.08;X.push(x);Y.push(-(x*x)+gauss(r)*.45)}}
  else if(shape==="clusters"){
    const g=c.groups||[[-1.2,-1.2],[1.2,1.2]];
    g.forEach(([mx,my])=>{for(let i=0;i<Math.round(n/g.length);i++){X.push(mx+gauss(r)*.45);Y.push(my+gauss(r)*.45)}});
  } else {
    let x=[],e=[];for(let i=0;i<n;i++){x.push(gauss(r));e.push(gauss(r))}
    x=stdz(x);e=stdz(e);const b=mean(x.map((v,i)=>v*e[i]));e=stdz(e.map((v,i)=>v-b*x[i]));
    const rr=c.r??0;X=x;Y=x.map((v,i)=>rr*v+Math.sqrt(Math.max(0,1-rr*rr))*e[i]);
  }
  let out=null; if(c.outlier){out=c.outlier;}
  const all=X.concat(out?[out[0]]:[]),allY=Y.concat(out?[out[1]]:[]);
  const xl=Math.min(...all)-.2,xh=Math.max(...all)+.2,yl=Math.min(...allY)-.2,yh=Math.max(...allY)+.2;
  let pts="";
  if(c.range){const a=sx(c.range[0],xl,xh),b=sx(c.range[1],xl,xh);pts+=`<rect class="shade" x="${a}" y="${PT}" width="${b-a}" height="${H-PB-PT}"/>`}
  X.forEach((x,i)=>{const faint=c.range&&(x<c.range[0]||x>c.range[1]);pts+=`<circle class="${faint?"pt-faint":"pt"}" cx="${sx(x,xl,xh).toFixed(1)}" cy="${sy(Y[i],yl,yh).toFixed(1)}" r="4.2"/>`});
  if(out)pts+=`<circle class="pt-out" cx="${sx(out[0],xl,xh)}" cy="${sy(out[1],yl,yh)}" r="6"/>`;
  return svg(frame(c.x||"Variable X",c.y||"Variable Y")+pts)+(c.label?`<div class="cap">${esc(c.label)}</div>`:"");
}
function niceMax(m){const p=Math.pow(10,Math.floor(Math.log10(m||1)));for(const k of[1,2,2.5,5,10])if(k*p>=m)return k*p;return 10*p}
function yAxis(lo,hi,steps){let s="";for(let i=0;i<=steps;i++){const v=lo+(hi-lo)*i/steps;const y=sy(v,lo,hi);s+=`<line class="gridl" x1="${PL}" y1="${y}" x2="${W-PR}" y2="${y}"/><text class="lbl-s" x="${PL-6}" y="${y+4}" text-anchor="end">${+v.toFixed(2)}</text>`}return s}
const SER=["sA","sB","sC"],FIL=["fA","fB","fC"],BAR=["barA","barB","barC"];
function marker(i,x,y){if(i===0)return `<circle class="${FIL[0]}" cx="${x}" cy="${y}" r="5"/>`;if(i===1)return `<rect class="${FIL[1]}" x="${x-5}" y="${y-5}" width="10" height="10"/>`;return `<path class="${FIL[2]}" d="M${x} ${y-6}L${x+6} ${y+5}L${x-6} ${y+5}Z"/>`}
function legend(series,yTop){let s="",x=PL+6;series.forEach((se,i)=>{s+=`<line class="${SER[i]}" x1="${x}" y1="${yTop}" x2="${x+26}" y2="${yTop}"/>${marker(i,x+13,yTop)}<text class="ink" x="${x+32}" y="${yTop+4}">${esc(se.name)}</text>`;x+=46+se.name.length*7});return s}
function lines(c){
  const xs=c.xLabels,lo=c.yMin??0,hi=c.yMax??niceMax(Math.max(...c.series.flatMap(s=>s.values))*1.1);
  const n=xs.length,px=i=>PL+40+i*((W-PR-PL-80)/Math.max(1,n-1));
  let s=frame(c.x,c.y,yAxis(lo,hi,4));
  xs.forEach((l,i)=>s+=`<text class="lbl" x="${px(i)}" y="${H-PB+18}" text-anchor="middle">${esc(l)}</text>`);
  c.series.forEach((se,k)=>{const d=se.values.map((v,i)=>`${i?"L":"M"}${px(i)} ${sy(v,lo,hi)}`).join("");s+=`<path class="${SER[k]}" d="${d}"/>`;se.values.forEach((v,i)=>s+=marker(k,px(i),sy(v,lo,hi)))});
  return svg(s+legend(c.series,12),H)+(c.label?`<div class="cap">${esc(c.label)}</div>`:"");
}
function bars(c){
  const g=c.groups,se=c.series,lo=0,hi=c.yMax??niceMax(Math.max(...se.flatMap(s=>s.values))*1.1);
  const gw=(W-PR-PL-20)/g.length,bw=Math.min(40,(gw-16)/se.length);
  let s=frame(c.x,c.y,yAxis(lo,hi,4));
  g.forEach((gl,i)=>{const cx=PL+10+gw*i+gw/2;s+=`<text class="lbl" x="${cx}" y="${H-PB+18}" text-anchor="middle">${esc(gl)}</text>`;
    se.forEach((sr,k)=>{const x=cx-(se.length*bw)/2+k*bw,y=sy(sr.values[i],lo,hi);s+=`<rect class="${BAR[k]}" x="${x+2}" y="${y}" width="${bw-4}" height="${H-PB-10-y}"/>`})});
  let lg="",x=PL+6;if(se.length>1)se.forEach((sr,k)=>{lg+=`<rect class="${BAR[k]}" x="${x}" y="6" width="12" height="12"/><text class="ink" x="${x+18}" y="16">${esc(sr.name)}</text>`;x+=36+sr.name.length*7});
  return svg(s+lg)+(c.label?`<div class="cap">${esc(c.label)}</div>`:"");
}
function phases(c){
  const all=c.phases.flatMap(p=>p.values),n=all.length,lo=0,hi=c.yMax??niceMax(Math.max(...all)*1.1);
  const px=i=>PL+16+i*((W-PR-PL-32)/(n-1));let s=frame(c.x||"Session",c.y,yAxis(lo,hi,4)),k=0,segs="";
  c.phases.forEach((p,pi)=>{const st=k;const d=p.values.map((v,j)=>`${j?"L":"M"}${px(k+j)} ${sy(v,lo,hi)}`).join("");segs+=`<path class="sA" d="${d}"/>`;
    p.values.forEach((v,j)=>segs+=`<circle class="fA" cx="${px(k+j)}" cy="${sy(v,lo,hi)}" r="3.8"/>`);
    const mid=(px(st)+px(k+p.values.length-1))/2;segs+=`<text class="ink" x="${mid}" y="${PT+2}" text-anchor="middle" font-weight="600">${esc(p.label)}</text>`;
    k+=p.values.length;if(pi<c.phases.length-1){const xb=(px(k-1)+px(k))/2;segs+=`<line class="phase" x1="${xb}" y1="${PT+8}" x2="${xb}" y2="${H-PB}"/>`}});
  return svg(s+segs)+(c.label?`<div class="cap">${esc(c.label)}</div>`:"");
}
function multibase(c){
  const rows=c.rows,ph=82,h=rows.length*ph+40;let s="";const n=rows[0].values.length;
  const px=i=>PL+10+i*((W-PR-PL-20)/(n-1));
  rows.forEach((r,ri)=>{const top=10+ri*ph,bot=top+ph-22,hi=c.yMax||niceMax(Math.max(...r.values)*1.1);const yy=v=>bot-(v/hi)*(bot-top-6);
    s+=`<line class="ax" x1="${PL}" y1="${bot}" x2="${W-PR}" y2="${bot}"/><line class="ax" x1="${PL}" y1="${top}" x2="${PL}" y2="${bot}"/><text class="ink" x="${PL-8}" y="${(top+bot)/2+4}" text-anchor="end">${esc(r.label)}</text>`;
    s+=`<path class="sA" d="${r.values.map((v,i)=>`${i?"L":"M"}${px(i)} ${yy(v)}`).join("")}"/>`;r.values.forEach((v,i)=>s+=`<circle class="fA" cx="${px(i)}" cy="${yy(v)}" r="3"/>`);
    const xb=(px(r.start-1)+px(r.start))/2;s+=`<line class="phase" x1="${xb}" y1="${top}" x2="${xb}" y2="${bot}"/>`});
  s+=`<text class="lbl" x="${(PL+W-PR)/2}" y="${h-8}" text-anchor="middle">${esc(c.x||"Week")} · dashed line = treatment starts</text>`;
  return `<svg viewBox="0 0 ${W} ${h}" role="img" aria-label="chart">${s}</svg>`+(c.label?`<div class="cap">${esc(c.label)}</div>`:"");
}
function series(c){
  const all=c.series.flatMap(s=>s.values),n=c.series[0].values.length,lo=c.yMin??0,hi=c.yMax??niceMax(Math.max(...all)*1.1);
  const px=i=>PL+10+i*((W-PR-PL-20)/(n-1));let s=frame(c.x||"Time",c.y,yAxis(lo,hi,4));
  if(c.breakAt!=null){const xb=(px(c.breakAt-1)+px(c.breakAt))/2;s+=`<line class="phase" x1="${xb}" y1="${PT}" x2="${xb}" y2="${H-PB}"/><text class="ink" x="${xb+4}" y="${PT+10}">${esc(c.breakLabel||"intervention")}</text>`}
  c.series.forEach((se,k)=>{s+=`<path class="${SER[k]}" d="${se.values.map((v,i)=>`${i?"L":"M"}${px(i)} ${sy(v,lo,hi)}`).join("")}"/>`;se.values.forEach((v,i)=>s+=marker(k,px(i),sy(v,lo,hi)).replace(/r="5"/,'r="3.5"'))});
  return svg(s+(c.series.length>1?legend(c.series,12):""))+(c.label?`<div class="cap">${esc(c.label)}</div>`:"");
}
function curve(c){
  const all=c.series.flatMap(s=>s.pts),xl=c.xMin??Math.min(...all.map(p=>p[0])),xh=c.xMax??Math.max(...all.map(p=>p[0]));
  const yl=c.yMin??Math.min(0,...all.map(p=>p[1])),yh=c.yMax??Math.max(...all.map(p=>p[1]));
  let s=frame(c.x,c.y,c.noTicks?"":yAxis(yl,yh,4));
  if(c.zero){const y0=sy(0,yl,yh),x0=sx(0,xl,xh);s+=`<line class="gridl" x1="${PL}" y1="${y0}" x2="${W-PR}" y2="${y0}"/><line class="gridl" x1="${x0}" y1="${PT}" x2="${x0}" y2="${H-PB}"/>`}
  (c.xTicks||[]).forEach(([v,l])=>s+=`<text class="lbl-s" x="${sx(v,xl,xh)}" y="${H-PB+16}" text-anchor="middle">${esc(l)}</text>`);
  c.series.forEach((se,k)=>{s+=`<path class="${SER[k]}" d="${se.pts.map((p,i)=>`${i?"L":"M"}${sx(p[0],xl,xh).toFixed(1)} ${sy(p[1],yl,yh).toFixed(1)}`).join("")}"/>`;if(se.dots)se.pts.forEach(p=>s+=marker(k,sx(p[0],xl,xh),sy(p[1],yl,yh)).replace(/r="5"/,'r="3.5"'))});
  (c.notes||[]).forEach(([x,y,t])=>s+=`<text class="ink" x="${sx(x,xl,xh)}" y="${sy(y,yl,yh)}" text-anchor="middle">${esc(t)}</text>`);
  return svg(s+(c.series.length>1||c.series[0].name?legend(c.series,12):""))+(c.label?`<div class="cap">${esc(c.label)}</div>`:"");
}
function normal(c){
  const lo=40,hi=160,pts=[];for(let x=lo;x<=hi;x+=2)pts.push([x,Math.exp(-((x-100)**2)/(2*225))]);
  const xs=v=>sx(v,lo,hi),ys=v=>sy(v,0,1.05);let s=frame("IQ score","");
  if(c.shade){const [a,b]=c.shade;const seg=pts.filter(p=>p[0]>=a&&p[0]<=b);s+=`<path class="shade" d="M${xs(a)} ${ys(0)}${seg.map(p=>`L${xs(p[0])} ${ys(p[1])}`).join("")}L${xs(b)} ${ys(0)}Z"/>`}
  s+=`<path class="sA" d="${pts.map((p,i)=>`${i?"L":"M"}${xs(p[0]).toFixed(1)} ${ys(p[1]).toFixed(1)}`).join("")}"/>`;
  [55,70,85,100,115,130,145].forEach(v=>s+=`<line class="gridl" x1="${xs(v)}" y1="${ys(0)}" x2="${xs(v)}" y2="${ys(0)+5}"/><text class="lbl-s" x="${xs(v)}" y="${H-PB+16}" text-anchor="middle">${v}</text>`);
  return svg(s)+(c.label?`<div class="cap">${esc(c.label)}</div>`:"");
}
function table(c){return `<table><thead><tr>${c.head.map(h=>`<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${c.rows.map(r=>`<tr>${r.map((v,i)=>i===0?`<th>${esc(v)}</th>`:`<td>${esc(v)}</td>`).join("")}</tr>`).join("")}</tbody></table>`+(c.label?`<div class="cap">${esc(c.label)}</div>`:"")}
function figure(c){if(!c)return "";const f={scatter,lines,bars,phases,multibase,series,curve,normal,table}[c.t];return f?`<div class="fig">${f(c)}</div>`:""}
window.PSY_FIGURE = figure;
})();
