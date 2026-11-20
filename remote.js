// Public Gradio call protocol. Audio is uploaded only when the form is submitted.
export const providers = {
  singer: 'https://kremon96-omnivoice-singing.hf.space',
  separator: 'https://eziamachukwu-spleeter-ht-demucs-stem-separation-2025.hf.space',
  converter: 'https://max-chenhuan-seed-vc-svc.hf.space'
};

async function checked(url, options) {
  const response = await fetch(url, {credentials: 'omit', ...options});
  if (!response.ok) {
    const message = response.status === 429 ? 'El servicio alcanzó su cuota.' : 'El servidor respondió ' + response.status + '.';
    throw new Error(message);
  }
  return response;
}

export async function upload(host, blob, name, signal) {
  const form = new FormData();
  form.append('files', blob, name);
  const response = await checked(host + '/gradio_api/upload', {method:'POST', body:form, signal});
  const [path] = await response.json();
  if (typeof path !== 'string') throw new Error('El servicio no recibió el archivo.');
  return {path, orig_name:name, meta:{_type:'gradio.FileData'}};
}

export async function predict(host, method, data, signal) {
  const base = host + '/gradio_api/call/' + method;
  const response = await checked(base, {
    method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({data}), signal
  });
  const job = await response.json();
  if (!job.event_id) throw new Error('El servicio no inició la generación.');
  const stream = await checked(base + '/' + encodeURIComponent(job.event_id), {signal});
  const reader = stream.body.getReader();
  const decoder = new TextDecoder();
  let pending = '', event = '', lines = [];
  try {
    while (true) {
      const {value,done} = await reader.read();
      pending += done ? decoder.decode() + '\n\n' : decoder.decode(value,{stream:true});
      let next;
      while ((next = pending.indexOf('\n')) !== -1) {
        const line = pending.slice(0,next).replace(/\r$/,'');
        pending = pending.slice(next+1);
        if (line.startsWith('event:')) event = line.slice(6).trim();
        else if (line.startsWith('data:')) lines.push(line.slice(5).trimStart());
        else if (!line) {
          if (event === 'error') throw new Error('El motor no pudo completar esta toma. Puede estar ocupado o sin cuota.');
          if (event === 'complete' && lines.length) return JSON.parse(lines.join('\n'));
          event = ''; lines = [];
        }
      }
      if (done) throw new Error('La conexión terminó antes de recibir la canción.');
    }
  } finally {await reader.cancel().catch(()=>{});}
}

export async function fetchAudio(host, file, signal) {
  if (!file || !file.url) throw new Error('El motor terminó sin entregar audio.');
  const url = new URL(file.url,host);
  if (url.origin !== host) throw new Error('El motor devolvió una dirección de audio inesperada.');
  const res = await checked(url.href,{signal});
  return res.arrayBuffer();
}
