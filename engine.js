// Pure v2.4 Lv3 calculations. This module never reads or writes browser storage.
export const ATTRS = ['体力','反射','知覚','理知','意志','幸運'];
export const STATS = ['命中','回避','砲撃','防壁','行動','攻撃力','FP','HP','EN','移動'];
export const CORE = ['core_repair','core_restart','core_rescue'];
const own = (obj,key) => Object.hasOwn(obj,key);
const zero = () => Object.fromEntries(STATS.map(k=>[k,0]));
export function presetCharacter(data, main='blade', sub='bastion', previous={}) {
  const p=data.presets[`${main}/${sub}`];
  if(!p) throw new Error('主クラスと副クラスは異なる組合せを選んでください。');
  return {schemaVersion:1, rulesVersion:data.version, level:3, mainRank:2, subRank:1,
    name:previous.name??'', notes:previous.notes??'', main,sub,
    mainSkills:[...p.mainSkills],subSkills:[...p.subSkills],weapons:[...p.weapons]};
}
export function allowedWeapons(data, main, slot) {
  const defaultId=slot==='主'?data.classes[main].weapon:'phase';
  return Object.entries(data.weapons).filter(([id,w])=>w.slot===slot &&
    (id===defaultId || (w.replaces===defaultId && w.allowed_main?.includes(main)))).map(([id])=>id);
}
export function availableSkills(data, cls, side) {
  return data.classes[cls].skills.filter(id=>data.skills[id].rank<=(side==='main'?2:1) &&
    (side==='main'||data.skills[id].sub_allowed));
}
export function compatibleWeapon(data, skillId, weaponId) {
  const s=data.skills[skillId], w=data.weapons[weaponId];
  if(!s||!w) return false;
  const required=s.parameters.weapon;
  if(required) {
    if(weaponId===required) return true;
    return Object.entries(data.tagCompatibility).some(([tag,t])=>t.named===required &&
      t.skills.includes(skillId) && t.weapons.includes(weaponId) && w.tags?.includes(tag));
  }
  // Weapon-kind restrictions come from the explicit effect text, not from names.
  if(['b1','b2','ub'].includes(skillId)) return w.kind==='白兵';
  if(['g1','g2','ug'].includes(skillId)) return ['射撃','砲撃'].includes(w.kind);
  if(skillId==='xv1') return ['白兵','射撃'].includes(w.kind);
  if(skillId==='f3') return (w.tags??[]).includes('interference_projector');
  return true;
}
export function validate(data,c) {
  const errors=[], incomplete=[], warnings=[];
  if(!own(data.classes,c.main)||!own(data.classes,c.sub)||c.main===c.sub) errors.push('主・副は異なる6クラスから選びます。');
  if(c.level!==3||c.mainRank!==2||c.subRank!==1) errors.push('この作成画面はLv3・主熟練度2・副熟練度1専用です。');
  if(errors.length) return {errors,incomplete,warnings,complete:false};
  const all=[...c.mainSkills,...c.subSkills];
  if(new Set(all).size!==all.length) errors.push('同じ技能は重複取得できません。');
  for(const [side,cls,cap] of [['main',c.main,2],['sub',c.sub,1]]) {
    const ids=c[`${side}Skills`], label=side==='main'?'主':'副';
    if(ids.length>cap) errors.push(`${label}技能は最大${cap}個です。`);
    if(ids.length<cap) incomplete.push(`${label}技能をあと${cap-ids.length}個選べます。`);
    for(const id of ids) {
      const s=data.skills[id];
      if(!s||!availableSkills(data,cls,side).includes(id)) {errors.push(`${label}クラスでは${s?.name??id}を取得できません。`);continue;}
      if(!s.requires.every(x=>ids.includes(x))) errors.push(`${s.name}の前提技能が同じ側にありません。`);
      if(s.parameters.weapon || ['b1','b2','g1','g2','f3','xv1'].includes(id)) {
        const candidates=[...c.weapons,'unarmed'];
        if(!candidates.some(w=>compatibleWeapon(data,id,w))) errors.push(`${s.name}：現在の装備は武器種・適合タグの条件を満たさず使用できません。`);
      }
    }
  }
  if(c.weapons.length!==2 || new Set(c.weapons).size!==2) errors.push('主武器1・副武器1を重複せず装備します。');
  for(const [i,slot] of ['主','副'].entries()) if(!allowedWeapons(data,c.main,slot).includes(c.weapons[i])) errors.push(`${slot}武器は主クラスの装備許可と装備枠を満たしていません。`);
  const grouped=new Map();
  for(const id of [...all,data.classes[c.main].ultimate]) {
    const s=data.skills[id]; if(!s) continue;
    if(['セットアップ','ムーブ','マイナー','メジャー'].includes(s.timing)) {
      const list=grouped.get(s.timing)??[];list.push(s.name);grouped.set(s.timing,list);
    }
  }
  for(const [timing,list] of grouped) if(list.length>1) warnings.push(`${timing}枠：${list.join('・')}は同じ枠でどれか一つを選びます。取得の両立は可能です。`);
  if(all.includes('xs2') && !all.some(id=>['b2','s1','s2','s3','xs1'].includes(id)) && c.main!=='bastion') warnings.push('防護からの標定：自分が使う防御技能の実効軽減・肩代わりが必要です。取得構成と仲間への防護手段を確認してください。');
  if(c.weapons.some(id=>data.weapons[id]?.attack_bonus)) warnings.push('制御武器の+2はその武器の攻撃判定だけ。リンク・照準・条件標定とは最大値一つで、シートの命中値へ加算しません。');
  if(all.includes('xs2')||all.includes('xv2')) warnings.push('条件標定は次の自分のメイン終了までの予約1個。反撃・複数対象には適用せず、追加手番や追加攻撃もありません。');
  if(all.some(id=>['g1','g3','l1'].includes(id))) warnings.push('同種の攻撃補助は最大値一つ。照準+2とリンク+2を足して+4にはしません。');
  return {errors,incomplete,warnings,complete:errors.length===0&&incomplete.length===0};
}
export function calculate(data,c) {
  const mc=data.classes[c.main], sc=data.classes[c.sub], L=3;
  const attributes=Object.fromEntries(ATTRS.map(k=>[k,12]));attributes[mc.attribute]+=3;attributes[sc.attribute]+=1;
  const bonuses=Object.fromEntries(ATTRS.map(k=>[k,Math.floor(attributes[k]/3)]));
  const b=bonuses, avg=(x,y)=>Math.floor((b[x]+b[y])/2);
  const base={'命中':avg('反射','知覚')+2+Math.floor(L/2),'回避':avg('反射','幸運')+3+Math.floor(L/3),
    '砲撃':avg('知覚','理知')+2+Math.floor(L/2),'防壁':avg('理知','意志')+3+Math.floor(L/3),
    '行動':b['反射']+b['知覚']+Math.floor(L/2),'攻撃力':Math.floor(b['体力']/2)+Math.floor(L/2),
    FP:12+3*L+2*b['体力']+b['意志'],HP:12+2*L+b['体力']+b['意志'],EN:8+2*L+2*b['理知']+b['意志'],'移動':2};
  const frame={...zero(),...data.frame.modifiers}, main={...zero(),...mc.profile}, sub=zero(), gear=zero();
  main[mc.focus]+=Math.floor((c.mainRank-1)/2);
  sub[sc.sub_focus]=sc.sub_focus==='EN'?2*c.subRank:sc.sub_focus==='移動'?Math.floor(c.subRank/3):Math.floor(c.subRank/2);
  const armor={...data.frame.armor};
  for(const id of c.weapons) for(const [k,v] of Object.entries(data.weapons[id].modifiers)) gear[k]+=v;
  if(mc.option) {
    const o=data.options[mc.option];
    for(const [k,v] of Object.entries(o.modifiers)) gear[k]+=v;
    for(const [k,v] of Object.entries(o.armor)) armor[k]+=v;
  }
  const components={base,frame,main,sub,gear};
  const stats=Object.fromEntries(STATS.map(k=>[k,Object.values(components).reduce((n,part)=>n+part[k],0)]));
  return {attributes,bonuses,components,stats,armor,option:mc.option,ultimate:mc.ultimate,
    restartFP:b['意志']+L, attacks:[...c.weapons,'unarmed'].map(id=>{
      const w=data.weapons[id];return {id,...w,checkValue:stats[w.check]+(w.attack_bonus??0),
        checkBase:stats[w.check],attackBonus:w.attack_bonus??0,damageFixed:stats['攻撃力']+w.power};
    })};
}
export function parseCharacter(data, text) {
  if(typeof text!=='string'||text.length>65536) throw new Error('JSONは64KB以下の文字列を選んでください。');
  let x;try{x=JSON.parse(text);}catch{throw new Error('JSONの形式を読み取れません。保存したJSONファイルを選んでください。');}
  const keys=['schemaVersion','rulesVersion','level','mainRank','subRank','name','notes','main','sub','mainSkills','subSkills','weapons'];
  if(!x||typeof x!=='object'||Array.isArray(x)||Object.keys(x).some(k=>!keys.includes(k))) throw new Error('この作成画面の保存形式ではありません。');
  if(x.schemaVersion!==1||x.rulesVersion!==data.version||x.level!==3||x.mainRank!==2||x.subRank!==1) throw new Error('対応する保存形式はv2.4／Lv3／主2・副1です。');
  for(const [key,max] of [['name',80],['notes',2000]]) if(typeof x[key]!=='string'||x[key].length>max) throw new Error(`${key==='name'?'PC名':'メモ'}の型・文字数が不正です。`);
  for(const key of ['main','sub']) if(typeof x[key]!=='string'||!own(data.classes,x[key])) throw new Error('不明なクラスが含まれています。');
  for(const [key,pool] of [['mainSkills',data.skills],['subSkills',data.skills],['weapons',data.weapons]]) {
    if(!Array.isArray(x[key])||x[key].length>10||!x[key].every(id=>typeof id==='string'&&own(pool,id))) throw new Error('技能・武器の型またはIDが不正です。');
  }
  // Reconstruct only known fields. Never merge untrusted objects or calculated totals.
  const c=Object.fromEntries(keys.map(k=>[k,Array.isArray(x[k])?[...x[k]]:x[k]]));
  const result=validate(data,c);
  if(result.errors.length) throw new Error(`保存データの選択に問題があります：${result.errors.join(' ')}`);
  return c;
}
export function serializeCharacter(c) {return JSON.stringify(c,null,2)+'\n';}
