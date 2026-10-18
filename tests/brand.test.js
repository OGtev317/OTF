import {test,expect} from 'vitest';
import {readFileSync} from 'node:fs';
test('all entry pages carry the accessible Roots identity and browser icon',()=>{
  for(const file of ['index.html','community.html','demo.html']){
    const doc=new DOMParser().parseFromString(readFileSync(file,'utf8'),'text/html');
    expect(doc.querySelector('.brand-roots').getAttribute('aria-label')).toBe('OTF Roots — home');
    expect(doc.querySelector('.brand-roots img').getAttribute('alt')).toBe('');
    expect(doc.querySelector('link[rel="icon"]').getAttribute('href')).toBe('/brand/favicon.svg');
  }
  for(const file of ['otf-roots-mark.svg','favicon.svg']){
    const svg=new DOMParser().parseFromString(readFileSync(`public/brand/${file}`,'utf8'),'image/svg+xml');
    expect(svg.querySelector('parsererror')).toBeNull();
    expect(svg.documentElement.getAttribute('viewBox')).toBe('0 0 64 64');
    expect(svg.querySelector('script')).toBeNull();
  }
});
