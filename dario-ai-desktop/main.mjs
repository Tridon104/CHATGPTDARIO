import {app,BrowserWindow,ipcMain,dialog,shell,safeStorage,clipboard} from 'electron';
import {join,dirname,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {createChatGPT} from '@siwc/local';
import {validateFiles,normalizeText,cleanFileName,makePromptMessages} from './attachments.mjs';
import {lightweightSnapshot} from './perf-store.mjs';

const root=join(dirname(fileURLToPath(import.meta.url)),'..');
app.setName('Dario AI Desktop');
app.setPath('userData',join(app.getPath('appData'),'Dario AI Desktop'));
const location=join(app.getPath('userData'),'dario-store.json');
const attachmentsDir=join(app.getPath('userData'),'attachments');
let win,sdk,active=null,models=[],data={chats:[],memories:[],model:''};
let cachedSession={status:'loading',sharing:false};
let modelsLoading=true;
let refreshPromise=null;
let persistQueue=Promise.resolve();
let storeRevision=0;

const date=()=>new Date().toISOString();
const clone=()=>structuredClone(data);
const attachmentPath=id=>join(attachmentsDir,id+'.txt');
const isId=value=>typeof value==='string'&&/^[0-9a-f-]{36}$/i.test(value);
const getChat=id=>data.chats.find(c=>c.id===id);
function findAttachment(id) {
 if(!isId(id))throw new Error('Allegato non valido.');
 for(const chat of data.chats)for(const msg of chat.messages)for(const file of msg.attachments||[])if(file.id===id)return file;
 throw new Error('Allegato non trovato.');
}
async function save(){
 const json=JSON.stringify(data);
 const tmp=location+'.'+randomUUID()+'.tmp';
 const write=async()=>{
  await mkdir(dirname(location),{recursive:true});
  await writeFile(tmp,json,'utf8');
  await rename(tmp,location);
 };
 persistQueue=persistQueue.catch(()=>{}).then(write);
 return persistQueue;
}
async function change(fn){
 const result=fn();
 storeRevision++;
 await save();
 publish();
 return result;
}
function snapshot(){
 return lightweightSnapshot(data,cachedSession,models,modelsLoading,active,storeRevision);
}
function publish(){
 if(win&&!win.isDestroyed()&&!win.webContents.isDestroyed())
  win.webContents.send('dario:update',snapshot());
}
const register=(name,fn)=>ipcMain.handle('dario:'+name,async (_event,...args)=>fn(...args));
async function refresh(){
 if(refreshPromise)return refreshPromise;
 modelsLoading=true;publish();
 refreshPromise=(async()=>{
  const s=await sdk.getSession();
  cachedSession=s;
  publish();
  if(s.status==='connected'&&s.sharing){
   const discovered=await sdk.listModels();
   models=Array.isArray(discovered)?discovered:[];
  }else models=[];
  if(models.length&&!models.some(m=>m.slug===data.model)){
   data.model=models[0].slug;
   await save();
  }
 })().catch(error=>{
  console.warn('[Dario AI] Refresh modelli:',String(error));
  // Non bloccare mai la chat per un errore temporaneo di rete.
 }).finally(()=>{
  modelsLoading=false;refreshPromise=null;publish();
 });
 return refreshPromise;
}
async function materialize(input){
 const entries=validateFiles(input);
 await mkdir(attachmentsDir,{recursive:true});
 const files=[];
 for(const entry of entries){
  const id=randomUUID();
  await writeFile(attachmentPath(id),entry.content,'utf8');
  files.push({id,name:entry.name,chars:entry.content.length,bytes:Buffer.byteLength(entry.content,'utf8')});
 }
 return files;
}
async function modelInput(chat){
 // Gli allegati delle chat passate non vengono reinviati in ogni richiesta:
 // evitano tempi di risposta enormi e consumi inutili di contesto.
 const latest=chat.messages.at(-1);
 const refs=latest?.role==='user'?(latest.attachments||[]).slice(0,5):[];
 const contents=[];
 for(const file of refs){
  if(!isId(file.id))continue;
  try{
   const text=await readFile(attachmentPath(file.id),'utf8');
   contents.push({name:file.name,content:text});
  }catch{
   contents.push({name:file.name,content:'[File locale non disponibile]'});
  }
 }
 return makePromptMessages(chat,data.memories,contents);
}
async function runModel(chat,existingAbort=null){
 if(active&&(!existingAbort||active.abort!==existingAbort))
  throw new Error('Una risposta è già in corso');
 const abort=existingAbort||new AbortController();
 active={id:chat.id,abort};publish();
 let streamTimer=null,buffer='';
 const flush=()=>{
  if(streamTimer){clearTimeout(streamTimer);streamTimer=null}
  if(!buffer)return;
  const delta=buffer;buffer='';
  if(win&&!win.isDestroyed()&&!win.webContents.isDestroyed())
   win.webContents.send('dario:delta',{id:chat.id,delta});
 };
 try{
  if(abort.signal.aborted)throw new Error('Richiesta interrotta');
  const context=await modelInput(chat);
  if(abort.signal.aborted)throw new Error('Richiesta interrotta');
  const response=await sdk.streamResponse({
   model:data.model,...context,signal:abort.signal,
   onDelta:delta=>{
    buffer+=String(delta??'');
    if(!streamTimer)streamTimer=setTimeout(flush,45);
   }
  });
  flush();
  if(!response.text?.trim())throw new Error('Nessuna risposta generata');
  await change(()=>{
   chat.messages.push({id:randomUUID(),role:'assistant',text:response.text,at:date()});
  });
 }finally{
  flush();
  if(active?.abort===abort){active=null;publish()}
 }
}
async function assertConnected(signal){
 const authPromise=sdk.getSession();
 const s=signal?await Promise.race([authPromise,new Promise((_,reject)=>{
  if(signal.aborted)return reject(new Error('Richiesta interrotta'));
  signal.addEventListener('abort',()=>reject(new Error('Richiesta interrotta')),{once:true});
 })]):await authPromise;
 if(s.status!=='connected'||!s.sharing)throw new Error('Collega e autorizza ChatGPT');
 if(!models.some(m=>m.slug===data.model))throw new Error('Modello non disponibile');
}
async function backup(){
 const result=await dialog.showSaveDialog(win,{
  defaultPath:'dario-ai-backup.json',filters:[{name:'Backup Dario AI',extensions:['json']}]
 });
 if(result.canceled||!result.filePath)return;
 const payload={version:2,data:clone(),attachments:{}};
 for(const c of data.chats)for(const m of c.messages)for(const f of m.attachments||[]){
  if(!isId(f.id))continue;
  try{payload.attachments[f.id]=await readFile(attachmentPath(f.id),'utf8')}
  catch{payload.attachments[f.id]=null}
 }
 await writeFile(result.filePath,JSON.stringify(payload,null,2),'utf8');
}
async function restore(){
 const result=await dialog.showOpenDialog(win,{properties:['openFile'],filters:[{name:'Backup JSON',extensions:['json']}]});
 if(result.canceled)return;
 const file=await readFile(result.filePaths[0],'utf8');
 if(file.length>80_000_000)throw new Error('Backup troppo grande (80 MB massimo)');
 const raw=JSON.parse(file);
 const restored=raw.version===2?raw.data:raw;
 if(!restored||!Array.isArray(restored.chats)||!Array.isArray(restored.memories)||typeof restored.model!=='string')
  throw new Error('Backup non valido');
 const confirm=await dialog.showMessageBox(win,{
  type:'warning',buttons:['Annulla','Ripristina'],defaultId:0,cancelId:0,
  message:'Sostituire chat e memorie locali? L’account ChatGPT resterà collegato.'
 });
 if(confirm.response!==1)return;
 if(raw.version===2&&raw.attachments){
  await mkdir(attachmentsDir,{recursive:true});
  for(const [id,content] of Object.entries(raw.attachments)){
   if(isId(id)&&typeof content==='string'&&content.length<=2_000_000)
    await writeFile(attachmentPath(id),content,'utf8');
  }
 }
 await change(()=>{data=restored});
}
function setup(){
 register('initial',snapshot);
 register('get-chat',id=>{
  const chat=getChat(id);
  if(!chat)throw new Error('Chat non trovata');
  return structuredClone(chat);
 });
 register('search-chats',term=>{
  const query=String(term??'').trim().toLowerCase().slice(0,150);
  if(query.length<3)return [];
  const found=[];
  for(const chat of data.chats){
   if(chat.title.toLowerCase().includes(query)||
      chat.messages.some(m=>String(m.text||'').toLowerCase().includes(query)))found.push(chat.id);
   if(found.length>=100)break;
  }
  return found;
 });
 register('signin',async()=>{await sdk.signIn();await refresh()});
 register('disconnect',async()=>{await sdk.disconnect();await refresh()});
 register('models',refresh);
 register('model',name=>{
  if(!models.some(m=>m.slug===name))throw new Error('Modello non disponibile');
  return change(()=>{data.model=name});
 });
 register('new-chat',()=>change(()=>{
  const chat={id:randomUUID(),title:'Nuova chat',messages:[],created:date()};
  data.chats.unshift(chat);return chat.id;
 }));
 register('delete-chat',id=>change(()=>{
  if(active?.id===id)throw new Error('Interrompi la risposta prima di eliminare');
  data.chats=data.chats.filter(c=>c.id!==id);
 }));
 register('rename-chat',(id,name)=>change(()=>{
  const chat=getChat(id);if(!chat)throw new Error('Chat non trovata');
  const title=String(name??'').trim().slice(0,100);
  if(!title)throw new Error('Titolo vuoto');chat.title=title;
 }));
 register('duplicate-chat',id=>change(()=>{
  const chat=getChat(id);if(!chat)throw new Error('Chat non trovata');
  const copy=structuredClone(chat);copy.id=randomUUID();copy.title=chat.title+' (copia)';
  copy.created=date();data.chats.unshift(copy);return copy.id;
 }));
 register('memory',text=>change(()=>{
  const value=String(text??'').trim();
  if(!value||value.length>1000)throw new Error('Massimo 1000 caratteri');
  data.memories.unshift({id:randomUUID(),text:value});
 }));
 register('remove-memory',id=>change(()=>{data.memories=data.memories.filter(m=>m.id!==id)}));
 register('copy-text',text=>{
  const value=String(text??'');
  if(value.length>3_000_000)throw new Error('Troppo grande per gli appunti');
  clipboard.writeText(value);
 });
 register('open-link',async raw=>{
  const url=new URL(String(raw??''));
  if(!['https:','http:'].includes(url.protocol)||url.href.length>4096)throw new Error('Link non consentito');
  await shell.openExternal(url.href);
 });
 register('save-text',async(name,content)=>{
  if(typeof content!=='string'||content.length>3_000_000)throw new Error('Testo troppo grande');
  let filename=cleanFileName(name);
  if(!extname(filename))filename+='.txt';
  const result=await dialog.showSaveDialog(win,{defaultPath:filename,filters:[{name:'File di testo',extensions:['txt','md','js','py','ts','html','css','json','csv','xml','sql']},{name:'Tutti i file',extensions:['*']}]});
  if(!result.canceled&&result.filePath)await writeFile(result.filePath,content,'utf8');
 });
 register('read-attachment',async id=>{
  const file=findAttachment(id);
  const content=await readFile(attachmentPath(file.id),'utf8');
  return {name:file.name,content:content.slice(0,200_000),truncated:content.length>200_000,chars:content.length};
 });
 register('copy-attachment',async id=>{
  const file=findAttachment(id);
  const value=await readFile(attachmentPath(file.id),'utf8');
  if(value.length>3_000_000)throw new Error('File troppo grande per copiare');
  clipboard.writeText(value);
 });
 register('export-attachment',async id=>{
  const file=findAttachment(id);
  const content=await readFile(attachmentPath(file.id),'utf8');
  const result=await dialog.showSaveDialog(win,{defaultPath:cleanFileName(file.name)});
  if(!result.canceled&&result.filePath)await writeFile(result.filePath,content,'utf8');
 });
 register('export-chat',async id=>{
  const chat=getChat(id);if(!chat)throw new Error('Chat non trovata');
  const out=['# '+chat.title,...chat.messages.map(m=>{
   const suffix=(m.attachments||[]).map(f=>'\n[Allegato: '+f.name+']').join('');
   return '\n## '+(m.role==='user'?'Tu':'Dario AI')+'\n\n'+m.text+suffix;
  })].join('\n\n');
  const result=await dialog.showSaveDialog(win,{defaultPath:cleanFileName(chat.title)+'.md',filters:[{name:'Markdown',extensions:['md']}]});
  if(!result.canceled&&result.filePath)await writeFile(result.filePath,out,'utf8');
 });
 register('stop',()=>{active?.abort.abort()});
 register('backup',backup);register('restore',restore);
 register('send',async(id,body,files=[])=>{
  if(active)throw new Error('Risposta già in corso');
  const chat=getChat(id);if(!chat)throw new Error('Chat non trovata');
  const entries=validateFiles(files);
  const text=normalizeText(body,entries.length>0);
  const abort=new AbortController();
  active={id,abort,phase:'preparing'};
  publish();
  try{
   const attachments=await materialize(entries);
   if(abort.signal.aborted)throw new Error('Richiesta interrotta');
   await change(()=>{
    chat.messages.push({id:randomUUID(),role:'user',text,attachments,at:date()});
    if(chat.title==='Nuova chat')chat.title=(text||attachments[0]?.name||'Nuova chat').slice(0,70);
   });
   if(abort.signal.aborted)throw new Error('Richiesta interrotta');
   await assertConnected(abort.signal);
   return await runModel(chat,abort);
  }catch(error){
   if(error?.message!=='Richiesta interrotta')console.warn('[Dario AI] Invio:',String(error));
   throw error;
  }finally{
   if(active?.abort===abort){active=null;publish()}
  }
 });
 register('regenerate',async id=>{
  if(active)throw new Error('Interrompi prima la risposta');
  const chat=getChat(id);if(!chat)throw new Error('Chat non trovata');
  const last=chat.messages.at(-1);
  if(!last||last.role!=='assistant'||!chat.messages.some(m=>m.role==='user'))throw new Error('Nessuna risposta da rigenerare');
  await assertConnected();
  await change(()=>{chat.messages.pop()});
  return runModel(chat);
 });
}
async function launch(){
 try{
  const old=JSON.parse(await readFile(location,'utf8'));
  if(Array.isArray(old.chats)&&Array.isArray(old.memories)&&typeof old.model==='string')data=old;
 }catch(e){if(e.code!=='ENOENT')throw e}
 const crypto={
  id:'dario-electron-v1',
  isAvailable:()=>safeStorage.isEncryptionAvailable(),
  encrypt:value=>safeStorage.encryptString(value),
  decrypt:value=>safeStorage.decryptString(Buffer.from(value))
 };
 sdk=createChatGPT({
  appName:'Dario AI Desktop',appId:'dario-ai-desktop',redirectPort:0,sendHostId:true,
  storageDir:join(app.getPath('userData'),'chatgpt'),
  credentialEncryption:crypto,
  openBrowser:async raw=>{
   const url=new URL(raw);
   if(url.origin!=='https://auth.openai.com')throw new Error('Accesso OAuth non consentito');
   await shell.openExternal(url.href);
  }
 });
 sdk.subscribe(session=>{cachedSession=session;publish()});setup();
 if(data.model)models=[{slug:data.model,displayName:data.model}];
 win=new BrowserWindow({
  title:'Dario AI Desktop',width:1260,height:840,minWidth:600,minHeight:500,
  backgroundColor:'#212121',autoHideMenuBar:true,
  webPreferences:{
   preload:join(root,'preload.cjs'),sandbox:true,contextIsolation:true,
   nodeIntegration:false,devTools:!app.isPackaged
  }
 });
 win.setMenuBarVisibility(false);
 win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
 win.webContents.on('will-navigate',e=>e.preventDefault());
 win.webContents.session.setPermissionRequestHandler((_wc,_permission,callback)=>callback(false));
 await win.loadFile(join(root,'ui','index.html'));
 publish();
 // La finestra viene resa immediatamente, senza attendere OAuth o la rete.
 setImmediate(()=>{void refresh()});
}
if(!app.requestSingleInstanceLock())app.quit();
else{
 app.whenReady().then(launch).catch(async error=>{
  await dialog.showMessageBox({type:'error',message:String(error)});app.quit();
 });
 app.on('window-all-closed',()=>app.quit());
 app.on('before-quit',()=>{active?.abort.abort();sdk?.cancelSignIn()});
}
