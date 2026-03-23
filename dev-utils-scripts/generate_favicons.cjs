const sharp = require('sharp');
const fs = require('fs');

async function generate() {
    const input = '/home/aiobi6/Projects/meet/aiobi-meet-logo-new.svg';
    const out = '/home/aiobi6/Projects/meet/src/frontend/public';

    await sharp(input).resize(16, 16, {fit: 'contain', background: {r:0,g:0,b:0,alpha:0}}).toFile(`${out}/favicon-16x16.png`);
    await sharp(input).resize(32, 32, {fit: 'contain', background: {r:0,g:0,b:0,alpha:0}}).toFile(`${out}/favicon-32x32.png`);
    await sharp(input).resize(180, 180, {fit: 'contain', background: {r:0,g:0,b:0,alpha:0}}).toFile(`${out}/apple-touch-icon.png`);
    await sharp(input).resize(192, 192, {fit: 'contain', background: {r:0,g:0,b:0,alpha:0}}).toFile(`${out}/android-chrome-192x192.png`);
    await sharp(input).resize(512, 512, {fit: 'contain', background: {r:0,g:0,b:0,alpha:0}}).toFile(`${out}/android-chrome-512x512.png`);

    fs.copyFileSync(`${out}/favicon-32x32.png`, `${out}/favicon.ico`);
    console.log('Done! All favicons generated from aiobi-meet-logo-new.svg');
}
generate().catch(console.error);
