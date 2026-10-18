// Decorative geometry only. No accounts, family records, or network traffic.
const point = (x,y) => `${Math.round(x)} ${Math.round(y)}`;
export function memberBranch() {
  // One shared decorative branch, not a claimed or inferred pedigree.
  const stem='M110 1020 C160 800 210 710 330 600 C480 480 600 420 780 310 C940 220 1100 160 1350 90';
  const twigs=[
    'M110 1020 C160 800 210 710 330 600 C260 480 210 400 120 320',
    'M110 1020 C160 800 210 710 330 600 C480 480 600 420 780 310 C720 190 640 130 560 60',
    'M110 1020 C160 800 210 710 330 600 C480 480 600 420 780 310 C940 220 1100 160 1350 90',
    'M110 1020 C160 800 210 710 330 600 C500 660 630 710 850 720',
    'M110 1020 C160 800 210 710 330 600 C480 480 600 420 780 310 C920 390 1100 430 1370 400',
    'M110 1020 C160 800 210 710 330 600 C480 480 600 420 780 310 C940 220 1100 160 1170 40',
  ];
  const nodes=[[330,600],[780,310],[120,320],[560,60],[1350,90],[850,720],[1370,400],[1170,40]];
  return `<div class="network-backdrop member-backdrop" aria-hidden="true"><svg class="network-tree member-branch" viewBox="0 0 1440 1000" fill="none" xmlns="http://www.w3.org/2000/svg" focusable="false">
    <g class="network-wires"><path d="${stem}"/>${twigs.map(d=>`<path d="${d}"/>`).join('')}</g>
    <g class="network-halos">${nodes.map(([x,y])=>`<circle cx="${x}" cy="${y}" r="16"/>`).join('')}</g>
    <g class="network-nodes">${nodes.map(([x,y])=>`<circle cx="${x}" cy="${y}" r="3"/>`).join('')}</g>
    <g class="network-signals">${twigs.map((d,i)=>`<path class="signal signal-${i}" d="${d}" pathLength="100"/>`).join('')}</g>
  </svg></div>`;
}
export function treeNetwork() {
  const wires=[], routes=[], nodes=[];
  const trunk='M720 690 C700 620 735 565 720 480';
  wires.push(trunk);
  const boughs=[
    [720,510,420,345],[720,475,565,250],[720,480,720,190],
    [720,495,880,260],[720,530,1040,355],
  ];
  function split(x,y,tx,ty,depth,spread,route) {
    const curve=` C${point(x+(tx-x)*.12,y+(ty-y)*.6)} ${point(tx-(tx-x)*.38,ty+16)} ${point(tx,ty)}`;
    wires.push(`M${point(x,y)}${curve}`);
    const next=route+curve;
    nodes.push([tx,ty,depth===0?2.3:3.2]);
    if(depth===0) {routes.push(next);return;}
    split(tx,ty,tx-spread,ty-60-depth*14,depth-1,spread*.58,next);
    split(tx,ty,tx+spread,ty-72-depth*12,depth-1,spread*.58,next);
  }
  boughs.forEach(([x,y,tx,ty],i)=>{
    const route=`M720 690 C700 620 735 565 ${point(x,y)}`;
    split(x,y,tx,ty,2,i===2?75:96,route);
  });
  // Roots radiate from the same trunk, with distinct routes to their tips.
  [-1,1].forEach(side=>{
    [0,1,2].forEach(i=>{
      const x=720+side*(145+i*82),y=760+i*31;
      const root=`M720 480 C735 565 700 620 720 690 C${point(720+side*30,735)} ${point(x-side*45,y-12)} ${point(x,y)}`;
      wires.push(root);nodes.push([x,y,3]);
      [-1,1].forEach(fork=>{
        const tx=x+side*(105+i*24),ty=y+fork*30+60;
        const tip=` C${point(x+side*50,y+12)} ${point(tx-side*30,ty)} ${point(tx,ty)}`;
        wires.push(`M${point(x,y)}${tip}`);routes.push(root+tip);nodes.push([tx,ty,2.5]);
      });
    });
  });
  return `<div class="network-backdrop" aria-hidden="true"><svg class="network-tree" viewBox="0 0 1440 1000" fill="none" xmlns="http://www.w3.org/2000/svg" focusable="false">
    <defs><radialGradient id="network-aura"><stop stop-color="#59e894" stop-opacity=".12"/><stop offset="1" stop-color="#59e894" stop-opacity="0"/></radialGradient></defs>
    <ellipse cx="720" cy="520" rx="520" ry="440" fill="url(#network-aura)"/>
    <g class="network-wires">${wires.map(d=>`<path d="${d}"/>`).join('')}</g>
    <g class="network-halos">${nodes.map(([x,y,r])=>`<circle cx="${Math.round(x)}" cy="${Math.round(y)}" r="${r*3}"/>`).join('')}</g>
    <g class="network-nodes">${nodes.map(([x,y,r])=>`<circle cx="${Math.round(x)}" cy="${Math.round(y)}" r="${r}"/>`).join('')}</g>
    <g class="network-signals">${routes.filter((_,i)=>i%2===0).map((d,i)=>`<path class="signal signal-${i%6}" d="${d}" pathLength="100"/>`).join('')}</g>
    <circle class="network-heart" cx="720" cy="690" r="7"/><circle class="network-heart-ring" cx="720" cy="690" r="17"/>
  </svg></div>`;
}
