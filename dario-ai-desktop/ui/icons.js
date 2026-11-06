const paths={
  'panel-left':'<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18"/>',
  'panel-left-close':'<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18m7-11-3 2 3 2"/>',
  'panel-left-open':'<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18m4-11 3 2-3 2"/>',
  'square-pen':'<path d="M12 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-6"/><path d="m16 4 4 4-8 8-4 1 1-4z"/>',
  'search':'<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
  'brain':'<path d="M12 7a4 4 0 1 0-8 0 4 4 0 0 0-1 7 4 4 0 0 0 5 6c2 0 4-1 4-4V7Zm0 0a4 4 0 1 1 8 0 4 4 0 0 1 1 7 4 4 0 0 1-5 6c-2 0-4-1-4-4V7Z"/>',
  'download':'<path d="M12 3v12m-5-5 5 5 5-5"/><path d="M4 17v4h16v-4"/>',
  'upload':'<path d="M12 16V4m-5 5 5-5 5 5M4 17v4h16v-4"/>',
  'sun':'<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  'moon':'<path d="M20.5 13.2A8.5 8.5 0 0 1 10.8 3.5 8.5 8.5 0 1 0 20.5 13.2Z"/>',
  'chevron-down':'<path d="m6 9 6 6 6-6"/>',
  'plus':'<path d="M12 5v14M5 12h14"/>',
  'arrow-up':'<path d="M12 19V5m-6 6 6-6 6 6"/>',
  'square':'<rect x="5" y="5" width="14" height="14" rx="2" fill="currentColor" stroke="none"/>',
  'paperclip':'<path d="m21 11.5-8.6 8.6a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 1 1 5.7 5.7l-9.2 9.2a2 2 0 1 1-2.8-2.8l8.5-8.5"/>',
  'file-text':'<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6M8 13h8M8 17h8"/>',
  'x':'<path d="M18 6 6 18M6 6l12 12"/>',
  'copy':'<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/>',
  'check':'<path d="m4 12 5 5L20 6"/>',
  'ellipsis':'<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
  'pencil':'<path d="m15 5 4 4M4 20l5-.9L20 7a2.8 2.8 0 0 0-4-4L4 15z"/>',
  'trash':'<path d="M3 6h18M8 6V4h8v2m3 0-1 15H6L5 6M10 10v7m4-7v7"/>',
  'repeat':'<path d="m17 2 4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4m14-1v2a3 3 0 0 1-3 3H3"/>',
  'code':'<path d="m8 8-4 4 4 4m8-8 4 4-4 4m-3-9-2 18"/>',
  'eye':'<path d="M2 12s3.8-7 10-7 10 7 10 7-3.8 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  'align-left':'<path d="M4 6h16M4 10h10M4 14h16M4 18h10"/>',
  'message':'<path d="M20 11.5a8.5 8.5 0 0 1-8.5 8.5 9 9 0 0 1-4-.9L3 21l1.6-4.4A8.5 8.5 0 1 1 20 11.5Z"/>',
  'external-link':'<path d="M14 4h6v6m0-6-9 9"/><path d="M20 13v6H4V5h7"/>',
  'folder':'<path d="M3 6a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v10H3Z"/>',
  'loader':'<path d="M12 2a10 10 0 1 0 10 10"/>',
  'keyboard':'<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M6 9h.01M10 9h.01M14 9h.01M18 9h.01M6 12h.01M10 12h.01M14 12h.01M18 12h.01M7 16h10"/>'
};
const ns='http://www.w3.org/2000/svg';
export function icon(name,size=19){
 const svg=document.createElementNS(ns,'svg');
 svg.setAttribute('viewBox','0 0 24 24');
 svg.setAttribute('width',String(size));
 svg.setAttribute('height',String(size));
 svg.setAttribute('fill','none');
 svg.setAttribute('stroke','currentColor');
 svg.setAttribute('stroke-width','1.85');
 svg.setAttribute('stroke-linecap','round');
 svg.setAttribute('stroke-linejoin','round');
 svg.setAttribute('aria-hidden','true');
 svg.classList.add('ui-icon');
 svg.innerHTML=paths[name]||paths.message;
 return svg;
}
export function hydrateIcons(root=document) {
 for(const node of root.querySelectorAll('[data-icon]')){
  const name=node.getAttribute('data-icon');
  node.replaceChildren(icon(name,Number(node.dataset.size)||19));
 }
}
