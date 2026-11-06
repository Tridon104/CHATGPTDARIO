/** Small summaries for UI updates: never send full conversation text on every event. */
export function chatSummary(chat){
 const last=chat.messages?.at(-1);
 return {id:chat.id,title:chat.title,created:chat.created,
  messageCount:chat.messages?.length??0,
  lastMessageId:last?.id||'',lastMessageAt:last?.at||''};
}
export function lightweightSnapshot(data,session,models,modelsLoading,active,revision){
 return {data:{chats:data.chats.map(chatSummary),memories:data.memories,model:data.model},
  session,models,modelsLoading,busy:!!active,activeChatId:active?.id??null,revision};
}
