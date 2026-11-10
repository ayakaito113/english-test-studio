import {downloadDocx} from './docx.js';
import {parseInstruction, formatQuestionText} from './formatting.js';
import {bookOf, sourceLabel} from './source.js';

const $ = id => document.getElementById(id);
const esc = str => String(str??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
const lines = str => esc(str).replace(/\r?\n/g,'<br>');
const short = (s,n=92) => String(s||'').replace(/\s+/g,' ').slice(0,n);
const idGen = () => `manual-${new Date().toISOString().replace(/[-:.TZ]/g,'')}-${Math.random().toString(36).slice(2,8)}`;
const blankDraft = {title:'英語 確認テスト', paper:'Letter',space:'standard',answerArea:'with',explain:false,showSources:true,selectedIds:[]};
const state = {questions:[], selectedIds:[],displayLimit:60,step:'choose', documentType:'questions',...blankDraft};
const selectedTopics = new Set(); // Empty = show all grammar topics. Does not alter the selected test questions.
let db;
let toastTimer;
function notice(msg){$('toast').textContent=msg;$('toast').classList.remove('hidden');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.add('hidden'),3800);}
function openDb(){return new Promise((resolve,reject)=>{const req=indexedDB.open('english-test-studio-v1',1);req.onupgradeneeded=()=>{const d=req.result;if(!d.objectStoreNames.contains('questions'))d.createObjectStore('questions',{keyPath:'id'});if(!d.objectStoreNames.contains('settings'))d.createObjectStore('settings',{keyPath:'key'});};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}
function transaction(store,mode,fn){return new Promise((resolve,reject)=>{const tx=db.transaction(store,mode),object=tx.objectStore(store);let request;try{request=fn(object);}catch(e){reject(e);return;}tx.oncomplete=()=>resolve(request?.result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});}
const getQuestions=()=>transaction('questions','readonly',s=>s.getAll());
const getDraft=()=>transaction('settings','readonly',s=>s.get('draft'));
const saveDraft=()=>transaction('settings','readwrite',s=>s.put({key:'draft',value:{title:state.title,paper:state.paper,space:state.space,answerArea:state.answerArea,explain:state.explain,showSources:state.showSources,selectedIds:state.selectedIds}}));
const putQuestions=arr=>transaction('questions','readwrite',s=>{for(const q of arr)s.put(q);});
const selected=()=>state.selectedIds.map(id=>state.questions.find(q=>q.id===id)).filter(Boolean);
const groups=()=>{const map=new Map();for(const q of selected()){const type=q.type||'その他';if(!map.has(type))map.set(type,{type,instruction:parseInstruction(q.instruction).heading,items:[]});map.get(type).items.push(q);}return [...map.values()];};
function normalize(raw,i=0){
 const q={id:String(raw.id||'').trim()||idGen(),book:bookOf(raw),topic:String(raw.topic||raw.文法||'未分類').trim(),level:String(raw.level||raw.難易度||'標準').trim(),type:String(raw.type||raw.問題形式||'その他').trim(),instruction:String(raw.instruction||'').trim(),text:String(raw.text||'').trim(),choices:String(raw.choices||'').trim(),answer:String(raw.answer||'').trim(),explanation:String(raw.explanation||'').trim(),source:String(raw.source||'').trim(),answerSource:String(raw.answerSource||'').trim(),notes:String(raw.notes||'').trim()};
 if(!q.text)throw new Error(`${i+1}番目の問題に本文がありません。`);return q;
}
function parseImport(raw){const data=JSON.parse(raw);if(data?.schemaVersion!==1)throw new Error('対応していないデータ形式です（schemaVersion: 1 が必要）。');if(Array.isArray(data.questions))return {questions:data.questions.map((q,i)=>normalize({...q,book:q.book||q.教材||data.book||data.教材||''},i)),draft:data.draft||null};if(data.kind==='english-test-studio-test'&&Array.isArray(data.selectedIds))return {questions:[],draft:data};throw new Error('questions 配列が見つかりません。');}
function unique(arr){return [...new Set(arr.filter(Boolean))];}
function fillOptions(id,values){const el=$(id),prev=el.value;el.innerHTML='<option value="">すべて</option>'+unique(values).sort((a,b)=>a.localeCompare(b,'ja')).map(v=>`<option value="${esc(v)}">${esc(v)}</option>`).join('');if([...el.options].some(o=>o.value===prev))el.value=prev;}
function updateTopicSummary(){
 const selected=[...selectedTopics].sort((a,b)=>a.localeCompare(b,'ja'));
 $('topicFilterValue').textContent=selected.length===0?'すべての文法項目':selected.length<=2?selected.join('・'):`${selected.length}項目を選択中`;
 $('clearTopics').disabled=selected.length===0;
}
function refreshTopicOptions(){
 const values=unique(state.questions.map(q=>q.topic)).sort((a,b)=>a.localeCompare(b,'ja'));
 const valid=new Set(values);
 for(const item of selectedTopics)if(!valid.has(item))selectedTopics.delete(item);
 $('topicOptions').innerHTML=values.map(topic=>`<label class="topic-option"><input type="checkbox" value="${esc(topic)}" ${selectedTopics.has(topic)?'checked':''}><span>${esc(topic)}</span></label>`).join('')||'<p class="topic-no-options">文法データがありません</p>';
 updateTopicSummary();
}
function refreshBookOptions(){
 const el=$('bookFilter'),prev=el.value;
 const fixed=['Sirius','文法問題集'];
 const others=unique(state.questions.map(bookOf)).filter(name=>!fixed.includes(name)).sort((a,b)=>a.localeCompare(b,'ja'));
 el.innerHTML='<option value="">両方・すべての教材</option>'+[...fixed,...others].map(name=>`<option value="${esc(name)}">${esc(name)}${fixed.includes(name)?'だけ':''}</option>`).join('');
 if([...el.options].some(option=>option.value===prev))el.value=prev;
}
function refreshOptions(){refreshTopicOptions();refreshBookOptions();fillOptions('levelFilter',state.questions.map(q=>q.level));fillOptions('typeFilter',state.questions.map(q=>q.type));}
function filtered(){const book=$('bookFilter').value,level=$('levelFilter').value,type=$('typeFilter').value,query=$('searchInput').value.trim().toLowerCase();return state.questions.filter(q=>(!book||bookOf(q)===book)&&(selectedTopics.size===0||selectedTopics.has(q.topic))&&(!level||q.level===level)&&(!type||q.type===type)&&(!query||[q.text,q.choices,q.source,q.topic,q.type,bookOf(q)].join(' ').toLowerCase().includes(query)));}
function updateCounters(){const n=state.questions.length;$('bankCountTop').textContent=`問題データ ${n}問`;$('dataCount').textContent=n;$('selectedCount').textContent=`${state.selectedIds.length}問`;$('selectedCount2').textContent=`${state.selectedIds.length}問`;$('heroTopics').innerHTML=n?`${unique(state.questions.map(q=>q.topic)).length}文法項目<br>標準・発展の問題バンク`:'問題データを読み込んで開始';$('previewTopics').textContent=`${state.selectedIds.length}問／${groups().length}大問`;}
function refreshList(){const arr=filtered();$('visibleCount').textContent=`${arr.length}問`;$('resultInfo').textContent=`${state.questions.length}問から ${arr.length}問を表示`;
 if(!state.questions.length){$('questionList').innerHTML=`<div class="empty"><strong>問題バンクはまだ空です</strong><div>まず手元にある非公開JSONファイルを読み込もう。<br>読み込んだ問題はこのブラウザ内だけに保存されます。</div><button type="button" class="primary" data-action="import">JSONファイルを読み込む</button></div>`;return;}
 if(!arr.length){$('questionList').innerHTML='<div class="empty"><strong>該当する問題がありません</strong>検索条件を変えてみてください。</div>';return;}
 const shown=arr.slice(0,state.displayLimit);$('questionList').innerHTML=shown.map(q=>{const added=state.selectedIds.includes(q.id);return `<article class="q-card" data-id="${esc(q.id)}"><div class="q-card-head"><div class="q-tags"><span class="tag book-tag">${esc(bookOf(q))}</span><span class="tag">${esc(q.topic)}</span><span class="tag level">${esc(q.level)}</span><span class="tag type">${esc(q.type)}</span></div><span class="q-source">${q.answer?'解答あり':'解答待ち'}</span></div><div class="q-provenance" title="${esc(q.source)}"><span class="q-provenance-key">出典</span><span class="q-provenance-value">${esc(sourceLabel(q))}</span></div><div class="q-main">${lines(q.text)}</div>${q.choices?`<div class="q-choices">${lines(q.choices)}</div>`:''}<div class="q-actions"><div class="q-actions-right"><button type="button" class="tiny-button" data-action="edit" data-id="${esc(q.id)}">修正</button><button type="button" data-action="toggle" data-id="${esc(q.id)}" class="primary add-button ${added?'chosen':''}">${added?'✓ 追加済み':'＋ 追加'}</button></div></div></article>`;}).join('')+(arr.length>shown.length?`<button type="button" class="outline full-width" data-action="more">さらに表示（${shown.length} / ${arr.length}問）</button>`:'');}
function selectedMarkup(){const items=selected();if(!items.length)return '<div class="empty"><strong>まだ選ばれていません</strong><span>左側から問題を追加してください。</span></div>';return items.map((q,i)=>`<div class="selected-card"><span class="sel-n">${i+1}</span><div><div class="sel-tags">${esc(bookOf(q))} · ${esc(q.topic)} · ${esc(q.level)} / ${esc(q.type)}</div><div class="sel-title">${esc(short(q.text,94))}</div><div class="sel-source" title="${esc(q.source)}">${esc(sourceLabel(q))}</div><div class="sel-order"><button type="button" class="icon-button" data-action="up" data-id="${esc(q.id)}" ${i===0?'disabled':''} aria-label="上へ移動">↑</button><button type="button" class="icon-button" data-action="down" data-id="${esc(q.id)}" ${i===items.length-1?'disabled':''} aria-label="下へ移動">↓</button></div></div><button class="sel-del" data-action="remove" data-id="${esc(q.id)}" type="button" title="取り外す" aria-label="取り外す">×</button></div>`).join('');}

/**
 * Shuffle only questions belonging to the same printed big-question type.
 * The first occurrence of each type (and therefore the order of big questions)
 * stays unchanged. Interleaved selections are supported; no new questions are added.
 */
function shuffleWithinTypes(ids, questions, rng=Math.random) {
 const byId=new Map(questions.map(q=>[q.id,q]));
 const positionsByType=new Map();
 ids.forEach((id,index)=>{
   const q=byId.get(id);
   if(!q)return;
   const type=q.type||'その他';
   if(!positionsByType.has(type))positionsByType.set(type,[]);
   positionsByType.get(type).push(index);
 });
 const result=[...ids];
 let shuffledGroups=0;
 for(const positions of positionsByType.values()){
   if(positions.length<2)continue;
   const original=positions.map(index=>result[index]);
   const mixed=[...original];
   for(let i=mixed.length-1;i>0;i--){
     const j=Math.floor(rng()*(i+1));
     [mixed[i],mixed[j]]=[mixed[j],mixed[i]];
   }
   // A shuffle button should visibly rearrange every group with 2+ questions.
   if(mixed.every((id,i)=>id===original[i]))[mixed[0],mixed[1]]=[mixed[1],mixed[0]];
   positions.forEach((position,i)=>{result[position]=mixed[i];});
   shuffledGroups++;
 }
 return {ids:result,shuffledGroups};
}
function shuffleSelectedWithinTypes(){
 const {ids,shuffledGroups}=shuffleWithinTypes(state.selectedIds,state.questions);
 if(!shuffledGroups){notice('同じ形式の問題を2問以上選ぶとシャッフルできます');return;}
 setSelected(ids);
 notice(`${shuffledGroups}大問の小問をシャッフルしました`);
}
function renderSelection(){const html=selectedMarkup();$('selectedList').innerHTML=html;$('selectedListPreview').innerHTML=html;$('goPreview').disabled=!state.selectedIds.length;$('clearSelection').disabled=!state.selectedIds.length;const canShuffle=groups().some(g=>g.items.length>1);$('shuffleWithinType').disabled=!canShuffle;$('shuffleWithinType2').disabled=!canShuffle;$('selectedCount').textContent=`${state.selectedIds.length}問`;$('selectedCount2').textContent=`${state.selectedIds.length}問`;}
function setSelected(ids){const oldCount=state.selectedIds.length;state.selectedIds=unique(ids).filter(id=>state.questions.some(q=>q.id===id));refreshList();renderSelection();updateCounters();renderLivePreview(state.selectedIds.length>oldCount);if(state.step==='preview')renderPreview();void saveDraft();}
function actionClick(action,id){if(action==='more'){state.displayLimit+=60;refreshList();return;}const ix=state.selectedIds.indexOf(id);if(action==='toggle'){if(ix<0)setSelected([...state.selectedIds,id]);else setSelected(state.selectedIds.filter(x=>x!==id));}
 if(action==='remove')setSelected(state.selectedIds.filter(x=>x!==id));
 if(action==='up'&&ix>0){const x=[...state.selectedIds];[x[ix-1],x[ix]]=[x[ix],x[ix-1]];setSelected(x);}
 if(action==='down'&&ix>=0&&ix<state.selectedIds.length-1){const x=[...state.selectedIds];[x[ix],x[ix+1]]=[x[ix+1],x[ix]];setSelected(x);}
 if(action==='edit')openEditor(id);if(action==='import')$('dataDialog').showModal();}
function syncSettings(){ $('testTitle2').value=state.title; $('paper2').value=state.paper; $('space2').value=state.space; $('space2').disabled=state.answerArea==='none'; $('answerArea2').value=state.answerArea; $('explain2').checked=state.explain; $('showSources2').checked=state.showSources; }
function updateSetting(field,value){state[field]=value;syncSettings();renderLivePreview();void saveDraft();if(state.step==='preview')renderPreview();}
function showStep(step){state.step=step;$('chooseView').classList.toggle('hidden',step!=='choose');$('previewView').classList.toggle('hidden',step!=='preview');document.querySelectorAll('.step').forEach(b=>b.classList.toggle('active',b.dataset.step===step));if(step==='preview')renderPreview();window.scrollTo(0,0);}
const asPageText=(s)=>lines(s);
// Both paper views share the exact same question grouping and answer-area logic.
function paperMarkup(answerMode=false){
 const qs=selected();
 let html=`<div class="paper-head"><h2>${esc(state.title)}</h2><div class="paper-metadata">${answerMode?'<span>解答・解説</span>':'<span>日付：______________</span><span>氏名：____________________</span>'}</div></div>`;
 groups().forEach((g,i)=>{
   html+=`<section class="paper-group"><div class="paper-group-header"><strong>【${i+1}】</strong><span>${asPageText(g.instruction||'次の問題に答えなさい。')}</span></div>`;
   g.items.forEach((q,j)=>{
     const heading=parseInstruction(q.instruction).heading;
      const specific=heading && heading!==g.instruction ? `<div class="paper-specific">個別の指示：${asPageText(heading)}</div>` : '';
      const sourceTag=state.showSources && String(q.source||'').trim() ? `<div class="paper-source">出典：${esc(sourceLabel(q))}</div>` : '';
     if(!answerMode){
       const answerBox=state.answerArea==='none' ? '' : q.type.includes('選択') ? '<div class="answer-space compact" style="border:none;text-align:right">答え（　　）</div>' : `<div class="answer-space ${esc(state.space)}"></div>`;
       html+=`<div class="paper-question"><div class="paper-qnum">(${j+1})</div><div>${specific}<div class="paper-text">${asPageText(formatQuestionText(q))}</div>${q.choices&&!q.text.includes(q.choices)?`<div class="paper-choices">${asPageText(q.choices)}</div>`:''}${sourceTag}${answerBox}</div></div>`;
     }else{
       html+=`<div class="paper-question answer-card"><div class="paper-qnum">(${j+1})</div><div><div class="paper-text answer-main">${asPageText(q.answer.trim()||'［解答未登録］')}</div>${state.explain&&q.explanation?`<div class="answer-explain">解説・訳：${asPageText(q.explanation)}</div>`:''}${sourceTag}</div></div>`;
     }
   });html+='</section>';
 });
 if(!qs.length)html+='<div class="live-empty">左側の「＋ 追加」で問題を選ぶと、ここに完成形が表示されます。</div>';
 return html;
}
function renderLivePreview(scrollToEnd=false){
 const el=$('livePaper');
 if(!el)return;
 const viewport=el.parentElement;
 const oldPosition=viewport.scrollTop;
 el.className=`paper live-paper ${state.paper.toLowerCase()}`;
 el.innerHTML=paperMarkup(false);
 $('livePreviewMeta').textContent=`${selected().length}問 / ${groups().length}大問`;
 // A new question is easiest to spot at the bottom; otherwise keep the reading position.
 viewport.scrollTop=scrollToEnd?viewport.scrollHeight:Math.min(oldPosition,viewport.scrollHeight);
}
function renderPreview(){
 const answerMode=state.documentType==='answers';
 $('tabQuestions').classList.toggle('active',!answerMode);
 $('tabAnswers').classList.toggle('active',answerMode);
 $('paperPreview').className=`paper ${state.paper.toLowerCase()}`;
 $('paperPreview').innerHTML=paperMarkup(answerMode);
 $('previewTypeSummary').textContent=`${groups().length}大問`;
 const printSize=document.getElementById('printSizeDynamic')||document.createElement('style');
 printSize.id='printSizeDynamic';
 printSize.textContent=`@media print{@page{size:${state.paper==='A4'?'A4':'letter'};margin:0.68in 0.65in}}`;
 document.head.appendChild(printSize);
}
async function importFile(file){try{const parsed=parseImport(await file.text());if(parsed.questions.length){await putQuestions(parsed.questions);state.questions=await getQuestions();refreshOptions();}
  if(parsed.draft){const d=parsed.draft;state.title=d.title||state.title;state.paper=d.paper==='A4'?'A4':'Letter';state.space=['compact','standard','wide'].includes(d.space)?d.space:'standard';state.answerArea=d.answerArea==='none'?'none':'with';state.explain=!!d.explain;state.showSources=d.showSources!==false;state.selectedIds=unique(d.selectedIds||[]).filter(id=>state.questions.some(q=>q.id===id));syncSettings();await saveDraft();}
  refreshAll();const message=`${parsed.questions.length}問を読み込みました。登録済み合計 ${state.questions.length}問。`;$('importResult').textContent=message;notice(message);
 }catch(e){$('importResult').textContent=`読み込みエラー：${e.message}`;notice(`読み込みできません：${e.message}`);}}
function saveJson(data,filename){const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json;charset=utf-8'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),4000);}
const safeFileName = s => String(s||'test').replace(/[\\/:*?"<>|]/g,'_').replace(/\s+/g,'_').slice(0,40);
function currentDraft(){return {title:state.title,paper:state.paper,space:state.space,answerArea:state.answerArea,explain:state.explain,showSources:state.showSources,selectedIds:state.selectedIds};}
function openEditor(id){const form=$('questionForm');form.reset();const q=state.questions.find(q=>q.id===id);$('editorHeading').textContent=q?'問題を編集する':'問題を登録する';for(const field of ['id','book','topic','level','type','instruction','text','choices','answer','source','explanation']){const el=form.elements.namedItem(field);if(el)el.value=field==='book'?(q?bookOf(q):'Sirius'):(q?.[field]||'');}$('editDialog').showModal();}
function refreshAll(){refreshOptions();refreshList();renderSelection();updateCounters();renderLivePreview();if(state.step==='preview')renderPreview();}
function bind(){
 ['bookFilter','levelFilter','typeFilter','searchInput'].forEach(id=>$(id).addEventListener('input',()=>{state.displayLimit=60;refreshList();}));
 $('topicOptions').addEventListener('change',ev=>{
   if(!ev.target.matches('input[type="checkbox"]'))return;
   if(ev.target.checked)selectedTopics.add(ev.target.value);else selectedTopics.delete(ev.target.value);
   updateTopicSummary();state.displayLimit=60;refreshList();
 });
 $('clearTopics').addEventListener('click',()=>{selectedTopics.clear();refreshTopicOptions();state.displayLimit=60;refreshList();});
 $('resetFilters').addEventListener('click',()=>{for(const id of ['bookFilter','levelFilter','typeFilter','searchInput'])$(id).value='';selectedTopics.clear();refreshTopicOptions();state.displayLimit=60;refreshList();});
 document.addEventListener('click',ev=>{const t=ev.target.closest('[data-action]');if(!t)return;actionClick(t.dataset.action,t.dataset.id);});
 document.querySelectorAll('[data-step]').forEach(btn=>btn.addEventListener('click',()=>{if(btn.dataset.step==='preview'&&!selected().length){notice('先に問題を選んでください');return;}showStep(btn.dataset.step);}));
 ['shuffleWithinType','shuffleWithinType2'].forEach(id=>$(id).addEventListener('click',shuffleSelectedWithinTypes));
 $('clearSelection').addEventListener('click',()=>{if(!state.selectedIds.length)return;setSelected([]);notice('前回の選択をリセットしました。問題バンクはそのままです。');});$('goPreview').addEventListener('click',()=>showStep('preview'));$('backToChoose').addEventListener('click',()=>showStep('choose'));$('backToChoose2').addEventListener('click',()=>showStep('choose'));
 $('testTitle2').addEventListener('input',ev=>updateSetting('title',ev.target.value||'英語 確認テスト'));
 $('paper2').addEventListener('change',ev=>updateSetting('paper',ev.target.value));
 $('space2').addEventListener('change',ev=>updateSetting('space',ev.target.value));
  $('answerArea2').addEventListener('change',ev=>updateSetting('answerArea',ev.target.value));
 $('explain2').addEventListener('change',ev=>updateSetting('explain',ev.target.checked));
 $('showSources2').addEventListener('change',ev=>updateSetting('showSources',ev.target.checked));
 for(const btn of document.querySelectorAll('[data-document]'))btn.addEventListener('click',()=>{state.documentType=btn.dataset.document;renderPreview();});
 for(const [id,type] of [['wordQuestions','questions'],['wordAnswers','answers']])$(id).addEventListener('click',()=>{if(!selected().length)return notice('問題を選んでください');downloadDocx({...currentDraft(),questions:selected(),documentType:type});notice((type==='answers'?'解答':'問題')+'のWordファイルを生成しました');});
 for(const [id,type] of [['printQuestions','questions'],['printAnswers','answers']])$(id).addEventListener('click',()=>{state.documentType=type;renderPreview();window.print();});
 $('openData').addEventListener('click',()=>$('dataDialog').showModal());$('importInline').addEventListener('click',()=>$('dataDialog').showModal());
 $('fileInput').addEventListener('change',async ev=>{const file=ev.target.files[0];if(file)await importFile(file);ev.target.value='';});
 $('backupBank').addEventListener('click',()=>{saveJson({schemaVersion:1,kind:'english-test-studio-bank',exportedAt:new Date().toISOString(),questions:state.questions,draft:currentDraft()},'英語テスト工房_問題バンク_バックアップ.json');notice('問題バンクを保存しました。公開リポジトリには置かないでください。');});
 $('downloadDraft').addEventListener('click',()=>{saveJson({schemaVersion:1,kind:'english-test-studio-test',exportedAt:new Date().toISOString(),...currentDraft()},`${safeFileName(state.title)}_選択内容.json`);notice('テストの選択内容を保存しました');});
 $('newQuestion').addEventListener('click',()=>openEditor());$('cancelEdit').addEventListener('click',()=>$('editDialog').close());$('cancelEdit2').addEventListener('click',()=>$('editDialog').close());
 $('questionForm').addEventListener('submit',async ev=>{ev.preventDefault();const form=ev.currentTarget,raw={};for(const key of ['id','book','topic','level','type','instruction','text','choices','answer','source','explanation'])raw[key]=form.elements.namedItem(key).value;try{const q=normalize(raw);await putQuestions([q]);state.questions=await getQuestions();refreshAll();$('editDialog').close();notice('問題を保存しました');}catch(e){notice(e.message);}});
}
async function init(){bind();try{db=await openDb();state.questions=await getQuestions();const stored=(await getDraft())?.value;if(stored){state.title=stored.title||state.title;state.paper=stored.paper==='A4'?'A4':'Letter';state.space=['compact','standard','wide'].includes(stored.space)?stored.space:'standard';state.answerArea=stored.answerArea==='none'?'none':'with';state.explain=!!stored.explain;state.showSources=stored.showSources!==false;state.selectedIds=unique(stored.selectedIds||[]).filter(id=>state.questions.some(q=>q.id===id));}syncSettings();refreshAll();}catch(err){console.error(err);$('questionList').innerHTML='<div class="empty"><strong>端末内のデータを開けません</strong><div>プライベートブラウズを解除して再度開いてください。</div></div>';notice('このブラウザでは保存領域を利用できません。通常モードで開いてください。');}}
init();