import {providers,upload,predict,fetchAudio} from './remote.js';
import {encodeWav,monoSlice,phrases,mix} from './audio.js';

const $=id=>document.getElementById(id);
let context, reference, referenceURL, finalAudio, outputURL, job, recorder, recordingTimer;
let selectionVersion=0, micPending=false, recording=false;
const rate=44100;
const pages={lyrics:$('lyricsPanel'),song:$('songPanel')};
const mode=()=>document.querySelector('input[name=mode]:checked').value;
const status=(msg,isError=false)=>{ $('feedback').textContent=msg; $('feedback').classList.toggle('error',isError); };
function audioContext(){
  if(!context)context=new (window.AudioContext||window.webkitAudioContext)({sampleRate:rate});
  return context;
}
async function decode(bytes){return audioContext().decodeAudioData(bytes);}
function adapt(){
  const writing=mode()==='lyrics';
  pages.lyrics.hidden=!writing; pages.song.hidden=writing;
  $('lyrics').required=writing; $('track').required=!writing; $('backing').disabled=!$('stems').checked;
  $('create').textContent=writing?'Cantar mi letra':'Cantar esta canción';
  $('transfer').textContent=writing?
    'Al tocar Cantar, se envían tu letra y la muestra de tu voz al servicio público OmniVoice Singing en Hugging Face.':
    'Al tocar Cantar, Seed-VC en Hugging Face recibe tu muestra y la voz guía.'+
    ($('stems').checked?' La instrumental se mezcla en tu teléfono.':' Demucs recibe la canción para separar la música del cantante.');
}
document.querySelectorAll('input[name=mode],#stems').forEach(e=>e.onchange=adapt);adapt();
try{$('lyrics').value=localStorage.getItem('canta.letra')||'';}catch{}
$('lyrics').oninput=()=>{try{localStorage.setItem('canta.letra',$('lyrics').value);}catch{}};
$('copy').onclick=async()=>{
  try{
    if(!$('lyrics').value.trim())throw new Error('Escribe tu letra primero.');
    await navigator.clipboard.writeText($('lyrics').value);$('copied').textContent='Letra copiada.';
  }catch(e){$('lyrics').focus();$('lyrics').select();$('copied').textContent=$('lyrics').value?'Selecciona Copiar en el menú del iPhone.':e.message;}
};
async function selectRef(file){
  const version=++selectionVersion;
  reference=null;$('preview').hidden=true;
  if(referenceURL)URL.revokeObjectURL(referenceURL);
  $('ref').required=true;
  if(!file)return;
  try{
    const buf=await decode(await file.arrayBuffer());
    if(version!==selectionVersion)return;
    if(buf.duration<1)throw new Error('Elige al menos un segundo de voz.');
    reference=buf;$('ref').required=false;
    referenceURL=URL.createObjectURL(file);$('refPlayer').src=referenceURL;
    $('start').max=Math.max(0,buf.duration-Math.min(buf.duration,12));
    $('start').value=0;$('offset').value='0 s';$('preview').hidden=false;status('');
  }catch(e){if(version===selectionVersion)status('No se pudo abrir la muestra. Prueba con WAV, MP3 o M4A. '+e.message,true);}
}
$('ref').onchange=()=>selectRef($('ref').files[0]);
$('start').oninput=()=>{$('offset').value=$('start').value+' s';$('refPlayer').currentTime=Number($('start').value);};
$('mic').onclick=async()=>{
  if(recording){recorder.stop();return;}
  if(micPending)return;
  let stream;
  try{
    micPending=true;
    stream=await navigator.mediaDevices.getUserMedia({audio:true});
    const rec=new MediaRecorder(stream);recorder=rec;
    const parts=[];
    rec.ondataavailable=e=>{if(e.data.size)parts.push(e.data);};
    rec.onstop=async()=>{
      clearTimeout(recordingTimer);recording=false;stream.getTracks().forEach(t=>t.stop());
      $('mic').textContent='Grabar mi voz';$('ref').disabled=false;
      $('ref').value='';await selectRef(new Blob(parts,{type:rec.mimeType}));$('create').disabled=false;
    };
    rec.start();recording=true;$('ref').disabled=true;$('create').disabled=true;
    $('mic').textContent='Terminar grabación';status('Grabando tu muestra. Se detendrá a los 12 segundos.');
    recordingTimer=setTimeout(()=>{if(rec.state==='recording')rec.stop();},12000);
  }catch(e){stream?.getTracks().forEach(t=>t.stop());status('No se pudo grabar. También puedes elegir un audio de Archivos.',true);}
  finally{micPending=false;}
};
function refClip(){
  if(!reference)throw new Error('Espera a que se cargue la muestra de tu voz.');
  const start=Number($('start').value);
  return monoSlice(reference,start,Math.min(reference.duration-start,12));
}
function logStage(msg){status(msg+'\nMantén esta página abierta.');}
async function downloadResult(host,meta,signal){return decode(await fetchAudio(host,meta,signal));}
function clearOutput(){
  if(outputURL)URL.revokeObjectURL(outputURL);
  outputURL=null;finalAudio=null;$('result').hidden=true;$('player').removeAttribute('src');
}
async function singLyrics(ref,signal){
  const parts=phrases($('lyrics').value);
  if(!parts.length)throw new Error('Escribe al menos una línea de letra.');
  const host=providers.singer;
  logStage('Preparando la muestra para cantar.');
  const voice=await upload(host,ref,'voz.wav',signal);
  const tracks=[];let at=0;
  for(let i=0;i<parts.length;i++){
    logStage('Cantando el fragmento '+(i+1)+' de '+parts.length+'.');
    const phrase=parts[i];
    const seconds=Math.max(3,Math.min(30,Math.round(phrase.split(/\s+/).length*0.62)));
    const result=await predict(host,'_clone_fn',['[singing] '+phrase,'Spanish',voice,$('refWords').value.trim(),'',24,2,true,1,seconds,true,false],signal);
    const buf=await downloadResult(host,result[0],signal);
    if(buf.duration<Math.min(1.2,seconds/3))throw new Error('El motor devolvió una toma demasiado corta. Vuelve a generar el fragmento.');
    tracks.push({buffer:buf,at});at+=buf.duration+0.22;
  }
  return mix(tracks,context.sampleRate);
}
function segmentEnd(buf,start){
  const remaining=buf.duration-start;
  if(remaining<=16)return buf.duration;
  const ch=buf.getChannelData(0), sr=buf.sampleRate;
  let best=start+14, least=Infinity;
  for(let t=start+12;t<start+16;t+=0.04){
    const frame=Math.floor(t*sr);let energy=0;
    for(let j=0;j<0.025*sr;j+=12)energy+=ch[frame+j]**2;
    if(energy<least){least=energy;best=t;}
  }
  return best;
}
async function convertSong(ref,signal){
  const file=$('track').files[0];
  let guide;
  const backings=[];
  if($('stems').checked){
    logStage('Abriendo las pistas de audio.');
    guide=await decode(await file.arrayBuffer());
    const backingFile=$('backing').files[0];if(backingFile)backings.push(await decode(await backingFile.arrayBuffer()));
  }else{
    const host=providers.separator;
    logStage('Separando al cantante de la música con Demucs.');
    // Upload an actual WAV irrespective of the original iPhone container.
    const original=await decode(await file.arrayBuffer());
    const channels=Array.from({length:Math.min(2,original.numberOfChannels)},(_,i)=>original.getChannelData(i));
    const source=await upload(host,encodeWav(channels,original.sampleRate),'cancion-'+crypto.randomUUID()+'.wav',signal);
    const separated=await predict(host,'separate_selected_models',[source,true,false],signal);
    if(!separated.slice(0,4).every(f=>f?.url) || separated.length<4)
      throw new Error('Demucs no entregó todas las pistas. Puedes cargar la voz y la instrumental por separado.');
    const [drums,bass,other,vocals]=await Promise.all(separated.slice(0,4).map(f=>downloadResult(host,f,signal)));
    guide=vocals;
    backings.push(drums,bass,other);
  }
  const host=providers.converter;
  const voice=await upload(host,ref,'referencia.wav',signal);
  const tracks=backings.map(buffer=>({buffer,at:0}));
  let at=0;
  while(at<guide.duration-0.001){
    const end=segmentEnd(guide,at),duration=end-at;
    const frame=Math.round(at*guide.sampleRate),limit=Math.min(guide.length,Math.round(end*guide.sampleRate));
    let peak=0;const ch=guide.getChannelData(0);
    for(let i=frame;i<limit;i+=8)peak=Math.max(peak,Math.abs(ch[i]));
    if(peak>0.001 && duration>0.15){
      logStage('Cambiando la voz · segundo '+Math.round(at)+' de '+Math.ceil(guide.duration)+'.');
      const clip=await upload(host,monoSlice(guide,at,duration,44100),'melodia.wav',signal);
      const result=await predict(host,'convert',[clip,voice,30],signal);
      const converted=await downloadResult(host,result[0],signal);
      if(converted.duration<duration*0.72)throw new Error('El motor cortó la voz antes de terminar. Vuelve a intentar la conversión.');
      tracks.push({buffer:converted,at,frames:Math.round(duration*context.sampleRate)});
    }
    at=end;
  }
  if(tracks.length<=backings.length)throw new Error('No se detectó canto en la pista de voz.');
  return mix(tracks,context.sampleRate);
}
$('studio').onsubmit=async e=>{
  e.preventDefault();if(job||recording)return;
  const control=new AbortController();job=control;clearOutput();
  const timer=setTimeout(()=>control.abort('timeout'),30*60*1000);
  $('inputs').disabled=true;$('cancel').hidden=false;$('mp3').disabled=false;
  try{
    const ref=refClip();
    const channels=await (mode()==='lyrics'?singLyrics(ref,control.signal):convertSong(ref,control.signal));
    control.signal.throwIfAborted();const blob=encodeWav(channels,context.sampleRate);
    finalAudio={channels,rate:context.sampleRate,blob};outputURL=URL.createObjectURL(blob);
    $('player').src=outputURL;$('wav').href=outputURL;
    $('share').hidden=!navigator.canShare?.({files:[new File([blob],'Mi-cancion.wav',{type:'audio/wav'})]});
    $('result').hidden=false;status('Tu audio está listo.');$('result').scrollIntoView({block:'center',behavior:'smooth'});
  }catch(err){
    if(control.signal.aborted)status(control.signal.reason==='timeout'?'La espera superó 30 minutos. Puedes volver a intentarlo.':'Espera cancelada.');
    else status((err.message||'No se pudo generar el audio.')+' Tu letra y tu selección siguen aquí.',true);
  }finally{clearTimeout(timer);$('inputs').disabled=false;$('cancel').hidden=true;job=null;}
};
$('cancel').onclick=()=>job?.abort('cancel');
$('share').onclick=async()=>{
  if(!finalAudio)return;
  try{await navigator.share({files:[new File([finalAudio.blob],'Mi-cancion.wav',{type:'audio/wav'})]});}
  catch(e){if(e.name!=='AbortError')status('Usa Guardar WAV para descargar el archivo.',true);}
};
$('mp3').onclick=async()=>{
  if(!finalAudio)return;
  $('mp3').disabled=true;
  const original=finalAudio;
  try{
    if(!window.lamejs)await new Promise((resolve,reject)=>{
      const s=document.createElement('script');s.src='https://cdn.jsdelivr.net/npm/lamejs@1.2.1/lame.min.js';
      s.integrity='sha384-xuasJXVcyv3hZq0eYpelEkBC8l4yufatZXDsKuyCU2rqfhDCb+ftuE/mSfZAteiK';s.crossOrigin='anonymous';
      s.onload=resolve;s.onerror=()=>reject(new Error('No se pudo cargar el codificador MP3. Puedes guardar WAV.'));document.head.append(s);
    });
    const {channels,rate}=original, encoder=new window.lamejs.Mp3Encoder(channels.length,rate,128), data=[];
    for(let pos=0;pos<channels[0].length;pos+=1152){
      const block=channels.map(ch=>Int16Array.from(ch.subarray(pos,pos+1152),x=>Math.round(x*(x<0?32768:32767))));
      const bytes=encoder.encodeBuffer(...block);if(bytes.length)data.push(new Int8Array(bytes));
      if(pos%(1152*160)===0)await new Promise(r=>setTimeout(r,0));
    }
    data.push(encoder.flush());if(original!==finalAudio)return;
    const file=new Blob(data,{type:'audio/mpeg'}), link=document.createElement('a');
    link.href=URL.createObjectURL(file);link.download='Mi-cancion.mp3';link.textContent='Descargar MP3';
    // A fresh tap is supported by Safari even when the encode completed asynchronously.
    $('mp3').after(link);link.className='mp3link';$('mp3').hidden=true;
    status('MP3 preparado. Toca Descargar MP3 para guardarlo.');
  }catch(e){status(e.message,true);}finally{$('mp3').disabled=false;}
};
const resetExports=()=>{
 for(const link of document.querySelectorAll('.mp3link')){URL.revokeObjectURL(link.href);link.remove();}
 $('mp3').hidden=false;
};
$('studio').addEventListener('submit',resetExports);
