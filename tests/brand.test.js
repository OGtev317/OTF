import {test,expect} from 'vitest';
import {readFileSync} from 'node:fs';
test('all entry pages carry the accessible Roots identity and browser icon',()=>{
  for(const file of ['index.html','community.html','demo.html']){
    const doc=new DOMParser().parseFromString(readFileSync(file,'utf8'),'text/html');
    expect(doc.querySelector('.brand-roots').getAttribute('aria-label')).toBe('OTF Roots — home');
    expect(doc.querySelector('.brand-roots img').getAttribute('alt')).toBe('');
    expect(doc.querySelector('.brand-roots img').getAttribute('src')).toBe('/brand/otf.png');
    expect(doc.querySelector('link[rel="icon"]').getAttribute('href')).toBe('/brand/otf.png');
    expect(doc.querySelector('link[rel="icon"]').getAttribute('type')).toBe('image/png');
    expect(doc.querySelectorAll('img[src$=".svg"]').length).toBe(0);
  }
  const png=readFileSync('public/brand/otf.png');
  expect(png.subarray(0,8).toString('hex')).toBe('89504e470d0a1a0a');
  expect(png.readUInt32BE(16)).toBe(1000);
  expect(png.readUInt32BE(20)).toBe(1000);
});
