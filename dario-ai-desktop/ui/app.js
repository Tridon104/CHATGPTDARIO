import {marked} from 'marked';
import DOMPurify from 'dompurify';
import hljs from 'highlight.js/lib/core';
import javascript from 'highlight.js/lib/languages/javascript';
import typescript from 'highlight.js/lib/languages/typescript';
import python from 'highlight.js/lib/languages/python';
import xml from 'highlight.js/lib/languages/xml';
import css from 'highlight.js/lib/languages/css';
import json from 'highlight.js/lib/languages/json';
import bash from 'highlight.js/lib/languages/bash';
import sql from 'highlight.js/lib/languages/sql';
import {icon,hydrateIcons} from './icons.js';

for(const [lang,module] of Object.entries({javascript,typescript,python,xml,css,json,bash,sql}))hljs.registerLanguage(lang,module);
marked.setOptions({gfm:true,breaks:true});
const $=id=>document.getElementById(id);
const el=(tag,text,className)=>{
 const node=document.createElement(tag);
 if(text!==undefined)node.textContent=text;
 if(className)node.className=className;
 return node;
};
const ask=(name,...args)=>window.dario.invoke(name,...args);
const fileLimit=2_000_000;
const fileCountLimit=5;
let state={data:{chats:[],memories:[],model:''},session:{status:'disconnected'},models:[],busy:false,activeChatId:null};
let selected='',pending=false,partial='',visibleCount=40,sidebarClosed=false,dialogType='',dialogFile=null,renameId=null,pendingFiles=[],streamRaf=0;
function button(label,iconName,className='',title=label){
 const node=el('button',undefined,className);
 node.type='button';node.title=title;node.setAttribute('aria-label',title);
 if(iconName)node.append(icon(iconName));
 if(label)node.append(el('span',label));
 return node;
}
function notify(error){
 const toast=$('toast');
 toast.textContent=String(error);
 toast.hidden=false;
 clearTimeout(notify.timer);
 notify.timer=setTimeout(()=>{toast.hidden=true},4800);
}
async function action(fn){try{return await fn()}catch(e){notify(e?.message||String(e));return null}}
const connected=()=>state.session?.status==='connected'&&state.session?.sharing===true;
function applyTheme(raw){
 const theme=raw==='dark'?'dark':'light';
 document.documentElement.dataset.theme=theme;
 $('themeLabel').textContent=theme==='dark'?'Tema chiaro':'Tema scuro';
 $('themeIcon').replaceChildren(icon(theme==='dark'?'sun':'moon'));
 try{localStorage.setItem('dario-theme',theme)}catch{}
}
function setSidebar(closed){
 sidebarClosed=closed;
 $('shell').classList.toggle('sidebar-closed',closed);
 $('expand').hidden=!closed;
 try{localStorage.setItem('dario-sidebar-closed',closed?'1':'0')}catch{}
}
function formatBytes(n){return n>=1048576?(n/1048576).toFixed(1)+' MB':n>=1024?Math.ceil(n/1024)+' KB':n+' B'}
function scrollBottom(){const box=$('conversation');box.scrollTop=box.scrollHeight}
function nearBottom(){
 const box=$('conversation');
 return box.scrollHeight-box.clientHeight-box.scrollTop<190;
}
function markdown(text){return DOMPurify.sanitize(marked.parse(String(text||'')),{USE_PROFILES:{html:true}})}
function attachIcons(){hydrateIcons(document)}
function renderNav(){
 const chats=state.data.chats||[];
 if(!chats.some(chat=>chat.id===selected)){selected=chats[0]?.id||'';visibleCount=40}
 const nav=$('chats');
 nav.replaceChildren();
 const query=$('filter').value.trim().toLowerCase();
 for(const chat of chats.filter(c=>c.title.toLowerCase().includes(query)||c.messages.some(m=>m.text?.toLowerCase().includes(query)))){
  const item=el('div',undefined,'nav-chat'+(chat.id===selected?' active':''));
  const select=el('button',chat.title,'chat-select chatlabel');
  select.title=chat.title;
  select.onclick=()=>{
   hideMenu();if(selected!==chat.id){selected=chat.id;visibleCount=40;partial=''}
   renderNav();renderMessages();
  };
  const more=button('', 'ellipsis','chat-options','Opzioni chat');
  more.onclick=e=>{e.stopPropagation();showMenu(e.currentTarget,chat)};
  item.append(select,more);nav.append(item);
 }
}
function showMenu(anchor,chat){
 const menu=$('contextMenu');
 if(!menu.hidden&&menu.dataset.id===chat.id){hideMenu();return}
 menu.dataset.id=chat.id;
 menu.replaceChildren();
 const choices=[
  ['Rinomina','pencil',()=>{renameId=chat.id;modal('rename')}],
  ['Duplica','copy',()=>action(async()=>{selected=await ask('duplicate-chat',chat.id);visibleCount=40;render()})],
  ['Esporta chat .md','download',()=>action(()=>ask('export-chat',chat.id))],
  ['Elimina','trash',()=>{if(confirm('Eliminare definitivamente la chat?'))action(()=>ask('delete-chat',chat.id))}]
 ];
 for(const [label,kind,fn] of choices){
  const entry=button(label,kind,label==='Elimina'?'destructive':'');
  entry.onclick=()=>{hideMenu();fn()};
  menu.append(entry);
 }
 menu.hidden=false;
 const bounds=anchor.getBoundingClientRect();
 const x=Math.max(8,Math.min(innerWidth-210,bounds.right-185));
 const y=Math.max(8,Math.min(innerHeight-215,bounds.top+24));
 menu.style.left=x+'px';menu.style.top=y+'px';
}
function hideMenu(){$('contextMenu').hidden=true}
function renderModels(){
 const select=$('model');
 select.replaceChildren();
 if(!state.models.length){
  const option=el('option','Nessun modello');
  option.value='';select.append(option);
 }
 for(const model of state.models){
  const option=el('option',model.displayName||model.slug||'Modello');
  option.value=model.slug;select.append(option);
 }
 if(state.models.some(m=>m.slug===state.data.model))select.value=state.data.model;
 select.disabled=!connected()||pending;
 $('status').textContent=connected()?'ChatGPT collegato':'Non collegato';
}
function codeControls(container){
 for(const pre of container.querySelectorAll('pre')){
  if(pre.closest('.code-block'))continue;
  const code=pre.querySelector('code');
  if(!code)continue;
  const content=code.textContent;
  const classes=String(code.className||'');
  const language=/language-([\w+-]+)/.exec(classes)?.[1]||'text';
  const filename='snippet.'+({javascript:'js',typescript:'ts',python:'py',xml:'xml',html:'html',css:'css',json:'json',bash:'sh',sql:'sql',javascriptreact:'jsx',typescriptreact:'tsx'}[language]||'txt');
  const wrapper=el('div',undefined,'code-block');
  const header=el('div',undefined,'code-head');
  header.append(icon('code',16),el('span',language,'code-language'));
  const copy=button('Copia','copy','code-tool');
  copy.onclick=()=>action(async()=>{
   await ask('copy-text',content);
   copy.replaceChildren(icon('check',15),el('span','Copiato'));
   setTimeout(()=>copy.replaceChildren(icon('copy',15),el('span','Copia')),1600);
  });
  const save=button('Salva','download','code-tool','Salva il codice come file');
  save.onclick=()=>action(()=>ask('save-text',filename,content));
  const wrap=button('A capo','align-left','code-tool','Attiva/disattiva il ritorno a capo');
  wrap.onclick=()=>wrapper.classList.toggle('wrapped');
  header.append(wrap,save,copy);
  pre.replaceWith(wrapper);wrapper.append(header,pre);
  if(content.length<24000&&language!=='text'){
   try{
    if(hljs.getLanguage(language))hljs.highlightElement(code);
    else if(language==='js'){code.classList.add('language-javascript');hljs.highlightElement(code)}
   }catch{}
  }
 }
}
function messageActions(msg,lastAssistant){
 const bar=el('div',undefined,'message-actions');
 const copy=button('','copy','mini-action','Copia messaggio');
 copy.onclick=()=>action(async()=>{await ask('copy-text',msg.text);notify('Messaggio copiato')});
 bar.append(copy);
 if(msg.role==='assistant'){
  const save=button('','download','mini-action','Salva risposta come Markdown');
  save.onclick=()=>action(()=>ask('save-text','risposta-dario.md',msg.text));
  bar.append(save);
  if(lastAssistant){
   const regenerate=button('','repeat','mini-action','Rigenera risposta');
   regenerate.onclick=()=>action(async()=>{if(!connected()){modal('account');return}pending=true;partial='';renderCompose();try{await ask('regenerate',selected)}finally{pending=false;render()}});
   bar.append(regenerate);
  }
 }
 return bar;
}
function fileCard(file){
 const card=el('button',undefined,'file-card');
 card.type='button';card.title='Apri '+file.name;
 const image=el('span',undefined,'file-icon');image.append(icon('file-text',21));
 const info=el('span',undefined,'file-info');
 info.append(el('strong',file.name),el('small',formatBytes(file.bytes||file.chars||0)+' · Testo'));
 card.append(image,info);
 card.onclick=()=>action(async()=>{
  dialogFile=await ask('read-attachment',file.id);
  dialogFile.id=file.id;modal('file');
 });
 return card;
}
function renderMessages(){
 const box=$('conversation');
 const shouldScroll=nearBottom();
 const list=$('messages');
 const chat=state.data.chats.find(c=>c.id===selected);
 const msgs=chat?.messages||[];
 const length=msgs.length;
 $('welcome').hidden=length>0;
 list.replaceChildren();
 const start=Math.max(0,length-visibleCount);
 if(start>0){
  const older=el('button','Mostra messaggi precedenti ('+start+')','load-older');
  older.onclick=()=>{
   const oldHeight=box.scrollHeight;
   visibleCount+=40;
   renderMessages();
   box.scrollTop+=box.scrollHeight-oldHeight;
  };
  list.append(older);
 }
 const lastAssistant=msgs.at(-1)?.role==='assistant';
 for(let i=start;i<length;i++){
  const msg=msgs[i];
  const article=el('article',undefined,'message '+(msg.role==='user'?'user':'assistant'));
  if(msg.role==='user'){
   if(msg.text)article.append(el('div',msg.text,'bubble'));
   for(const file of msg.attachments||[])article.append(fileCard(file));
   article.append(messageActions(msg,false));
  }else{
   const response=el('div',undefined,'response');
   response.innerHTML=markdown(msg.text);
   codeControls(response);
   article.append(response,messageActions(msg,lastAssistant&&i===length-1));
  }
  list.append(article);
 }
 if((state.busy||pending)&&state.activeChatId===selected){
  const article=el('article',undefined,'message assistant');
  const response=el('div',undefined,'response streamed');
  response.id='streamResponse';
  response.textContent=partial;
  if(!partial)response.append(el('span',undefined,'streaming-cursor'));
  article.append(response);list.append(article);
 }
 if(shouldScroll)requestAnimationFrame(scrollBottom);
}
function renderChips(){
 const box=$('attachmentChips');
 box.replaceChildren();
 box.hidden=!pendingFiles.length;
 for(let index=0;index<pendingFiles.length;index++){
  const file=pendingFiles[index];
  const chip=el('div',undefined,'pending-chip');
  chip.append(icon('file-text',15),el('span',file.name+' · '+formatBytes(new TextEncoder().encode(file.content).length)));
  const remove=button('', 'x',undefined,'Rimuovi '+file.name);
  remove.onclick=()=>{pendingFiles.splice(index,1);renderChips();renderCompose()};
  chip.append(remove);box.append(chip);
 }
}
function renderCompose(){
 const textarea=$('prompt');
 const canSend=Boolean(textarea.value.trim()||pendingFiles.length);
 $('send').disabled=!connected()||pending||state.busy||!canSend;
 $('stop').hidden=!state.busy;
 textarea.style.height='auto';
 textarea.style.height=Math.min(textarea.scrollHeight,Math.max(100,Math.min(innerHeight*.33,230)))+'px';
}
function render(){
 renderNav();
 renderModels();
 renderMessages();
 renderChips();
 renderCompose();
 if(dialogType==='account'||dialogType==='memory')renderDialog();
}
function modal(type){
 dialogType=type;
 $('overlay').hidden=false;renderDialog();
}
function closeModal(){
 dialogType='';dialogFile=null;renameId=null;$('overlay').hidden=true;
}
function addActions(body,items){
 const row=el('div',undefined,'modal-actions');
 for(const item of items){
  const node=el('button',item.label,item.primary?'primary':'');
  node.onclick=()=>action(item.action);
  row.append(node);
 }
 body.append(row);
}
function renderDialog(){
 const body=$('modalBody');body.replaceChildren();
 const label={account:'Account ChatGPT',memory:'Memoria personale',rename:'Rinomina conversazione',file:dialogFile?.name||'Allegato'};
 $('modalTitle').textContent=label[dialogType]||'Impostazioni';
 if(dialogType==='account'){
  body.append(el('p',connected()?'L’account è collegato. Le chat restano salvate su questo computer.':'Accedi nel browser e autorizza l’utilizzo del tuo account ChatGPT.'));
  addActions(body,[
   {label:connected()?'Disconnetti':'Collega ChatGPT',primary:true,action:async()=>{await ask(connected()?'disconnect':'signin');closeModal()}},
   {label:'Aggiorna modelli',action:()=>ask('models')}
  ]);
  body.append(el('p','Non inserire dati di pazienti o materiale riservato: la memoria locale non è cifrata.'));
 }else if(dialogType==='memory'){
  body.append(el('p','Le memorie vengono aggiunte al contesto della chat. Puoi eliminarle in qualsiasi momento.'));
  const input=el('input');input.placeholder='Aggiungi una memoria';input.maxLength=1000;body.append(input);
  addActions(body,[{label:'Salva memoria',primary:true,action:async()=>{await ask('memory',input.value);input.value=''}}]);
  for(const entry of state.data.memories){
   const line=el('div',undefined,'memory-row');
   line.append(el('p',entry.text));
   const remove=button('', 'trash','mini-action','Elimina memoria');
   remove.onclick=()=>action(()=>ask('remove-memory',entry.id));
   line.append(remove);body.append(line);
  }
 }else if(dialogType==='rename'){
  const chat=state.data.chats.find(c=>c.id===renameId);
  const input=el('input');input.value=chat?.title||'';input.maxLength=100;body.append(input);
  addActions(body,[{label:'Salva nome',primary:true,action:async()=>{await ask('rename-chat',renameId,input.value);closeModal()}}]);
  setTimeout(()=>{input.focus();input.select()},20);
 }else if(dialogType==='file'&&dialogFile){
  const file=dialogFile;
  body.append(el('p','Anteprima del testo allegato ('+file.chars.toLocaleString('it-IT')+' caratteri).'+(file.truncated?' Sono mostrati solo i primi 200.000 caratteri.':'')+' Il file originale resta sul PC.'));
  const preview=el('textarea');preview.readOnly=true;preview.value=file.content;preview.setAttribute('aria-label','Anteprima file');body.append(preview);
  addActions(body,[
   {label:'Copia tutto',primary:true,action:async()=>{await ask('copy-attachment',file.id);notify('File copiato')}},
   {label:'Salva file',action:()=>ask('export-attachment',file.id)}
  ]);
  body.append(el('p','Per limiti di contesto, Dario AI può leggere un estratto del file. Il file completo non viene cancellato.'));
 }
}
function addFile(name,content){
 if(pendingFiles.length>=fileCountLimit){notify('Puoi allegare massimo 5 file per messaggio.');return false}
 if(!content||content.length>fileLimit||new TextEncoder().encode(content).length>3_000_000){
  notify('Il file supera il limite locale di circa 2 milioni di caratteri. Dividilo in parti.');return false;
 }
 if(content.includes('\0')){notify('Sono supportati soltanto file di testo.');return false}
 const safeName=String(name||'codice-incollato.txt').replace(/[\\/:*?"<>|\u0000-\u001f]/g,'_').slice(0,120);
 pendingFiles.push({name:safeName||'allegato.txt',content});
 renderChips();renderCompose();return true;
}
async function handleFiles(files){
 for(const file of Array.from(files||[])){
  if(file.size>3_000_000){notify('File troppo grande: '+file.name);continue}
  const content=await file.text();
  addFile(file.name,content);
 }
}
async function send(){
 let text=$('prompt').value.trim();
 if(!text&&!pendingFiles.length||pending||state.busy)return;
 if(!connected()){modal('account');return}
 if(text.length>20000){
  if(!addFile('testo-lungo.txt',text))return;
  text='';
 }
 const attachments=pendingFiles.slice();
 const previous=$('prompt').value;
 try{
  if(!selected){selected=await ask('new-chat');visibleCount=40}
  pending=true;partial='';
  $('prompt').value='';pendingFiles=[];renderChips();renderCompose();
  await ask('send',selected,text,attachments);
 }catch(error){
  notify(error?.message||String(error));
  $('prompt').value=previous;pendingFiles=attachments;renderChips();
 }finally{
  pending=false;partial='';render();$('prompt').focus();
 }
}
function scheduleStream(){
 if(streamRaf)return;
 streamRaf=requestAnimationFrame(()=>{
  streamRaf=0;
  const response=$('streamResponse');
  if(response){
   response.textContent=partial;
   if(nearBottom())scrollBottom();
  }
 });
}
window.dario.onChange(next=>{
 state=next;
 render();
});
window.dario.onDelta(({id,delta})=>{
 if(id!==selected)return;
 partial+=delta;
 scheduleStream();
});
function init(){
 attachIcons();
 try{applyTheme(localStorage.getItem('dario-theme')||'light')}catch{applyTheme('light')}
 try{sidebarClosed=localStorage.getItem('dario-sidebar-closed')==='1'}catch{}
 setSidebar(sidebarClosed);
 $('collapse').onclick=()=>setSidebar(true);
 $('expand').onclick=()=>setSidebar(false);
 $('brand').onclick=()=>action(async()=>{selected=await ask('new-chat');visibleCount=40;render();$('prompt').focus()});
 $('new').onclick=()=>action(async()=>{selected=await ask('new-chat');visibleCount=40;render();$('prompt').focus()});
 $('filter').oninput=renderNav;
 $('memory').onclick=()=>modal('memory');
 $('account').onclick=()=>modal('account');
 $('export').onclick=()=>action(()=>ask('backup'));
 $('import').onclick=()=>action(()=>ask('restore'));
 $('theme').onclick=()=>applyTheme(document.documentElement.dataset.theme==='dark'?'light':'dark');
 $('attach').onclick=()=>$('files').click();
 $('files').onchange=e=>{action(()=>handleFiles(e.target.files));e.target.value=''};
 $('close').onclick=closeModal;
 $('overlay').onclick=e=>{if(e.target===$('overlay'))closeModal()};
 $('send').onclick=send;
 $('stop').onclick=()=>action(()=>ask('stop'));
 $('prompt').addEventListener('input',renderCompose);
 $('prompt').addEventListener('paste',event=>{
  const pasted=event.clipboardData?.getData('text/plain');
  if(!pasted)return;
  if(pasted.length>4500||pasted.split('\n').length>70){
   event.preventDefault();
   const name='codice-incollato-'+String(Date.now()).slice(-6)+'.txt';
   if(addFile(name,pasted))notify('Testo lungo allegato come '+name);
  }
 });
 $('prompt').onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();send()}};
 $('model').onchange=e=>action(()=>ask('model',e.target.value));
 for(const node of document.querySelectorAll('[data-prompt]')){
  node.onclick=()=>{$('prompt').value=node.dataset.prompt;renderCompose();$('prompt').focus()};
 }
 const composer=$('composer');
 composer.addEventListener('dragover',event=>{if(event.dataTransfer?.types?.includes('Files')){event.preventDefault();composer.classList.add('dragging')}});
 composer.addEventListener('dragleave',()=>composer.classList.remove('dragging'));
 composer.addEventListener('drop',event=>{
  event.preventDefault();composer.classList.remove('dragging');
  action(()=>handleFiles(event.dataTransfer.files));
 });
 document.addEventListener('click',event=>{
  if(!event.target.closest('#contextMenu')&&!event.target.closest('.chat-options'))hideMenu();
 });
 document.onkeydown=e=>{
  if(e.key==='Escape'){closeModal();hideMenu()}
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();$('filter').focus()}
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='n'){e.preventDefault();$('new').click()}
 };
 $('messages').addEventListener('click',e=>{
  const link=e.target.closest('a[href]');
  if(link){e.preventDefault();action(()=>ask('open-link',link.href))}
 });
 ask('initial').then(next=>{state=next;render()}).catch(e=>notify(e?.message||String(e)));
}
init();
