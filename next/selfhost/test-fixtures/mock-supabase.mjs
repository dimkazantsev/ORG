// Offline test-only fake Supabase SDK. NEVER use this for live load measurement.
// CI generates a temporary package alias from this fixture without network or secrets.
const topics=new Map();
function listeners(topic){
 if(!topics.has(topic))topics.set(topic,new Set());
 return topics.get(topic);
}
export function createClient(){
 const active=new Set();
 const realtime={disconnect(){}};
 return {
  realtime,
  auth:{},
  rpc:async(name)=>{
   if(name!=='qwiz_party_projection')throw Error('Unexpected RPC '+name);
   return {data:{title:'QWIZ LOAD 40 · disposable fixture'},error:null};
  },
  channel(topic){
   let event=null,callback=null,statusCallback=null,joined=false;
   const channel={
    on(kind,opts,cb){if(kind==='broadcast'){event=opts.event;callback=cb}return channel},
    subscribe(cb){
     statusCallback=cb;
     queueMicrotask(()=>{joined=true;listeners(topic).add(channel);active.add(channel);cb('SUBSCRIBED')});
     return channel;
    },
    async httpSend(kind,payload){
     for(const other of listeners(topic)){
      if(other._event===kind && other._joined()){
       queueMicrotask(()=>other._receive({event:kind,payload}));
      }
     }
     return 'ok';
    },
    _event:null,
    _joined:()=>joined,
    _receive(message){callback?.(message)},
    _close(){
     if(joined){joined=false;listeners(topic).delete(channel);active.delete(channel);statusCallback?.('CLOSED')}
    }
   };
   // Keep listener event in sync for the minimal fake.
   channel.on=(kind,opts,cb)=>{
    if(kind==='broadcast'){channel._event=opts.event;callback=cb}
    return channel;
   };
   return channel;
  },
  async removeChannel(channel){channel._close();return 'ok'},
  async removeAllChannels(){for(const ch of [...active])ch._close();return 'ok'}
 };
}
