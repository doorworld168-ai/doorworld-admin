import { useState, useEffect } from 'react';
import { uploadFile } from '../api/storage';
import { sbFetch } from '../api/supabase';
import { fmtDate, CASE_STATUS_LABEL, CASE_STATUS_COLOR, DOOR_TYPE_LABEL } from '../api/utils';
import { useToast } from '../components/UI/Toast';
import Modal from '../components/UI/Modal';
import StatCard from '../components/UI/StatCard';

const TW_DISTRICTS_URL = 'https://raw.githubusercontent.com/donma/TaiwanAddressCityAreaRoadChineseEnglishJSON/master/CityCountyData.json';

function fmtD(d) { return d ? new Date(d).toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' }) : '—'; }

function getInstallInfo(val) {
  if (!val) return null;
  const v = String(val).toLowerCase();
  if (v === 'dry' || v === '乾式') return { label: '乾式施工', type: 'dry', color: '#3b82f6', bg: 'rgba(59,130,246,.12)' };
  if (v === 'wet' || v === '濕式') return { label: '濕式施工', type: 'wet', color: '#10b981', bg: 'rgba(16,185,129,.12)' };
  return { label: val, type: 'other', color: 'var(--gold)', bg: 'var(--gold-dim)' };
}

function InstallBadge({ type }) {
  const info = getInstallInfo(type);
  if (!info) return <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>未設定</span>;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', padding: '2px 10px', borderRadius: 99, fontSize: 12, fontWeight: 600, background: info.bg, color: info.color }}>{info.label}</span>
  );
}

function CalendarView({ data, dateField, onClickDate }) {
  const [viewMonth, setViewMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const year = viewMonth.getFullYear();
  const month = viewMonth.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = new Date().toISOString().slice(0, 10);

  const byDate = {};
  data.forEach(c => {
    const d = c[dateField];
    if (!d) return;
    const key = d.slice(0, 10);
    if (!byDate[key]) byDate[key] = [];
    byDate[key].push(c);
  });

  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push(<div key={'e' + i} />);
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const cases = byDate[dateStr] || [];
    const isToday = dateStr === today;
    cells.push(
      <div key={d} onClick={() => cases.length && onClickDate(dateStr)} style={{
        minHeight: 60, padding: 4, border: '1px solid var(--outline)', borderRadius: 4,
        background: isToday ? 'rgba(236,194,70,.06)' : 'var(--surface-low)',
        cursor: cases.length ? 'pointer' : 'default', position: 'relative'
      }}>
        <div style={{ fontSize: 11, fontWeight: isToday ? 700 : 400, color: isToday ? 'var(--gold)' : 'var(--text-muted)', marginBottom: 2 }}>{d}</div>
        {cases.slice(0, 3).map(c => (
          <div key={c.id} style={{ fontSize: 9, padding: '1px 3px', borderRadius: 3, marginBottom: 1, background: c.status === 'measured' ? 'rgba(16,185,129,.15)' : 'rgba(236,194,70,.15)', color: c.status === 'measured' ? 'var(--success)' : 'var(--gold)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.customer_name}</div>
        ))}
        {cases.length > 3 && <div style={{ fontSize: 8, color: 'var(--text-muted)' }}>+{cases.length - 3}</div>}
        {cases.length > 0 && <div style={{ position: 'absolute', top: 4, right: 4, width: 16, height: 16, borderRadius: '50%', background: 'var(--gold)', color: '#3d2e00', fontSize: 9, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{cases.length}</div>}
      </div>
    );
  }

  const monthLabel = viewMonth.toLocaleDateString('zh-TW', { year: 'numeric', month: 'long' });
  const navBtn = { background: 'none', border: '1px solid var(--outline)', borderRadius: 4, padding: '4px 10px', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 12 };

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <button style={navBtn} onClick={() => setViewMonth(new Date(year, month - 1, 1))}>← 上月</button>
        <strong style={{ fontSize: 15, fontFamily: 'var(--font-heading)' }}>{monthLabel}</strong>
        <div style={{ display: 'flex', gap: 6 }}>
          <button style={navBtn} onClick={() => setViewMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1))}>今天</button>
          <button style={navBtn} onClick={() => setViewMonth(new Date(year, month + 1, 1))}>下月 →</button>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 3, fontSize: 10, color: 'var(--text-muted)', textAlign: 'center', marginBottom: 4 }}>
        {['日', '一', '二', '三', '四', '五', '六'].map(d => <div key={d} style={{ padding: 4, fontWeight: 600 }}>{d}</div>)}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 3 }}>{cells}</div>
    </div>
  );
}

export default function Measurement({ initialTab = 'schedule' }) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [mainTab, setMainTab] = useState(initialTab); // 'schedule' | 'tasks'

  // Dispatch modal (admin sets date/staff/address/type)
  const [modal, setModal] = useState({ open: false, data: null });
  const [form, setForm] = useState({ date: '', staff: '', note: '', city: '', dist: '', addr: '', installType: '' });

  // Task modal (師傅 fills measurement result)
  const [taskModal, setTaskModal] = useState({ open: false, data: null });
  const [taskForm, setTaskForm] = useState({ width: '', height: '', threshW: '', threshH: '', note: '' });
  const [taskPhotos, setTaskPhotos] = useState([]);
  const [photoStatus, setPhotoStatus] = useState('');
  const [saving, setSaving] = useState(false);

  const [staffList, setStaffList] = useState([]);
  const [twDistricts, setTwDistricts] = useState({});
  const [view, setView] = useState('list');
  const [selectedDate, setSelectedDate] = useState(null);
  const [filter, setFilter] = useState('all');
  const toast = useToast();

  async function load() {
    setLoading(true);
    try {
      setData(await sbFetch('cases?select=*&status=in.(new,measure_scheduled,measured)&order=measure_date.asc.nullslast&limit=200') || []);
    } catch (e) { toast(e.message, 'error'); }
    setLoading(false);
  }

  useEffect(() => {
    load();
    sbFetch('staff?select=display_name&is_active=eq.true').then(d => setStaffList((d || []).map(s => s.display_name))).catch(() => {});
    fetch(TW_DISTRICTS_URL).then(r => r.json()).then(data => {
      const map = {};
      data.forEach(c => { map[c.CityName] = c.AreaList.map(a => a.AreaName); });
      setTwDistricts(map);
    }).catch(() => {});
  }, []);

  // ── Dispatch modal ──
  function openDetail(c) {
    const fullAddr = c.case_address || c.customer_addr || '';
    let city = '', dist = '', rest = fullAddr;
    for (const ci of Object.keys(twDistricts)) {
      if (fullAddr.startsWith(ci)) { city = ci; rest = fullAddr.slice(ci.length); break; }
    }
    if (city) {
      for (const di of (twDistricts[city] || [])) {
        if (rest.startsWith(di)) { dist = di; rest = rest.slice(di.length); break; }
      }
    }
    setForm({
      date: c.measure_date ? c.measure_date.slice(0, 10) : '',
      staff: c.measure_staff || '',
      note: c.measure_note || '',
      city, dist, addr: rest,
      installType: c.install_type || ''
    });
    setModal({ open: true, data: c });
  }

  async function saveDetail() {
    if (!modal.data) return;
    const c = modal.data;
    const fullAddress = [form.city, form.dist, form.addr].filter(Boolean).join('') || null;
    const fields = {
      measure_date: form.date || null,
      measure_staff: form.staff || null,
      measure_note: form.note || null,
      case_address: fullAddress,
      updated_at: new Date().toISOString()
    };
    if (form.installType) fields.install_type = form.installType;
    if (form.date && c.status === 'new') fields.status = 'measure_scheduled';
    try {
      await sbFetch(`cases?id=eq.${c.id}`, { method: 'PATCH', body: JSON.stringify(fields) });
      toast(form.date && form.staff ? '已派發丈量任務' : '已儲存', 'success');
      setModal({ open: false, data: null });
      load();
    } catch (e) { toast('儲存失敗: ' + e.message, 'error'); }
  }

  // ── Task modal (師傅) ──
  function openTask(c) {
    setTaskForm({
      width: c.actual_width_cm || '',
      height: c.actual_height_cm || '',
      threshW: c.threshold_width_cm || '',
      threshH: c.threshold_height_cm || '',
      note: ''
    });
    setTaskPhotos(Array.isArray(c.site_photos) ? c.site_photos.slice() : []);
    setPhotoStatus('');
    setTaskModal({ open: true, data: c });
  }

  async function uploadPhotos(files) {
    if (!files.length || !taskModal.data) return;
    const c = taskModal.data;
    setPhotoStatus(`上傳中 0/${files.length}...`);
    let uploaded = 0;
    const newPhotos = [...taskPhotos];
    for (const file of files) {
      if (!file.type.startsWith('image/')) continue;
      if (file.size > 10 * 1024 * 1024) { toast(`${file.name} 超過 10MB，已跳過`, 'error'); continue; }
      const ext = file.name.split('.').pop().toLowerCase();
      const caseNo = (c.case_no || 'unknown').replace(/[^a-zA-Z0-9-]/g, '');
      const fileName = `${caseNo}/${Date.now()}_${Math.random().toString(36).slice(2, 6)}.${ext}`;
      try {
        const publicUrl = await uploadFile('site-photos', fileName, file);
        newPhotos.push(publicUrl);
        uploaded++;
        setPhotoStatus(`上傳中 ${uploaded}/${files.length}...`);
      } catch (e) { toast(`${file.name} 上傳失敗`, 'error'); }
    }
    setTaskPhotos(newPhotos);
    if (taskModal.data?.id) {
      await sbFetch(`cases?id=eq.${taskModal.data.id}`, { method: 'PATCH', body: JSON.stringify({ site_photos: newPhotos }) }).catch(e => toast(e.message, 'error'));
    }
    setPhotoStatus(`已上傳 ${uploaded} 張照片`);
    setTimeout(() => setPhotoStatus(''), 2000);
    if (uploaded) toast(`${uploaded} 張照片已上傳`, 'success');
  }

  function removePhoto(idx) {
    const newPhotos = taskPhotos.filter((_, i) => i !== idx);
    setTaskPhotos(newPhotos);
    if (taskModal.data?.id) {
      sbFetch(`cases?id=eq.${taskModal.data.id}`, { method: 'PATCH', body: JSON.stringify({ site_photos: newPhotos }) }).catch(e => toast(e.message, 'error'));
    }
  }

  async function completeMeasurement() {
    if (!taskModal.data) return;
    const c = taskModal.data;
    if (!taskForm.width || !taskForm.height) { toast('請填入實際寬度與高度', 'error'); return; }
    setSaving(true);
    const installInfo = getInstallInfo(c.install_type);
    const fields = {
      actual_width_cm: Number(taskForm.width),
      actual_height_cm: Number(taskForm.height),
      measured_at: new Date().toISOString(),
      status: 'measured',
      updated_at: new Date().toISOString()
    };
    if (installInfo?.type === 'dry') {
      if (taskForm.threshW) fields.threshold_width_cm = Number(taskForm.threshW);
      if (taskForm.threshH) fields.threshold_height_cm = Number(taskForm.threshH);
    }
    // If showBoth (type not set), save threshold too if filled
    if (!installInfo) {
      if (taskForm.threshW) fields.threshold_width_cm = Number(taskForm.threshW);
      if (taskForm.threshH) fields.threshold_height_cm = Number(taskForm.threshH);
    }
    if (taskForm.note) fields.measure_note = taskForm.note;
    try {
      await sbFetch(`cases?id=eq.${c.id}`, { method: 'PATCH', body: JSON.stringify(fields) });
      toast('丈量完成！案件狀態已更新', 'success');
      setTaskModal({ open: false, data: null });
      load();
    } catch (e) { toast('儲存失敗: ' + e.message, 'error'); }
    setSaving(false);
  }

  // ── Derived ──
  const noDate = data.filter(c => !c.measure_date);
  const scheduled = data.filter(c => c.measure_date && c.status !== 'measured');
  const done = data.filter(c => c.status === 'measured');
  const dispatched = scheduled;

  const inputStyle = { padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 'var(--radius)', fontSize: 13, background: 'var(--surface-2)', color: 'var(--text)', fontFamily: 'var(--font-body)', width: '100%' };
  const secLabel = { fontSize: 11, fontWeight: 700, color: 'var(--gold)', letterSpacing: 1.5, textTransform: 'uppercase', display: 'block', marginBottom: 4 };

  let filtered = data;
  if (filter === 'nodate') filtered = noDate;
  if (filter === 'scheduled') filtered = scheduled;
  if (filter === 'done') filtered = done;
  if (selectedDate) filtered = data.filter(c => c.measure_date && c.measure_date.slice(0, 10) === selectedDate);

  const viewToggle = { background: 'none', border: '1px solid var(--outline)', borderRadius: 4, padding: '4px 10px', cursor: 'pointer', fontSize: 11, fontWeight: 600 };
  const filterBtn = (label, val, color) => {
    const on = filter === val && !selectedDate;
    return <button key={val} onClick={() => { setFilter(val); setSelectedDate(null); }} style={{ padding: '5px 11px', borderRadius: 6, border: `1px solid ${on ? 'var(--gold)' : 'var(--border)'}`, background: on ? 'var(--gold-dim)' : 'var(--surface-2)', color: on ? (color || 'var(--gold)') : 'var(--text-muted)', fontSize: 13, cursor: 'pointer', fontWeight: on ? 700 : 500 }}>{label}</button>;
  };
  const tabStyle = (active) => ({
    padding: '8px 22px', borderRadius: 'var(--radius)', cursor: 'pointer', fontSize: 13, fontWeight: 600,
    border: `1px solid ${active ? 'var(--gold)' : 'var(--border)'}`,
    background: active ? 'var(--gold-dim)' : 'transparent',
    color: active ? 'var(--gold)' : 'var(--text-muted)', transition: 'all .2s'
  });

  return (
    <div>
      <div className="page-header">
        <div className="page-title-wrap">
          <div className="page-title">丈量安排</div>
          <div className="page-subtitle">現場丈量排程、派案與丈量記錄</div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {mainTab === 'schedule' && (
            <>
              <button style={{ ...viewToggle, color: view === 'calendar' ? 'var(--gold)' : 'var(--text-muted)', borderColor: view === 'calendar' ? 'var(--gold)' : 'var(--outline)' }} onClick={() => { setView('calendar'); setSelectedDate(null); }}>📅 月曆</button>
              <button style={{ ...viewToggle, color: view === 'list' ? 'var(--gold)' : 'var(--text-muted)', borderColor: view === 'list' ? 'var(--gold)' : 'var(--outline)' }} onClick={() => { setView('list'); setSelectedDate(null); }}>☰ 列表</button>
            </>
          )}
          <button className="btn btn-primary" onClick={load}>↻ 更新</button>
        </div>
      </div>

      {/* Main tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 20 }}>
        <button onClick={() => setMainTab('schedule')} style={tabStyle(mainTab === 'schedule')}>排程管理</button>
        <button onClick={() => setMainTab('tasks')} style={tabStyle(mainTab === 'tasks')}>
          師傅待丈量{dispatched.length > 0 ? ` (${dispatched.length})` : ''}
        </button>
      </div>

      {/* ── 排程管理 tab ── */}
      {mainTab === 'schedule' && (
        <>
          <div className="stats">
            <StatCard label="待安排" value={noDate.length} color={noDate.length ? 'var(--danger)' : undefined} />
            <StatCard label="已派發" value={scheduled.length} color="var(--gold)" />
            <StatCard label="丈量完成" value={done.length} color="var(--success)" />
          </div>
          <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
            {filterBtn(`全部 (${data.length})`, 'all')}
            {filterBtn(`待安排 (${noDate.length})`, 'nodate', 'var(--danger)')}
            {filterBtn(`已派發 (${scheduled.length})`, 'scheduled')}
            {filterBtn(`完成 (${done.length})`, 'done', 'var(--success)')}
            {selectedDate && <button onClick={() => setSelectedDate(null)} style={{ padding: '5px 11px', borderRadius: 6, border: '1px solid var(--gold)', background: 'var(--gold-dim)', color: 'var(--gold)', fontSize: 13, cursor: 'pointer', fontWeight: 700 }}>{fmtD(selectedDate)} ✕</button>}
          </div>
          {loading ? <div className="loading"><div className="spinner" /><br />載入中...</div> : (
            <>
              {view === 'calendar' && <CalendarView data={data} dateField="measure_date" onClickDate={d => { setSelectedDate(d); setFilter('all'); }} />}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {filtered.length === 0 ? <div className="empty"><div className="icon">📏</div>無案件</div> :
                  filtered.map(c => {
                    const st = CASE_STATUS_COLOR[c.status] || CASE_STATUS_COLOR.new;
                    return (
                      <div key={c.id} onClick={() => openDetail(c)} style={{ background: 'var(--surface-low)', borderRadius: 'var(--radius)', padding: 14, border: `1px solid ${!c.measure_date ? 'rgba(239,68,68,.3)' : 'var(--border)'}`, cursor: 'pointer' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <strong style={{ fontFamily: 'monospace', fontSize: 13 }}>{c.order_no || c.case_no}</strong>
                            <span>{c.customer_name || '—'}</span>
                            <InstallBadge type={c.install_type} />
                          </div>
                          <span className="badge" style={{ background: st.bg, color: st.color }}>{CASE_STATUS_LABEL[c.status]}</span>
                        </div>
                        <div style={{ display: 'flex', gap: 16, fontSize: 13, color: 'var(--text-muted)', flexWrap: 'wrap' }}>
                          <span>丈量日期：<strong style={{ color: c.measure_date ? 'var(--text)' : 'var(--danger)' }}>{c.measure_date ? fmtDate(c.measure_date).split(' ')[0] : '未安排'}</strong></span>
                          <span>人員：{c.measure_staff || '—'}</span>
                          <span>地址：{c.case_address || c.customer_addr || '—'}</span>
                          <span>業務：{c.sales_person || '—'}</span>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </>
          )}
        </>
      )}

      {/* ── 師傅待丈量 tab ── */}
      {mainTab === 'tasks' && (
        <>
          {loading ? <div className="loading"><div className="spinner" /><br />載入中...</div> : (
            dispatched.length === 0 ? (
              <div className="empty"><div className="icon">✔</div>目前無待丈量任務</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {dispatched.map(c => {
                  const info = getInstallInfo(c.install_type);
                  return (
                    <div key={c.id} onClick={() => openTask(c)} style={{
                      background: 'var(--surface-low)', borderRadius: 'var(--radius)', padding: '14px 16px',
                      border: '1px solid var(--border)', cursor: 'pointer'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <strong style={{ fontFamily: 'monospace', fontSize: 13, color: 'var(--gold)' }}>{c.order_no || c.case_no || '—'}</strong>
                          <span style={{ fontWeight: 600 }}>{c.customer_name || '—'}</span>
                          {info
                            ? <span style={{ display: 'inline-flex', alignItems: 'center', padding: '2px 8px', borderRadius: 99, fontSize: 11, fontWeight: 600, background: info.bg, color: info.color }}>{info.label}</span>
                            : <span style={{ fontSize: 11, color: 'var(--danger)', fontWeight: 600 }}>施工方式未設定</span>
                          }
                        </div>
                        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>點擊填入丈量 →</span>
                      </div>
                      <div style={{ display: 'flex', gap: 20, fontSize: 13, flexWrap: 'wrap', marginBottom: 6 }}>
                        <span>📅 <strong style={{ color: 'var(--gold)' }}>{c.measure_date ? fmtDate(c.measure_date).split(' ')[0] : '—'}</strong></span>
                        <span>👤 {c.measure_staff || '未指派'}</span>
                        <span>📞 {c.customer_phone || '—'}</span>
                      </div>
                      <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                        📍 {c.case_address || c.customer_addr || '—'}
                      </div>
                      {c.measure_note && <div style={{ marginTop: 6, fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>備註：{c.measure_note}</div>}
                    </div>
                  );
                })}
              </div>
            )
          )}
        </>
      )}

      {/* ── Dispatch Modal (Admin) ── */}
      <Modal open={modal.open} onClose={() => setModal({ open: false, data: null })}
        title={modal.data ? (modal.data.order_no || modal.data.case_no || '丈量派案') : '丈量派案'}
        maxWidth={560}
        footer={<>
          <button className="btn btn-ghost" onClick={() => setModal({ open: false, data: null })}>關閉</button>
          <button className="btn btn-primary" onClick={saveDetail}>派發丈量</button>
        </>}>
        {modal.open && modal.data && (() => {
          const c = modal.data;
          return (
            <>
              {/* Case info */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 13, marginBottom: 16, padding: 12, background: 'var(--surface-2)', borderRadius: 'var(--radius)' }}>
                <div><span style={{ color: 'var(--text-muted)' }}>客戶</span><br /><strong>{c.customer_name || '—'}</strong></div>
                <div><span style={{ color: 'var(--text-muted)' }}>電話</span><br /><strong>{c.customer_phone || '—'}</strong></div>
                <div><span style={{ color: 'var(--text-muted)' }}>產品</span><br /><strong>{c.product_code || '—'}</strong></div>
                <div><span style={{ color: 'var(--text-muted)' }}>門型</span><br /><strong>{(DOOR_TYPE_LABEL[c.door_type] || c.door_type || '—')}{c.is_fireproof ? ' (防火)' : ''}</strong></div>
              </div>

              {/* Construction type */}
              <div style={{ marginBottom: 16 }}>
                <label style={secLabel}>施工方式</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  {[
                    { val: '', label: '未設定', border: 'var(--border)', bg: 'transparent', color: 'var(--text-muted)' },
                    { val: 'dry', label: '乾式施工', border: '#3b82f6', bg: 'rgba(59,130,246,.12)', color: '#3b82f6' },
                    { val: 'wet', label: '濕式施工', border: '#10b981', bg: 'rgba(16,185,129,.12)', color: '#10b981' }
                  ].map(opt => {
                    const on = form.installType === opt.val;
                    return (
                      <button key={opt.val} onClick={() => setForm(f => ({ ...f, installType: opt.val }))} style={{
                        flex: 1, padding: '8px 0', borderRadius: 'var(--radius)', fontSize: 13, cursor: 'pointer', fontWeight: on ? 700 : 500,
                        border: `1px solid ${on ? opt.border : 'var(--border)'}`,
                        background: on ? opt.bg : 'transparent',
                        color: on ? opt.color : 'var(--text-muted)'
                      }}>{opt.label}</button>
                    );
                  })}
                </div>
              </div>

              {/* Address */}
              <div style={{ marginBottom: 16 }}>
                <label style={secLabel}>案場地址</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 6 }}>
                  <select value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value, dist: '' }))} style={inputStyle}>
                    <option value="">縣市</option>
                    {Object.keys(twDistricts).map(ci => <option key={ci} value={ci}>{ci}</option>)}
                  </select>
                  <select value={form.dist} onChange={e => setForm(f => ({ ...f, dist: e.target.value }))} style={inputStyle}>
                    <option value="">鄉鎮區</option>
                    {(twDistricts[form.city] || []).map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
                <input value={form.addr} onChange={e => setForm(f => ({ ...f, addr: e.target.value }))} placeholder="路/街/巷/弄/號/樓" style={inputStyle} />
              </div>

              {/* Date + Staff */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
                <div>
                  <label style={secLabel}>丈量日期</label>
                  <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} style={inputStyle} />
                </div>
                <div>
                  <label style={secLabel}>派發人員</label>
                  <select value={form.staff} onChange={e => setForm(f => ({ ...f, staff: e.target.value }))} style={inputStyle}>
                    <option value="">選擇丈量人員</option>
                    {staffList.map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
              </div>

              {/* Note */}
              <div>
                <label style={secLabel}>派案備註</label>
                <textarea value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} placeholder="派案附帶說明（師傅可見）" style={{ ...inputStyle, minHeight: 60, resize: 'vertical' }} />
              </div>
            </>
          );
        })()}
      </Modal>

      {/* ── Task Modal (師傅 measurement) ── */}
      <Modal open={taskModal.open} onClose={() => setTaskModal({ open: false, data: null })}
        title="丈量紀錄"
        maxWidth={520}
        footer={<>
          <button className="btn btn-ghost" onClick={() => setTaskModal({ open: false, data: null })}>關閉</button>
          <button className="btn btn-primary" onClick={completeMeasurement} disabled={saving}
            style={{ background: 'var(--success)', border: 'none' }}>
            {saving ? '儲存中...' : '✓ 丈量完成'}
          </button>
        </>}>
        {taskModal.open && taskModal.data && (() => {
          const c = taskModal.data;
          const installInfo = getInstallInfo(c.install_type);
          const isDry = installInfo?.type === 'dry';
          const isWet = installInfo?.type === 'wet';
          const showBoth = !isDry && !isWet;

          return (
            <>
              {/* Header info */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 13, marginBottom: 14, padding: 12, background: 'var(--surface-2)', borderRadius: 'var(--radius)' }}>
                <div>
                  <span style={{ color: 'var(--text-muted)' }}>估價單號</span><br />
                  <strong style={{ fontFamily: 'monospace', color: 'var(--gold)' }}>{c.order_no || c.case_no || '—'}</strong>
                </div>
                <div>
                  <span style={{ color: 'var(--text-muted)' }}>施工方式</span><br />
                  {installInfo
                    ? <span style={{ fontWeight: 700, color: installInfo.color }}>{installInfo.label}</span>
                    : <span style={{ color: 'var(--danger)', fontWeight: 600 }}>未設定</span>
                  }
                </div>
                <div><span style={{ color: 'var(--text-muted)' }}>聯絡人</span><br /><strong>{c.customer_name || '—'}</strong></div>
                <div><span style={{ color: 'var(--text-muted)' }}>電話</span><br /><strong>{c.customer_phone || '—'}</strong></div>
                <div style={{ gridColumn: '1/-1' }}>
                  <span style={{ color: 'var(--text-muted)' }}>丈量地址</span><br />
                  <strong>{c.case_address || c.customer_addr || '—'}</strong>
                </div>
              </div>

              {/* Date + staff strip */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16, padding: '8px 12px', background: 'rgba(236,194,70,.06)', borderRadius: 'var(--radius)', fontSize: 13 }}>
                <span>📅 <strong style={{ color: 'var(--gold)' }}>{c.measure_date ? fmtDate(c.measure_date).split(' ')[0] : '—'}</strong></span>
                {c.measure_staff && <span>👤 <strong>{c.measure_staff}</strong></span>}
              </div>

              {/* Measurement sections */}
              {/* Dry section */}
              {(isDry || showBoth) && (
                <div style={{ marginBottom: 14, padding: 14, border: '1px solid rgba(59,130,246,.25)', borderRadius: 'var(--radius)', background: 'rgba(59,130,246,.04)' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#3b82f6', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 12 }}>
                    乾式工法
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                    <div>
                      <label style={{ ...secLabel, color: '#3b82f6' }}>實際寬度 (CM)</label>
                      <input type="number" value={taskForm.width} onChange={e => setTaskForm(f => ({ ...f, width: e.target.value }))} placeholder="寬度" style={inputStyle} />
                    </div>
                    <div>
                      <label style={{ ...secLabel, color: '#3b82f6' }}>實際高度 (CM)</label>
                      <input type="number" value={taskForm.height} onChange={e => setTaskForm(f => ({ ...f, height: e.target.value }))} placeholder="高度" style={inputStyle} />
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div>
                      <label style={{ ...secLabel, color: '#3b82f6' }}>門檻寬度 (CM)</label>
                      <input type="number" value={taskForm.threshW} onChange={e => setTaskForm(f => ({ ...f, threshW: e.target.value }))} placeholder="門檻寬" style={inputStyle} />
                    </div>
                    <div>
                      <label style={{ ...secLabel, color: '#3b82f6' }}>門檻高度 (CM)</label>
                      <input type="number" value={taskForm.threshH} onChange={e => setTaskForm(f => ({ ...f, threshH: e.target.value }))} placeholder="門檻高" style={inputStyle} />
                    </div>
                  </div>
                </div>
              )}

              {/* Wet section */}
              {(isWet || showBoth) && (
                <div style={{ marginBottom: 14, padding: 14, border: '1px solid rgba(16,185,129,.25)', borderRadius: 'var(--radius)', background: 'rgba(16,185,129,.04)' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#10b981', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 12 }}>
                    濕式工法
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div>
                      <label style={{ ...secLabel, color: '#10b981' }}>實際寬度 (CM)</label>
                      <input type="number" value={isWet ? taskForm.width : ''} onChange={e => setTaskForm(f => ({ ...f, width: e.target.value }))} placeholder="寬度" style={inputStyle} />
                    </div>
                    <div>
                      <label style={{ ...secLabel, color: '#10b981' }}>實際高度 (CM)</label>
                      <input type="number" value={isWet ? taskForm.height : ''} onChange={e => setTaskForm(f => ({ ...f, height: e.target.value }))} placeholder="高度" style={inputStyle} />
                    </div>
                  </div>
                </div>
              )}

              {/* Photos */}
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14, marginBottom: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <label style={secLabel}>現場照片</label>
                  <label className="btn btn-ghost btn-sm" style={{ cursor: 'pointer', fontSize: 13, borderColor: 'var(--gold)', color: 'var(--gold)' }}>
                    + 上傳照片
                    <input type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={e => uploadPhotos(Array.from(e.target.files))} />
                  </label>
                </div>
                {photoStatus && <div style={{ fontSize: 13, color: 'var(--gold)', marginBottom: 6 }}>{photoStatus}</div>}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                  {taskPhotos.length === 0 ? (
                    <div style={{ color: 'var(--text-muted)', fontSize: 13, gridColumn: '1/-1', textAlign: 'center', padding: '8px 0' }}>尚無照片</div>
                  ) : taskPhotos.map((url, i) => (
                    <div key={i} style={{ position: 'relative', borderRadius: 4, overflow: 'hidden', border: '1px solid var(--border)', aspectRatio: '1', background: 'var(--surface)' }}>
                      <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      <button onClick={() => removePhoto(i)} style={{ position: 'absolute', top: 2, right: 2, width: 20, height: 20, borderRadius: '50%', border: 'none', background: 'rgba(0,0,0,0.7)', color: '#fff', fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}>&times;</button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Note */}
              <div>
                <label style={secLabel}>丈量備註</label>
                <textarea value={taskForm.note} onChange={e => setTaskForm(f => ({ ...f, note: e.target.value }))} placeholder="備註說明" style={{ ...inputStyle, minHeight: 60, resize: 'vertical' }} />
              </div>
            </>
          );
        })()}
      </Modal>
    </div>
  );
}
