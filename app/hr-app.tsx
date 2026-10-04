"use client";

import { FormEvent, ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { Building2, CalendarDays, Clock3, LogIn, LogOut, Plus, RefreshCw, Settings, ShieldCheck, Trash2, UserRound, UsersRound } from "lucide-react";
import type { Session } from "@supabase/supabase-js";
import { supabase, isSupabaseConfigured, authLinkType, authLinkError } from "@/lib/supabase-browser";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type Profile = { id:string; email:string; role:"admin"|"employee"; employee_id:number|null };
type Option = { id:number; name:string };
type Employee = { id:number; code:string; name:string; accountEmail:string|null; departmentId:number|null; department:string; branchId:number|null; branch:string; annualLeave:number; monthlyPermission:number; leaveUsed:number; leaveRemaining:number; permissionUsed:number; permissionRemaining:number };
type LeaveRow = { id:number; employee_id:number; leave_type:string; days:number; start_date:string; substitute_employee_id:number|null; notes:string|null; status:string };
type PermissionRow = { id:number; employee_id:number; permission_date:string; hours:number; substitute_employee_id:number|null; notes:string|null };
type AdminEmail = { email:string };

const today = new Date().toISOString().slice(0,10);
const monthStart = `${today.slice(0,7)}-01`;
const nextMonth = new Date(`${monthStart}T00:00:00Z`); nextMonth.setUTCMonth(nextMonth.getUTCMonth()+1);
const nextMonthStart = nextMonth.toISOString().slice(0,10);

function relationName(value:unknown){
  if(Array.isArray(value)) return String((value[0] as {name?:string}|undefined)?.name ?? "");
  return String((value as {name?:string}|null)?.name ?? "");
}
function hours(value:number){ const h=Math.floor(value), m=Math.round((value-h)*60); return m?`${h} س و${m} د`:`${h} ساعات`; }
function Field({label,children}:{label:string;children:ReactNode}){ return <label className="field"><span>{label}</span>{children}</label>; }

export default function HRApp(){
  const [session,setSession]=useState<Session|null>(null);
  const [profile,setProfile]=useState<Profile|null>(null);
  const [loading,setLoading]=useState(true);
  const [message,setMessage]=useState("");
  const [settingPassword,setSettingPassword]=useState(false);
  const [authNotice,setAuthNotice]=useState("");

  const resolveProfile=useCallback(async(current:Session|null)=>{
    setSession(current); setMessage("");
    if(!current){ setProfile(null); setLoading(false); return; }
    const {data,error}=await supabase.from("profiles").select("id,email,role,employee_id").eq("id",current.user.id).maybeSingle();
    if(error) setMessage(error.message);
    setProfile((data as Profile|null) ?? null); setLoading(false);
  },[]);

  useEffect(()=>{
    if(!isSupabaseConfigured){ setLoading(false); return; }
    let active=true;
    const linkParams=new URLSearchParams(window.location.hash.slice(1));
    const queryParams=new URLSearchParams(window.location.search);
    const linkFailed=authLinkError||linkParams.has("error")||queryParams.has("error");
    const passwordLink=authLinkType==="invite"||authLinkType==="recovery"||queryParams.get("mode")==="set-password";
    if(linkFailed){
      setAuthNotice("رابط الإيميل غير صالح أو انتهت صلاحيته. اضغط «تعيين أو استعادة كلمة المرور» لطلب رابط جديد.");
      sessionStorage.removeItem("hr-password-pending");
      window.history.replaceState(null,"",window.location.pathname);
    }else if(passwordLink){
      sessionStorage.setItem("hr-password-pending","true");
      setSettingPassword(true);
    }else{
      setSettingPassword(sessionStorage.getItem("hr-password-pending")==="true");
    }
    // Auth callbacks must return before making another Supabase request.
    const {data}=supabase.auth.onAuthStateChange((event,next)=>{
      if(event==="PASSWORD_RECOVERY"){
        sessionStorage.setItem("hr-password-pending","true");
        setSettingPassword(true);
      }
      setTimeout(()=>{if(active) void resolveProfile(next)},0);
    });
    void supabase.auth.getSession().then(({data,error})=>{
      if(!active)return;
      if(error||(!data.session&&passwordLink&&!linkFailed)){
        setAuthNotice("تعذر تفعيل الرابط. اطلب رابطًا جديدًا من «تعيين أو استعادة كلمة المرور».");
        setSettingPassword(false);
        sessionStorage.removeItem("hr-password-pending");
      }
      void resolveProfile(data.session);
    });
    return()=>{active=false;data.subscription.unsubscribe()};
  },[resolveProfile]);

  if(!isSupabaseConfigured) return <StatusCard title="الموقع بانتظار الربط" text="لم تُضف إعدادات قاعدة البيانات إلى الاستضافة بعد."/>;
  if(loading) return <StatusCard title="جاري تحميل النظام…" text="لحظات ونجهز بيانات حسابك." spin/>;
  if(!session) return <AuthScreen initialNotice={authNotice}/>;
  if(settingPassword) return <SetPasswordScreen onComplete={()=>{
    sessionStorage.removeItem("hr-password-pending");
    window.history.replaceState(null,"",window.location.pathname);
    setSettingPassword(false);
    void resolveProfile(session);
  }}/>;
  if(!profile) return <StatusCard title="الحساب غير مرتبط بالنظام" text="أضف بريدك في بيانات الموظف أو قائمة المدراء، ثم سجّل الدخول من جديد." action={<Button onClick={()=>supabase.auth.signOut()}>الدخول بحساب آخر</Button>}/>;
  if(profile.role==="admin") return <AdminDashboard profile={profile}/>;
  return <EmployeeDashboard profile={profile}/>;
}

function AuthScreen({initialNotice=""}:{initialNotice?:string}){
  const [busy,setBusy]=useState(false); const [notice,setNotice]=useState(initialNotice);
  const [recovering,setRecovering]=useState(false);
  async function submit(e:FormEvent<HTMLFormElement>){
    e.preventDefault(); setBusy(true); setNotice(""); const d=new FormData(e.currentTarget); const email=String(d.get("email")||"").trim(); const password=String(d.get("password")||"");
    try{
      if(recovering){
        const {error}=await supabase.auth.resetPasswordForEmail(email,{redirectTo:`${window.location.origin}/?mode=set-password`});
        setNotice(error?"تعذر إرسال الرابط الآن. حاول لاحقًا أو تواصل مع مدير النظام.":"إذا كان البريد مرتبطًا بحساب، سيصلك رابط تعيين كلمة المرور. افتح أحدث رسالة واستخدم الرابط مرة واحدة.");
      }else{
        const result=await supabase.auth.signInWithPassword({email,password});
        if(result.error) setNotice("تعذر تسجيل الدخول. تأكد من البريد وكلمة المرور أو تواصل مع مدير النظام.");
      }
    }catch{setNotice("تعذر الاتصال. تحقق من الإنترنت وحاول مرة أخرى.")}
    finally{setBusy(false)}
  }
  return <main className="access-page auth-bg"><section className="access-card login-card"><div className="brand-mark login-mark">م</div><h1>مجموعة المحيميد القابضة</h1><p>{recovering?"أدخل بريد حسابك ليصلك رابط تعيين كلمة المرور.":"سجّل الدخول للوصول إلى نظام الموظفين."}</p>{notice&&<div className="notice" role="status">{notice}</div>}<form onSubmit={submit}><Field label="البريد الإلكتروني"><Input name="email" type="email" required autoComplete="email"/></Field>{!recovering&&<Field label="كلمة المرور"><Input name="password" type="password" minLength={8} required autoComplete="current-password"/></Field>}<Button className="submit" disabled={busy} type="submit"><LogIn/>{busy?"جاري التحقق…":recovering?"إرسال رابط تعيين كلمة المرور":"تسجيل الدخول"}</Button></form><Button type="button" variant="ghost" disabled={busy} onClick={()=>{setRecovering(!recovering);setNotice("")}}>{recovering?"العودة لتسجيل الدخول":"تعيين أو استعادة كلمة المرور"}</Button><small>الحسابات تُنشأ من إدارة النظام فقط.</small></section></main>;
}

function SetPasswordScreen({onComplete}:{onComplete:()=>void}){
  const [busy,setBusy]=useState(false);const [notice,setNotice]=useState("");
  async function submit(e:FormEvent<HTMLFormElement>){
    e.preventDefault();const form=new FormData(e.currentTarget),password=String(form.get("password")||"");
    if(password.length<8){setNotice("استخدم كلمة مرور من 8 أحرف على الأقل.");return;}
    if(password!==form.get("confirmPassword")){setNotice("كلمتا المرور غير متطابقتين.");return;}
    setBusy(true);setNotice("");
    try{
      const {error}=await supabase.auth.updateUser({password});
      if(error){setNotice("تعذر حفظ كلمة المرور. قد يكون الرابط انتهى؛ اطلب رابطًا جديدًا أو جرّب كلمة مرور أقوى.");return;}
      onComplete();
    }catch{setNotice("تعذر الاتصال. حاول مرة أخرى.")}
    finally{setBusy(false)}
  }
  return <main className="access-page auth-bg"><section className="access-card login-card"><div className="brand-mark login-mark">م</div><h1>تعيين كلمة المرور</h1><p>اختر كلمة مرور لحسابك في نظام مجموعة المحيميد القابضة.</p>{notice&&<div className="notice" role="status">{notice}</div>}<form onSubmit={submit}><Field label="كلمة المرور الجديدة"><Input name="password" type="password" required minLength={8} autoComplete="new-password"/></Field><Field label="تأكيد كلمة المرور"><Input name="confirmPassword" type="password" required minLength={8} autoComplete="new-password"/></Field><Button className="submit" disabled={busy} type="submit">{busy?"جاري الحفظ…":"حفظ كلمة المرور والدخول"}</Button></form><Button type="button" variant="ghost" disabled={busy} onClick={()=>{sessionStorage.removeItem("hr-password-pending");window.history.replaceState(null,"",window.location.pathname);void supabase.auth.signOut()}}>العودة لتسجيل الدخول</Button></section></main>;
}

function StatusCard({title,text,spin,action}:{title:string;text:string;spin?:boolean;action?:ReactNode}){return <main className="access-page"><section className="access-card"><UserRound className={spin?"spin":""}/><h1>{title}</h1><p>{text}</p>{action}</section></main>}

function AdminDashboard({profile}:{profile:Profile}){
  const [employees,setEmployees]=useState<Employee[]>([]); const [departments,setDepartments]=useState<Option[]>([]); const [branches,setBranches]=useState<Option[]>([]); const [leaves,setLeaves]=useState<LeaveRow[]>([]); const [permissions,setPermissions]=useState<PermissionRow[]>([]); const [admins,setAdmins]=useState<AdminEmail[]>([]); const [loading,setLoading]=useState(true); const [notice,setNotice]=useState("");
  const load=useCallback(async()=>{
    setLoading(true); setNotice("");
    const [er,dr,br,lr,pr,ar]=await Promise.all([
      supabase.from("employees").select("id,code,name,account_email,annual_leave_days,monthly_permission_hours,department_id,branch_id,department:departments(name),branch:branches(name)").order("code"),
      supabase.from("departments").select("id,name").order("name"), supabase.from("branches").select("id,name").order("name"),
      supabase.from("leave_requests").select("id,employee_id,leave_type,days,start_date,substitute_employee_id,notes,status").order("start_date",{ascending:false}),
      supabase.from("permissions").select("id,employee_id,permission_date,hours,substitute_employee_id,notes").gte("permission_date",monthStart).lt("permission_date",nextMonthStart).order("permission_date",{ascending:false}),
      supabase.from("admin_emails").select("email").order("email")
    ]);
    const error=er.error||dr.error||br.error||lr.error||pr.error||ar.error; if(error){setNotice(error.message);setLoading(false);return;}
    const leaveRows=(lr.data??[]) as LeaveRow[]; const permissionRows=(pr.data??[]) as PermissionRow[];
    const normalized=(er.data??[]).map((row:Record<string,unknown>)=>{ const id=Number(row.id); const annual=Number(row.annual_leave_days); const monthly=Number(row.monthly_permission_hours); const leaveUsed=leaveRows.filter(x=>x.employee_id===id&&x.status==="approved").reduce((n,x)=>n+Number(x.days),0); const permissionUsed=permissionRows.filter(x=>x.employee_id===id).reduce((n,x)=>n+Number(x.hours),0); return {id,code:String(row.code),name:String(row.name),accountEmail:row.account_email?String(row.account_email):null,departmentId:row.department_id?Number(row.department_id):null,branchId:row.branch_id?Number(row.branch_id):null,department:relationName(row.department),branch:relationName(row.branch),annualLeave:annual,monthlyPermission:monthly,leaveUsed,leaveRemaining:Math.max(0,annual-leaveUsed),permissionUsed,permissionRemaining:Math.max(0,monthly-permissionUsed)}; });
    setEmployees(normalized); setDepartments((dr.data??[]) as Option[]); setBranches((br.data??[]) as Option[]); setLeaves(leaveRows); setPermissions(permissionRows); setAdmins((ar.data??[]) as AdminEmail[]); setLoading(false);
  },[]);
  useEffect(()=>{void load()},[load]);
  const totals=useMemo(()=>({leave:employees.reduce((n,e)=>n+e.leaveUsed,0),permission:employees.reduce((n,e)=>n+e.permissionUsed,0)}),[employees]);
  async function mutate(action:()=>PromiseLike<{error:{message:string}|null}>,success:string,form?:HTMLFormElement){setNotice("");const {error}=await action();if(error){setNotice(error.message);return;}form?.reset();setNotice(success);await load();}
  async function addEmployee(e:FormEvent<HTMLFormElement>){e.preventDefault();const f=e.currentTarget,d=new FormData(f);await mutate(()=>supabase.from("employees").insert({code:d.get("code"),name:d.get("name"),account_email:String(d.get("accountEmail")||"").trim().toLowerCase()||null,department_id:Number(d.get("departmentId")),branch_id:Number(d.get("branchId"))}).then(x=>({error:x.error})),"تمت إضافة الموظف",f)}
  async function addLeave(e:FormEvent<HTMLFormElement>){e.preventDefault();const f=e.currentTarget,d=new FormData(f),days=Number(d.get("days")),start=String(d.get("startDate"));const end=new Date(`${start}T00:00:00Z`);end.setUTCDate(end.getUTCDate()+Math.max(0,Math.ceil(days)-1));await mutate(()=>supabase.from("leave_requests").insert({employee_id:Number(d.get("employeeId")),substitute_employee_id:Number(d.get("substituteEmployeeId")),leave_type:d.get("leaveType"),days,start_date:start,end_date:end.toISOString().slice(0,10),notes:String(d.get("notes")||"")||null,status:"approved"}).then(x=>({error:x.error})),"تم تسجيل الإجازة",f)}
  async function addPermission(e:FormEvent<HTMLFormElement>){e.preventDefault();const f=e.currentTarget,d=new FormData(f),duration=Number(d.get("hours"))+Number(d.get("minutes"))/60;await mutate(()=>supabase.from("permissions").insert({employee_id:Number(d.get("employeeId")),substitute_employee_id:Number(d.get("substituteEmployeeId")),permission_date:d.get("permissionDate"),hours:duration,notes:String(d.get("notes")||"")||null}).then(x=>({error:x.error})),"تم تسجيل الاستئذان",f)}
  async function addSetting(table:"departments"|"branches",e:FormEvent<HTMLFormElement>){e.preventDefault();const f=e.currentTarget,d=new FormData(f);await mutate(()=>supabase.from(table).insert({name:d.get("name")}).then(x=>({error:x.error})),"تمت الإضافة",f)}
  async function removeSetting(table:"departments"|"branches",id:number){await mutate(()=>supabase.from(table).delete().eq("id",id).then(x=>({error:x.error})),"تم الحذف")}
  async function saveEmail(id:number,email:string){await mutate(()=>supabase.from("employees").update({account_email:email.trim().toLowerCase()||null}).eq("id",id).then(x=>({error:x.error})),"تم ربط حساب الموظف")}
  async function addAdmin(e:FormEvent<HTMLFormElement>){e.preventDefault();const f=e.currentTarget,d=new FormData(f);await mutate(()=>supabase.from("admin_emails").insert({email:String(d.get("email")||"").trim().toLowerCase()}).then(x=>({error:x.error})),"تمت إضافة بريد المدير",f)}
  return <main className="min-h-screen bg-[#f3f6f4] text-[#14231f]"><Header subtitle="نظام إدارة الموظفين" email={profile.email}/><div className="workspace"><section className="welcome"><div><h1>الموظفون والأرصدة</h1><p>إدارة الإجازات السنوية والاستئذانات الشهرية من مكان واحد.</p></div><Button variant="outline" onClick={()=>void load()}><RefreshCw/>تحديث</Button></section>{notice&&<div className={notice.startsWith("تم")?"notice success":"notice"}>{notice}</div>}<section className="stats"><Stat icon={<UsersRound/>} label="إجمالي الموظفين" value={String(employees.length)}/><Stat icon={<CalendarDays/>} label="أيام الإجازات المستخدمة" value={String(totals.leave)} kind="gold"/><Stat icon={<Clock3/>} label="الاستئذان هذا الشهر" value={hours(totals.permission)} kind="blue"/></section><Tabs defaultValue="employees" className="panel"><TabsList className="tabs" variant="line"><TabsTrigger value="employees"><UsersRound/>الموظفون</TabsTrigger><TabsTrigger value="leaves"><CalendarDays/>الإجازات</TabsTrigger><TabsTrigger value="permissions"><Clock3/>الاستئذان</TabsTrigger><TabsTrigger value="settings"><Settings/>الإعدادات</TabsTrigger></TabsList>
  <TabsContent value="employees" className="content-grid"><FormCard title="إضافة موظف" icon={<Plus/>}><form onSubmit={addEmployee}><Field label="كود الموظف"><Input name="code" required/></Field><Field label="اسم الموظف"><Input name="name" required/></Field><Field label="بريد الدخول (اختياري)"><Input name="accountEmail" type="email"/></Field><OptionPicker name="departmentId" label="الإدارة" items={departments}/><OptionPicker name="branchId" label="الفرع" items={branches}/><Button className="submit" type="submit"><Plus/>إضافة الموظف</Button></form></FormCard><EmployeeTable employees={employees} loading={loading} saveEmail={saveEmail}/></TabsContent>
  <TabsContent value="leaves" className="content-grid"><FormCard title="تسجيل إجازة" icon={<CalendarDays/>}><form onSubmit={addLeave}><EmployeePicker employees={employees}/><EmployeePicker employees={employees} substitute/><Field label="نوع الإجازة"><NativeSelect name="leaveType"><NativeSelectOption value="عادية">إجازة عادية</NativeSelectOption><NativeSelectOption value="طارئة">إجازة طارئة</NativeSelectOption></NativeSelect></Field><Field label="عدد الأيام"><Input name="days" type="number" min="0.5" max="21" step="0.5" required/></Field><Field label="تاريخ البداية"><Input name="startDate" type="date" defaultValue={today} required/></Field><Field label="ملاحظة"><Input name="notes"/></Field><Button className="submit">تسجيل الإجازة</Button></form></FormCard><BalanceCards employees={employees} type="leave"/></TabsContent>
  <TabsContent value="permissions" className="content-grid"><FormCard title="تسجيل استئذان" icon={<Clock3/>}><form onSubmit={addPermission}><EmployeePicker employees={employees}/><EmployeePicker employees={employees} substitute/><div className="split"><Field label="الساعات"><Input name="hours" type="number" min="0" max="4" defaultValue="1" required/></Field><Field label="الدقائق"><Input name="minutes" type="number" min="0" max="59" defaultValue="0" required/></Field></div><Field label="التاريخ"><Input name="permissionDate" type="date" defaultValue={today} required/></Field><Field label="ملاحظة"><Input name="notes"/></Field><Button className="submit">تسجيل الاستئذان</Button></form></FormCard><BalanceCards employees={employees} type="permission"/></TabsContent>
  <TabsContent value="settings" className="settings-grid"><SettingCard title="الإدارات" items={departments} onSubmit={e=>addSetting("departments",e)} onDelete={id=>removeSetting("departments",id)}/><SettingCard title="الفروع" items={branches} onSubmit={e=>addSetting("branches",e)} onDelete={id=>removeSetting("branches",id)}/><section className="settings-card admin-manager"><div className="section-title"><ShieldCheck/><div><h2>مدراء النظام</h2><p>أضف البريد قبل إنشاء حساب المدير.</p></div></div><form className="setting-form" onSubmit={addAdmin}><Input name="email" type="email" required placeholder="manager@example.com"/><Button><Plus/>إضافة مدير</Button></form><div className="setting-list">{admins.map(x=><div key={x.email}><span>{x.email}</span></div>)}</div></section></TabsContent></Tabs><Footer/></div></main>;
}

function EmployeeDashboard({profile}:{profile:Profile}){
  const [employee,setEmployee]=useState<Employee|null>(null); const [leaves,setLeaves]=useState<LeaveRow[]>([]); const [permissions,setPermissions]=useState<PermissionRow[]>([]); const [names,setNames]=useState<Record<number,string>>({}); const [loading,setLoading]=useState(true); const [error,setError]=useState("");
  const load=useCallback(async()=>{setLoading(true);const [er,lr,pr]=await Promise.all([supabase.from("employees").select("id,code,name,account_email,annual_leave_days,monthly_permission_hours,department_id,branch_id,department:departments(name),branch:branches(name)"),supabase.from("leave_requests").select("id,employee_id,leave_type,days,start_date,substitute_employee_id,notes,status").order("start_date",{ascending:false}),supabase.from("permissions").select("id,employee_id,permission_date,hours,substitute_employee_id,notes").order("permission_date",{ascending:false})]);const err=er.error||lr.error||pr.error;if(err){setError(err.message);setLoading(false);return;}const row=(er.data??[])[0] as Record<string,unknown>|undefined;const leaveRows=(lr.data??[]) as LeaveRow[],permissionRows=(pr.data??[]) as PermissionRow[];if(!row){setError("لم يتم ربط الحساب بموظف.");setLoading(false);return;}const id=Number(row.id),annual=Number(row.annual_leave_days),monthly=Number(row.monthly_permission_hours),leaveUsed=leaveRows.filter(x=>x.status==="approved").reduce((n,x)=>n+Number(x.days),0),permissionUsed=permissionRows.filter(x=>x.permission_date>=monthStart&&x.permission_date<nextMonthStart).reduce((n,x)=>n+Number(x.hours),0);setEmployee({id,code:String(row.code),name:String(row.name),accountEmail:row.account_email?String(row.account_email):null,departmentId:row.department_id?Number(row.department_id):null,branchId:row.branch_id?Number(row.branch_id):null,department:relationName(row.department),branch:relationName(row.branch),annualLeave:annual,monthlyPermission:monthly,leaveUsed,leaveRemaining:Math.max(0,annual-leaveUsed),permissionUsed,permissionRemaining:Math.max(0,monthly-permissionUsed)});setLeaves(leaveRows);setPermissions(permissionRows);const ids=[...new Set([...leaveRows.map(x=>x.substitute_employee_id),...permissionRows.map(x=>x.substitute_employee_id)].filter(Boolean))] as number[];if(ids.length){const {data}=await supabase.from("employees").select("id,name").in("id",ids);setNames(Object.fromEntries((data??[]).map(x=>[x.id,x.name])));}setLoading(false)},[]);
  useEffect(()=>{void load()},[load]); if(loading)return <StatusCard title="جاري تحميل بياناتك…" text="لحظات فقط." spin/>;if(error||!employee)return <StatusCard title="تعذر عرض بيانات الموظف" text={`${error||"الحساب غير مرتبط."} الحساب الحالي: ${profile.email}`} action={<><Button onClick={()=>void supabase.auth.signOut()}>الدخول بحساب آخر</Button><Button variant="outline" onClick={()=>{setError("");void load()}}>إعادة المحاولة</Button></>}/>;
  return <main className="min-h-screen bg-[#f3f6f4] text-[#14231f]"><Header subtitle="بوابة الموظف" email={profile.email}/><div className="workspace employee-workspace"><section className="employee-hero"><div><span>مرحبًا بك</span><h1>{employee.name}</h1><p>{employee.code} · {employee.department} · {employee.branch}</p></div><Button variant="outline" onClick={()=>void load()}><RefreshCw/>تحديث</Button></section><section className="employee-balance-grid"><BalanceSummary icon={<CalendarDays/>} label="رصيد الإجازة السنوي" remaining={`${employee.leaveRemaining} يوم`} detail={`استخدمت ${employee.leaveUsed} من ${employee.annualLeave} يومًا`} progress={employee.leaveUsed/employee.annualLeave*100}/><BalanceSummary icon={<Clock3/>} label="رصيد الاستئذان هذا الشهر" remaining={hours(employee.permissionRemaining)} detail={`استخدمت ${hours(employee.permissionUsed)} من ${hours(employee.monthlyPermission)}`} progress={employee.permissionUsed/employee.monthlyPermission*100}/></section><section className="employee-history-grid"><History title="إجازاتي" icon={<CalendarDays/>} empty="لا توجد إجازات مسجلة">{leaves.map(x=><div className="history-row" key={x.id}><div><b>إجازة {x.leave_type}</b><span>{x.start_date} · البديل: {x.substitute_employee_id?names[x.substitute_employee_id]||"موظف":"—"}</span>{x.notes&&<small>{x.notes}</small>}</div><strong>{x.days} يوم</strong></div>)}</History><History title="استئذاناتي" icon={<Clock3/>} empty="لا توجد استئذانات مسجلة">{permissions.map(x=><div className="history-row" key={x.id}><div><b>استئذان</b><span>{x.permission_date} · البديل: {x.substitute_employee_id?names[x.substitute_employee_id]||"موظف":"—"}</span>{x.notes&&<small>{x.notes}</small>}</div><strong>{hours(x.hours)}</strong></div>)}</History></section><Footer/></div></main>;
}

function Header({subtitle,email}:{subtitle:string;email:string}){return <header className="topbar"><div className="brand-mark">م</div><div><p>مجموعة المحيميد القابضة</p><span>{subtitle}</span></div><button className="signout-link" onClick={()=>supabase.auth.signOut()}><LogOut/>خروج</button><small className="signed-email">{email}</small></header>}
function Footer(){return <footer><Building2/>مجموعة المحيميد القابضة</footer>}
function Stat({icon,label,value,kind=""}:{icon:ReactNode;label:string;value:string;kind?:string}){return <article><div className={`stat-icon ${kind}`}>{icon}</div><div><span>{label}</span><strong>{value}</strong></div></article>}
function FormCard({title,icon,children}:{title:string;icon:ReactNode;children:ReactNode}){return <section className="form-card"><div className="section-title">{icon}<div><h2>{title}</h2></div></div>{children}</section>}
function OptionPicker({name,label,items}:{name:string;label:string;items:Option[]}){return <Field label={label}><NativeSelect name={name} required><NativeSelectOption value="">اختر {label}</NativeSelectOption>{items.map(x=><NativeSelectOption key={x.id} value={x.id}>{x.name}</NativeSelectOption>)}</NativeSelect></Field>}
function EmployeePicker({employees,substitute=false}:{employees:Employee[];substitute?:boolean}){return <Field label={substitute?"الموظف البديل":"الموظف"}><NativeSelect name={substitute?"substituteEmployeeId":"employeeId"} required><NativeSelectOption value="">اختر الموظف</NativeSelectOption>{employees.map(x=><NativeSelectOption key={x.id} value={x.id}>{x.name} — {x.code}</NativeSelectOption>)}</NativeSelect></Field>}
function EmployeeTable({employees,loading,saveEmail}:{employees:Employee[];loading:boolean;saveEmail:(id:number,email:string)=>Promise<void>}){return <section className="data-card"><div className="section-heading"><h2>قائمة الموظفين</h2><p>{employees.length} موظف مسجل</p></div>{loading?<div className="empty">جاري التحميل…</div>:<Table><TableHeader><TableRow><TableHead>الموظف</TableHead><TableHead>الإدارة</TableHead><TableHead>الفرع</TableHead><TableHead>الإجازة</TableHead><TableHead>الاستئذان</TableHead><TableHead>حساب الدخول</TableHead></TableRow></TableHeader><TableBody>{employees.map(e=><TableRow key={e.id}><TableCell><b>{e.name}</b><small>{e.code}</small></TableCell><TableCell>{e.department}</TableCell><TableCell>{e.branch}</TableCell><TableCell><b>{e.leaveRemaining}</b> / {e.annualLeave} يوم</TableCell><TableCell><b>{hours(e.permissionRemaining)}</b></TableCell><TableCell><form className="email-link-form" onSubmit={x=>{x.preventDefault();void saveEmail(e.id,String(new FormData(x.currentTarget).get("email")||""))}}><Input name="email" type="email" defaultValue={e.accountEmail||""} placeholder="employee@example.com"/><Button size="sm">حفظ</Button></form></TableCell></TableRow>)}</TableBody></Table>}</section>}
function BalanceCards({employees,type}:{employees:Employee[];type:"leave"|"permission"}){return <section className="data-card"><div className="section-heading"><h2>{type==="leave"?"أرصدة الإجازات":"رصيد الاستئذان الشهري"}</h2></div><div className="balances">{employees.map(e=>{const used=type==="leave"?e.leaveUsed:e.permissionUsed,max=type==="leave"?e.annualLeave:e.monthlyPermission,remaining=type==="leave"?`${e.leaveRemaining} يوم`:hours(e.permissionRemaining);return <article key={e.id}><div className="balance-head"><div><b>{e.name}</b><span>{e.code} · {e.branch}</span></div><strong>{remaining}</strong></div><Progress value={Math.min(100,used/max*100)}/><div className="balance-meta"><span>المستخدم: {type==="leave"?`${used} يوم`:hours(used)}</span><span>المتبقي</span></div></article>})}</div></section>}
function SettingCard({title,items,onSubmit,onDelete}:{title:string;items:Option[];onSubmit:(e:FormEvent<HTMLFormElement>)=>void;onDelete:(id:number)=>void}){return <section className="settings-card"><div className="section-title"><Settings/><div><h2>{title}</h2><p>خيارات قابلة للتعديل.</p></div></div><form className="setting-form" onSubmit={onSubmit}><Input name="name" required/><Button><Plus/>إضافة</Button></form><div className="setting-list">{items.map(x=><div key={x.id}><span>{x.name}</span><Button variant="ghost" size="icon" onClick={()=>onDelete(x.id)}><Trash2/></Button></div>)}</div></section>}
function BalanceSummary({icon,label,remaining,detail,progress}:{icon:ReactNode;label:string;remaining:string;detail:string;progress:number}){return <article className="balance-summary">{icon}<div><span>{label}</span><strong>{remaining}</strong><p>{detail}</p><Progress value={Math.min(100,progress)}/></div></article>}
function History({title,icon,empty,children}:{title:string;icon:ReactNode;empty:string;children:ReactNode}){const has=Array.isArray(children)?children.length>0:Boolean(children);return <section className="history-card"><div className="section-title">{icon}<h2>{title}</h2></div>{has?<div className="history-list">{children}</div>:<div className="empty">{empty}</div>}</section>}
