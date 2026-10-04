import {ATTRS,STATS,CORE,presetCharacter,allowedWeapons,availableSkills,compatibleWeapon,validate,calculate,parseCharacter,serializeCharacter} from './engine.js';
const $=id=>document.getElementById(id), KEY='ignis.character.v1';
const main=$('main');
let data,c,step=1,dirty=false,printStep=null;
function el(tag,attrs={},...children) {
  const n=document.createElement(tag);
  for(const [k,v] of Object.entries(attrs)) {
    if(k.startsWith('on')) n.addEventListener(k.slice(2),v);
    else if(k==='class') n.className=v;
    else if(k==='value') n.value=v;
    else if(k==='disabled'||k==='hidden'||k==='checked') n[k]=v;
    else n.setAttribute(k,String(v));
  }
  for(const child of children.flat(Infinity)) if(child!=null) n.append(child instanceof Node?child:document.createTextNode(String(child)));
  return n;
}
function showMessage(text,error=false) {
  const box=$('message');box.textContent=text;box.hidden=false;box.classList.toggle('error',error);
}
function changed() {dirty=true;$('save-status').textContent='変更があります。保存ボタンでこの端末またはJSONに保存できます。';}
function go(n,focus=true) {
  step=n;history.pushState(null,'',`#step-${n}`);displayStep();if(focus){main.focus();main.scrollIntoView({block:'start',behavior:'smooth'});}
}
function displayStep() {
  for(const s of main.querySelectorAll('[data-panel]')) s.hidden=Number(s.dataset.panel)!==step;
  for(const b of document.querySelectorAll('[data-step]')) {const active=Number(b.dataset.step)===step;b.classList.toggle('active',active);if(active)b.setAttribute('aria-current','step');else b.removeAttribute('aria-current');}
}
function sectionHead(number,title,text) {return el('div',{class:'section-head'},el('p',{class:'eyebrow'},`STEP ${number} / 03`),el('h2',{},title),el('p',{},text));}
function classChanged(side,id) {
  if(c[side]===id)return;
  const before=[...c.mainSkills,...c.subSkills,...c.weapons];
  let m=side==='main'?id:c.main, s=side==='sub'?id:c.sub;
  if(m===s)s=Object.keys(data.classes).find(k=>k!==m);
  c=presetCharacter(data,m,s,c);changed();render();
  const removed=before.filter(x=>![...c.mainSkills,...c.subSkills,...c.weapons].includes(x)).map(id=>data.skills[id]?.name??data.weapons[id]?.name);
  showMessage(`クラスを変更し、新しい組合せのおすすめ構成と標準装備を設定しました。${removed.length?`外れた選択：${removed.join('・')}。`:''} PC名とメモは保持しています。`);
}
function classCards(side) {
  return el('div',{class:'class-grid'},Object.entries(data.classes).map(([id,cls],i)=>{
    const disabled=side==='sub'&&id===c.main;
    return el('button',{type:'button',class:`class-card ${c[side]===id?'selected':''}`,disabled,'aria-pressed':c[side]===id,onclick:()=>classChanged(side,id)},
      el('span',{class:'card-index'},`0${i+1} / ${side==='main'?'MAIN':'SUB'}`),el('strong',{},cls.name),el('span',{},cls.fiction),
      el('small',{},disabled?'主と同じクラスは選べません':`指定能力：${cls.attribute} ${side==='main'?'+3':'+1'}`));
  }));
}
function attributesTable(pc) {
  return el('div',{class:'attribute-grid'},ATTRS.map(k=>el('div',{},el('span',{},k),el('strong',{},pc.attributes[k]),el('small',{},`ボーナス ${pc.bonuses[k]}`))));
}
function panel1(pc) {
  const name=el('input',{id:'pc-name',type:'text',maxlength:80,value:c.name,placeholder:'例：イグニスの操縦者（仮名可）',autocomplete:'off',oninput:e=>{c.name=e.target.value;changed();}});
  const notes=el('textarea',{id:'pc-notes',maxlength:2000,rows:3,placeholder:'外見や性格など、任意のメモ',oninput:e=>{c.notes=e.target.value;changed();}});notes.value=c.notes;
  return el('section',{'data-panel':'1',class:'panel no-print'},sectionHead('01','名前と、あなたの役割。','まず主クラスを選び、異なる副クラスを一つ組み合わせます。'),
    el('div',{class:'identity-grid'},el('div',{},el('label',{for:'pc-name'},'PC名'),name,el('small',{},'仮名・未入力でも作成できます。80文字まで。')),el('div',{},el('label',{for:'pc-notes'},'メモ（任意）'),notes)),
    el('h3',{},'主クラス / 熟練度2'),el('p',{class:'muted'},'機体の役割、主装備、共鳴解放を決めます。'),classCards('main'),
    el('h3',{},'副クラス / 熟練度1'),el('p',{class:'muted'},'技能一つと指定能力+1。副の主武器・オプション・共鳴解放は追加しません。'),classCards('sub'),
    el('div',{class:'info-box'},el('h3',{},'能力値は正式ルールに沿って自動設定'),el('p',{},'Lv3は各12＋主の指定能力3＋副の指定能力1。指定能力が同じなら合計+4。合計76、ボーナスは基本値÷3の切捨てです。'),attributesTable(pc),el('p',{class:'muted'},'成長時はLvごとに任意の能力基本値を一つ+1。この画面は初期Lv3専用です。')),
    el('div',{class:'actions'},el('button',{class:'primary',type:'button',onclick:()=>{render();go(2);}},'技能と武器へ →')));
}
function mechanics(s) {
  const line=s.effect.split('\n').find(t=>t.startsWith('- 効果：'));
  return line?line.slice(5):s.effect;
}
function costText(s) {const costs=Object.entries(s.cost).map(([k,v])=>`${k}${v}`).join(' / ');return `${costs||'なし'}${s.weapon_cost_additional?' ＋武器代償':''}`;}
function skillDetail(s) {
  return el('details',{class:'skill-detail'},el('summary',{},'条件・効果・重複を読む'),el('dl',{},
    el('dt',{},'取得条件'),el('dd',{},`熟練度${s.rank} / ${s.sub_allowed?'主・副可':'主のみ'} / 前提：${s.requires.map(id=>data.skills[id].name).join('・')||'なし'}`),
    el('dt',{},'対象 / 射程'),el('dd',{},`${s.target} / ${s.range}`),el('dt',{},'判定'),el('dd',{},s.check),el('dt',{},'使用条件'),el('dd',{},s.conditions),el('dt',{},'持続'),el('dd',{},s.duration),el('dt',{},'重複'),el('dd',{},s.stacking)),
    s.effect.split(/\n\s*\n/).filter(Boolean).map(t=>el('p',{class:'rule-text'},t)));
}
function skillsSelect(side) {
  const cls=c[side], chosen=c[`${side}Skills`], cap=side==='main'?2:1, allowed=availableSkills(data,cls,side);
  return el('fieldset',{class:'skill-fieldset'},el('legend',{},`${side==='main'?'主':'副'}技能 — ${chosen.length} / ${cap}枠`),
    data.classes[cls].skills.map(id=>{
      const s=data.skills[id], legal=allowed.includes(id), checked=chosen.includes(id);
      const input=el('input',{type:'checkbox',id:`${side}-${id}`,checked,disabled:!legal, onchange:e=>{
        if(e.target.checked && chosen.length>=cap){e.target.checked=false;showMessage(`${side==='main'?'主':'副'}技能は${cap}枠です。入れ替える技能のチェックを外してから選んでください。`,true);return;}
        c[`${side}Skills`]=e.target.checked?[...chosen,id]:chosen.filter(x=>x!==id);changed();render();document.getElementById(`${side}-${id}`)?.focus();
      }});
      return el('article',{class:`skill-card ${checked?'selected':''} ${!legal?'unavailable':''}`},
        el('label',{for:`${side}-${id}`,class:'skill-title'},input,el('span',{},el('strong',{},s.name),el('small',{},legal?s.role:`必要熟練度${s.rank} / ${s.sub_allowed?'主・副可':'主のみ'}：現在は取得不可`))),
        el('div',{class:'skill-meta'},el('span',{},s.timing),el('span',{},costText(s)),el('span',{},s.limit)),
        el('p',{},mechanics(s)),skillDetail(s));
    }));
}
function weaponSelect(slot,index) {
  const options=allowedWeapons(data,c.main,slot), id=c.weapons[index],w=data.weapons[id];
  const select=el('select',{id:`weapon-${index}`,onchange:e=>{c.weapons[index]=e.target.value;changed();render();$('weapon-'+index).focus();}},options.map(wid=>el('option',{value:wid},data.weapons[wid].name)));select.value=id;
  const tagNames={'phase_blade':'位相刃','focus_cannon':'収束砲','interference_projector':'位相投射'};
  return el('div',{class:'weapon-card'},el('label',{for:`weapon-${index}`},`${slot}武器 — 1枠`),select,
    el('p',{},`${w.kind} / ${w.check} 対 ${w.defense} / 射程 ${w.range.join('～')} / ${w.attribute}+${w.power} / EN${w.EN}`),
    el('small',{},`装備補正：${Object.entries(w.modifiers).map(([k,v])=>`${k}${v>=0?'+':''}${v}`).join('・')||'なし'} / 適合タグ：${(w.tags??[]).map(t=>tagNames[t]).join('・')||'なし'}`),
    w.attack_bonus?el('p',{class:'warning-text'},'この武器の攻撃判定だけ+2。威力は標準より3低く、タグによる名称指定技能の継承はありません。'):null);
}
function checks(result) {
  return el('div',{class:`legality ${result.complete?'valid':'pending'}`,role:'status'},el('h3',{},result.complete?'✓ 作成条件を確認しました':result.errors.length?'選択を確認してください':'技能を選択中'),
    result.errors.length?el('ul',{class:'error-text'},result.errors.map(x=>el('li',{},x))):null,
    result.incomplete.length?el('ul',{},result.incomplete.map(x=>el('li',{},x))):null,
    result.warnings.length?el('details',{open:'',class:'warnings'},el('summary',{},'使い方の注意'),el('ul',{},result.warnings.map(x=>el('li',{},x)))):null);
}
function panel2(pc,result) {
  const p=data.presets[`${c.main}/${c.sub}`];
  return el('section',{'data-panel':'2',class:'panel no-print'},sectionHead('02','使いたい行動を選ぼう。',`${data.classes[c.main].name} / ${data.classes[c.sub].name}。おすすめを出発点に、同じ取得枠の中で入れ替えられます。`),
    el('div',{class:'preset-box'},el('div',{},el('p',{class:'eyebrow'},`RECOMMENDED / ${p.category}`),el('h3',{},'配布ガイドの取得例'),el('p',{},p.example),el('p',{class:'muted'},p.caution),el('small',{},'この行動例はおすすめ技能・標準装備のときの例です。手動変更後は現在の技能・武器条件を確認してください。')),
      el('button',{class:'primary',type:'button',onclick:()=>{c=presetCharacter(data,c.main,c.sub,c);changed();render();showMessage('配布ガイドの主2技能・副1技能と標準装備を設定しました。');}},'おすすめを適用')),
    el('div',{class:'skill-columns'},skillsSelect('main'),skillsSelect('sub')),
    el('h3',{},'武器を選ぶ'),el('p',{class:'muted'},'主1・副1・オプション1。副クラスから主専用武器は得ません。武器交換は安全なシーン間10分、戦闘中は不可。'),
    el('div',{class:'weapon-grid'},weaponSelect('主',0),weaponSelect('副',1)),
    el('div',{class:'info-box'},el('strong',{},'固定の機体・オプション'),el('p',{},`${data.frame.name} / サイズ${data.frame.size} / ${pc.option?data.options[pc.option].name:'オプションなし'}`)),checks(result),
    el('div',{class:'actions'},el('button',{type:'button',onclick:()=>go(1)},'← 名前とクラス'),el('button',{class:'primary',type:'button',onclick:()=>{render();go(3);}},'最終シートへ →')));
}
function statTable(pc) {
  const heads=['数値','基礎','機体','主','副','装備','最終'];
  return el('div',{class:'table-scroll',tabindex:0,'aria-label':'計算内訳の表。小さな画面では横にスクロールできます。'},el('table',{},el('caption',{},'最終値の内訳（各補正を一度ずつ加算）'),el('thead',{},el('tr',{},heads.map(x=>el('th',{scope:'col'},x)))),
    el('tbody',{},STATS.map(k=>el('tr',{},el('th',{scope:'row'},k),Object.values(pc.components).map(p=>el('td',{},p[k])),el('td',{class:'total'},pc.stats[k]))))));
}
function sheetSkill(id,pc) {
  const s=data.skills[id];let effect=mechanics(s);
  if(id==='core_restart')effect+=` このPCの復帰FPは${pc.restartFP}。再接続系は対象側の同じセッション1回を消費します。`;
  if(id==='us')effect+=` このPCでは${12+2*c.level}点軽減。`;
  if(id==='ul')effect+=` このPCでは${15+c.level}点回復。`;
  return el('article',{class:'sheet-skill'},el('h4',{},s.name),el('p',{class:'skill-meta'},`${s.timing} / ${costText(s)} / ${s.limit} / 射程 ${s.range}`),el('p',{},effect),
    ['xs2','xv2'].includes(id)?el('p',{class:'warning-text'},`発動条件：${s.conditions}`):null,
    el('div',{class:'no-print'},skillDetail(s)));
}
function panel3(pc,result) {
  return el('section',{'data-panel':'3',id:'sheet',class:'panel'},el('div',{class:'sheet-heading'},el('div',{},el('p',{class:'eyebrow'},'IGNIS / Lv3 CHARACTER SHEET'),el('h2',{id:'sheet-name'},c.name.trim()||'名前未設定'),el('p',{},`${data.classes[c.main].name} M2 / ${data.classes[c.sub].name} S1`)),el('span',{class:'sheet-stamp'},'非公式\n試遊 v2.4')),
    el('p',{class:result.complete?'sheet-status valid-text':'sheet-status warning-text'},result.complete?'作成条件確認済み / 初期現在値は上限と同じ':`確認中のシート：${[...result.errors,...result.incomplete].join(' ')}`),
    c.notes?el('p',{class:'pc-memo'},c.notes):null,
    el('div',{class:'resource-grid'},['FP','HP','EN'].map(k=>el('div',{},el('span',{},k),el('strong',{},pc.stats[k]),el('small',{},k==='FP'?'機体':k==='HP'?'操縦者':'出力資源')))),
    el('h3',{},'能力基本値 / ボーナス'),attributesTable(pc),el('h3',{},'戦闘値'),statTable(pc),
    el('h3',{},'機体と属性防御'),el('p',{},`${data.frame.name} / サイズ${data.frame.size} / オプション：${pc.option?data.options[pc.option].name:'なし'}`),el('div',{class:'armor-grid'},Object.entries(pc.armor).map(([k,v])=>el('span',{},`${k} ${v}`))),
    el('h3',{},'通常攻撃'),el('p',{class:'muted'},'判定：2D6＋対応値。通常ダメージ：2D6＋下記固定値。装備補正を再加算しません。'),
    el('div',{class:'attack-grid'},pc.attacks.map(w=>el('article',{},el('h4',{},w.name),el('p',{},`${w.kind} / 射程 ${w.range.join('～')} / ${w.attribute}属性 / EN${w.EN}`),el('p',{},`2D6 + ${w.checkValue}（${w.check}） 対 ${w.defense}`),el('p',{},`ダメージ 2D6 + ${w.damageFixed}`),w.attackBonus?el('small',{class:'warning-text'},`対応値${w.checkBase} ＋この武器だけ${w.attackBonus}。同種補助は最大値一つ。`):null,w.kind==='砲撃'?el('small',{class:'warning-text'},'移動したメインでは砲撃できません。'):null))),
    el('h3',{},'選択技能 / 主2・副1'),[...c.mainSkills,...c.subSkills].map(id=>sheetSkill(id,pc)),
    el('h3',{},'別枠 / 主クラスの共鳴解放'),sheetSkill(pc.ultimate,pc),['ub','ug'].includes(pc.ultimate)?el('p',{class:'warning-text'},'命中後、ダメージロール直前に宣言。外れではEN4・回数を消費しません。宣言後に打ち消された場合は消費します。'):null,
    el('h3',{},'別枠 / イグニス・コア固定能力'),CORE.map(id=>sheetSkill(id,pc)),
    el('div',{class:'sheet-notes'},el('h3',{},'プレイ時の確認'),el('p',{},'攻撃補助・防御補助・固定ダメージ増加・通常軽減・射程拡張・装甲無視は同種の最大値一つ。同じ行動枠の技能はどれか一つ。技能ENと使用武器ENは別払い。機体・武器の固定補正は全装備から一度だけ加算。'),el('p',{},'HP0またはFP0で操縦不能。通常修復ではFP0から復帰できません。共鳴解放はEN4・1セッション1回。副の共鳴解放は取得しません。')),
    el('div',{class:'no-print'},checks(result),el('div',{class:'actions'},el('button',{type:'button',onclick:()=>go(2)},'← 技能と武器'),el('button',{class:'primary',type:'button',onclick:printSheet},'印刷 / PDF →'))),
    el('p',{class:'print-footer'},'イグニス独自試遊ルール v2.4 / Lv3専用 / 非公式ファン用 / このシートは端末内で作成'));
}
function render() {
  const pc=calculate(data,c), result=validate(data,c);
  main.replaceChildren(panel1(pc),panel2(pc,result),panel3(pc,result));displayStep();
}
function saveReady() {
  const r=validate(data,c);if(r.errors.length){showMessage(`保存前に選択を確認してください：${r.errors.join(' ')}`,true);return false;}return true;
}
function saveLocal() {
  if(!saveReady())return;
  try {localStorage.setItem(KEY,serializeCharacter(c));dirty=false;$('save-status').textContent='この端末に保存しました。次回アクセス時に復元します。';showMessage('ブラウザの保存領域に保存しました。別の端末へ移す場合はJSONも保存してください。');}
  catch {showMessage('端末への保存に失敗しました。保存容量やブラウザ設定を確認し、JSONを保存して入力を保管してください。',true);}
}
function restoreLocal(automatic=false) {
  try {const saved=localStorage.getItem(KEY);if(!saved){if(!automatic)showMessage('この端末には保存データがありません。');return;}
    const parsed=parseCharacter(data,saved);c=parsed;dirty=false;render();$('save-status').textContent='端末保存を復元しました。';showMessage('この端末に保存したキャラクターを復元しました。');
  }catch {showMessage('端末保存を読み込めませんでした。現在の入力は保持しています。JSONから復元するか、保存領域の設定を確認してください。',true);}
}
function exportJSON() {
  if(!saveReady())return;
  try {const blob=new Blob([serializeCharacter(c)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=el('a',{href:url,download:'ignis-character-v2.4.json'});document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);showMessage('JSONの保存を開始しました。ダウンロード先にファイルがあることを確認してください。');}
  catch{showMessage('JSONの保存を開始できませんでした。ブラウザのダウンロード設定を確認してください。',true);}
}
async function importJSON(e) {
  const file=e.target.files[0];if(!file)return;
  try {if(file.size>65536)throw new Error('ファイルは64KB以下を選んでください。');const parsed=parseCharacter(data,await file.text());c=parsed;changed();render();showMessage('JSONを読み込み、正式ルールから数値を再計算しました。端末に残す場合は保存してください。');}
  catch(error){showMessage(`読込エラー：${error.message} 現在の入力は保持しています。`,true);}
  finally {e.target.value='';}
}
function printSheet() {render();go(3,false);window.print();}
window.addEventListener('beforeprint',()=>{if(!data)return;printStep=step;render();step=3;displayStep();});
window.addEventListener('afterprint',()=>{if(printStep!=null){step=printStep;printStep=null;displayStep();}});
window.addEventListener('popstate',()=>{const n=Number(location.hash.match(/^#step-([123])$/)?.[1]);step=n||1;displayStep();});
window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue='';}});
async function start() {
  try {
    const r=await fetch('./data/rules.json');if(!r.ok)throw new Error('data');data=await r.json();c=presetCharacter(data);step=Number(location.hash.match(/^#step-([123])$/)?.[1])||1;render();restoreLocal(true);
    document.querySelectorAll('[data-step]').forEach(b=>b.addEventListener('click',()=>{render();go(Number(b.dataset.step));}));
    $('save-local').addEventListener('click',saveLocal);$('restore-local').addEventListener('click',()=>restoreLocal());$('export').addEventListener('click',exportJSON);$('import').addEventListener('change',importJSON);$('print').addEventListener('click',printSheet);
  } catch {main.replaceChildren(el('div',{class:'notice error',role:'alert'},'ルールデータを読み込めませんでした。ページを再読み込みしてください。ローカルで使う場合はREADMEのHTTPサーバー手順を確認してください。'));document.querySelectorAll('.toolbar button').forEach(b=>b.disabled=true);}
}
start();
