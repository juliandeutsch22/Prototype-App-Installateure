// Jeder Formular-Browsertest erhält einen eigenen Vorschauprozess mit frischem Rate-Limit.
const {spawn}=require('node:child_process');
const {once}=require('node:events');
const path=require('node:path');
module.exports=async function preview(port){
 const child=spawn(process.execPath,['server/app.mjs','--preview'],{cwd:path.resolve(__dirname,'..'),env:{...process.env,NODE_ENV:'development',HOST:'127.0.0.1',PORT:String(port),CONTACT_ORIGINS:`http://127.0.0.1:${port}`},stdio:['ignore','pipe','pipe']});
 let stderr='';child.stderr.on('data',b=>stderr+=b.toString().slice(0,1500));
 try{await Promise.race([once(child.stdout,'data'),once(child,'exit').then(()=>{throw Error('Vorschau beendet: '+stderr)}),new Promise((_,reject)=>{const t=setTimeout(()=>reject(Error('Vorschau startet nicht')),6000);t.unref();})]);}
 catch(e){child.kill();throw e;}
 return {url:`http://127.0.0.1:${port}`,close:async()=>{if(child.exitCode!==null)return;const ended=once(child,'exit');child.kill();await ended;}};
};
