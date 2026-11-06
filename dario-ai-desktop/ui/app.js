const $=id=>document.getElementById(id);
let state={data:{chats:[],memories:[],model:''},session:{status:'disconnected'},models:[],busy:false};
let selected='',pending=false,partial='',dialogType='';
const ask=(name,...args)=>window.dario.invoke(name,...args);
const element=(tag,text,cls)=>{const x=document.createElement(tag);if(text!==undefined)x.textContent=text;if(cls)x.className=cls;return x};
function notify(message){const t=$('toast');t.textContent=String(message);t.hidden=false;setTimeout(()=>t.hidden=true,4500)}
async function action(fn){try{await fn()}catch(e){notify(e.message||String(e))}}
function connected(){return state.session?.status==='connected'&&state.session?.sharing===true}
function render(){
 const chats=state.data.chats;const previous=selected;
 if(!chats.some(c=>c.id===selected))selected=chats[0]?.id||'';
 $('chats').replaceChildren();
 const search=$('filter').value.trim().toLowerCase();
 for(const c of chats.filter(c=>c.title.toLowerCase().includes(search))){
  const b=element('button',undefined,c.id===selected?'active':'');
  const title=element('span',c.title,'chatlabel');const del=element('span','×','remove');
  b.append(title,del);b.onclick=e=>{if(e.target===del){if(confirm('Eliminare questa conversazione?'))action(()=>ask('delete-chat',c.id));}else{selected=c.id;partial='';render();}};$('chats').append(b);
 }
 const c=chats.find(c=>c.id===selected);
 $('heading').textContent=c?.title||'Dario AI Desktop';
 $('messages').replaceChildren();$('welcome').hidden=!!c?.messages?.length;
 if(c?.messages)for(const m of c.messages){
  const article=element('div',undefined,'message '+m.role);
  article.append(element('strong',m.role==='user'?'Tu':'Dario AI'),element('div',m.text));
  $('messages').append(article);
 }
 if(state.busy&&selected&&partial){const article=element('div',undefined,'message assistant');article.append(element('strong','Dario AI'),element('div',partial));$('messages').append(article);}
 $('status').textContent=connected()?'● ChatGPT collegato':'○ ChatGPT non collegato';
 $('connect').textContent=connected()?'Inizia una conversazione':'Collega ChatGPT';
 const select=$('model');const was=state.data.model;select.replaceChildren();
 if(!state.models.length)select.append(element('option','Nessun modello'));
 for(const m of state.models){const option=element('option',m.displayName||m.slug);option.value=m.slug;select.append(option);}
 if(state.models.some(m=>m.slug===was))select.value=was;
 select.disabled=!connected()||pending;
 $('send').disabled=!connected()||pending||state.busy;
 $('stop').hidden=!(state.busy||pending);
 if(dialogType)renderDialog();
 $('conversation').scrollTop=$('conversation').scrollHeight;
}
function modal(type){dialogType=type;$('overlay').hidden=false;renderDialog()}
function closeModal(){dialogType='';$('overlay').hidden=true}
function renderDialog(){
 const box=$('modalBody');box.replaceChildren();
 $('modalTitle').textContent=dialogType==='account'?'Account ChatGPT':'Memoria personale';
 if(dialogType==='account'){
  box.append(element('p',connected()?'Account autorizzato. Le risposte utilizzano i modelli e i limiti disponibili per il tuo piano.':'Collega il tuo account tramite il browser e autorizza l’uso del piano ChatGPT.'));
  const login=element('button',connected()?'Disconnetti':'Connetti ChatGPT','primary');login.onclick=()=>action(async()=>{await ask(connected()?'disconnect':'signin');closeModal()});box.append(login);
  const refresh=element('button','Aggiorna modelli');refresh.onclick=()=>action(()=>ask('models'));box.append(refresh);
 }else{
  box.append(element('p','Le memorie vengono aggiunte alle richieste AI e restano nel database locale.'));
  const input=element('input');input.placeholder='Aggiungi una memoria';input.maxLength=1000;box.append(input);
  const add=element('button','Salva memoria','primary');add.onclick=()=>action(async()=>{await ask('memory',input.value);input.value=''});box.append(add);
  for(const m of state.data.memories){
   const row=element('div',undefined,'memory-row');row.append(element('p',m.text));
   const del=element('button','×');del.onclick=()=>action(()=>ask('remove-memory',m.id));
   row.append(del);box.append(row);
  }
 }
}
async function send(){
 const text=$('prompt').value.trim();if(!text||pending||state.busy)return;
 if(!connected())return modal('account');
 try{
  if(!selected)selected=await ask('new-chat');
  pending=true;partial='';$('prompt').value='';render();
  await ask('send',selected,text);
 }catch(e){notify(e.message||String(e));$('prompt').value=text}
 finally{pending=false;partial='';render();}
}
window.dario.onChange(s=>{state=s;render()});
window.dario.onDelta(({id,delta})=>{if(selected!==id)return;partial+=delta;render()});
$('new').onclick=()=>action(async()=>{selected=await ask('new-chat');partial='';render()});
$('filter').oninput=render;
$('memory').onclick=()=>modal('memory');
$('account').onclick=()=>modal('account');
$('connect').onclick=()=>connected()?action(async()=>{selected=await ask('new-chat')}):modal('account');
$('export').onclick=()=>action(()=>ask('backup'));
$('import').onclick=()=>action(()=>ask('restore'));
$('close').onclick=closeModal;
$('overlay').onclick=e=>{if(e.target===$('overlay'))closeModal()};
$('send').onclick=send;
$('stop').onclick=()=>action(()=>ask('stop'));
$('prompt').onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send()}};
$('model').onchange=e=>action(()=>ask('model',e.target.value));
document.onkeydown=e=>{if(e.key==='Escape')closeModal()};
ask('initial').then(s=>{state=s;render()}).catch(e=>notify(e.message));
