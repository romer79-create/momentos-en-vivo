// Original instrumental motifs, or a private, sanitized clip from this event.
const motifs = {
  champagne: [60, 64, 67, 72, 67, 64, 62, 67],
  aurora: [69, 72, 76, 81, 76, 72, 67, 74],
  'disco-pop': [60, 67, 70, 72, 63, 70, 74, 79],
  nocturno: [57, 64, 69, 71, 64, 59, 66, 69],
  hechizo: [57, 64, 60, 71, 69, 65, 59, 64]
};
export function soundtrack(theme, { record = false, custom = null } = {}) {
  const Context = window.AudioContext || window.webkitAudioContext;
  if (!Context) throw new Error('Este navegador no puede reproducir la música. Podés continuar sin sonido.');
  const context = new Context(); const master = context.createGain(); master.gain.value = custom ? .7 : .16;
  const destination = record ? context.createMediaStreamDestination() : context.destination; master.connect(destination);
  let timer, source, closed = false;
  function phrase(start) {
    const notes = motifs[theme] || motifs.champagne;
    for (let i = 0; i < 16; i++) {
      const time = start + i; const frequency = 440 * 2 ** ((notes[i % notes.length] - 69) / 12);
      for (const [ratio, volume] of [[1, .55], [2, .1]]) {
        const osc = context.createOscillator(); const gain = context.createGain(); osc.type = 'sine'; osc.frequency.value = frequency * ratio;
        gain.gain.setValueAtTime(0, time); gain.gain.linearRampToValueAtTime(volume, time + .045); gain.gain.exponentialRampToValueAtTime(.0001, time + 2.4);
        osc.connect(gain); gain.connect(master); osc.start(time); osc.stop(time + 2.5); osc.onended = () => { osc.disconnect(); gain.disconnect(); };
      }
    }
  }
  return {
    context, stream: record ? destination.stream : null,
    async start() {
      await context.resume(); if (closed) return;
      if (custom) {
        const bytes = await custom(); if (closed) return;
        const buffer = await context.decodeAudioData(bytes.slice(0)); if (closed) return;
        source = context.createBufferSource(); source.buffer = buffer; source.loop = true; source.connect(master); source.start();
      } else { phrase(context.currentTime + .05); timer = setInterval(() => { if (!closed) phrase(context.currentTime + .05); }, 16000); }
    },
    async close() { if (closed) return; closed = true; clearInterval(timer); source?.stop(); source?.disconnect(); master.disconnect(); if (context.state !== 'closed') await context.close(); }
  };
}

// Decode locally, retain only a bounded excerpt, resample and strip all metadata.
export async function prepareMusic(file, offset = 0) {
  if (!file || file.size > 15 * 1048576 || !/\.(mp3|m4a|wav|ogg|aac)$/i.test(file.name)) throw new Error('Elegí MP3, M4A, WAV, OGG o AAC de hasta 15 MB.');
  if (!Number.isFinite(offset) || offset < 0) throw new Error('Elegí un segundo de inicio válido.');
  const Context = window.AudioContext || window.webkitAudioContext;
  if (!Context || !window.OfflineAudioContext) throw new Error('Este navegador no permite preparar audio. Probá desde Chrome o Edge.');
  const decoder = new Context(); let decoded;
  try { decoded = await decoder.decodeAudioData(await file.arrayBuffer()); }
  catch { throw new Error('No pudimos abrir ese audio. Probá con un MP3 o WAV válido.'); }
  finally { await decoder.close(); }
  const seconds = Math.min(60, decoded.duration - offset);
  if (seconds < 2) throw new Error('Elegí un inicio que deje al menos 2 segundos de música.');
  const length = Math.floor(seconds * 32000); const offline = new OfflineAudioContext(1, length, 32000);
  const source = offline.createBufferSource(); source.buffer = decoded; source.connect(offline.destination); source.start(0, offset, seconds);
  const rendered = await offline.startRendering(); const samples = rendered.getChannelData(0);
  const bytes = new Uint8Array(44 + length * 2); const view = new DataView(bytes.buffer);
  const label = (at, str) => [...str].forEach((char, i) => view.setUint8(at + i, char.charCodeAt(0)));
  label(0, 'RIFF'); view.setUint32(4, bytes.length - 8, true); label(8, 'WAVEfmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true); view.setUint32(24, 32000, true); view.setUint32(28, 64000, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true); label(36, 'data'); view.setUint32(40, length * 2, true);
  for (let i = 0; i < length; i++) { const fade = Math.min(1, i / 640, (length - 1 - i) / 1600); const value = Math.max(-1, Math.min(1, samples[i])) * fade; view.setInt16(44 + i * 2, Math.round(value * (value < 0 ? 32768 : 32767)), true); }
  let binary = ''; for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return { audioBase64: btoa(binary), buffer: bytes.buffer, duration: length / 32000 };
}
