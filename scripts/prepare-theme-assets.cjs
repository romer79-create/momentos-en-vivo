const fs = require('node:fs');
const path = require('node:path');
const sharp = require('../functions/node_modules/sharp');
const manifest = require('../output/temas-invitaciones/fondos-prompts.json');
const panoramic = require('../output/temas-invitaciones/fondos-panoramicos-prompts.json');
(async () => {
  fs.mkdirSync('public/assets/themes', { recursive: true });
  for (const asset of [...manifest.assets, ...panoramic.assets]) {
    const target = path.join('public/assets/themes', `${asset.id}.webp`);
    await sharp(asset.source).resize(asset.id.endsWith('-wide') ? 1920 : 1200, asset.id.endsWith('-wide') ? 1080 : 1800, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 84 }).toFile(target);
    console.log(`${asset.id}: ${Math.round(fs.statSync(target).size / 1024)} KB`);
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
