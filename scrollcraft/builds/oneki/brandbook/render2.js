const fs=require('fs');const {chromium}=require('/home/user/test/scrollcraft/builds/oneki/brandbook/fx/node_modules/playwright-core');
(async()=>{
 const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
 const ctx=await b.newContext({viewport:{width:1836,height:1170},deviceScaleFactor:2});
 const FR=fs.existsSync('/home/user/test/scrollcraft/builds/oneki/brandbook/b/frames.json')?fs.readFileSync('/home/user/test/scrollcraft/builds/oneki/brandbook/b/frames.json','utf8'):'null';
 await ctx.addInitScript(`window.FRAMES=${FR};`);
 const pg=await ctx.newPage();
 await pg.goto('file:///home/user/test/scrollcraft/builds/oneki/brandbook/b/'+(process.env.IN||'index.html'),{waitUntil:'load'});
 await pg.evaluate(()=>document.fonts.ready); await pg.waitForTimeout(1500);
 fs.mkdirSync('/home/user/test/scrollcraft/builds/oneki/brandbook/b/gen',{recursive:true});
 const n=await pg.evaluate(()=>{const r=[...document.querySelectorAll('.rast')];r.forEach((e,i)=>e.dataset.ri=i);return r.length});
 const rects=await pg.evaluate(()=>[...document.querySelectorAll('.rast')].map(t=>{const r=t.getBoundingClientRect(),s=t.closest('.sp').getBoundingClientRect();return [r.left-s.left,r.top-s.top,r.width,r.height]}));
 for(let i=0;i<n;i++){const el=await pg.$(`[data-ri="${i}"]`);await el.screenshot({path:`/home/user/test/scrollcraft/builds/oneki/brandbook/b/gen/r${i}.jpg`,type:'jpeg',quality:92});}
 await pg.evaluate(([n,rects])=>{for(let i=0;i<n;i++){const t=document.querySelector(`[data-ri="${i}"]`);const sp=t.closest('.sp');const [x,y,w,h]=rects[i];
  const img=document.createElement('img');img.src=`gen/r${i}.jpg`;img.style.cssText=`position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;transform:none`;sp.appendChild(img);t.remove();}},[n,rects]);
 await pg.evaluate(()=>Promise.all([...document.images].map(i=>i.decode().catch(()=>0))));
 await pg.waitForTimeout(500);
 console.log('rast',n);
 await pg.emulateMedia({media:'print'});
 await pg.pdf({path:process.env.OUT||'/home/user/test/scrollcraft/builds/oneki/brandbook/b/ONEKI_BrandBook.pdf',width:'1836px',height:'1170px',printBackground:true,preferCSSPageSize:true});
 console.log('pdf done'); await b.close();
})();
