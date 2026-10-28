'use strict';
// Reine Darstellung in dieser Vorschau. Keine Produktionsaufrufe, keine Haptik.
window.LotCraft={
 reduced:()=>matchMedia('(prefers-reduced-motion:reduce)').matches,
 animate(el,frames,duration){
  if(!el||this.reduced()||!el.animate)return Promise.resolve();
  el.getAnimations().forEach(a=>a.cancel());
  return el.animate(frames,{duration,easing:'cubic-bezier(.22,1,.36,1)'}).finished.catch(()=>{});
 },
 mark(root=document){root.querySelectorAll('button.inline-flex.items-center.justify-center,.btn').forEach(el=>el.setAttribute('data-craft-button',''))},
 async close(el){
  if(!el)return;
  const content=el.querySelector('.drawer,.dialog')||el;
  const sheet=content.classList.contains('drawer');
  await this.animate(content,[{opacity:1,transform:'none'},{opacity:0,transform:sheet?(innerWidth<760?'translateY(8px)':'translateX(8px)'):'scale(.99)'}],140);
 },
 open(el){
  const drawer=el.matches('.drawer,.fenster,.fenster-breit,.blatt');
  // Auf echten Komponenten nur Deckkraft: bestehendes Ziehen bleibt unberührt.
  const prototype=el.matches('.drawer,.dialog');
  if(!prototype)return this.animate(el,[{opacity:0},{opacity:1}],200);
  const from=prototype?(drawer?(innerWidth<760?'translateY(12px)':'translateX(10px)'):'scale(.99)'):'none';
  return this.animate(el,[{opacity:0,transform:from},{opacity:1,transform:'none'}],200);
 }
};
document.documentElement.classList.add('craft');
window.LotCraft.mark();
const observer=new MutationObserver(changes=>{
 for(const change of changes)for(const node of change.addedNodes){
  if(!(node instanceof Element))continue;
  window.LotCraft.mark(node);
  if(node.matches('button.inline-flex.items-center.justify-center,.btn'))node.setAttribute('data-craft-button','');
  const modal=node.matches('[role=dialog]')?node:node.querySelector('[role=dialog]');
  if(modal&&!modal.dataset.craftSeen){modal.dataset.craftSeen='1';window.LotCraft.open(modal);}
  const menu=node.matches('[role=menu]')?node:node.querySelector('[role=menu]');
  if(menu&&!menu.dataset.craftSeen){menu.dataset.craftSeen='1';requestAnimationFrame(()=>window.LotCraft.animate(menu,[{opacity:0},{opacity:1}],160));}
 }
});
observer.observe(document.body,{childList:true,subtree:true});
document.querySelectorAll('[role=dialog]').forEach(el=>{el.dataset.craftSeen='1';window.LotCraft.open(el)});
// Öffnen eines nativen Details bleibt unmittelbar; nur der sichtbare Inhalt blendet kurz ein.
document.addEventListener('toggle',e=>{
 if(!(e.target instanceof HTMLDetailsElement)||!e.target.open)return;
 const content=[...e.target.children].find(el=>el.tagName!=='SUMMARY');
 if(content)window.LotCraft.animate(content,[{opacity:0},{opacity:1}],160);
},true);
