export function encodeWav(channels, rate) {
  const length = channels[0].length, count = channels.length;
  const ab = new ArrayBuffer(44 + length * count * 2), view = new DataView(ab);
  function tag(pos, text) {
    for (let i=0;i<text.length;i++) view.setUint8(pos+i,text.charCodeAt(i));
  }
  tag(0,'RIFF'); view.setUint32(4,ab.byteLength-8,true); tag(8,'WAVE'); tag(12,'fmt ');
  view.setUint32(16,16,true); view.setUint16(20,1,true); view.setUint16(22,count,true);
  view.setUint32(24,rate,true); view.setUint32(28,rate*count*2,true); view.setUint16(32,count*2,true);
  view.setUint16(34,16,true); tag(36,'data'); view.setUint32(40,ab.byteLength-44,true);
  let p=44;
  for (let i=0;i<length;i++) for(const channel of channels) {
    const x=Math.max(-1,Math.min(1,channel[i]));
    view.setInt16(p,Math.round(x*(x<0?32768:32767)),true); p+=2;
  }
  return new Blob([ab],{type:'audio/wav'});
}

export function monoSlice(buffer, start, duration, rate = 24000) {
  const begin=Math.round(start*buffer.sampleRate);
  const samples=Math.min(Math.round(duration*buffer.sampleRate),buffer.length-begin);
  if(samples<1) throw new Error('La selección de audio está vacía.');
  const mix = new Float32Array(Math.ceil(samples*rate/buffer.sampleRate));
  for(let c=0;c<buffer.numberOfChannels;c++){
    const input=buffer.getChannelData(c);
    for(let i=0;i<mix.length;i++){
      const x=Math.min(buffer.length-1,begin+i*buffer.sampleRate/rate), a=Math.floor(x);
      mix[i]+=(input[a]+(input[Math.min(a+1,input.length-1)]-input[a])*(x-a))/buffer.numberOfChannels;
    }
  }
  return encodeWav([mix],rate);
}

export function phrases(text, max=185) {
  const result=[];
  for(const line of text.replace(/^\s*\[[^\]\n]+\]\s*$/gm,'').trim().split(/\n\s*\n/)) {
    let current='';
    for(const word of line.trim().split(/\s+/).filter(Boolean)){
      if(current && current.length+word.length+1>max){result.push(current);current='';}
      current+=(current?' ':'')+word;
    }
    if(current)result.push(current);
  }
  return result;
}

export function mix(tracks, rate) {
  // Each track has a decoded AudioBuffer and its start time on the song timeline.
  const length=Math.max(...tracks.map(t=>Math.round(t.at*rate)+(t.frames??t.buffer.length)));
  const count=Math.min(2,Math.max(...tracks.map(t=>t.buffer.numberOfChannels)));
  const channels=Array.from({length:count},()=>new Float32Array(length));
  let peak=0;
  for(const t of tracks){
    const offset=Math.round(t.at*rate), frames=Math.min(t.frames??t.buffer.length,t.buffer.length);
    for(let c=0;c<count;c++){
      const src=t.buffer.getChannelData(Math.min(c,t.buffer.numberOfChannels-1));
      for(let i=0;i<frames;i++)channels[c][offset+i]+=src[i]*(t.gain??1);
    }
  }
  for(const ch of channels)for(let i=0;i<ch.length;i++)peak=Math.max(peak,Math.abs(ch[i]));
  if(peak>0.97)for(const ch of channels)for(let i=0;i<ch.length;i++)ch[i]*=0.97/peak;
  return channels;
}
