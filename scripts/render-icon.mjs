// The logo is a tiny, source-controlled vector wordmark. Export PNGs for Marketplace.
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright';
const browser=await chromium.launch({headless:true});
try{
 const svg=await readFile('assets/icon.svg','utf8');
 for(const size of [256,128]){
  const page=await browser.newPage({viewport:{width:size,height:size}});
  await page.setContent(`<style>html,body{margin:0;width:100%;height:100%;background:transparent}svg{width:100%;height:100%;display:block}</style>${svg}`);
  await page.screenshot({path:size===256?'assets/icon.png':'assets/publisher-icon.png',omitBackground:true});await page.close();
 }
}finally{await browser.close();}
