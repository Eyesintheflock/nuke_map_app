import {mkdir,copyFile,cp} from 'node:fs/promises';
await mkdir('dist',{recursive:true});
for(const f of ['index.html','climate.html','climate.css','app.js','styles.css','sw.js','manifest.webmanifest','Icon-192.png','Icon-512.png'])await copyFile(f,'dist/'+f);
await cp('app','dist/app',{recursive:true});
console.log('Static preview prepared in dist/');
