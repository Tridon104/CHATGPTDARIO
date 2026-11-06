import { marked } from 'marked';
import DOMPurify from 'dompurify';

marked.setOptions({gfm:true,breaks:true});
const $=id=>document.getElementById(id);
const el=(tag,text,cls)=>{
 const node=document.createElement(tag);
 if(text!==undefined)node.textContent=text;
 if(cls)node.className=cls;
 return node;
};
const ask=(command,...params)=>window.dario.invoke(command,...params);
let state={data:{chats:[],memories:[],model:''},session:{status:'disconnected'},models:[],busy:false};
let selected='',pending=false,partial='',dialogType='',sidebarClosed=false;
function notify(error){
 const t=$('toast');
 t.textContent=String(error);
 t.hidden=false;
 window.clearTimeout(notify.timer);
 notify.timer=window.setTimeout(()=>{t.hidden=true},5000);
}
async function action(fn){try{await fn()}catch(err){notify(err?.message||String(err))}}
const connected=()=>state.session?.status==='connected'&&state.session?.sharing===true;
function applyTheme(theme){
 const value=theme==='light'?'light':'dark';
 document.documentElement.dataset.theme=value;
 $('themeLabel').textContent=value==='dark'?'Tema chiaro':'Tema scuro';
 $('themeIcon').textContent=value==='dark'?'☼':'☾';
 try{localStorage.setItem('dario-theme',value)}catch{}
}
try{applyTheme(localStorage.getItem('dario-theme')||'dark')}catch{applyTheme('dark')}
try{sidebarClosed=localStorage.getItem('dario-sidebar-closed')==='1'}catch{}
function setSidebar(closed){
 sidebarClosed=closed;
 $('shell').classList.toggle('sidebar-closed',closed);
 $('expand').hidden=!closed;
 try{localStorage.setItem('dario-sidebar-closed',closed?'1':'0')}catch{}
}
setSidebar(sidebarClosed);
function scrollBottom(){
 const area=$('conversation');
 area.scrollTop=area.scrollHeight;
}
function updateCompose(){
 $('send').disabled=pending||state.busy||!$('prompt').value.trim();
 $('stop').hidden=!state.busy;
 $('prompt').style.height='auto';
 $('prompt').style.height=Math.min($('prompt').scrollHeight,170)+'px';
}
function markdown(text){
 const output=marked.parse(String(text||''));
 return DOMPurify.sanitize(output,{USE_PROFILES:{html:true}});
}
function renderMessages(){
 const list=$('messages');
 const oldScroll=$('conversation');
 const nearBottom=oldScroll.scrollHeight-oldScroll.clientHeight-oldScroll.scrollTop<130;
 list.replaceChildren();
 const chat=state.data.chats.find(c=>c.id===selected);
 $('welcome').hidden=Boolean(chat?.messages?.length);
 if(chat?.messages)for(const msg of chat.messages){
  const article=el('article',undefined,'message '+(msg.role==='user'?'user':'assistant'));
  if(msg.role==='user'){
   article.append(el('div',msg.text,'bubble'));
  }else{
   const response=el('div',undefined,'response');
   response.innerHTML=markdown(msg.text);
   article.append(response);
   const actions=el('div',undefined,'message-actions');
   const copy=el('button','▢ Copia');
   copy.title='Copia la risposta';
   copy.addEventListener('click',()=>action(async()=>{await ask('copy-text',msg.text);notify('Risposta copiata')}));
   actions.append(copy);article.append(actions);
  }
  list.append(article);
 }
 if((state.busy||pending)&&selected===chat?.id){
  const article=el('article',undefined,'message assistant');
  const response=el('div',undefined,'response');
  response.id='streamResponse';
  if(partial)response.innerHTML=markdown(partial);
  else response.append(el('span',undefined,'streaming-cursor'));
  article.append(response);
  list.append(article);
 }
 if(nearBottom||!chat?.messages?.length)scrollBottom();
}
function renderNav(){
 if(!state.data.chats.some(c=>c.id===selected))selected=state.data.chats[0]?.id||'';
 const nav=$('chats');nav.replaceChildren();
 const search=$('filter').value.trim().toLowerCase();
 for(const chat of state.data.chats.filter(c=>c.title.toLowerCase().includes(search))){
  const item=el('button',undefined,'nav-chat'+(chat.id===selected?' active':''));
  item.type='button';
  item.title=chat.title;
  const label=el('span',chat.title,'chatlabel');
  const remove=el('span','×','remove');
  remove.title='Elimina conversazione';
  item.append(label,remove);
  item.onclick=e=>{
   if(e.target===remove){
    if(window.confirm('Vuoi eliminare questa chat?'))action(()=>ask('delete-chat',chat.id));
   }else{
    selected=chat.id;
    partial='';
    render();
   }
  };
  nav.append(item);
 }
}
function render(){
 renderNav();
 const models=$('model'),old=state.data.model;
 models.replaceChildren();
 if(!state.models.length){
  const empty=el('option','Nessun modello disponibile');
  empty.value='';
  models.append(empty);
 }
 for(const m of state.models){
  const option=el('option',m.displayName||m.slug||'Modello');
  option.value=m.slug;
  models.append(option);
 }
 if(state.models.some(m=>m.slug===old))models.value=old;
 models.disabled=!connected()||pending;
 $('status').textContent=connected()?'ChatGPT collegato':'ChatGPT non collegato';
 renderMessages();
 updateCompose();
 if(dialogType)renderDialog();
}
function modal(type){
 dialogType=type;
 $('overlay').hidden=false;
 renderDialog();
}
function closeModal(){dialogType='';$('overlay').hidden=true}
function renderDialog(){
 const body=$('modalBody');
 body.replaceChildren();
 $('modalTitle').textContent=dialogType==='account'?'Account ChatGPT':'Memoria personale';
 if(dialogType==='account'){
  body.append(el('p',connected()?'Il tuo account è collegato. Scegli il modello disponibile dal menu in alto.':'Collega il tuo account ChatGPT e autorizza l’utilizzo del piano tramite il browser.'));
  const login=el('button',connected()?'Disconnetti ChatGPT':'Collega ChatGPT','primary');
  login.onclick=()=>action(async()=>{await ask(connected()?'disconnect':'signin');closeModal()});
  body.append(login);
  const refresh=el('button','Aggiorna modelli');
  refresh.onclick=()=>action(()=>ask('models'));
  body.append(refresh);
  const info=el('p','I dati delle chat e le memorie sono memorizzati sul tuo PC senza cifratura, separatamente dalle chat del sito ChatGPT.');
  body.append(info);
 }else{
  body.append(el('p','Queste informazioni saranno utilizzate come contesto nelle nuove richieste. Puoi eliminarle quando vuoi.'));
  const input=el('input');input.placeholder='Scrivi una nuova memoria';input.maxLength=1000;
  body.append(input);
  const add=el('button','Aggiungi memoria','primary');
  add.onclick=()=>action(async()=>{await ask('memory',input.value);input.value=''});
  body.append(add);
  for(const memory of state.data.memories){
   const row=el('div',undefined,'memory-row');
   row.append(el('p',memory.text));
   const del=el('button','Elimina');
   del.onclick=()=>action(()=>ask('remove-memory',memory.id));
   row.append(del);body.append(row);
  }
 }
}
async function send(){
 const text=$('prompt').value.trim();
 if(!text||pending||state.busy)return;
 if(!connected()){modal('account');return}
 try{
  if(!selected)selected=await ask('new-chat');
  pending=true;partial='';$('prompt').value='';
  updateCompose();
  renderMessages();
  await ask('send',selected,text);
 }catch(error){notify(error?.message||String(error));$('prompt').value=text}
 finally{pending=false;partial='';render();$('prompt').focus()}
}
window.dario.onChange(next=>{state=next;render()});
window.dario.onDelta(({id,delta})=>{
 if(selected!==id)return;
 partial+=delta;
 const response=$('streamResponse');
 if(response){response.innerHTML=markdown(partial);scrollBottom()}
 else renderMessages();
});
$('new').onclick=()=>action(async()=>{selected=await ask('new-chat');partial='';render();$('prompt').focus()});
$('brand').onclick=()=>action(async()=>{selected=await ask('new-chat');partial='';render()});
$('filter').oninput=renderNav;
$('collapse').onclick=()=>setSidebar(true);
$('expand').onclick=()=>setSidebar(false);
$('theme').onclick=()=>applyTheme(document.documentElement.dataset.theme==='dark'?'light':'dark');
$('memory').onclick=()=>modal('memory');
$('account').onclick=()=>modal('account');
$('export').onclick=()=>action(()=>ask('backup'));
$('import').onclick=()=>action(()=>ask('restore'));
$('close').onclick=closeModal;
$('overlay').onclick=e=>{if(e.target===$('overlay'))closeModal()};
$('send').onclick=send;
$('stop').onclick=()=>action(()=>ask('stop'));
$('prompt').addEventListener('input',updateCompose);
$('prompt').onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();send()}};
$('model').onchange=e=>action(()=>ask('model',e.target.value));
for(const button of document.querySelectorAll('[data-prompt]')){
 button.onclick=()=>{$('prompt').value=button.dataset.prompt;updateCompose();$('prompt').focus()}
}
$('messages').addEventListener('click',e=>{
 const link=e.target.closest('a[href]');
 if(!link)return;
 e.preventDefault();
 action(()=>ask('open-link',link.href));
});
document.onkeydown=e=>{if(e.key==='Escape')closeModal()};
ask('initial').then(next=>{state=next;render()}).catch(e=>notify(e.message||String(e)));
