const API="https://al-mohaimeed-hr.i-moh.chatgpt.site/api";
let employees=[],departments=[],branches=[];
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const today=new Date().toISOString().slice(0,10);
const hours=m=>{const h=Math.floor(m/60),r=m%60;return r?`${h} س و${r} د`:`${h} ساعات`};

function notice(message,success=false){const el=$("#notice");el.textContent=message;el.className=`notice${success?" success":""}`;el.hidden=false;window.scrollTo({top:0,behavior:"smooth"});}
async function request(path,options){const r=await fetch(API+path,options);const j=await r.json();if(!r.ok)throw new Error(j.error||"تعذر تنفيذ العملية");return j}
async function load(){document.body.classList.add("loading");try{const [employeeData,settingData]=await Promise.all([request("/employees"),request("/settings")]);employees=employeeData.employees;departments=settingData.departments;branches=settingData.branches;render()}catch(e){notice(e.message||"تعذر الاتصال بالنظام")}finally{document.body.classList.remove("loading")}}
function render(){
  $("#employeeCount").textContent=employees.length;$("#leaveTotal").textContent=employees.reduce((n,e)=>n+e.leaveUsed,0);$("#permissionTotal").textContent=hours(employees.reduce((n,e)=>n+e.permissionUsed,0));$("#employeesLabel").textContent=`${employees.length} موظف مسجل`;
  $("#employeesRows").innerHTML=employees.map(e=>`<tr><td><b>${esc(e.name)}</b><small>${esc(e.code)}</small></td><td>${esc(e.department)}</td><td>${esc(e.branch)}</td><td><b>${e.leaveRemaining}</b> / 21 يوم</td><td><b>${hours(e.permissionRemaining)}</b> متبقي</td></tr>`).join("");$("#employeesEmpty").hidden=employees.length>0;
  const opts='<option value="">اختر الموظف</option>'+employees.map(e=>`<option value="${e.id}">${esc(e.name)} — ${esc(e.code)}</option>`).join("");$$('.employee-picker').forEach(x=>x.innerHTML=opts);
  const replacementOpts='<option value="">اختر الموظف البديل</option>'+employees.map(e=>`<option value="${e.id}">${esc(e.name)} — ${esc(e.code)}</option>`).join("");$$('.replacement-picker').forEach(x=>x.innerHTML=replacementOpts);
  $('#departmentSelect').innerHTML='<option value="">اختر الإدارة</option>'+departments.map(x=>`<option>${esc(x.name)}</option>`).join('');$('#branchSelect').innerHTML='<option value="">اختر الفرع</option>'+branches.map(x=>`<option>${esc(x.name)}</option>`).join('');
  $('#departmentList').innerHTML=settingItems(departments,'department');$('#branchList').innerHTML=settingItems(branches,'branch');
  $("#leaveBalances").innerHTML=cards("leave");$("#permissionBalances").innerHTML=cards("permission");
}
function cards(type){if(!employees.length)return '<div class="empty">أضف موظفًا لعرض الأرصدة</div>';return employees.map(e=>{const used=type==='leave'?e.leaveUsed:e.permissionUsed,max=type==='leave'?21:240,remain=type==='leave'?e.leaveRemaining:e.permissionRemaining;return `<article class="balance"><div class="balance-head"><div><b>${esc(e.name)}</b><span>${esc(e.code)} · ${esc(e.branch)}</span></div><strong>${type==='leave'?remain+' يوم':hours(remain)}</strong></div><div class="bar"><i style="width:${Math.min(100,used/max*100)}%"></i></div><div class="balance-meta"><span>المستخدم: ${type==='leave'?used+' يوم':hours(used)}</span><span>المتبقي من ${type==='leave'?'21 يوم':'4 ساعات'}</span></div></article>`}).join('')}
function esc(v){return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function settingItems(items,type){return items.map(x=>`<div><span>${esc(x.name)}</span><button class="delete-setting" type="button" data-type="${type}" data-id="${x.id}">حذف</button></div>`).join('')}
async function submit(form,path,data){try{await request(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});form.reset();$$('.today').forEach(x=>x.value=today);notice('تم الحفظ بنجاح',true);await load()}catch(e){notice(e.message||'تعذر الحفظ')}}
async function removeSetting(type,id){try{await request('/settings',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({type,id})});notice('تم الحذف بنجاح',true);await load()}catch(e){notice(e.message||'تعذر الحذف')}}

$$('.tabs button').forEach(b=>b.onclick=()=>{$$('.tabs button,.tab').forEach(x=>x.classList.remove('active'));b.classList.add('active');$('#'+b.dataset.tab).classList.add('active')});
$('#refresh').onclick=load;$$('.today').forEach(x=>x.value=today);$('#headerDate').textContent=new Intl.DateTimeFormat('ar-SA',{dateStyle:'long'}).format(new Date());
$('#employeeForm').onsubmit=e=>{e.preventDefault();const d=Object.fromEntries(new FormData(e.currentTarget));submit(e.currentTarget,'/employees',d)};
$('#leaveForm').onsubmit=e=>{e.preventDefault();const d=Object.fromEntries(new FormData(e.currentTarget));submit(e.currentTarget,'/leaves',{...d,employeeId:Number(d.employeeId),replacementEmployeeId:Number(d.replacementEmployeeId),days:Number(d.days)})};
$('#permissionForm').onsubmit=e=>{e.preventDefault();const d=Object.fromEntries(new FormData(e.currentTarget));submit(e.currentTarget,'/permissions',{employeeId:Number(d.employeeId),replacementEmployeeId:Number(d.replacementEmployeeId),minutes:Number(d.hours)*60+Number(d.minutes),permissionDate:d.permissionDate,note:d.note})};
$$('.setting-form').forEach(form=>form.onsubmit=e=>{e.preventDefault();const d=new FormData(form);submit(form,'/settings',{type:form.dataset.type,name:d.get('name')})});
document.addEventListener('click',e=>{const button=e.target.closest('.delete-setting');if(button)removeSetting(button.dataset.type,Number(button.dataset.id))});
load();
