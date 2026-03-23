const sharp = require('sharp');
const fs = require('fs');

async function generate() {
    const input = 'aiobi-meet-logo.svg';
    await sharp(input).resize(16, 16, {fit: 'contain', background: {r:0,g:0,b:0,alpha:0}}).toFile('src/frontend/public/favicon-16x16.png');
    await sharp(input).resize(32, 32, {fit: 'contain', background: {r:0,g:0,b:0,alpha:0}}).toFile('src/frontend/public/favicon-32x32.png');
    await sharp(input).resize(180, 180, {fit: 'contain', background: {r:0,g:0,b:0,alpha:0}}).toFile('src/frontend/public/apple-touch-icon.png');
    await sharp(input).resize(192, 192, {fit: 'contain', background: {r:0,g:0,b:0,alpha:0}}).toFile('src/frontend/public/android-chrome-192x192.png');
    await sharp(input).resize(512, 512, {fit: 'contain', background: {r:0,g:0,b:0,alpha:0}}).toFile('src/frontend/public/android-chrome-512x512.png');
    
    fs.copyFileSync('src/frontend/public/favicon-32x32.png', 'src/frontend/public/favicon.ico');
    console.log("Successfully generated all favicons!");
}
generate().catch(console.error);
