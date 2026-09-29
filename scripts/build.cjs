const esbuild = require('esbuild');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
async function build() {
  await esbuild.build({ entryPoints: ['web/sylar/site.js'], bundle: true, minify: true, target: ['es2020'], outfile: 'public/assets/sylar.js', loader: { '.css': 'text' } });
  fs.copyFileSync('web/sylar/site.css', 'public/assets/sylar.css');
  const withSylar = html => html.replace('</head>', `<link rel="stylesheet" href="${asset('sylar.css')}"><script src="${asset('sylar.js')}" defer></script></head>`);
  await esbuild.build({ entryPoints: ['web/app.js'], bundle: true, minify: true, target: ['es2020'], outfile: 'public/assets/app.bundle.js', sourcemap: false, legalComments: 'eof' });
  fs.writeFileSync('public/assets/app.css', ['app.css', 'setup.css', 'assistant.css'].map(file => fs.readFileSync(path.join('web', file), 'utf8')).join('\n'));
  for (const id of Object.keys(require('../functions/themes.json'))) {
    if (!/^[a-z0-9-]+$/.test(id)) throw new Error('Identificador de tema inválido.');
    for (const suffix of ['', '-wide']) if (!fs.existsSync(`public/assets/themes/${id}${suffix}.webp`)) throw new Error(`Falta la imagen del tema ${id}${suffix}.`);
  }
  fs.writeFileSync('public/assets/themes.css', ['themes.css', 'live.css', 'invitation-motion.css', 'hechizo.css'].map(file => fs.readFileSync(path.join('web', file), 'utf8')).join('\n'));
  for (const name of ['landing.css', 'landing.js']) if (fs.existsSync(path.join('web', name))) fs.copyFileSync(path.join('web', name), path.join('public/assets', name));
  await esbuild.build({ entryPoints: ['web/portada-modelo.js'], bundle: true, minify: true, target: ['es2020'], outfile: 'public/assets/portada-modelo.js' });
  fs.writeFileSync('public/assets/portada-modelo.css', ['portada-modelo.css', 'cover-faq.css'].map(file => fs.readFileSync(path.join('web', file), 'utf8')).join('\n'));
  const escapeHtml = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const samples = { champagne: 'Lucía & Mateo', aurora: 'Valentina', 'disco-pop': 'Los 30 de Nico', nocturno: 'Encuentro 2026' };
  const models = Object.entries(require('../functions/themes.json')).map(([id, p]) => `<a class="theme-card" href="/invitacion.html?demo=${id}" aria-label="Ver invitación ${escapeHtml(p.name)}"><div class="theme-image" style="--sample-text:${p.text}"><img src="/assets/themes/${id}.webp" width="400" height="600" alt="" loading="lazy"><span class="theme-mini-title"><small>${escapeHtml(p.eyebrow)}</small>${escapeHtml(p.sample?.name || samples[id] || 'Tu celebración')}</span></div><div class="theme-card-info"><strong>${escapeHtml(p.name)}</strong><span aria-hidden="true">↗</span></div><p>${escapeHtml(p.description)}</p></a>`).join('\n');
  const cover = withSylar(fs.readFileSync('web/portada-modelo.html', 'utf8').replace('<!-- MODELOS -->', models).replace('/assets/portada-modelo.css', asset('portada-modelo.css')).replace('/assets/portada-modelo.js', asset('portada-modelo.js')));
  fs.writeFileSync('public/portada-modelo.html', cover);
  fs.writeFileSync('public/index.html', cover.replace('<meta name="robots" content="noindex,nofollow">', '<meta name="robots" content="index,follow"><link rel="canonical" href="https://momentos-en-vivo.web.app/">').replace('Momentos en Vivo · Modelo de portada', 'Momentos en Vivo · Fotos e invitaciones para tu evento').replace(/  <div class="prototype-bar">.*?<\/div>\r?\n/, '').replace('<a href="/">Ver portada actual ↗</a>', '<a href="/manual.html">Guía de uso ↗</a>'));
  // The production policy stays strict. Local Auth needs its emulator address.
  const local = JSON.parse(fs.readFileSync('firebase.json'));
  for (const group of local.hosting.headers || []) for (const header of group.headers) {
    if (header.key === 'Content-Security-Policy') header.value = header.value.replace("connect-src 'self'", "connect-src 'self' http://127.0.0.1:9099");
  }
  // Superstatic 10 normalizes header paths with Windows backslashes before
  // passing them to its POSIX glob matcher. Use equivalent regexes only in the
  // generated local config so browser tests actually enforce the same headers.
  if (process.platform === 'win32') for (const group of local.hosting.headers || []) {
    const source = group.source;
    if (!source) continue;
    const pattern = source === '**' ? '.*' : source === '**/*.html' ? '.*\\.html' :
      source.replace(/[.*+?^$()|[\]\\]/g, '\\$&').replace(/\{/g, '(?:').replace(/,/g, '|').replace(/\}/g, ')').replace(/\//g, '[/\\\\]');
    group.regex = `^${pattern}$`; delete group.source;
  }
  fs.writeFileSync('firebase.local.json', JSON.stringify(local, null, 2));
  const pages = { 'cliente-login.html': ['login', 'Ingresar'], 'admin-login.html': ['login', 'Ingresar'], 'registro.html': ['register', 'Crear cuenta'], 'cliente-panel.html': ['panel', 'Mis eventos'], 'admin.html': ['panel', 'Administración'], 'moderador.html': ['moderator', 'Moderación'], 'home.html': ['capture', 'Compartí tu momento'], 'proyeccion.html': ['projection', 'En vivo'], 'compras.html': ['purchases', 'Mis compras'], 'pago.html': ['payment', 'Estado de tu compra'] };
  Object.assign(pages, { 'temas.html': ['themes', 'Elegí tu estilo'], 'diseno.html': ['design', 'Diseño e invitación'], 'invitacion.html': ['invitation', 'Estás invitado'] });
  function asset(name) { return `/assets/${name}?v=${createHash('sha256').update(fs.readFileSync(path.join('public/assets', name))).digest('hex').slice(0, 16)}`; }
  for (const [file, [page, title]] of Object.entries(pages)) {
    fs.writeFileSync(path.join('public', file), `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer">${page === 'invitation' ? '<meta name="robots" content="noindex,nofollow">' : ''}<title>${title} · Momentos en Vivo</title><link rel="stylesheet" href="${asset('app.css')}"><link rel="stylesheet" href="${asset('themes.css')}"><script src="${asset('app.bundle.js')}" defer></script></head><body data-page="${page}"><header class="topbar"><a class="brand" href="/">Momentos<span>en Vivo</span><i aria-hidden="true"></i></a><nav id="navigation" aria-label="Navegación"></nav></header><main id="app" class="shell"><p class="status" role="status">Preparando tu espacio…</p></main><div id="notice" role="status" aria-live="polite"></div></body></html>`);
  }
  for (const [file, [page]] of Object.entries(pages)) {
    if (['projection', 'invitation'].includes(page)) continue;
    const target = path.join('public', file);
    fs.writeFileSync(target, withSylar(fs.readFileSync(target, 'utf8')));
  }
  const redirects = { 'login.html': '/cliente-login.html', 'cliente-gestion.html': '/cliente-login.html', 'demo-dashboard.html': '/cliente-login.html', 'create-test-users.html': '/cliente-login.html', 'demo.html': '/index.html#demo', 'preguntas.html': '/index.html#faq', 'checkout.html': '/compras.html' };
  for (const [file, destination] of Object.entries(redirects)) {
    fs.writeFileSync(path.join('public', file), `<!doctype html><html lang="es"><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=${destination}"><title>Momentos en Vivo</title><a href="${destination}">Continuar</a></html>`);
  }
  for (const file of ['manual.html', 'contacto.html']) {
    fs.writeFileSync(path.join('public', file), withSylar(fs.readFileSync(path.join('web', file), 'utf8')));
  }
}
build().catch(error => { console.error(error.message); process.exitCode = 1; });
