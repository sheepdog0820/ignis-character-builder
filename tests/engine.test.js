import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {ATTRS,STATS,presetCharacter,allowedWeapons,availableSkills,compatibleWeapon,validate,calculate,parseCharacter,serializeCharacter} from '../engine.js';
const data=JSON.parse(fs.readFileSync(new URL('../data/rules.json',import.meta.url),'utf8'));
const reference=JSON.parse(fs.readFileSync(new URL('./reference-values.json',import.meta.url),'utf8'));
for(const ref of reference.builds) test(`正式Python計算と一致：${ref.main}/${ref.sub}`,()=>{
  const c=presetCharacter(data,ref.main,ref.sub),pc=calculate(data,c);
  assert.equal(validate(data,c).complete,true);
  for(const k of ['attributes','bonuses','components','stats','armor']) assert.deepEqual(pc[k],ref[k]);
  assert.equal(Object.values(pc.attributes).reduce((a,b)=>a+b),76);
});
test('既存完成サンプル3構成の数値と一致',()=>{
  assert.equal(reference.samples.length,3);
  for(const s of reference.samples) {
    const pc=calculate(data,presetCharacter(data,s.main,s.sub));
    for(const k of ['attributes','bonuses','components','stats','armor']) assert.deepEqual(pc[k],s[k]);
  }
});
test('6種の異なる主副30通りと取得例の枠',()=>{
  assert.equal(Object.keys(data.classes).length,6);assert.equal(Object.keys(data.presets).length,30);
  for(const [key,p] of Object.entries(data.presets)) {
    const [main,sub]=key.split('/');assert.notEqual(main,sub);assert.equal(p.mainSkills.length,2);assert.equal(p.subSkills.length,1);
    assert.equal(validate(data,presetCharacter(data,main,sub)).errors.length,0);
  }
});
test('同じ指定能力は+4、異なる指定能力は+3と+1',()=>{
  assert.equal(calculate(data,presetCharacter(data,'link','field')).attributes['理知'],16);
  const a=calculate(data,presetCharacter(data,'blade','gunner')).attributes;assert.equal(a['反射'],15);assert.equal(a['知覚'],13);
});
test('装備補正とその攻撃限定+2を分離する',()=>{
  for(const main of ['bastion','link','field','vector']) {
    const c=presetCharacter(data,main,'gunner'),base=calculate(data,c);
    c.weapons=['control_frame','control_projector'];const pc=calculate(data,c);
    assert.deepEqual(pc.stats,base.stats);assert.equal(pc.attacks[0].checkValue,pc.stats['命中']+2);
    assert.equal(pc.attacks[1].checkValue,pc.stats['命中']+2);assert.equal(pc.attacks[2].checkValue,pc.stats['命中']);
    assert.equal(pc.attacks[0].damageFixed,base.attacks[0].damageFixed-3);
  }
  const c=presetCharacter(data,'blade','gunner'),pc=calculate(data,c);
  assert.equal(pc.attacks[1].checkBase,pc.stats['命中']); // blade's equipment +1 also applies to phase.
});
test('長柄刃と中距離砲の射程、威力、装備差分',()=>{
  const c=presetCharacter(data,'blade','bastion'),base=calculate(data,c);c.weapons[0]='long_blade';const pc=calculate(data,c);
  assert.equal(validate(data,c).complete,true);assert.deepEqual(pc.attacks[0].range,[0,1]);assert.equal(pc.stats['行動'],base.stats['行動']-1);assert.equal(pc.attacks[0].damageFixed,base.attacks[0].damageFixed-1);
  const g=presetCharacter(data,'gunner','blade');g.weapons[0]='mid_cannon';assert.deepEqual(calculate(data,g).attacks[0].range,[2,4]);assert.equal(validate(data,g).complete,true);
});
test('主限定武器・枠違い・重複装備を拒否',()=>{
  for(const main of ['blade','gunner']){const c=presetCharacter(data,main,'bastion');c.weapons[1]='control_projector';assert.ok(validate(data,c).errors.length);}
  const c=presetCharacter(data,'link','blade');c.weapons[0]='blade';assert.ok(validate(data,c).errors.length);
  c.weapons=['phase','phase'];assert.ok(validate(data,c).errors.length);
});
test('指定タグは列挙された技能のみ。制御投射器へ妨害を継承しない',()=>{
  for(const id of ['f1','f2']) {assert.equal(compatibleWeapon(data,id,'phase'),true);assert.equal(compatibleWeapon(data,id,'economy_phase'),true);assert.equal(compatibleWeapon(data,id,'control_projector'),false);}
  assert.equal(compatibleWeapon(data,'b3','long_blade'),true);assert.equal(compatibleWeapon(data,'g3','mid_cannon'),true);
  const c=presetCharacter(data,'field','link');c.weapons[1]='control_projector';assert.ok(validate(data,c).errors.some(x=>x.includes('適合タグ')));
});
test('取得数・副許可・主副違い・上位熟練度・重複を検証',()=>{
  let c=presetCharacter(data);c.mainSkills.push('b2');assert.ok(validate(data,c).errors.some(x=>x.includes('最大2')));
  c=presetCharacter(data);c.subSkills=['s3'];assert.ok(validate(data,c).errors.length);
  c=presetCharacter(data);c.sub=c.main;assert.ok(validate(data,c).errors.length);
  c=presetCharacter(data);c.mainSkills=['b1','b1'];assert.ok(validate(data,c).errors.some(x=>x.includes('重複')));
  c=presetCharacter(data);c.mainSkills=[];assert.equal(validate(data,c).errors.length,0);assert.equal(validate(data,c).complete,false);
  assert.ok(!availableSkills(data,'gunner','sub').includes('g3'));
});
test('行動枠競合は取得禁止にせず日本語の注意を表示',()=>{
  const c=presetCharacter(data,'link','field');c.subSkills=['xf1'];const r=validate(data,c);
  assert.equal(r.complete,true);assert.ok(r.warnings.some(x=>x.includes('セットアップ')));
});
test('共鳴は主一つ、緊急再同期は意志B+Lv',()=>{
  for(const f of reference.builds){const c=presetCharacter(data,f.main,f.sub),pc=calculate(data,c);assert.equal(pc.ultimate,data.classes[f.main].ultimate);assert.equal(pc.restartFP,pc.bonuses['意志']+3);}
  assert.equal(data.skills.core_restart.cost.HP,6);assert.equal(data.skills.ub.cost.EN,4);assert.equal(data.skills.ug.cost.EN,4);
});
test('JSON往復は全30構成の選択・名前・メモを保持し数値を再計算',()=>{
  for(const f of reference.builds) {const c=presetCharacter(data,f.main,f.sub,{name:'試験用の仮名',notes:'<img src=x onerror=alert(1)>\n& テスト'});assert.deepEqual(parseCharacter(data,serializeCharacter(c)),c);}
});
test('不正JSON・型・未知ID・試作版・過大ファイル・prototypeキー・不合法構成を拒否',()=>{
  const base=presetCharacter(data);
  for(const text of ['{','null','[]','"text"','x'.repeat(65537),'{"__proto__":{"polluted":true}}'])assert.throws(()=>parseCharacter(data,text));
  for(const patch of [{name:{}},{notes:33},{name:'x'.repeat(81)},{notes:'x'.repeat(2001)},{main:'__proto__'},{weapons:'phase'},{mainSkills:[{}]},{subSkills:['unknown']},{level:4},{rulesVersion:'2.3'},{stats:{}},{mainRank:'2'},{weapons:['frame','blade']},{mainSkills:['b1','b1']}]) assert.throws(()=>parseCharacter(data,JSON.stringify({...base,...patch})));
  assert.equal({}.polluted,undefined);
});
test('公開データにシナリオ・既存PC・敵・旧任意武器を収録しない',()=>{
  for(const k of ['samples','enemies','map','campaign_levels','legacy_optional_v01','npc_transfer'])assert.equal(Object.hasOwn(data,k),false);
  assert.equal(Object.hasOwn(data.weapons,'short_blade'),false);
  assert.deepEqual(Object.keys(data).sort(),['classes','frame','level','mainRank','options','presets','released','skills','subRank','tagCompatibility','version','weapons'].sort());
});
