const test=require('node:test'),assert=require('node:assert/strict');
let nav;test.before(async()=>{nav=await import('../src/hooks/islandNavigation.mjs');});
test('section order keeps user choices, removes duplicates and unknown IDs, and appends new sections',()=>{
 const defaults=['agents','phone','controls','apps'];assert.deepEqual(nav.normalizeTabOrder(['apps','bad','apps','controls',null],defaults),['apps','controls','agents','phone']);assert.deepEqual(nav.normalizeTabOrder(null,defaults),defaults);
 const moved=nav.moveTab(['apps','phone','controls'],'phone',-1);assert.deepEqual(moved,['phone','apps','controls']);assert.deepEqual(nav.moveTab(moved,'phone',-1),moved);
});
test('section arrows follow visible order, wrap, and use physical direction in RTL',()=>{
 const tabs=['apps','wallpaper','phone'];assert.equal(nav.nextVisibleTab(tabs,'apps','ArrowRight'),'wallpaper');assert.equal(nav.nextVisibleTab(tabs,'apps','ArrowLeft'),'phone');assert.equal(nav.nextVisibleTab(tabs,'apps','ArrowRight',true),'phone');assert.equal(nav.nextVisibleTab(['apps'],'apps','ArrowRight'),'apps');assert.equal(nav.nextVisibleTab([], 'apps','ArrowRight'),null);
});
test('application arrows select the first result from search and wrap without invalid indices',()=>{
 assert.equal(nav.nextAppSelection(3,-1,'ArrowDown'),0);assert.equal(nav.nextAppSelection(3,-1,'ArrowUp'),2);assert.equal(nav.nextAppSelection(3,2,'ArrowDown'),0);assert.equal(nav.nextAppSelection(0,0,'ArrowDown'),-1);assert.equal(nav.nextAppSelection(1,999,'ArrowDown'),0);
});
