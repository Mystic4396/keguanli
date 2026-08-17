
// 姓名清洗: 只保留中文、英文字母、数字、常见标点
function cleanName(s){return s.replace(/[^\u4e00-\u9fff\u3400-\u4dbfa-zA-Z0-9·\-\s]/g,'').trim()}
let db={},coach=null,selId=null,editId=null,confCb=null,addType='次卡',editTypeVal='次卡',advBilling='monthly',editAdvBilling='monthly';let currentMgrName='';let MANAGERS=[];
const STORE_NAMES={'henglicheng':'恒力城店','baolong':'宝龙店','taihe':'泰禾店','yangguang':'阳光天地店'};
let perfData=null,mgrPwd='',storeCoachNames=[];

function go(id){document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));document.getElementById(id).classList.add('active')}
function goLand(){go('pgLand')}


function doExportJSON(){window.location.href='/api/export?store='+currentStore}
function doExportHTML(){window.location.href='/api/export-html?store='+currentStore}


async function deletePerfRec(idx){
  if(!confirm('确定删除该业绩记录？'))return;
  perfData.perfRecords.splice(idx,1);
  try{await savePerf({perfRecords:perfData.perfRecords});toast('已删除','ok');refreshPerf()}catch(e){toast('删除失败','no')}
}


function goStoreSelect(action){
  pendingAction=action;
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.getElementById('pgStore').classList.add('active');
}
function selectStore(store){
  currentStore=store;
  document.querySelectorAll('.store-label').forEach(el=>el.textContent=STORE_NAMES[store]||store);
  // Prewarm: wake Render server while user types password
  fetch('/api/ping?store=_prewarm').catch(()=>{});
  if(pendingAction==='coach')goCoachLogin();
  else if(pendingAction==='parent')goParent();
  else if(pendingAction==='mgr')goMgrLogin();
  pendingAction='';
}

function goCoachLogin(){go('pgLogin');document.getElementById('lUser').value='';document.getElementById('lPwd').value='';fetch('/api/ping?store=_prewarm').catch(()=>{})}
function goParent(){go('pgParent');document.getElementById('pSearch').value='';['pResult','pNoRes','pMatchList'].forEach(id=>document.getElementById(id).style.display='none')}
async function goMgrLogin(){go('pgMgrLogin');document.getElementById('mPwd').value='';try{const r=await fetch('/api/managers?store='+currentStore).then(r=>r.json());const sel=document.getElementById('mgrNameSelect');sel.innerHTML=r.map(m=>'<option value="'+m.name+'">'+m.name+'</option>').join('')||'<option value="">无可用店长</option>'}catch(e){document.getElementById('mgrNameSelect').innerHTML='<option value="">加载失败</option>'}}

async function api(method,path,body){let url=path;if(method==='GET'&&currentStore)url+=(url.includes('?')?'&':'?')+'store='+currentStore;if(body&&typeof body==='object'){body={...body,store:currentStore}}const r=await fetch(url,{method,headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});if(!r.ok){const e=await r.json().catch(()=>({error:'网络错误'}));throw new Error(e.error||'操作失败')}return r.json()}

// ===== Coach system =====
async function doLogin(){const u=document.getElementById('lUser').value.trim(),p=document.getElementById('lPwd').value,b=document.querySelector('.login-box .btn');if(!u||!p){toast('请输入账号密码','wn');return}b.disabled=true;b.textContent='登录中...';try{const r=await api('POST','/api/login',{username:u,password:p});coach={...r,_pwd:p};toast('欢迎 '+r.name,'ok');enterCoach()}catch(e){toast(e.message,'no')}finally{b.disabled=false;b.textContent='登 录'}}
function doLogout(){coach=null;stopAutoSync();goLand()}
async function enterCoach(){go('pgCoach');document.getElementById('coachBadge').textContent=coach.name;await refresh();startAutoSync()}
async function loadDB(){db=await api('GET','/api/data');return db}
async function save(updates){await api('PUT','/api/data',{auth:{username:coach.username,password:coach._pwd},updates})}
function stuType(s){return s.type||'次卡'}
function isMonthly(s){return stuType(s)==='月卡'||(stuType(s)==='提高班'&&(s.billing||'monthly')==='monthly')}
function isClassCard(s){return stuType(s)==='次卡'||(stuType(s)==='提高班'&&s.billing==='class')}
function typeTag(t,billing){const sub=billing==='class'?'-课时':'-月卡';return '<span class="ttag '+(t==='月卡'?'ttag-mk':t==='提高班'?'ttag-adv':'ttag-ck')+'">'+t+(t==='提高班'?(billing||'monthly')==='monthly'?'-月卡':'-课时':'')+'</span>'}
function typeAvClass(t){return t==='月卡'?'mk':t==='提高班'?'adv':''}
function daysUntil(d){if(!d)return 9999;const t=new Date(d);t.setHours(23,59,59);return Math.ceil((t-new Date())/864e5)}
function expDisplay(s){if(!isMonthly(s)){if(s.totalClasses!=null&&s.totalClasses>0)return{html:s.classes+'/'+s.totalClasses+'节',cls:'scls'};return{html:s.classes+'节',cls:'scls'}}const d=daysUntil(s.expiry);const clsInfo=s.classes>0?'已上'+s.classes+'节 · ':'';if(d<0)return{html:clsInfo+'已过期'+Math.abs(d)+'天',cls:'sexp expired'};if(d<=7)return{html:clsInfo+'余'+d+'天',cls:'sexp soon'};return{html:clsInfo+'余'+d+'天',cls:'sexp ok'}}
function fmtExp(d){if(!d)return'未设置';const n=daysUntil(d);if(n<0)return'已过期'+Math.abs(n)+'天 ('+d+')';return d+' (余'+n+'天)'}

async function refresh(){try{await loadDB();const cks=db.students.filter(s=>stuType(s)==='次卡'),mks=db.students.filter(s=>stuType(s)==='月卡'),advs=db.students.filter(s=>stuType(s)==='提高班');document.getElementById('sCk').textContent=cks.length;document.getElementById('sMk').textContent=mks.length;document.getElementById('sAdv').textContent=advs.length;document.getElementById('t4Ck').textContent=cks.length?'('+cks.length+')':'';document.getElementById('t4Mk').textContent=mks.length?'('+mks.length+')':'';document.getElementById('t4Adv').textContent=advs.length?'('+advs.length+')':'';document.getElementById('cSearch').value='';document.getElementById('cMatchList').style.display='none';document.getElementById('selInfo').style.display='none';selId=null;renderRecs();renderStuLists()}catch(e){toast('加载失败','no');console.error(e)}
}
function cSearchStu(){const q=document.getElementById('cSearch').value.trim(),ml=document.getElementById('cMatchList');selId=null;document.getElementById('selInfo').style.display='none';if(!q){ml.style.display='none';return}const m=db.students.filter(s=>s.name.includes(q));if(!m.length){ml.style.display='block';ml.innerHTML='<div style="text-align:center;padding:10px;color:var(--g400);font-size:13px">未找到学员</div>';return}ml.style.display='block';ml.innerHTML=m.map(s=>{const ed=expDisplay(s);return '<div class="mi" onclick="pickStu(\''+s.id+'\')"><div><div class="mn">'+s.name+' '+typeTag(stuType(s),s.billing)+'</div><div class="mid">'+s.id+(s.note?' · '+s.note:'')+'</div></div><div class="mc">'+ed.html+'</div></div>'}).join('')}
function pickStu(id){const s=db.students.find(x=>x.id===id);if(!s)return;selId=id;const t=stuType(s);document.getElementById('cMatchList').style.display='none';document.getElementById('cSearch').value=s.name;document.getElementById('iName').textContent=s.name;document.getElementById('iId').textContent=s.id;document.getElementById('iType').innerHTML=typeTag(t,s.billing);document.getElementById('iNote').textContent=s.note||'无';if(isMonthly(s)){document.getElementById('iClsRow').style.display='flex';document.getElementById('iClsRow').querySelector('.il').textContent='已上课时';document.getElementById('iCls').textContent=s.classes+' 节';document.getElementById('iExpRow').style.display='flex';document.getElementById('iExp').textContent=fmtExp(s.expiry);document.getElementById('actCk').style.display='none';document.getElementById('actCk2').style.display='none';document.getElementById('actMk').style.display='flex';document.getElementById('actMk2').style.display='flex';document.getElementById('actMkFreeze').style.display='flex';document.getElementById('btnDeductMk').disabled=false;document.getElementById('btnDeductMkN').disabled=false;document.getElementById('btnRenew').disabled=false;if(s.isFrozen){document.getElementById('iFreezeRow').style.display='flex';document.getElementById('iFreeze').textContent='已冻结（'+s.frozenDays+'天）';document.getElementById('btnFreeze').textContent='恢复上课';document.getElementById('btnFreeze').style.background='var(--ok)'}else{document.getElementById('iFreezeRow').style.display='none';document.getElementById('btnFreeze').textContent='冻课';document.getElementById('btnFreeze').style.background='var(--wn)'}document.getElementById('btnDeductMk').disabled=s.isFrozen;document.getElementById('btnDeductMkN').disabled=s.isFrozen}else{document.getElementById('iClsRow').style.display='flex';document.getElementById('iClsRow').querySelector('.il').textContent='剩余课时';if(s.totalClasses!=null&&s.totalClasses>0){document.getElementById('iCls').textContent=s.classes+'/'+s.totalClasses+' 节'}else{document.getElementById('iCls').textContent=s.classes+' 节'};document.getElementById('iExpRow').style.display='none';document.getElementById('actCk').style.display='flex';document.getElementById('actCk2').style.display='flex';document.getElementById('actMk').style.display='none';document.getElementById('actMk2').style.display='none';document.getElementById('actMkFreeze').style.display='none';document.getElementById('iFreezeRow').style.display='none';document.getElementById('btnDeduct').disabled=s.classes<=0;document.getElementById('btnDeductN').disabled=s.classes<=0;document.getElementById('btnAdd').disabled=false;document.getElementById('btnAddN').disabled=false}document.getElementById('selInfo').style.display='block'}
function doDeduct(){if(!selId)return;const s=db.students.find(x=>x.id===selId);if(!s||s.classes<=0){toast('课时不足','wn');return}const tcInfo=s.totalClasses!=null&&s.totalClasses>0;showConf('确认扣课','为 <strong>'+s.name+'</strong> 扣减 1 节课？<br>剩余：'+s.classes+(tcInfo?'/'+s.totalClasses:'')+' → '+(s.classes-1)+(tcInfo?'/'+s.totalClasses:''),async()=>{try{await api('POST','/api/deduct',{auth:{username:coach.username,password:coach._pwd},studentId:selId,n:1,mode:'ck'});toast('已扣减 1 节','ok');await refresh();pickStu(selId)}catch(e){toast(e.message||'扣课失败','no')}})}
function doDeductMk(){if(!selId)return;const s=db.students.find(x=>x.id===selId);if(!s)return;showConf('确认上课','为 <strong>'+s.name+'</strong>（'+stuType(s)+'）记录上课 1 节？<br>已上：'+s.classes+' → '+(s.classes+1),async()=>{try{await api('POST','/api/deduct',{auth:{username:coach.username,password:coach._pwd},studentId:selId,n:1,mode:'mk'});toast('已记录上课 1 节','ok');await refresh();pickStu(selId)}catch(e){toast(e.message||'操作失败','no')}})}
function showDeductMkNModal(){if(!selId)return;document.getElementById('deductMkNVal').value=2;document.getElementById('moDeductMkN').classList.add('on')}
async function toggleFreeze(){if(!selId)return;const s=db.students.find(x=>x.id===selId);if(!s||!isMonthly(s))return;if(s.isFrozen){const fsd=new Date(s.frozenStartDate);const now=new Date();const elapsed=Math.round((now.getTime()-fsd.getTime())/(1000*60*60*24));showConf('恢复上课','确认恢复 <strong>'+s.name+'</strong> 的月卡？<br>冻结 '+elapsed+' 天，到期日将顺延 '+elapsed+' 天',async()=>{const ep=s.expiry.split('-');const d=new Date(parseInt(ep[0]),parseInt(ep[1])-1,parseInt(ep[2]));d.setDate(d.getDate()+elapsed);s.expiry=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');if(!s.freezeHistory)s.freezeHistory=[];s.freezeHistory.push({action:'恢复',date:nowLocal(),days:elapsed});s.isFrozen=false;s.frozenDays=0;s.frozenStartDate=null;try{await save({students:db.students});toast('已恢复','ok');await refresh();pickStu(selId)}catch(e){toast('保存失败','no')}})}else{const days=daysUntil(s.expiry);if(days<=0){toast('已过期，请先续期','wn');return}showConf('冻课','确认冻结 <strong>'+s.name+'</strong> 的月卡？<br>剩余 '+days+' 天将暂停',async()=>{if(!s.freezeHistory)s.freezeHistory=[];s.freezeHistory.push({action:'冻课',date:nowLocal(),days:days});s.isFrozen=true;s.frozenDays=days;s.frozenStartDate=nowLocal();try{await save({students:db.students});toast('已冻结','ok');await refresh();pickStu(selId)}catch(e){toast('保存失败','no')}})}}
async function doDeductMkN(){const n=parseInt(document.getElementById('deductMkNVal').value)||0;if(n<=0){toast('请输入正数','wn');return}if(!selId)return;const s=db.students.find(x=>x.id===selId);if(!s)return;clsMo('moDeductMkN');showConf('确认上课','为 <strong>'+s.name+'</strong>（'+stuType(s)+'）记录上课 '+n+' 节？<br>已上：'+s.classes+' → '+(s.classes+n),async()=>{try{await api('POST','/api/deduct',{auth:{username:coach.username,password:coach._pwd},studentId:selId,n:n,mode:'mk'});toast('已记录上课 '+n+' 节','ok');await refresh();pickStu(selId)}catch(e){toast(e.message||'操作失败','no')}})}

function doAddClass(){if(!selId)return;const s=db.students.find(x=>x.id===selId);if(!s)return;showConf('确认充值','为 <strong>'+s.name+'</strong> 充值 1 节课？<br>需管理员审核后生效',async()=>{try{await api('POST','/api/pending',{auth:{username:coach.username,password:coach._pwd},type:'charge',details:{studentId:selId,studentName:s.name,n:1}});toast('已提交审核，等待管理员确认','ok')}catch(e){toast('提交失败','no')}})}
function showAddNModal(){document.getElementById('addNVal').value=5;document.getElementById('moAddN').classList.add('on')}
function showDeductNModal(){if(!selId)return;document.getElementById('deductNVal').value=2;document.getElementById('moDeductN').classList.add('on')}
async function doAddN(){const n=parseInt(document.getElementById('addNVal').value)||0;if(n<=0){toast('请输入正数','wn');return}if(!selId)return;const s=db.students.find(x=>x.id===selId);if(!s)return;clsMo('moAddN');showConf('确认充值','为 <strong>'+s.name+'</strong> 充值 '+n+' 节课？<br>需管理员审核后生效',async()=>{try{await api('POST','/api/pending',{auth:{username:coach.username,password:coach._pwd},type:'charge',details:{studentId:selId,studentName:s.name,n:n}});toast('已提交审核，等待管理员确认','ok')}catch(e){toast('提交失败','no')}})}
async function doDeductN(){const n=parseInt(document.getElementById('deductNVal').value)||0;if(n<=0){toast('请输入正数','wn');return}if(!selId)return;const s=db.students.find(x=>x.id===selId);if(!s||s.classes<n){toast('课时不足','wn');return}clsMo('moDeductN');const tcInfo=s.totalClasses!=null&&s.totalClasses>0;showConf('确认扣课','为 <strong>'+s.name+'</strong> 扣减 '+n+' 节课？<br>剩余：'+s.classes+(tcInfo?'/'+s.totalClasses:'')+' → '+(s.classes-n)+(tcInfo?'/'+s.totalClasses:''),async()=>{try{await api('POST','/api/deduct',{auth:{username:coach.username,password:coach._pwd},studentId:selId,n:n,mode:'ck'});toast('已扣减 '+n+' 节','ok');await refresh();pickStu(selId)}catch(e){toast(e.message||'扣课失败','no')}})}
function showRenewModal(){if(!selId)return;const s=db.students.find(x=>x.id===selId);if(!s)return;document.getElementById('renewCur').textContent=fmtExp(s.expiry);let base;if(s.expiry&&daysUntil(s.expiry)>0){const parts=s.expiry.split('-');base=new Date(parseInt(parts[0]),parseInt(parts[1])-1,parseInt(parts[2]))}else{const now=new Date();base=new Date(now.getFullYear(),now.getMonth(),now.getDate())}base.setMonth(base.getMonth()+3);const y=base.getFullYear();const m=String(base.getMonth()+1).padStart(2,'0');const d=String(base.getDate()).padStart(2,'0');document.getElementById('renewNewDate').value=y+'-'+m+'-'+d;document.getElementById('moRenew').classList.add('on')}
async function doRenew(){if(!selId)return;const s=db.students.find(x=>x.id===selId);if(!s)return;const newExp=document.getElementById('renewNewDate').value;if(!newExp){toast('请选择到期日期','wn');return}if(newExp===s.expiry){toast('日期未变更','wn');return}clsMo('moRenew');showConf('确认修改到期日','为 <strong>'+s.name+'</strong> 设置到期日至 '+newExp+'？<br>需管理员审核后生效',async()=>{try{await api('POST','/api/pending',{auth:{username:coach.username,password:coach._pwd},type:'renew',details:{studentId:selId,studentName:s.name,newExpiry:newExp}});toast('已提交审核，等待管理员确认','ok')}catch(e){toast('提交失败','no')}})}
function getTodayStr(){const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
function nowLocal(){const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')+'T'+String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0')+':'+String(d.getSeconds()).padStart(2,'0')}
function renderRI(r,mode,showDate){const d=new Date(r.time),t=String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');const ds=(d.getMonth()+1)+'/'+d.getDate(),timeStr=showDate?ds+' '+t:t;const isAdd=r.type==='充',isRenew=r.type==='续';const _stu=r.sid?db.students.find(x=>x.id===r.sid):null;const _sn=_stu?_stu.name:r.sname;const _coach=r.coach||'';const _coaches=db.coaches||[];const _cMatch=_coaches.find(c=>c.name===_coach);const cn=_cMatch?_cMatch.name:_coach;if(mode==='coach'){const stu=r.sid?db.students.find(x=>x.id===r.sid):null;const isMkStu=stu&&isMonthly(stu);const act=isRenew?'修改到期日至 '+r.after:(isAdd?(r.n===0&&r.note?r.note:'充值 '+r.n+'节'):isMkStu?'上课 '+r.n+'节':'扣减 '+r.n+'节');const afterLabel=isRenew?r.after:(isMkStu?(r.n===0&&r.note?r.note:'已上'+r.after+'节'):'余'+r.after+'节');return '<div class="ri"><div class="rd" style="background:'+(isRenew?'var(--adv)':isAdd?'var(--ok)':'var(--p)')+'"></div><div class="rm"><div class="rn">'+_sn+' · '+act+'</div><div class="rmt">'+timeStr+' · <span style="color:var(--g700);font-weight:500">'+cn+'</span></div></div><div class="rb '+(isRenew?'rb-p':isAdd?'rb-ok':'rb-no')+'">'+afterLabel+'</div></div>'}const stu2=r.sid?db.students.find(x=>x.id===r.sid):null;const isMkStu2=stu2&&isMonthly(stu2);const act=isRenew?'修改到期日至 '+r.after:(isAdd?(r.n===0&&r.note?r.note:'充值 '+r.n+'节'):isMkStu2?'上课 '+r.n+'节':'上课扣减 '+r.n+'节');return '<div class="ri"><div class="rd" style="background:'+(isRenew?'var(--adv)':isAdd?'var(--ok)':'var(--p)')+'"></div><div class="rm"><div class="rn">'+act+'</div><div class="rmt">'+timeStr+' · <span style="color:var(--g700);font-weight:500">'+cn+'</span></div></div><div class="rb '+(isRenew?'rb-p':isAdd?'rb-ok':'rb-p')+'">'+(isRenew?r.after:(r.n===0&&r.note?r.after:(isMkStu2?'已上'+r.after+'节':'余'+r.after+'节')))+'</div></div>'}
function renderRecs(){const _now=new Date(),_y=_now.getFullYear(),_m=_now.getMonth(),_d=_now.getDate();const todayR=db.records.filter(r=>{if(!r.time)return false;const d=new Date(r.time);return d.getFullYear()===_y&&d.getMonth()===_m&&d.getDate()===_d}),histR=db.records.filter(r=>{if(!r.time)return false;const d=new Date(r.time);return!(d.getFullYear()===_y&&d.getMonth()===_m&&d.getDate()===_d)});const tEl=document.getElementById('cTodayRecs'),tEm=document.getElementById('cTodayEmpty');if(!todayR.length){tEl.innerHTML='';tEm.style.display='block'}else{tEm.style.display='none';tEl.innerHTML=todayR.map(r=>renderRI(r,'coach')).join('');if(todayR.length>5){tEl.style.maxHeight='300px';tEl.style.overflowY='auto';tEl.style.webkitOverflowScrolling='touch'}else{tEl.style.maxHeight='';tEl.style.overflowY=''}}const hEl=document.getElementById('cHistRecs'),hEm=document.getElementById('cHistEmpty');if(!histR.length){hEl.innerHTML='';hEm.style.display='block'}else{hEm.style.display='none';hEl.innerHTML=histR.map(r=>renderRI(r,'coach',true)).join('')}document.getElementById('histBtn').style.display=histR.length?'flex':'none';document.getElementById('cHistRecs').style.display='none'}
function toggleHist(){const el=document.getElementById('cHistRecs'),btn=document.getElementById('histBtn');if(el.style.display==='none'){el.style.display='block';btn.innerHTML='<svg viewBox="0 0 24 24" style="width:14px;height:14px;fill:currentColor"><path d="M13 3a9 9 0 0 0-9 9H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42A8.954 8.954 0 0 0 13 21a9 9 0 0 0 0-18zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8H12z"/></svg> 收起历史'}else{el.style.display='none';btn.innerHTML='<svg viewBox="0 0 24 24" style="width:14px;height:14px;fill:currentColor"><path d="M13 3a9 9 0 0 0-9 9H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42A8.954 8.954 0 0 0 13 21a9 9 0 0 0 0-18zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8H12z"/></svg> 历史记录'}}
function renderStuLists(){const cks=db.students.filter(s=>stuType(s)==='次卡').sort((a,b)=>a.classes-b.classes||a.id.localeCompare(b.id)),mks=db.students.filter(s=>stuType(s)==='月卡').sort((a,b)=>daysUntil(a.expiry)-daysUntil(b.expiry)),advs=db.students.filter(s=>stuType(s)==='提高班').sort((a,b)=>{const am=isMonthly(a),bm=isMonthly(b);if(am&&!bm)return -1;if(!am&&bm)return 1;if(am)return daysUntil(a.expiry)-daysUntil(b.expiry);return a.classes-b.classes});document.getElementById('ckList').innerHTML=renderGroup(cks);document.getElementById('mkList').innerHTML=renderGroup(mks);document.getElementById('advList').innerHTML=renderGroup(advs)}
function renderGroup(list){if(!list.length)return '<div class="empty">暂无学员</div>';if(list.length<=5)return list.map(s=>renderSli(s)).join('');const show=list.slice(0,5),rest=list.slice(5);return show.map(s=>renderSli(s)).join('')+'<button class="fb" style="width:100%;padding:8px;margin:6px 0" onclick="this.nextElementSibling.style.display=\'block\';this.outerHTML=\'\'">展开全部 ('+list.length+'人)</button><div style="display:none">'+rest.map(s=>renderSli(s)).join('')+'</div>'}
function renderSli(s){const t=stuType(s),avc=typeAvClass(t),ed=expDisplay(s);return '<div class="sli"><div class="sli-info"><div class="sav '+avc+'">'+s.name[0]+'</div><div style="min-width:0"><div class="sn">'+s.name+'</div><div class="sid">'+s.id+(s.note?' · '+s.note:'')+'</div></div></div><div style="display:flex;align-items:center;gap:8px"><span class="'+ed.cls+'">'+ed.html+'</span><div class="sact"><button class="abtn" onclick="showStuQR(\''+s.id+'\')" title="二维码"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 11h8V3H3v8zm2-6h4v4H5V5zm8-2v8h8V3h-8zm6 6h-4V5h4v4zM3 21h8v-8H3v8zm2-6h4v4H5v-4zm13-2h-2v4h-2v2h2v2h2v-2h2v-2h-2v-4zm0 6h-2v2h2v-2zm-4-2h-2v4h2v-4z"/></svg></button><button class="abtn" onclick="openEdit(\''+s.id+'\')" title="编辑"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg></button><button class="abtn dng" onclick="delStu(\''+s.id+'\')" title="删除"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg></button></div></div></div>'}
function swMainTab(tab,el){document.querySelectorAll('#mainTabs .t4').forEach(x=>x.classList.remove('on'));el.classList.add('on');document.getElementById('tabCk').style.display=tab==='ck'?'block':'none';document.getElementById('tabMk').style.display=tab==='mk'?'block':'none';document.getElementById('tabAdv').style.display=tab==='adv'?'block':'none';document.getElementById('tabAdd').style.display=tab==='add'?'block':'none';if(tab==='add'){addType='次卡';document.getElementById('nName').value='';document.getElementById('nId').value=String(db.nextId).padStart(4,'0');document.getElementById('nCls').value='20';document.getElementById('nTotalCls').value='20';document.getElementById('nExp').value='';document.getElementById('nNote').value='';selAddType('次卡',document.querySelector('#addTypeSel .type-opt'))}}
function selAddType(t,el){addType=t;advBilling='monthly';document.querySelectorAll('#addTypeSel .type-opt').forEach(o=>{o.className='type-opt'});el.classList.add(t==='月卡'?'sel-mk':t==='提高班'?'sel-adv':'sel-ck');document.getElementById('addCkFields').style.display=t==='次卡'||(t==='提高班'&&advBilling==='class')?'block':'none';document.getElementById('addMkFields').style.display=t==='月卡'?'block':'none';document.getElementById('addAdvBilling').style.display=t==='提高班'?'block':'none';if(t==='提高班')selAdvBilling('monthly',document.querySelector('#advBillingSel .type-opt'))}
function selAdvBilling(b,el){advBilling=b;document.querySelectorAll('#advBillingSel .type-opt').forEach(o=>{o.className='type-opt'});el.classList.add(b==='monthly'?'sel-mk':'sel-adv');document.getElementById('addCkFields').style.display=b==='class'?'block':'none';document.getElementById('addMkFields').style.display=b==='monthly'?'block':'none'}
function selEditType(t,el){editTypeVal=t;document.querySelectorAll('#editTypeSel .type-opt').forEach(o=>{o.className='type-opt'});el.classList.add(t==='月卡'?'sel-mk':t==='提高班'?'sel-adv':'sel-ck');document.getElementById('editAdvBilling').style.display=t==='提高班'?'block':'none';if(t!=='提高班'){document.getElementById('editCkFields').style.display=t==='次卡'?'block':'none';document.getElementById('editMkFields').style.display=t==='月卡'?'block':'none'}}
function selEditAdvBilling(b,el){editAdvBilling=b;document.querySelectorAll('#editAdvBillingSel .type-opt').forEach(o=>{o.className='type-opt'});el.classList.add(b==='monthly'?'sel-mk':'sel-adv');document.getElementById('editCkFields').style.display=b==='class'?'block':'none';document.getElementById('editMkFields').style.display=b==='monthly'?'block':'none'}
async function doAddStu(){const name=cleanName(document.getElementById('nName').value),id=document.getElementById('nId').value.trim(),note=document.getElementById('nNote').value.trim();if(!name){toast('请输入姓名','wn');return}if(!id){toast('请输入编号','wn');return}const stu={id,name,note:note||'',type:addType};if(addType==='月卡'){stu.classes=0;stu.expiry=document.getElementById('nExp').value||'';if(!stu.expiry){toast('请设置到期日期','wn');return}}else if(addType==='提高班'&&advBilling==='monthly'){stu.billing='monthly';stu.classes=0;stu.expiry=document.getElementById('nExp').value||'';if(!stu.expiry){toast('请设置到期日期','wn');return}}else if(addType==='提高班'&&advBilling==='class'){stu.billing='class';stu.classes=parseInt(document.getElementById('nCls').value)||0;const tc=parseInt(document.getElementById('nTotalCls').value);stu.totalClasses=tc>0?tc:stu.classes}else{stu.classes=parseInt(document.getElementById('nCls').value)||0;const tc=parseInt(document.getElementById('nTotalCls').value);stu.totalClasses=tc>0?tc:stu.classes;const regDate=document.getElementById('nRegDate').value;if(regDate)stu.regDate=regDate;const validMonths=parseInt(document.getElementById('nValidMonths').value)||0;if(validMonths>0){stu.validMonths=validMonths;const rp=regDate.split('-');const d=new Date(parseInt(rp[0]),parseInt(rp[1])-1,parseInt(rp[2]));d.setMonth(d.getMonth()+validMonths);stu.expiry=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}}const nid=Math.max(db.nextId,parseInt(id)+1);try{await api('POST','/api/pending',{auth:{username:coach.username,password:coach._pwd},type:'add',details:{student:stu,nextId:nid}});toast(name+' 已提交审核，等待管理员确认','ok');await refresh();db.nextId=nid;document.getElementById('nId').value=String(db.nextId).padStart(4,'0');swMainTab('ck',document.querySelector('#mainTabs .t4'))}catch(e){toast('提交失败','no')}}
function openEdit(id){const s=db.students.find(x=>x.id===id);if(!s)return;editId=id;editTypeVal=stuType(s);editAdvBilling=s.billing||(stuType(s)==='提高班'?'monthly':'class');document.getElementById('eName').value=s.name;document.getElementById('eNote').value=s.note||'';document.getElementById('eTypeDisplay').textContent=editTypeVal+(editTypeVal==='提高班'?'-'+(editAdvBilling==='monthly'?'月卡':'课时卡'):'');document.getElementById('eClsAdd').value=0;if(editTypeVal==='月卡'||(editTypeVal==='提高班'&&editAdvBilling==='monthly')){document.getElementById('eMkClsDisplay').textContent=s.classes+' 节';document.getElementById('eExpDisplay').textContent=s.expiry||'未设置';document.getElementById('eExpNew').value=s.expiry||''}else{document.getElementById('eClsDisplay').textContent=(s.totalClasses!=null&&s.totalClasses>0)?(s.classes+'/'+s.totalClasses+' 节'):(s.classes+' 节');document.getElementById('eRegDate').value=s.regDate||'';document.getElementById('eValidMonths').value=s.validMonths||''}document.getElementById('eAge').value=s.age||'';document.getElementById('eWeight').value=s.weight||'';document.getElementById('eHeight').value=s.height||'';document.getElementById('e200m').value=s.run200m||'';document.getElementById('e500m').value=s.run500m||'';document.getElementById('e1000m').value=s.run1000m||'';document.getElementById('eFitness').value=s.fitness||'';document.getElementById('eTech').value=s.tech||'';document.getElementById('eStatus').value=s.trainStatus||'';document.getElementById('editCkFields').style.display=(editTypeVal==='次卡'||(editTypeVal==='提高班'&&editAdvBilling==='class'))?'block':'none';document.getElementById('editMkFields').style.display=(editTypeVal==='月卡'||(editTypeVal==='提高班'&&editAdvBilling==='monthly'))?'block':'none';document.getElementById('editAdvFields').style.display=editTypeVal==='提高班'?'block':'none';document.getElementById('moEdit').classList.add('on')}
async function doSaveEdit(){const saveBtn=event.target;const origText=saveBtn.textContent;saveBtn.disabled=true;saveBtn.textContent='保存中…';saveBtn.style.opacity='0.6';const name=cleanName(document.getElementById('eName').value),note=document.getElementById('eNote').value.trim();if(!name){toast('姓名不能空','wn');return}const s=db.students.find(x=>x.id===editId);s.name=name;s.note=note;const isMonthlyType=editTypeVal==='月卡'||(editTypeVal==='提高班'&&editAdvBilling==='monthly');const addCls=!isMonthlyType?(parseInt(document.getElementById('eClsAdd').value)||0):0;const newExpVal=isMonthlyType?document.getElementById('eExpNew').value:'';if(editTypeVal==='提高班'){s.age=parseInt(document.getElementById('eAge').value)||undefined;s.weight=parseFloat(document.getElementById('eWeight').value)||undefined;s.height=parseFloat(document.getElementById('eHeight').value)||undefined;s.run200m=parseFloat(document.getElementById('e200m').value)||undefined;s.run500m=parseFloat(document.getElementById('e500m').value)||undefined;s.run1000m=parseFloat(document.getElementById('e1000m').value)||undefined;s.fitness=parseFloat(document.getElementById('eFitness').value)||undefined;s.tech=parseFloat(document.getElementById('eTech').value)||undefined;s.trainStatus=document.getElementById('eStatus').value.trim()||undefined;}else{s.age=undefined;s.weight=undefined;s.height=undefined;s.run200m=undefined;s.run500m=undefined;s.run1000m=undefined;s.fitness=undefined;s.tech=undefined;s.trainStatus=undefined;const newRegDate=document.getElementById('eRegDate').value;if(newRegDate)s.regDate=newRegDate;const newValidMonths=parseInt(document.getElementById('eValidMonths').value)||0;if(newValidMonths>0){s.validMonths=newValidMonths;if(newRegDate){const rp=newRegDate.split('-');const d=new Date(parseInt(rp[0]),parseInt(rp[1])-1,parseInt(rp[2]));d.setMonth(d.getMonth()+newValidMonths);s.expiry=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}}}try{await save({students:db.students});let hasFinancial=false;if(addCls>0){hasFinancial=true;await api('POST','/api/pending',{auth:{username:coach.username,password:coach._pwd},type:'charge',details:{studentId:editId,studentName:s.name,n:addCls}})}if(newExpVal&&newExpVal!==s.expiry){hasFinancial=true;await api('POST','/api/pending',{auth:{username:coach.username,password:coach._pwd},type:'renew',details:{studentId:editId,studentName:s.name,newExpiry:newExpVal}})}saveBtn.disabled=false;saveBtn.textContent=origText;saveBtn.style.opacity='1';clsMo('moEdit');toast(hasFinancial?'信息已保存，充值/续期已提交审核':'已保存','ok');await refresh()}catch(e){toast('保存失败','no');saveBtn.disabled=false;saveBtn.textContent=origText;saveBtn.style.opacity='1'}}
function delStu(id){const s=db.students.find(x=>x.id===id);if(!s)return;showConf('删除学员','确认提交删除 <strong>'+s.name+'</strong>（'+s.id+'）的申请？<br>需管理员审核后生效',async()=>{try{await api('POST','/api/pending',{auth:{username:coach.username,password:coach._pwd},type:'delete',details:{studentId:id,studentName:s.name}});toast('删除申请已提交审核','ok')}catch(e){toast('提交失败','no')}})}

// Parent
async function doPQuery(){const q=document.getElementById('pSearch').value.trim();if(!q){toast('请输入姓名','wn');return}try{await loadDB();const m=db.students.filter(s=>s.name.includes(q));document.getElementById('pResult').style.display='none';document.getElementById('pNoRes').style.display='none';document.getElementById('pMatchList').style.display='none';if(!m.length){document.getElementById('pNoRes').style.display='block';return}if(m.length===1){showPDetail(m[0])}else{document.getElementById('pMatchList').style.display='block';document.getElementById('pMatchList').innerHTML=m.map(s=>{const ed=expDisplay(s);return '<div class="mi" onclick="showPDetail(db.students.find(x=>x.id===\''+s.id+'\'))"><div><div class="mn">'+s.name+' '+typeTag(stuType(s),s.billing)+'</div><div class="mid">'+s.id+'</div></div><div class="mc">'+ed.html+'</div></div>'}).join('')}}catch(e){toast('查询失败','no')}}
function showPDetail(s){document.getElementById('pMatchList').style.display='none';document.getElementById('pNoRes').style.display='none';document.getElementById('pResult').style.display='block';parentEditId=s.id;document.getElementById('pName').textContent=s.name;document.getElementById('pId').textContent=s.id;document.getElementById('pType').textContent=stuType(s)+(stuType(s)==='提高班'?'-'+((s.billing||'monthly')==='monthly'?'月卡':'课时'):'');if(isMonthly(s)){document.getElementById('pClsRow').style.display='flex';document.getElementById('pClsRow').querySelector('.il').textContent='已上课时';document.getElementById('pCls').textContent=s.classes+' 节';document.getElementById('pExpRow').style.display='flex';document.getElementById('pExp').textContent=fmtExp(s.expiry)}else{document.getElementById('pClsRow').style.display='flex';document.getElementById('pClsRow').querySelector('.il').textContent='剩余课时';document.getElementById('pExpRow').style.display='none';if(s.totalClasses!=null&&s.totalClasses>0){document.getElementById('pCls').textContent=s.classes+'/'+s.totalClasses+' 节'}else{document.getElementById('pCls').textContent=s.classes+' 节'}}document.getElementById('pAge').textContent=s.age||'-';document.getElementById('pWeight').innerHTML=(s.weight||'-')+'<span class="ic-unit">kg</span>';document.getElementById('pHeight').innerHTML=(s.height||'-')+'<span class="ic-unit">cm</span>';document.getElementById('p200m').innerHTML=(s.run200m||'-')+'<span class="ic-unit">s</span>';document.getElementById('p500m').innerHTML=(s.run500m||'-')+'<span class="ic-unit">s</span>';document.getElementById('p1000m').innerHTML=(s.run1000m||'-')+'<span class="ic-unit">s</span>';document.getElementById('pFitness').innerHTML=(s.fitness||'-')+'<span class="ic-unit">小时</span>';document.getElementById('pTech').innerHTML=(s.tech||'-')+'<span class="ic-unit">小时</span>';document.getElementById('pStatus').textContent=s.trainStatus||'-';document.getElementById('pAdvFields').style.display=stuType(s)==='提高班'?'grid':'none';const recs=db.records.filter(r=>r.sid===s.id);const el=document.getElementById('pRecList'),em=document.getElementById('pRecEmpty');if(!recs.length){el.innerHTML='';em.style.display='block'}else{em.style.display='none';el.innerHTML=recs.map(r=>renderRI(r,'parent',true)).join('')}}


let parentEditId=null;
function showParentEditModal(){if(!parentEditId){const q=document.getElementById('pSearch').value.trim();const m=db.students.filter(s=>s.name.includes(q));if(m.length)parentEditId=m[0].id}if(!parentEditId)return;const s=db.students.find(x=>x.id===parentEditId);if(!s)return;document.getElementById('peAge').value=s.age||'';document.getElementById('peWeight').value=s.weight||'';document.getElementById('peHeight').value=s.height||'';document.getElementById('peAdvFields').style.display=stuType(s)==='提高班'?'block':'none';document.getElementById('moParentEdit').classList.add('on')}
async function doParentEditSave(){if(!parentEditId)return;const s=db.students.find(x=>x.id===parentEditId);if(!s)return;const saveBtn=event.target;const origText=saveBtn.textContent;saveBtn.disabled=true;saveBtn.textContent='保存中…';saveBtn.style.opacity='0.6';if(stuType(s)==='提高班'){s.age=parseInt(document.getElementById('peAge').value)||0||undefined;s.weight=parseFloat(document.getElementById('peWeight').value)||0||undefined;s.height=parseFloat(document.getElementById('peHeight').value)||0||undefined;}try{await save({students:db.students});saveBtn.disabled=false;saveBtn.textContent=origText;saveBtn.style.opacity='1';clsMo('moParentEdit');toast('已保存','ok');await loadDB();showPDetail(db.students.find(x=>x.id===parentEditId))}catch(e){toast('保存失败','no');saveBtn.disabled=false;saveBtn.textContent=origText;saveBtn.style.opacity='1'}}
// ===== Manager / Performance system =====
async function doMgrLogin(){const p=document.getElementById('mPwd').value;const m=document.getElementById('mgrNameSelect').value;if(!m){toast('请选择店长','wn');return}if(!p){toast('请输入密码','wn');return}const btn=document.querySelector('#pgMgrLogin .btn-p');if(btn){btn.disabled=true;btn.textContent='登录中...'}try{const r=await api('POST','/api/perf/login',{name:m,password:p});if(r.ok){mgrPwd=p;currentMgrName=m;MANAGERS=await readManagersForStore();toast('欢迎'+m,'ok');enterMgr()}}catch(e){toast(e.message,'no')}finally{if(btn){btn.disabled=false;btn.textContent='登 录'}}}
function doMgrLogout(){mgrPwd='';goLand()}
async function enterMgr(){go('pgMgr');const y=document.getElementById('mgrYear');const mo=document.getElementById('mgrMonth');const d=new Date();const cy=d.getFullYear();const cmo=d.getMonth()+1;for(let i=cy;i<=cy+2;i++){const o=document.createElement('option');o.value=i;o.textContent=i+(i===cy?' (今年)':'');y.appendChild(o)}for(let i=1;i<=12;i++){const o=document.createElement('option');o.value=i;o.textContent=i+'月';if(i===cmo)o.selected=true;mo.appendChild(o)}y.value=cy;document.getElementById('mgrBadge').textContent=currentMgrName;try{const[dataRes,perfRes]=await Promise.all([api('GET','/api/data'),api('GET','/api/perf')]);storeCoachNames=(dataRes.coaches||[]).map(c=>c.name);perfData=perfRes;migrateOldPerfData();const mc=getMC();document.getElementById('ptRate').value=mc.partTimeRate||20;document.getElementById('mFixedCost').value=mc.fixedCost||5500;document.getElementById('mShoeJunior').value=mc.shoeCostJunior||195;document.getElementById('mShoeSenior').value=mc.shoeCostSenior||750;calcAll();renderPerfList();renderCoachIncome();renderPartTime();renderProspectList()}catch(e){toast('加载失败','no');console.error(e)}}
async function loadPerf(){perfData=await api('GET','/api/perf');return perfData}
async function readManagersForStore(){try{return await fetch('/api/managers?store='+currentStore).then(r=>r.json())}catch(e){return[]}}
async function savePerf(updates){await api('PUT','/api/perf',{name:currentMgrName,password:mgrPwd,updates})}
function getMonthKey(){const y=document.getElementById('mgrYear');const m=document.getElementById('mgrMonth');if(y&&m)return y.value+'-'+String(m.value).padStart(2,'0');const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')}
function getMC(){const mk=getMonthKey();if(!perfData.monthlyConfig)perfData.monthlyConfig={};if(!perfData.monthlyConfig[mk])perfData.monthlyConfig[mk]={};return perfData.monthlyConfig[mk]}
function migrateOldPerfData(){if(!perfData.monthlyConfig&&(perfData.partTimeHours||perfData.coachBaseSalary||perfData.fixedCost||perfData.partTimeRate)){const mk=getMonthKey();perfData.monthlyConfig={};perfData.monthlyConfig[mk]={partTimeHours:perfData.partTimeHours||{},coachBaseSalary:perfData.coachBaseSalary||{},fixedCost:perfData.fixedCost||5500,partTimeRate:perfData.partTimeRate||20};delete perfData.partTimeHours;delete perfData.coachBaseSalary;delete perfData.fixedCost;delete perfData.partTimeRate}}

async function refreshPerf(){try{await loadPerf();migrateOldPerfData();const mc=getMC();document.getElementById('ptRate').value=mc.partTimeRate||20;document.getElementById('mFixedCost').value=mc.fixedCost||5500;document.getElementById('mShoeJunior').value=mc.shoeCostJunior||195;document.getElementById('mShoeSenior').value=mc.shoeCostSenior||750;calcAll();renderPerfList();renderCoachIncome();renderPartTime();renderProspectList()}catch(e){toast('加载失败','no');console.error(e)}}

function calcAll(){if(!perfData)return;const mk=getMonthKey();const mc=getMC();const monthRecs=(perfData.perfRecords||[]).filter(r=>r.date&&r.date.startsWith(mk));const rev=monthRecs.reduce((s,r)=>s+(parseFloat(r.amount)||0),0);perfData.monthlyRevenue[mk]=rev;const totalComm=monthRecs.reduce((s,r)=>s+(parseFloat(r.commission)||0),0);const shoeJr=parseFloat(document.getElementById('mShoeJunior').value)||195;const shoeSr=parseFloat(document.getElementById('mShoeSenior').value)||750;const shoeCost=monthRecs.reduce((s,r)=>{if(r.shoe==='初级')return s+shoeJr;if(r.shoe==='中级')return s+shoeSr;return s},0);mc.shoeCostJunior=shoeJr;mc.shoeCostSenior=shoeSr;;const coachBaseTotal=Object.values(mc.coachBaseSalary||{}).reduce((s,v)=>s+(parseFloat(v)||0),0);const ptRate=parseFloat(document.getElementById('ptRate').value)||20;const ptTotal=Object.values(mc.partTimeHours||{}).reduce((s,h)=>s+(parseFloat(h)||0)*ptRate,0);const fc=parseFloat(document.getElementById('mFixedCost').value)||5500;mc.fixedCost=fc;const profit=rev-fc-totalComm-shoeCost-coachBaseTotal-ptTotal;document.getElementById('mRev').textContent=rev.toFixed(0);document.getElementById('mProfit').textContent=profit.toFixed(0);clearTimeout(window._revTimer);window._revTimer=setTimeout(async()=>{try{const mc2=getMC();await savePerf({monthlyRevenue:perfData.monthlyRevenue,monthlyConfig:perfData.monthlyConfig,partTimeRate:mc2.partTimeRate||20,fixedCost:mc2.fixedCost||5500,shoeCostJunior:mc2.shoeCostJunior||195,shoeCostSenior:mc2.shoeCostSenior||750})}catch(e){}},800)}

function renderPerfList(){const mk=getMonthKey();const all=perfData.perfRecords||[];const recs=all.map((r,i)=>({r,oi:i})).sort((a,b)=>b.r.date.localeCompare(a.r.date));const el=document.getElementById('perfList'),em=document.getElementById('perfEmpty');if(!recs.length){el.innerHTML='';em.style.display='block';return}em.style.display='none';function rri(item){const r=item.r,oi=item.oi;const amt=r.amount||0;const amtColor=amt<0?'var(--no)':'var(--ok)';return'<div class="ri" style="cursor:pointer" onclick="editPerfRec('+oi+')"><div class="rd" style="background:var(--wn)"></div><div class="rm"><div class="rn">'+r.childName+' · '+r.courseType+(r.shoe!=='无'?' · '+r.shoe+'鞋':'')+'</div><div class="rmt">'+r.date+' · '+(r.coaches&&r.coaches.length>1?r.coaches.join(' & '):r.coach)+' · '+r.orderId+'</div></div><div style="text-align:right"><div style="font-size:13px;font-weight:600;color:'+amtColor+'">&yen;'+amt+'</div><div style="font-size:10px;color:var(--g400)">提成&yen;'+r.commission+'</div></div></div>'}const monthRecs=recs.filter(item=>item.r.date&&item.r.date.startsWith(mk));let html='';if(monthRecs.length){html+='<div style="font-size:12px;color:var(--g500);margin-bottom:6px">'+mk+' ('+monthRecs.length+'条)</div>';html+=monthRecs.map(item=>rri(item)).join('')}else{html+='<div style="font-size:12px;color:var(--g500);margin-bottom:6px">'+mk+' 暂无记录</div>'}el.innerHTML=html}
function renderCoachIncome(){const mk=getMonthKey();const mc=getMC();const recs=(perfData.perfRecords||[]).filter(r=>r.date&&r.date.startsWith(mk));const coaches=(perfData.customCoaches||[]);const bases=mc.coachBaseSalary||{};const profit=parseFloat(document.getElementById('mProfit').textContent)||0;let coachHtml='';coaches.forEach(name=>{if(MANAGERS.find(m=>m.name===name))return;const base=parseFloat(bases[name])||0;const comm=recs.reduce((s,r)=>{const cs=r.coaches||[r.coach];if(cs.includes(name)){const ci=cs.indexOf(name);const cms=r.commissions||[];return s+(parseFloat(cms[ci])||(ci===0?parseFloat(r.commission)||0:0));}return s},0);coachHtml+='<div class="irow"><span class="il">'+name+'</span><span class="iv">底薪<input type="number" value="'+base+'" data-coach="'+name+'" class="sal-input" style="width:56px;padding:2px 4px;border:1px solid var(--g200);border-radius:4px;font-size:12px;height:24px;margin:0 4px;text-align:center"> + 提成'+comm.toFixed(0)+' = <strong>'+(base+comm).toFixed(0)+'</strong><button onclick="removeCoach(\''+name+'\')" style="background:none;border:none;color:var(--no);font-size:14px;cursor:pointer;padding:0 2px;margin-left:4px">✕</button></span></div>'});document.getElementById('coachIncomeList').innerHTML=coachHtml||'<div class="empty">暂无教练</div>';document.getElementById('coachEditor').innerHTML='';let mgrHtml='';MANAGERS.forEach(m=>{const base=parseFloat(bases[m.name])||0;const comm=recs.reduce((s,r)=>{const cs=r.coaches||[r.coach];if(cs.includes(m.name)){const ci=cs.indexOf(m.name);const cms=r.commissions||[];return s+(parseFloat(cms[ci])||(ci===0?parseFloat(r.commission)||0:0));}return s},0);const pShare=Math.max(0,profit)*m.share;const total=base+comm+pShare;const isCurrent=m.name===currentMgrName;mgrHtml+='<div class="irow" style="'+(isCurrent?'background:var(--pb);border-radius:8px;padding:8px 10px;margin:-4px -4px 4px':'')+'"><span class="il" style="font-weight:600">'+m.name+'</span><span class="iv">底薪'+base+' + 提成'+comm.toFixed(0)+' + 利润×'+m.share+'('+pShare.toFixed(0)+') = <strong style="color:var(--p)">'+total.toFixed(0)+'</strong></span></div>'});document.getElementById('mgrIncomeList').innerHTML=mgrHtml}

async function addCoach(){const name=document.getElementById('newCoachName').value.trim();if(!name){toast('请输入名字','wn');return}const coaches=perfData.customCoaches||[];if(coaches.includes(name)){toast('已存在','wn');return}coaches.push(name);try{await savePerf({customCoaches:coaches});document.getElementById('newCoachName').value='';toast('已添加','ok');refreshPerf()}catch(e){toast('添加失败','no')}}
async function removeCoach(name){const coaches=(perfData.customCoaches||[]).filter(n=>n!==name);try{await savePerf({customCoaches:coaches,monthlyConfig:perfData.monthlyConfig});toast('已删除','ok');refreshPerf()}catch(e){toast('删除失败','no')}}
async function saveCoachSalary(){const inputs=document.querySelectorAll('.sal-input');const sal={};inputs.forEach(inp=>{sal[inp.dataset.coach]=parseFloat(inp.value)||0});const mc=getMC();mc.coachBaseSalary=sal;try{await savePerf({monthlyConfig:perfData.monthlyConfig});toast('底薪已保存','ok');refreshPerf()}catch(e){toast('保存失败','no');saveBtn.disabled=false;saveBtn.textContent=origText;saveBtn.style.opacity='1'}}

function renderPartTime(){const mc=getMC();const pts=mc.partTimeHours||{};const rate=parseFloat(document.getElementById('ptRate').value)||20;const el=document.getElementById('ptList');if(!Object.keys(pts).length){el.innerHTML='<div class="empty">暂无兼职</div>';return}let html='';for(const[name,hours] of Object.entries(pts)){const pay=(parseFloat(hours)||0)*rate;html+='<div class="irow"><span class="il">'+name+' ('+hours+'时×'+rate+')</span><span class="iv">&yen;'+pay.toFixed(0)+' <button onclick="removePartTime(\''+name+'\')" style="background:none;border:none;color:var(--no);font-size:14px;cursor:pointer;padding:0 2px">✕</button></span></div>'}el.innerHTML=html}
async function removePartTime(name){if(!confirm('删除兼职 '+name+'？'))return;const mc=getMC();if(mc.partTimeHours)delete mc.partTimeHours[name];try{await savePerf({monthlyConfig:perfData.monthlyConfig});toast('已删除','ok');refreshPerf()}catch(e){toast('删除失败','no')}}

async function addPartTime(){const name=document.getElementById('ptName').value.trim(),hours=parseFloat(document.getElementById('ptHours').value)||0;if(!name){toast('请输入姓名','wn');return}const mc=getMC();if(!mc.partTimeHours)mc.partTimeHours={};mc.partTimeHours[name]=hours;mc.partTimeRate=parseFloat(document.getElementById('ptRate').value)||20;try{await savePerf({monthlyConfig:perfData.monthlyConfig,partTimeRate:mc.partTimeRate});document.getElementById('ptName').value='';document.getElementById('ptHours').value='';toast('已添加','ok');refreshPerf()}catch(e){toast('添加失败','no')}}

function renderProspectList(){const mk=getMonthKey();if(!perfData.prospectMemos)perfData.prospectMemos={};const memos=perfData.prospectMemos[mk]||[];const el=document.getElementById("prospectList"),em=document.getElementById("prospectEmpty");if(!memos.length){el.innerHTML="";em.style.display="block";return}em.style.display="none";let html="";memos.forEach((m,i)=>{html+=`<div class="ri"><div class="rd" style="background:var(--wn)"></div><div class="rm"><div class="rn">${m.wechat}${m.age?" · "+m.age+"岁":""}</div><div class="rmt">${m.note||""}</div></div><button onclick="deleteProspect(${i})" style="background:none;border:none;color:var(--no);font-size:14px;cursor:pointer;padding:0 2px;flex-shrink:0">✕</button></div>`});el.innerHTML=html}
function showProspectModal(){document.getElementById("pWechat").value="";document.getElementById("pAge").value="";document.getElementById("pNote").value="";document.getElementById("moProspect").classList.add("on")}
async function doAddProspect(){const wechat=document.getElementById("pWechat").value.trim(),age=parseInt(document.getElementById("pAge").value)||0,note=document.getElementById("pNote").value.trim();if(!wechat){toast("请填写微信名","wn");return}const mk=getMonthKey();if(!perfData.prospectMemos)perfData.prospectMemos={};if(!perfData.prospectMemos[mk])perfData.prospectMemos[mk]=[];perfData.prospectMemos[mk].push({wechat,age,note,time:new Date().toISOString()});try{await savePerf({prospectMemos:perfData.prospectMemos});clsMo("moProspect");toast("已添加","ok");renderProspectList()}catch(e){toast("添加失败","no")}}
async function deleteProspect(idx){const mk=getMonthKey();if(!perfData.prospectMemos||!perfData.prospectMemos[mk])return;if(!confirm("删除此意向客户？"))return;perfData.prospectMemos[mk].splice(idx,1);try{await savePerf({prospectMemos:perfData.prospectMemos});toast("已删除","ok");renderProspectList()}catch(e){toast("删除失败","no")}}
function showReportModal(){window._editPerfIdx=null;const mk=getMonthKey();const [ym,mm]=mk.split('-');const today=ym+'-'+mm+'-'+new Date().getDate().toString().padStart(2,'0');const coaches=(perfData.customCoaches||[]);const mgrOpts=MANAGERS.map(m=>'<option value="'+m.name+'">'+m.name+'</option>').join('');const coachOpts='<option value="">不选</option>'+mgrOpts+coaches.map(c=>'<option value="'+c+'">'+c+'</option>').join('');document.getElementById('rptDelBtn').style.display='none';document.getElementById('rptModalBody').innerHTML='<div class="fg"><label>日期</label><input id="rptDate" type="date" value="'+today+'"></div><div class="fg"><label>订单编号</label><input id="rptOrderId" placeholder="订单编号"></div><div class="fg"><label>金额（可填负数）</label><input id="rptAmount" type="number" placeholder="金额，支持负数"></div><div class="fg"><label>课程类型</label><input id="rptCourse" placeholder="填写课程类型"></div><div class="fg"><label>搭配鞋子</label><select id="rptShoe"><option value="无">无</option><option value="初级">初级鞋</option><option value="中级">中级鞋</option></select></div><div class="fg"><label>小朋友名字</label><input id="rptChild" placeholder="小朋友名字"></div><div class="fg"><label>提成所属1</label><select id="rptCoach1">'+coachOpts+'</select></div><div class="fg"><label>提成1金额</label><input id="rptComm1" type="number" placeholder="教练1提成金额"></div><div class="fg"><label>提成所属2</label><select id="rptCoach2">'+coachOpts+'</select></div><div class="fg"><label>提成2金额</label><input id="rptComm2" type="number" placeholder="教练2提成金额（可选）"></div>';document.getElementById('moReport').classList.add('on');}
function editPerfRec(idx){const r=perfData.perfRecords[idx];if(!r)return;const today=r.date;const coaches=(perfData.customCoaches||[]);const mgrOpts=MANAGERS.map(m=>'<option value="'+m.name+'">'+m.name+'</option>').join('');const coachOpts='<option value="">不选</option>'+mgrOpts+coaches.map(c=>'<option value="'+c+'">'+c+'</option>').join('');const c1=(r.coaches&&r.coaches[0])||r.coach||'';const c2=(r.coaches&&r.coaches[1])||'';document.getElementById('rptDelBtn').style.display='none';document.getElementById('rptModalBody').innerHTML='<div class="fg"><label>日期</label><input id="rptDate" type="date" value="'+today+'"></div><div class="fg"><label>订单编号</label><input id="rptOrderId" value="'+(r.orderId||'')+'"></div><div class="fg"><label>金额（可填负数）</label><input id="rptAmount" type="number" value="'+(r.amount||'')+'"></div><div class="fg"><label>课程类型</label><input id="rptCourse" value="'+(r.courseType||'')+'"></div><div class="fg"><label>搭配鞋子</label><select id="rptShoe"><option value="无"'+(r.shoe==='无'?' selected':'')+'>无</option><option value="初级"'+(r.shoe==='初级'?' selected':'')+'>初级鞋</option><option value="中级"'+(r.shoe==='中级'?' selected':'')+'>中级鞋</option></select></div><div class="fg"><label>小朋友名字</label><input id="rptChild" value="'+(r.childName||'')+'"></div><div class="fg"><label>提成所属1</label><select id="rptCoach1">'+coachOpts+'</select></div><div class="fg"><label>提成1金额</label><input id="rptComm1" type="number"></div><div class="fg"><label>提成所属2</label><select id="rptCoach2">'+coachOpts+'</select></div><div class="fg"><label>提成2金额</label><input id="rptComm2" type="number"></div>';document.getElementById('rptCoach1').value=c1;document.getElementById('rptComm1').value=(r.commissions&&r.commissions[0])||(r.coaches&&r.coaches.length===1?r.commission:0);document.getElementById('rptCoach2').value=c2;document.getElementById('rptComm2').value=(r.commissions&&r.commissions[1])||0;window._editPerfIdx=idx;document.getElementById('rptDelBtn').style.display='block';document.getElementById('moReport').classList.add('on');}

async function doReport(){const date=document.getElementById('rptDate').value,orderId=document.getElementById('rptOrderId').value.trim(),amount=parseFloat(document.getElementById('rptAmount').value)||0,courseType=document.getElementById('rptCourse').value.trim(),shoe=document.getElementById('rptShoe').value,childName=document.getElementById('rptChild').value.trim(),coach1=document.getElementById('rptCoach1').value,coach2=document.getElementById('rptCoach2').value,comm1=parseFloat(document.getElementById('rptComm1').value)||0,comm2=coach2?parseFloat(document.getElementById('rptComm2').value)||0:0;if(!date||!orderId||!childName){toast('请填写完整信息','wn');return}if(!coach1){toast('请选择提成所属1','wn');return}const coaches=[coach1,coach2].filter(Boolean);const commission=comm1+comm2;const commissions=[comm1];if(coach2)commissions.push(comm2);toast('提交中...','wn');const rec={date,orderId,amount,courseType,shoe,childName,commission,commissions,coach:coaches[0],coaches,time:nowLocal()};if(window._editPerfIdx!==undefined&&window._editPerfIdx!==null){perfData.perfRecords[window._editPerfIdx]=rec;window._editPerfIdx=null}else{perfData.perfRecords.push(rec);}try{await savePerf({perfRecords:perfData.perfRecords});clsMo('moReport');toast('业绩已提交','ok');refreshPerf()}catch(e){toast('提交失败','no')}}

// Common utils
function toast(m,t){const c=document.getElementById('tc'),e=document.createElement('div');e.className='tst '+(t||'');e.textContent=m;c.appendChild(e);setTimeout(()=>e.remove(),2400)}
function showConf(title,body,cb){document.getElementById('confTitle').textContent=title;document.getElementById('confBody').innerHTML=body;confCb=cb;document.getElementById('moConf').classList.add('on')}
function doConf(){if(confCb)confCb();clsMo('moConf')}
function clsMo(id){document.getElementById(id).classList.remove('on');if(id==='moConf')confCb=null}

// ===== Admin Management =====
const ADMIN_PWD='123456';
let adminAuth=false,adminCoaches=[],adminEditOldUser=null;

function goAdminLogin(){go('pgAdminLogin');document.getElementById('adminPwd').value=''}
function doAdminLogin(){const p=document.getElementById('adminPwd').value;if(p!==ADMIN_PWD){toast('密码错误','no');return}adminAuth=true;const btn=document.querySelector('#pgAdminLogin .btn-p');if(btn){btn.disabled=true;btn.textContent='登录中...'}enterAdmin().finally(()=>{if(btn){btn.disabled=false;btn.textContent='登 录'}})}

async function enterAdmin(){
  go('pgAdmin');
  try{
    const [coaches,recs,mgrs,pending]=await Promise.all([
      fetch('/api/admin/coaches?pwd='+ADMIN_PWD).then(r=>r.json()),
      fetch('/api/admin/records?pwd='+ADMIN_PWD).then(r=>r.json()),
      fetch('/api/admin/managers?pwd='+ADMIN_PWD).then(r=>r.json()),
      fetch('/api/admin/pending?pwd='+ADMIN_PWD).then(r=>r.json())
    ]);
    adminCoaches=coaches;
    renderAdminCoaches(coaches);
    renderAdminMgrs(mgrs);
    renderAdminRecs(recs);
    renderAdminPending(pending);
  }catch(e){toast('加载失败','no');console.error(e)}
  startAdminAutoRefresh();
}

// 账号管理界面：每15秒自动刷新审核列表
let _adminPendingTimer=null;
function startAdminAutoRefresh(){
  if(_adminPendingTimer)return;
  _adminPendingTimer=setInterval(function(){loadAdminPending()},15000);
}
function stopAdminAutoRefresh(){
  if(_adminPendingTimer){clearInterval(_adminPendingTimer);_adminPendingTimer=null}
}
function renderAdminCoaches(coaches){
  const el=document.getElementById('adminCoachList');
  document.getElementById('adminCoachCount').textContent='('+coaches.length+'人)';
  const SN={'henglicheng':'恒力城','baolong':'宝龙','taihe':'泰禾','yangguang':'阳光天地'};
  const show=coaches.slice(0,2),hidden=coaches.slice(2);
  let h=show.map((c,i)=>'<div class="admin-item"><div class="admin-item-name">'+c.name+'</div><div class="admin-item-stores">'+(c.stores?c.stores.map(s=>SN[s]||s).join('、'):'')+'</div><div class="admin-item-info">账号: '+c.username+'</div><div class="admin-item-info">密码: '+c.password+'</div><div class="admin-item-acts"><button class="btn btn-o btn-sm" onclick="adminEditCoach('+i+')">编辑</button><button class="btn btn-no btn-sm" style="background:var(--no);color:#fff" onclick="adminDelCoach('+i+')">删除</button></div></div>').join('');
  if(hidden.length){h+='<div id="coachMore" style="display:none">'+hidden.map((c,i)=>'<div class="admin-item"><div class="admin-item-name">'+c.name+'</div><div class="admin-item-stores">'+(c.stores?c.stores.map(s=>SN[s]||s).join('、'):'')+'</div><div class="admin-item-info">账号: '+c.username+'</div><div class="admin-item-info">密码: '+c.password+'</div><div class="admin-item-acts"><button class="btn btn-o btn-sm" onclick="adminEditCoach('+(i+2)+')">编辑</button><button class="btn btn-no btn-sm" style="background:var(--no);color:#fff" onclick="adminDelCoach('+(i+2)+')">删除</button></div></div>').join('')+'</div>';h+='<button class="btn btn-o btn-sm" style="width:100%;margin-top:8px" onclick="this.previousElementSibling.style.display=\'block\';this.style.display=\'none\'">展开全部 ('+hidden.length+'人)</button>';}
  if(!coaches.length)h='<div class="empty">暂无教练</div>';
  el.innerHTML=h;
}

function getCoachStores(){const s=[];if(document.getElementById('ceS1').checked)s.push('henglicheng');if(document.getElementById('ceS2').checked)s.push('baolong');if(document.getElementById('ceS3').checked)s.push('taihe');if(document.getElementById('ceS4').checked)s.push('yangguang');return s;}

function adminShowAddCoach(){
  adminEditOldUser=null;
  document.getElementById('coachEditTitle').textContent='添加教练';
  document.getElementById('ceUser').value='';
  document.getElementById('cePwd').value='123456';
  document.getElementById('ceName').value='';
  document.getElementById('ceS1').checked=true;document.getElementById('ceS2').checked=true;document.getElementById('ceS3').checked=true;document.getElementById('ceS4').checked=true;
  document.getElementById('moCoachEdit').classList.add('on');
}

function adminEditCoach(idx){
  const c=adminCoaches[idx];if(!c)return;
  adminEditOldUser=c.username;
  document.getElementById('coachEditTitle').textContent='编辑教练';
  document.getElementById('ceUser').value=c.username;
  document.getElementById('cePwd').value=c.password;
  document.getElementById('ceName').value=c.name;
  document.getElementById('ceS1').checked=(c.stores||[]).includes('henglicheng');
  document.getElementById('ceS2').checked=(c.stores||[]).includes('baolong');
  document.getElementById('ceS3').checked=(c.stores||[]).includes('taihe');
  document.getElementById('ceS4').checked=(c.stores||[]).includes('yangguang');
  document.getElementById('moCoachEdit').classList.add('on');
}

async function adminSaveCoach(){
  const username=document.getElementById('ceUser').value.trim();
  const password=document.getElementById('cePwd').value.trim();
  const name=document.getElementById('ceName').value.trim();
  const stores=getCoachStores();
  if(!username||!password||!name){toast('请填写完整','wn');return}
  if(!stores.length){toast('请选择至少一个门店','wn');return}
  try{
    if(adminEditOldUser){
      const cr=await fetch('/api/admin/coaches',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({pwd:ADMIN_PWD,oldUsername:adminEditOldUser,username,password,name,stores})});
      if(!cr.ok){const e=await cr.json().catch(()=>({error:'更新失败'}));toast(e.error||'更新失败','no');return}
      toast('已更新','ok');loadAdminCoaches();return;
    }else{
      const cr2=await fetch('/api/admin/coaches',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({pwd:ADMIN_PWD,username,password,name,stores})});
      if(!cr2.ok){const e=await cr2.json().catch(()=>({error:'添加失败'}));toast(e.error||'添加失败','no');return}
      toast('已添加','ok');
    }
    clsMo('moCoachEdit');
    loadAdminCoaches();
  }catch(e){toast('操作失败','no')}
}

async function adminDelCoach(idx){
  const c=adminCoaches[idx];if(!c)return;
  if(!confirm('确定删除教练 '+c.name+'？'))return;
  try{
    const dr=await fetch('/api/admin/coaches?pwd='+ADMIN_PWD+'&username='+c.username,{method:'DELETE'});if(!dr.ok){toast('删除失败','no');return}
    toast('已删除','ok');loadAdminCoaches();
  }catch(e){toast('删除失败','no')}
}

let adminMgrs=[];
function renderAdminMgrs(mgrs){
  adminMgrs=mgrs;
  const el=document.getElementById('adminMgrList');
  document.getElementById('adminMgrCount').textContent='('+mgrs.length+'人)';
  const SN={'henglicheng':'恒力城','baolong':'宝龙','taihe':'泰禾','yangguang':'阳光天地'};
  const show=mgrs.slice(0,2),hidden=mgrs.slice(2);
  const renderItem=(m,i)=>{const sharesHtml=m.stores?m.stores.map(s=>SN[s]+': '+((m.shares&&m.shares[s]||m.share||0)*100)+'%').join('、'):(m.share?(m.share*100+'%'):'未设置');return '<div class="admin-item"><div class="admin-item-name">'+m.name+'</div><div class="admin-item-info">密码: '+m.password+'</div><div class="admin-item-info">分成: '+sharesHtml+'</div><div class="admin-item-acts"><button class="btn btn-o btn-sm" onclick="adminEditMgr('+i+')">编辑</button><button class="btn btn-no btn-sm" style="background:var(--no);color:#fff" onclick="adminDelMgr('+i+')">删除</button></div></div>'};
  let h=show.map((m,i)=>renderItem(m,i)).join('');
  if(hidden.length){h+='<div id="mgrMore" style="display:none">'+hidden.map((m,i)=>renderItem(m,i+2)).join('')+'</div>';h+='<button class="btn btn-o btn-sm" style="width:100%;margin-top:8px" onclick="this.previousElementSibling.style.display=\'block\';this.style.display=\'none\'">展开全部 ('+hidden.length+'人)</button>';}
  if(!mgrs.length)h='<div class="empty">暂无店长</div>';
  el.innerHTML=h;
}
function adminShowAddMgr(){
  adminEditOldMgrName=null;
  document.getElementById('mgrEditTitle').textContent='添加店长';
  document.getElementById('meName').value='';
  document.getElementById('mePwd').value='admin888';
  document.getElementById('meShare1').value='0.3';
  document.getElementById('meShare2').value='0.3';
  document.getElementById('meShare3').value='0.3';
  document.getElementById('meShare4').value='0.3';
  document.getElementById('meS1').checked=true;document.getElementById('meS2').checked=true;document.getElementById('meS3').checked=true;document.getElementById('meS4').checked=true;
  document.getElementById('moMgrEdit').classList.add('on');
}
function adminEditMgr(idx){
  const m=adminMgrs[idx];if(!m)return;
  adminEditOldMgrName=m.name;
  document.getElementById('mgrEditTitle').textContent='编辑店长';
  document.getElementById('meName').value=m.name;
  document.getElementById('mePwd').value=m.password;
  const ms=m.shares||{};
  document.getElementById('meS1').checked=m.stores.includes('henglicheng');
  document.getElementById('meShare1').value=ms.henglicheng!=null?ms.henglicheng:(m.share||'');
  document.getElementById('meS2').checked=m.stores.includes('baolong');
  document.getElementById('meShare2').value=ms.baolong!=null?ms.baolong:'';
  document.getElementById('meS3').checked=m.stores.includes('taihe');
  document.getElementById('meShare3').value=ms.taihe!=null?ms.taihe:'';
  document.getElementById('meS4').checked=m.stores.includes('yangguang');
  document.getElementById('meShare4').value=ms.yangguang!=null?ms.yangguang:'';
  document.getElementById('moMgrEdit').classList.add('on');
}
function getMgrStores(){
  const s=[];
  if(document.getElementById('meS1').checked)s.push('henglicheng');
  if(document.getElementById('meS2').checked)s.push('baolong');
  if(document.getElementById('meS3').checked)s.push('taihe');
  if(document.getElementById('meS4').checked)s.push('yangguang');
  return s;
}
async function adminSaveMgr(){
  const name=document.getElementById('meName').value.trim();
  const password=document.getElementById('mePwd').value.trim();
  const stores=getMgrStores();
  const shares={};
  if(document.getElementById('meS1').checked&&document.getElementById('meShare1').value)shares.henglicheng=parseFloat(document.getElementById('meShare1').value)||0;
  if(document.getElementById('meS2').checked&&document.getElementById('meShare2').value)shares.baolong=parseFloat(document.getElementById('meShare2').value)||0;
  if(document.getElementById('meS3').checked&&document.getElementById('meShare3').value)shares.taihe=parseFloat(document.getElementById('meShare3').value)||0;
  if(document.getElementById('meS4').checked&&document.getElementById('meShare4').value)shares.yangguang=parseFloat(document.getElementById('meShare4').value)||0;
  if(!name||!password){toast('请填写完整','wn');return}
  if(!stores.length){toast('请选择至少一个门店','wn');return}
  try{
    let resp;
    if(adminEditOldMgrName){
      resp=await fetch('/api/admin/managers',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({pwd:ADMIN_PWD,oldName:adminEditOldMgrName,name,password,shares,stores})});
    }else{
      resp=await fetch('/api/admin/managers',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({pwd:ADMIN_PWD,name,password,shares,stores})});
    }
    if(!resp.ok){const e=await resp.json().catch(()=>({error:'保存失败'}));toast(e.error||'保存失败','no');return}
    toast(adminEditOldMgrName?'已更新':'已添加','ok');clsMo('moMgrEdit');loadAdminMgrs();
  }catch(e){toast('操作失败','no')}
}
async function adminDelMgr(idx){
  const m=adminMgrs[idx];if(!m)return;
  if(!confirm('确定删除店长 '+m.name+'？'))return;
  try{
    const dr2=await fetch('/api/admin/managers?pwd='+ADMIN_PWD+'&name='+encodeURIComponent(m.name),{method:'DELETE'});if(!dr2.ok){toast('删除失败','no');return}
    toast('已删除','ok');loadAdminMgrs();
  }catch(e){toast('删除失败','no')}
}

function loadAdminCoaches(){fetch('/api/admin/coaches?pwd='+ADMIN_PWD).then(r=>r.json()).then(d=>{adminCoaches=d;renderAdminCoaches(d)}).catch(()=>toast('加载失败','no'))}
function loadAdminMgrs(){fetch('/api/admin/managers?pwd='+ADMIN_PWD).then(r=>r.json()).then(d=>{renderAdminMgrs(d)}).catch(()=>toast('加载失败','no'))}
function loadAdminPending(){fetch('/api/admin/pending?pwd='+ADMIN_PWD).then(r=>r.json()).then(d=>renderAdminPending(d)).catch(()=>toast('加载失败','no'))}
function loadAdminRecs(){fetch('/api/admin/records?pwd='+ADMIN_PWD).then(r=>r.json()).then(d=>renderAdminRecs(d)).catch(()=>toast('加载失败','no'))}

function renderAdminPending(items){
  const el=document.getElementById('adminPendingList');
  document.getElementById('adminPendingCount').textContent='('+items.length+'条)';
  if(!items.length){el.innerHTML='<div class="empty">暂无待审核</div>';return}
  const SN={'henglicheng':'恒力城','baolong':'宝龙','taihe':'泰禾','yangguang':'阳光天地'};
  el.innerHTML=items.map(p=>{
    let desc='';
    if(p.type==='charge')desc='充值 <strong>'+p.details.n+'</strong> 节';
    else if(p.type==='renew')desc='修改到期日至 <strong>'+(p.details.newExpiry||p.details.n+(p.details.unit==='天'?'天':'个月'))+'</strong>';
    else if(p.type==='delete')desc='<strong style=color:var(--no)>删除</strong> 学员';else if(p.type==='add')desc='添加学员 <strong>'+p.details.student.name+'</strong>'+(p.details.student.classes>0?'（初始'+p.details.student.classes+'节）':'');
    return '<div class="admin-item"><div class="admin-item-top"><span class="admin-item-name">'+(p.details.studentName||p.details.student.name)+'</span></div><div class="admin-item-info">'+desc+'</div><div class="admin-item-info">'+p.coach+' · '+SN[p.store]+' · '+p.time+'</div><div class="admin-item-acts"><button class="btn btn-ok btn-sm" onclick="approvePending(\''+p.id+'\')">通过</button><button class="btn btn-no btn-sm" onclick="rejectPending(\''+p.id+'\')">拒绝</button></div></div>';
  }).join('');
}
async function approvePending(id){
  const btn=event.target;const origText=btn.textContent;btn.disabled=true;btn.textContent='处理中…';btn.style.opacity='0.6';
  try{
    const r=await fetch('/api/admin/pending/'+id+'/approve',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({pwd:ADMIN_PWD})});
    if(!r.ok){const e=await r.json().catch(()=>({error:'审批失败'}));toast(e.error||'审批失败','no');btn.disabled=false;btn.textContent=origText;btn.style.opacity='1';return}
    const result=await r.json().catch(()=>({}));
    toast(result.warn||'已通过','ok');
  }catch(e){toast('审批失败','no');btn.disabled=false;btn.textContent=origText;btn.style.opacity='1';return}
  loadAdminPending();loadAdminRecs();
}
async function rejectPending(id){
  if(!confirm('确定拒绝此申请？'))return;const btn=event.target;const origText=btn.textContent;btn.disabled=true;btn.textContent='处理中…';btn.style.opacity='0.6';
  try{
    const r=await fetch('/api/admin/pending/'+id+'/reject',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({pwd:ADMIN_PWD})});
    if(!r.ok){toast('拒绝失败','no');btn.disabled=false;btn.textContent=origText;btn.style.opacity='1';return}
    toast('已拒绝','ok');
  }catch(e){toast('拒绝失败','no');btn.disabled=false;btn.textContent=origText;btn.style.opacity='1';return}
  loadAdminPending();
}

function renderAdminRecs(recs){
  const el=document.getElementById('adminRecList');
  document.getElementById('adminRecCount').textContent='('+recs.length+'条)';
  const SN={'henglicheng':'恒力城','baolong':'宝龙','taihe':'泰禾','yangguang':'阳光天地'};
  const renderItem=r=>{const isRenew=r.type==='续';return '<div class="ri"><div class="rd" style="background:'+(isRenew?'var(--adv)':'var(--ok)')+'"></div><div class="rm"><div class="rn">'+(r.sname||'')+' '+(isRenew?'修改到期日至 '+r.after:(r.n===0&&r.note?r.note:'充'+r.n+'节'))+'</div><div class="rmt">'+(r.coach||'')+' · '+(SN[r._store]||r._store||'')+' · '+(r.time||'')+'</div></div><div class="rb '+(isRenew?'rb-p':'rb-ok')+'">'+(isRenew?'续':'充')+'</div><button class="btn btn-no btn-sm" style="background:var(--no);color:#fff;margin-left:auto;padding:2px 8px;font-size:12px" onclick="adminDelRec(\''+r._store+'\',\''+r.sid+'\',\''+r.time+'\')">×</button></div>'};
  const show=recs.slice(0,5);
  const hidden=recs.slice(5);
  let h=show.map(r=>renderItem(r)).join('');
  if(hidden.length){
    h+='<div id="adminRecMore" style="display:none">'+hidden.map(r=>renderItem(r)).join('')+'</div>';
    h+='<button class="btn btn-o btn-sm" style="width:100%;margin-top:8px" onclick="this.previousElementSibling.style.display=\'block\';this.style.display=\'none\'">展开全部 ('+hidden.length+'条)</button>';
  }
  if(!recs.length)h='<div class="empty">暂无充值记录</div>';
  el.innerHTML=h;
}
async function adminDelRec(store,sid,time){
  if(!confirm('确定删除该充值记录？'))return;
  try{
    const r=await fetch('/api/admin/records?pwd='+ADMIN_PWD+'&store='+store+'&sid='+sid+'&time='+encodeURIComponent(time),{method:'DELETE'});
    if(!r.ok){const e=await r.json().catch(()=>({error:'删除失败'}));toast(e.error||'删除失败','no');return}
    toast('已删除','ok');loadAdminRecs();
  }catch(e){toast('删除失败','no')}
}


// Hash routing
const h=window.location.hash;const hParams=new URLSearchParams(h.split('?')[1]);if(hParams.get('store'))currentStore=hParams.get('store');if(h==='#coach'||h.startsWith('#coach?'))goCoachLogin();else if(h==='#parent'||h.startsWith('#parent?'))goParent();
window.addEventListener('hashchange',()=>{const h2=window.location.hash;if(h2==='#coach')goCoachLogin();else if(h2==='#parent')goParent()});

// QR & Scanner
let qrScanner=null;
function showStuQR(id){const s=db.students.find(x=>x.id===id);if(!s)return;const url=window.location.origin+'/#parent?sid='+id+'&store='+currentStore;const ct=document.getElementById('qrCanvas');ct.innerHTML='';const doQR=()=>new QRCode(ct,{text:url,width:180,height:180,colorDark:'#1F2937',colorLight:'#ffffff',correctLevel:QRCode.CorrectLevel.M});if(window.QRCode){doQR()}else{const sc=document.createElement('script');sc.src='https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';sc.onload=doQR;document.head.appendChild(sc)};document.getElementById('qrStuName').textContent=s.name;document.getElementById('qrStuId').textContent=s.id;document.getElementById('moQR').classList.add('on')}
function downloadStuQR(){const name=document.getElementById('qrStuName').textContent;const canvas=document.querySelector('#qrCanvas canvas'),img=document.querySelector('#qrCanvas img');const link=document.createElement('a');link.download=name+'_二维码.png';if(canvas)link.href=canvas.toDataURL('image/png');else if(img&&img.src)link.href=img.src;else{toast('二维码未生成','no');return}link.click()}
function closeQRMo(){clsMo('moQR')}
function openCoachScan(){document.getElementById('scanTitle').textContent='扫码识别学员';document.getElementById('moScan').classList.add('on');startScanner('qrReader',function(sid){pickStu(sid);stopScanner();clsMo('moScan');toast('已识别学员','ok')})}
function openParentScan(){document.getElementById('scanTitle').textContent='扫码查询课时';document.getElementById('moScan').classList.add('on');startScanner('qrReader',function(sid){stopScanner();clsMo('moScan');const s=db.students.find(x=>x.id===sid);if(s){showPDetail(s);toast('已识别: '+s.name,'ok')}else{toast('未找到该学员','no')}})}
function loadScanLib(cb){if(window.Html5Qrcode&&window.QRCode){cb();return}const s1=document.createElement('script');s1.src='https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';s1.onload=()=>{const s2=document.createElement('script');s2.src='https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js';s2.onload=cb;document.head.appendChild(s2)};document.head.appendChild(s1)}
function startScanner(elId,onSuccess){stopScanner();const el=document.getElementById(elId);el.innerHTML='<div style="padding:40px 0;text-align:center;color:var(--g400)"><div style="font-size:24px;margin-bottom:8px">📷</div><div>正在加载扫码组件...</div></div>';loadScanLib(()=>{el.innerHTML='<div style="padding:40px 0;text-align:center;color:var(--g400)"><div style="font-size:24px;margin-bottom:8px">📷</div><div>正在打开摄像头...</div></div>';qrScanner=new Html5Qrcode(elId);qrScanner.start({facingMode:"environment"},{fps:15,qrbox:{width:200,height:200},aspectRatio:1.0},function(text){let sid=text;try{const u=new URL(text);const m=u.hash.match(/sid=([^&]+)/);if(m)sid=m[1]}catch(e){const m=text.match(/sid=([^&]+)/);if(m)sid=m[1]}const s=db.students.find(x=>x.id===sid);if(s)onSuccess(sid);else toast('未找到学员: '+sid,'no')},function(){}).catch(function(err){toast('无法打开相机，请检查权限','no');console.error(err)})})}
function stopScanner(){if(qrScanner){try{qrScanner.stop()}catch(e){}try{qrScanner.clear()}catch(e){}qrScanner=null}}
function closeScanMo(){stopScanner();clsMo('moScan')}

(function(){const params=new URLSearchParams(window.location.hash.split('?')[1]),autoSid=params.get('sid'),autoStore=params.get('store');if(autoStore)currentStore=autoStore;if(autoSid&&window.location.hash.includes('#parent')){window.addEventListener('load',function(){setTimeout(function(){loadDB().then(function(){const s=db.students.find(x=>x.id===autoSid);if(s)showPDetail(s)})},500)})}})();
// Render保活: 浏览器开着时每5分钟静默ping
setInterval(function(){fetch('/api/ping?store=_keepalive').catch(function(){})},240000);
// 自动同步: 教练面板每30秒静默刷新数据
let _autoSync=null;
function startAutoSync(){if(_autoSync)return;_autoSync=setInterval(function(){if(coach&&currentStore)loadDB().then(function(){renderRecs();renderStuLists()}).catch(function(){})},30000)}
function stopAutoSync(){if(_autoSync){clearInterval(_autoSync);_autoSync=null}}
// 切换回页面时立刻刷新
document.addEventListener('visibilitychange',function(){if(!document.hidden&&coach&&currentStore)refresh()});
