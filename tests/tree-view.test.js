import {test,expect} from 'vitest';
import {treeView} from '../tree-view.js';
test('stale and removed-contributor approvals disabled; rejection remains available; unsafe text escaped',()=>{
  const p={id:'p',name:'<script>bad</script>',story:'',parents:[],version:2};
  const c={id:'c',person_id:'p',submitted_by:'gone',base_version:1,before_record:{...p,version:1},proposed_record:{...p,story:'<img src=x onerror=alert(1)>'},status:'pending',submitted_at:'2026-10-18T00:00:00Z'};
  document.body.innerHTML=treeView({people:[p],memberships:[],contributions:[c]},null,true,'owner');
  expect(document.querySelector('button[value=approve]').disabled).toBe(true);
  expect(document.querySelector('button[value=reject]').disabled).toBe(false);
  expect(document.body.textContent).toContain('This record has changed');
  expect(document.body.textContent).toContain('no longer belongs');
  expect(document.querySelector('script,img')).toBeNull();
  expect(document.querySelector('#person [name=life_status]').value).toBe('unknown');
});
