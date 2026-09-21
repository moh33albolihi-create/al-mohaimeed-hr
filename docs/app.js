const API="https://al-mohaimeed-hr.i-moh.chatgpt.site/api";
let employees=[];
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const today=new Date().toISOString().slice(0,10);
const hours=m=>{const h=Math.floor(m/60),r=m%60;return r?`${h} س و${r} د`:`${h} ساعات`};

function notice(message,success=false){const el=$("#notice");el.textContent=message;el.className=`notice${success?" success":""}`;el.hidden=false;window.scrollTo({top:0,behavior:"smooth"});}
async function request(path,options){const r=await fetch(API+path,options);const j=await r.json();if(!r.ok)throw new Error(j.error||"تعذر تنفيذ العملية");return j}
async function load(){document.body.classList.add("loading");try{employees=(await request("/employees")).employees;render()}catch(e){notice(e.message||"تعذر الاتصال بالنظام")}finally{document.body.classList.remove("loading")}}
function render(){
  $("#employeeCount").textContent=employees.length;$("#leaveTotal").textContent=employees.reduce((n,e)=>n+e.leaveUsed,0);$("#permissionTotal").textContent=hours(employees.reduce((n,e)=>n+e.permissionUsed,0));$("#employeesLabel").textContent=`${employees.length} موظف مسجل`;
  $("#employeesRows").innerHTML=employees.map(e=>`<tr><td><b>${esc(e.name)}</b><small>${esc(e.code)}</small></td><td>${esc(e.department)}</td><td>${esc(e.branch)}</td><td><b>${e.leaveRemaining}</b> / 21 يوم</td><td><b>${hours(e.permissionRemaining)}</b> متبقي</td></tr>`).join("");$("#employeesEmpty").hidden=employees.length>0;
  const opts='<option value="">اختر الموظف</option>'+employees.map(e=>`<option value="${e.id}">${esc(e.name)} — ${esc(e.code)}</option>`).join("");$$('.employee-picker').forEach(x=>x.innerHTML=opts);
  $("#leaveBalances").innerHTML=cards("leave");$("#permissionBalances").innerHTML=cards("permission");
}
function cards(type){if(!employees.length)return '<div class="empty">أضف موظفًا لعرض الأرصدة</div>';return employees.map(e=>{const used=type==='leave'?e.leaveUsed:e.permissionUsed,max=type==='leave'?21:240,remain=type==='leave'?e.leaveRemaining:e.permissionRemaining;return `<article class="balance"><div class="balance-head"><div><b>${esc(e.name)}</b><span>${esc(e.code)} · ${esc(e.branch)}</span></div><strong>${type==='leave'?remain+' يوم':hours(remain)}</strong></div><div class="bar"><i style="width:${Math.min(100,used/max*100)}%"></i></div><div class="balance-meta"><span>المستخدم: ${type==='leave'?used+' يوم':hours(used)}</span><span>المتبقي من ${type==='leave'?'21 يوم':'4 ساعات'}</span></div></article>`}).join('')}
function esc(v){return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
async function submit(form,path,data){try{await request(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});form.reset();$$('.today').forEach(x=>x.value=today);notice('تم الحفظ بنجاح',true);await load()}catch(e){notice(e.message||'تعذر الحفظ')}}

$$('.tabs button').forEach(b=>b.onclick=()=>{$$('.tabs button,.tab').forEach(x=>x.classList.remove('active'));b.classList.add('active');$('#'+b.dataset.tab).classList.add('active')});
$('#refresh').onclick=load;$$('.today').forEach(x=>x.value=today);$('#headerDate').textContent=new Intl.DateTimeFormat('ar-SA',{dateStyle:'long'}).format(new Date());
$('#employeeForm').onsubmit=e=>{e.preventDefault();const d=Object.fromEntries(new FormData(e.currentTarget));submit(e.currentTarget,'/employees',d)};
$('#leaveForm').onsubmit=e=>{e.preventDefault();const d=Object.fromEntries(new FormData(e.currentTarget));submit(e.currentTarget,'/leaves',{...d,employeeId:Number(d.employeeId),days:Number(d.days)})};
$('#permissionForm').onsubmit=e=>{e.preventDefault();const d=Object.fromEntries(new FormData(e.currentTarget));submit(e.currentTarget,'/permissions',{employeeId:Number(d.employeeId),minutes:Number(d.hours)*60+Number(d.minutes),permissionDate:d.permissionDate,note:d.note})};
load();
