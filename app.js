import { demoFetch } from './pages-api.mjs?v=4d19bdc717d6';
const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
const money = value => Number(value || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const date = value => value ? new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(value)).replaceAll('/', '-') : '—';
const dateOnly = value => date(value).slice(0, 10);
const walletNumber = value => Number(value || 0).toLocaleString('zh-CN', { maximumFractionDigits: 2 });
const fullTime = value => `${date(value)}:${String(new Date(value).getUTCSeconds()).padStart(2, '0')}`;
const termLabel = ({ months, durationDays }) => `${months}个月（${durationDays}天）`;
const statusNames = { active: '存款中', settled: '已到账' };
const pointTitles = { opening: '期初积分', evaluation: '德育评价', debit: '兑换扣减', deposit: '定期存入，本金锁定', principal_return: '到期本金返还', interest: '定期利息到账' };
const pointSources = { opening: '历史积分', evaluation: '参与评价活动', debit: '积分兑换', bank: '校园银行' };
const bankPointCaptions = { deposit: '本次锁定本金', principal_return: '本次返还本金', interest: '本次到账利息' };
const signedPoints = value => `${Number(value) > 0 ? '+' : ''}${money(value)}`;
const paths = {
  bank: '<path d="m3 9 9-6 9 6v2H3zM5 14v6m7-6v6m7-6v6M3 22h18"/>',
  wallet: '<path d="M20 8V5H5a3 3 0 0 0 0 6h16v10H5a3 3 0 0 1-3-3V8m19 5h-6v5h6m-3-2.5h.01"/>',
  chart: '<path d="M4 3v18h18M8 16l4-5 4 3 5-8"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m20 0v-2a4 4 0 0 0-3-3.87M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8m8-7.87a4 4 0 0 1 0 7.75"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4m8-4v4M3 10h18"/>',
  shield: '<path d="m12 3 8 3v6c0 5-8 10-8 10S4 17 4 12V6zM8 12l3 3 5-6"/>',
  arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>',
  back: '<path d="m15 5-7 7 7 7"/>',
  download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  settings: '<path d="M4 7h16M4 17h16M8 4v6m8 4v6"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10h.01"/>',
  file: '<path d="M14 3H5v18h14V8zm0 0v6h5M8 13h8m-8 4h6"/>',
};
const icon = (name, cls = '') => `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.bank}</svg>`;
const badge = status => `<span class="badge ${status}"><i></i>${statusNames[status]}</span>`;
const isMobileLocation = () => new URLSearchParams(location.search).get('view') === 'mobile';
const mobileUrl = point => point == null ? './?view=mobile' : `./?${new URLSearchParams({ view: 'mobile', point })}`;
const adminUrl = './';
const state = { view: isMobileLocation() ? 'mobile' : 'admin', adminPage: 'bank', tab: 'records', mobilePage: 'wallet', studentId: '', productId: '', principal: '', mobileStatus: '', page: 1, filters: {}, pointPage: 1, pointFilters: {}, points: null, bootstrap: null, records: null, tools: false, busy: false, quote: null, requestKey: null, modal: null };
let toastTimer, previousFocus, loadRevision = 0;
function toast(message, error = false) { const el = $('#toast'); el.textContent = message; el.className = `visible ${error ? 'error' : ''}`; clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.className = ''; }, 4200); }
async function api(path, data, method = data === undefined ? 'GET' : 'POST') {
  const response = await demoFetch(`/api${path}`, { method, headers: data === undefined ? {} : { 'Content-Type': 'application/json' }, body: data === undefined ? undefined : JSON.stringify(data) });
  const result = await response.json();
  if (!response.ok) { const error = new Error(result.message); Object.assign(error, { code: result.code, status: response.status }); throw error; }
  return result;
}
function telemetry(event, productId) { api('/events', { event, productId }).catch(() => {}); }
function params() { return new URLSearchParams({ ...(state.view === 'mobile' ? { studentId: state.studentId, status: state.mobileStatus } : state.filters), page: state.page }).toString(); }
const account = () => state.bootstrap.students.find(s => s.id === state.studentId) || state.bootstrap.students[0];
async function load() {
  const revision = ++loadRevision;
  state.draftDirty = false;
  const bootstrap = await api('/bootstrap');
  if (revision !== loadRevision) return;
  state.bootstrap = bootstrap;
  if (!state.bootstrap.students.some(s => s.id === state.studentId)) state.studentId = state.bootstrap.students[0]?.id || '';
  if (!state.bootstrap.products.some(p => p.id === state.productId && p.enabled)) state.productId = state.bootstrap.products.find(p => p.enabled)?.id || '';
  if (state.view === 'admin' && state.adminPage === 'points') {
    const points = await api(`/point-transactions?${new URLSearchParams({ ...state.pointFilters, page: state.pointPage })}`);
    if (revision !== loadRevision) return;
    state.points = points;
    state.pointPage = points.page;
  } else if (state.view === 'mobile' && state.mobilePage === 'wallet' && state.studentId) {
    const points = await api(`/point-transactions?${new URLSearchParams({ studentId: state.studentId, period: state.walletPeriod || 'all', page: state.walletPage || 1 })}`);
    if (revision !== loadRevision) return;
    state.points = points;
    state.walletPage = points.page;
  } else if (state.view === 'mobile' && state.mobilePage === 'point-detail') {
    let entry, error;
    try {
      entry = await api(`/point-transactions/${encodeURIComponent(state.pointId)}`);
    } catch (failure) {
      error = [403, 404].includes(failure.status) ? 'unavailable' : 'failed';
    }
    if (revision !== loadRevision) return;
    state.pointEntry = entry;
    state.pointError = error;
  } else if (state.view === 'admin' || state.mobilePage === 'bank') {
    const records = await api(`/deposits?${params()}`);
    if (revision !== loadRevision) return;
    state.records = records;
  }
  render();
}
function demoBar() {
  const actor = state.bootstrap.actor;
  const key = Object.entries({ admin: 'admin-a', viewer: 'viewer-a', parent: 'parent-a', guardian: 'parent-shared', otherSchool: 'admin-b' }).find(([, id]) => id === actor.id)?.[0];
  return `<div class="demo-bar"><div class="demo-identity"><span class="demo-dot"></span><strong>校园银行</strong><span class="demo-label">线上演示 · 数据保存在本浏览器</span></div><div class="demo-actions"><div class="view-toggle"><button data-action="view" data-view="admin" class="${state.view === 'admin' ? 'selected' : ''}">PC 管理端</button><button data-action="view" data-view="mobile" class="${state.view === 'mobile' ? 'selected' : ''}">家长移动端</button></div><select id="demo-profile" aria-label="演示角色"><option value="admin" ${key === 'admin' ? 'selected' : ''}>学校管理员</option><option value="parent" ${key === 'parent' ? 'selected' : ''}>家长 · 两个孩子</option><option value="guardian" ${key === 'guardian' ? 'selected' : ''}>同一学生另一位家长</option><option value="viewer" ${key === 'viewer' ? 'selected' : ''}>班主任 · 只读</option><option value="otherSchool" ${key === 'otherSchool' ? 'selected' : ''}>另一学校 · 隔离数据</option></select><button class="tool-button ${state.tools ? 'active' : ''}" data-action="tools">${icon('settings')}演示工具</button></div></div>${state.tools ? `<section class="demo-tools"><div><strong>演示工具</strong><p>使用虚构积分。时间跳转可验证到期结算，关页期间到期的存款会在重新打开时补结算。</p><span>当前演示时间：${date(state.bootstrap.now)}（北京时间）</span></div><div class="tools-buttons"><label class="check-label"><input id="fail-once" type="checkbox">模拟一次结算失败</label><button class="btn" data-action="advance">跳至下一笔到期 / 重试</button>${actor.role === 'admin' ? '<button class="btn" data-action="debit">模拟消费扣减</button>' : ''}<button class="btn" data-action="refresh">刷新数据</button></div></section>` : ''}`;
}
function adminShell() {
  const { school, actor } = state.bootstrap;
  const points = state.adminPage === 'points', pageTitle = points ? '积分统计' : '校园银行';
  return `<div class="admin-shell"><aside class="sidebar"><div class="brand"><span class="brand-mark">${icon('chart')}</span><span>评价管理系统</span></div><div class="school-label">${icon('bank')} ${esc(school.name)}</div><nav aria-label="系统导航"><div class="nav-group">${icon('bank')}<span>首页</span></div><div class="nav-group">${icon('file')}<span>评价管理</span><span class="chevron">⌄</span></div><div class="nav-group">${icon('shield')}<span>成长体系</span><span class="chevron">⌄</span></div><div class="nav-group expanded">${icon('wallet')}<span>积分资产</span><span class="chevron">⌃</span></div><div class="nav-sub muted">积分管理</div><div class="nav-sub muted">积分卡管理</div><button class="nav-sub admin-nav-button ${points ? 'current' : ''}" data-action="admin-page" data-page="points" ${points ? 'aria-current="page"' : ''}>积分统计</button><div class="nav-group">${icon('file')}<span>兑换记录</span></div><div class="nav-group">${icon('chart')}<span>排行榜</span></div><div class="nav-group">${icon('settings')}<span>设备管理</span><span class="chevron">⌄</span></div><button class="nav-group admin-nav-button ${points ? '' : 'current'}" data-action="admin-page" data-page="bank" ${points ? '' : 'aria-current="page"'}>${icon('bank')}<span>校园银行</span></button></nav><div class="sidebar-foot">学生成长 · 每一分都有价值</div></aside><main class="admin-main"><header class="topbar"><div class="breadcrumb">首页<span>/</span>${points ? '积分资产<span>/</span>' : ''}<strong>${pageTitle}</strong></div><div class="user-block"><span class="avatar">${actor.role === 'viewer' ? '师' : '管'}</span>${esc(actor.name)}</div></header><div class="route-tabs"><span>首页</span><span class="active">${pageTitle} <span>×</span></span></div><section class="page-card">${points ? adminPointRecords() : `<div class="page-heading"><div><h1>校园银行</h1></div><div class="prd-heading-actions"><span class="school-status ${school.enabled ? '' : 'off'}"><i></i>${school.enabled ? '本校已开放存款' : '本校暂未开放存款'}</span><button type="button" class="btn prd-trigger" data-action="view-prd" aria-haspopup="dialog">PRD</button></div></div><div class="main-tabs" role="tablist" aria-label="校园银行管理"><button role="tab" aria-selected="${state.tab === 'records'}" data-action="tab" data-tab="records" class="${state.tab === 'records' ? 'active' : ''}">存款记录</button><button role="tab" aria-selected="${state.tab === 'rules'}" data-action="tab" data-tab="rules" class="${state.tab === 'rules' ? 'active' : ''}">规则配置</button></div>${state.tab === 'rules' ? adminRules() : adminRecords()}`}</section><footer class="page-foot">${pageTitle} · 北京时间 <span>本地独立演示，未接入线上积分账户</span></footer></main></div>`;
}
function adminRecords() {
  const r = state.records, f = state.filters;
  return `<div class="stat-grid"><div class="stat-card"><span class="stat-icon mint">${icon('bank')}</span><div><span>未结清本金</span><strong>${money(r.summary.locked)}<small>积分</small></strong></div></div><div class="stat-card"><span class="stat-icon amber">${icon('chart')}</span><div><span>已到账利息</span><strong>${money(r.summary.paid)}<small>积分</small></strong></div></div><div class="stat-card"><span class="stat-icon blue">${icon('file')}</span><div><span>存款总笔数</span><strong>${r.summary.count}<small>笔</small></strong></div></div></div><form id="filter-form" class="filter-panel" novalidate><div class="filter-grid"><label>学生姓名<input name="name" value="${esc(f.name || '')}" placeholder="请输入学生姓名"></label><label>学号<input name="number" value="${esc(f.number || '')}" placeholder="请输入学号"></label><label>所在班级<select name="className"><option value="">全部班级</option>${[...new Set(state.bootstrap.students.map(s => s.className))].map(c => `<option value="${esc(c)}" ${f.className === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></label><label>存款状态<select name="status"><option value="">全部状态</option>${Object.entries(statusNames).map(([k, v]) => `<option value="${k}" ${f.status === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label><label class="date-filter">存入日期<div><input type="date" aria-label="存入开始日期" name="start" value="${esc(f.start || '')}"><span>至</span><input type="date" aria-label="存入结束日期" name="end" value="${esc(f.end || '')}"></div></label><label class="date-filter">到期日期<div><input type="date" aria-label="到期开始日期" name="dueStart" value="${esc(f.dueStart || '')}"><span>至</span><input type="date" aria-label="到期结束日期" name="dueEnd" value="${esc(f.dueEnd || '')}"></div></label></div><div class="filter-footer"><span>顶部统计按数据权限汇总，筛选仅影响列表和导出</span><button type="button" class="btn" data-action="reset-filters">重置</button><button class="btn primary" type="submit">${icon('search')}查询</button></div></form><div class="table-toolbar"><div><h2>学生存款记录</h2><span>共 ${r.total} 条记录</span></div>${state.bootstrap.actor.role === 'admin' ? `<button class="btn" data-action="export" ${!r.total ? 'disabled' : ''}>${icon('download')}导出 Excel</button>` : '<span class="subtle">当前为班级只读权限</span>'}</div><div class="table-wrap"><table class="records-table"><thead><tr><th>学生姓名</th><th>学号</th><th>所在班级</th><th class="num">存入本金</th><th>存期</th><th>月利率</th><th>存入时间</th><th>到期时间</th><th class="num">到期利息</th><th>状态</th><th>操作</th></tr></thead><tbody>${r.items.length ? r.items.map(d => `<tr><td><strong>${esc(d.studentName)}</strong></td><td>${esc(d.studentNumber)}</td><td>${esc(d.className)}</td><td class="num"><strong>${money(d.principal)}</strong></td><td>${termLabel(d)}</td><td>${d.rate}%</td><td class="time-cell">${date(d.createdAt)}</td><td class="time-cell">${date(d.dueAt)}</td><td class="num"><span class="positive">+${money(d.expectedInterest)}</span></td><td>${badge(d.status)}</td><td><button class="text-btn" data-action="detail" data-id="${esc(d.id)}">详情</button></td></tr>`).join('') : `<tr><td colspan="11">${empty('未查询到符合条件的存款', '请调整筛选条件后重新查询')}</td></tr>`}</tbody></table></div>${pagination(r)}<div class="footnote">${icon('info')}到期利息按月单利计算；存期内本金锁定，不可兑换、消费或提前取出。</div>`;
}
function adminPointRecords() {
  const { items, total, page, pageSize } = state.points;
  const f = state.pointFilters;
  const classes = [...new Set(state.bootstrap.students.map(student => student.className))];
  const rows = items.map((item, index) => {
    const sequence = (page - 1) * pageSize + index + 1;
    const source = item.depositId ? pointSources.bank : pointSources[item.kind] || '积分变动';
    const remarks = ['deposit', 'principal_return', 'interest', 'debit'].includes(item.kind)
      ? pointTitles[item.kind]
      : item.remark || '—';
    const deltaClass = Number(item.availableDelta) > 0 ? ' positive' : '';
    const evaluation = [item.evaluationType, item.classMoralEducation].filter(Boolean).join(' / ')
      || (item.kind === 'evaluation' ? pointTitles.evaluation : '—');
    const activity = [item.activityName, item.honorTitle].filter(Boolean).join(' / ') || '—';
    return `<tr>
      <td class="point-select"><input type="checkbox" data-point-record="${esc(item.id)}" aria-label="选择第 ${sequence} 条积分记录"></td>
      <td>${sequence}</td>
      <td>${esc(item.studentName)}</td>
      <td class="point-face">${item.studentFaceUrl ? `<img src="${esc(item.studentFaceUrl)}" alt="${esc(item.studentName)}的人脸照片" loading="lazy">` : '—'}</td>
      <td>${esc(item.className)}</td>
      <td>${source}</td>
      <td>${esc(evaluation)}</td>
      <td>${esc(activity)}</td>
      <td class="num${deltaClass}">${signedPoints(item.availableDelta)}</td>
      <td class="time-cell">${fullTime(item.createdAt)}</td>
      <td>${esc(remarks)}</td>
      <td><button class="text-btn" data-action="point-detail" data-id="${esc(item.id)}">详情</button></td>
    </tr>`;
  }).join('');
  return `
    <div class="page-heading"><h1>积分记录</h1><button class="btn prd-trigger" data-action="view-prd" aria-haspopup="dialog">PRD</button></div>
    <div class="main-tabs"><span class="point-records-tab">积分记录</span></div>
    <form id="point-filter-form" class="filter-panel" novalidate>
      <div class="filter-grid">
        <label>学生姓名<input name="name" value="${esc(f.name || '')}" placeholder="请输入学生姓名"></label>
        <label>所在班级<select name="className"><option value="">全部班级</option>${classes.map(c => `<option value="${esc(c)}" ${f.className === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></label>
        <label>得分形式<select name="source"><option value="">全部</option>${Object.entries(pointSources).map(([value, title]) => `<option value="${value}" ${f.source === value ? 'selected' : ''}>${title}</option>`).join('')}</select></label>
        <label class="date-filter">得分时间<div><input type="date" name="start" aria-label="得分开始日期" value="${esc(f.start || '')}"><span>至</span><input type="date" name="end" aria-label="得分结束日期" value="${esc(f.end || '')}"></div></label>
      </div>
      <div class="filter-footer"><button class="btn" type="button" data-action="reset-point-filters">重置</button><button class="btn primary" type="submit">${icon('search')}查询</button></div>
    </form>
    <div class="table-toolbar"><span>共 ${total} 条记录</span></div>
    <div class="table-wrap" id="point-records"><table class="point-records-table"><thead><tr>
      <th scope="col" class="point-select"><input type="checkbox" id="point-select-page" aria-label="选择本页全部积分记录" ${items.length === 0 ? 'disabled' : ''}></th>
      <th scope="col">序号</th><th scope="col">学生姓名</th><th scope="col">学生人脸</th><th scope="col">所在班级</th>
      <th scope="col">得分形式</th><th scope="col">评价类型/班级德育</th><th scope="col">活动名称/荣誉称号</th>
      <th scope="col" class="num">得分</th><th scope="col">得分时间</th><th scope="col">备注</th><th scope="col">操作</th>
    </tr></thead><tbody>${rows || `<tr><td colspan="12">${empty('暂无匹配的积分记录')}</td></tr>`}</tbody></table></div>${pagination(state.points, 'point-page')}`;
}

function syncPointSelection(table) {
  const toggle = table.querySelector('#point-select-page');
  const rows = [...table.querySelectorAll('input[data-point-record]')];
  const selectedCount = rows.filter(box => box.checked).length;
  toggle.checked = rows.length > 0 && selectedCount === rows.length;
  toggle.indeterminate = selectedCount > 0 && selectedCount < rows.length;
}
function adminRules() {
  const { school, products, actor } = state.bootstrap, readonly = actor.role !== 'admin';
  return `<div class="rule-notice">${icon('shield')}<div><strong>已存入记录按原规则结算</strong><span>调息、调整起存额或停用功能仅影响后续存入，不改变已有存款的本金、利率及到期时间。</span></div></div><section class="settings-section"><div class="section-heading"><h2>基础设置</h2><span>学校独立生效</span></div><form id="settings-form" novalidate><div class="setting-row"><div><strong>开放定期存款</strong><p>关闭后停止新存入，已有存款仍可查询并正常到期结算。</p></div><label class="switch"><input type="checkbox" name="enabled" aria-label="开放定期存款" ${school.enabled ? 'checked' : ''} ${readonly ? 'disabled' : ''}><span></span></label></div><div class="setting-row"><div><strong>最低起存额</strong><p>所有存期档位统一使用此起存额，允许多笔独立存入。</p></div><label class="suffix-field"><input name="minimum" aria-label="最低起存额" inputmode="decimal" value="${school.minimum}" ${readonly ? 'disabled' : ''}><span>积分</span></label></div><div class="setting-row plain"><div class="setting-tags"><span>按月单利</span><span>按固定天数到期</span><span>到期日 00:00 自动到账</span><span>保留两位小数</span></div>${!readonly ? '<button class="btn primary" type="submit">保存基础设置</button>' : '<span class="subtle">当前账号仅可查看</span>'}</div></form></section><section class="settings-section"><div class="section-heading"><div><h2>存期与月利率</h2><span>月利率 × 存期月数 = 整期收益率</span></div>${!readonly ? `<button class="btn primary" data-action="product-new" ${products.length === state.bootstrap.termOptions.length ? 'disabled title="所有存期档位均已配置"' : ''}>${icon('plus')}新增档位</button>` : ''}</div><div class="table-wrap"><table><thead><tr><th>存期</th><th>月利率</th><th>整期收益率</th><th>100积分到期利息</th><th>状态</th><th>操作</th></tr></thead><tbody>${products.map(p => `<tr><td><strong>${termLabel(p)}</strong></td><td class="positive">${p.rate}%</td><td>${(Number(p.rate) * p.months).toFixed(2)}%</td><td>${money(Number(p.rate) * p.months)} 积分</td><td><span class="badge ${p.enabled ? 'active' : 'disabled'}"><i></i>${p.enabled ? '已启用' : '已停用'}</span></td><td>${!readonly ? `<button class="text-btn" data-action="product-edit" data-id="${esc(p.id)}">编辑</button>${p.canDelete ? `<button class="text-btn product-delete" data-action="product-delete" data-id="${esc(p.id)}">删除</button>` : ''}` : '—'}</td></tr>`).join('')}</tbody></table></div><p class="formula-note">示例：100 积分 × 1.50% × 2（2个月档，60天）＝ 3.00 积分利息。存期内不发放利息，不计复利。</p></section>`;
}
function empty(title, sub = '') { return `<div class="empty-state">${icon('bank')}<strong>${esc(title)}</strong><span>${esc(sub)}</span></div>`; }
function pagination(r, action = 'page') { const pages = Math.max(1, Math.ceil(r.total / r.pageSize)); return `<div class="pagination"><span>共 ${r.total} 条</span><button class="btn" data-action="${action}" data-page="${r.page - 1}" ${r.page <= 1 ? 'disabled' : ''}>上一页</button><span class="page-current">${r.page}</span><button class="btn" data-action="${action}" data-page="${r.page + 1}" ${r.page >= pages ? 'disabled' : ''}>下一页</button><span>${r.pageSize} 条 / 页</span></div>`; }
function studentSelector() { return `<label class="student-selector"><span class="child-avatar">${esc(account()?.name.slice(-1))}</span><select id="student-select" aria-label="当前学生">${state.bootstrap.students.map(s => `<option value="${s.id}" ${s.id === state.studentId ? 'selected' : ''}>${esc(s.name)} · ${esc(s.className)}</option>`).join('')}</select></label>`; }
function mobileShell() {
  if (state.mobilePage === 'point-detail') return mobilePointDetail();
  const a = account();
  if (!a) return `<main class="phone">${empty('当前身份暂无绑定学生')}</main>`;
  const wallet = state.mobilePage === 'wallet';
  const overview = state.mobilePage === 'overview';
  return `<div class="mobile-stage original-stage"><main class="phone original-phone ${wallet ? 'original-wallet' : 'original-bank'}">${wallet ? mobileWallet(a) : `<header class="mobile-header"><button aria-label="返回我的积分" data-action="mobile-back">${icon('back')}</button><strong>${overview ? '积分总览' : '校园银行'}</strong><div class="mobile-prd-actions">${overview ? '' : `<button aria-label="查看积分规则" data-action="mobile-help">${icon('info')}</button>`}<button type="button" class="prd-trigger" data-action="view-prd" aria-haspopup="dialog">PRD</button></div></header>${studentSelector()}${overview ? mobilePointsOverview(a) : `${mobileBank(a)}<footer class="mobile-foot">${icon('shield')}积分存款仅适用于校园积分，不涉及现金</footer>`}`}</main></div>`;
}
function mobilePointDetail() {
  const item = state.pointEntry;
  const heading = `<header class="mobile-point-header"><button type="button" aria-label="返回积分明细" data-action="mobile-point-back">${icon('back')}</button><h1 id="mobile-point-title" tabindex="-1">积分详情</h1><button type="button" class="prd-trigger" data-action="view-prd" aria-haspopup="dialog">PRD</button></header>`;
  let content;
  if (item) {
    const bankCaption = bankPointCaptions[item.kind];
    const caption = bankCaption || (Number(item.availableDelta) < 0 ? '本次扣减积分' : '本次获得积分');
    const source = bankCaption ? pointSources.bank : pointSources[item.kind] || '积分变动';
    const delta = signedPoints(item.availableDelta);
    content = `<section class="mobile-point-summary">
      <div class="mobile-point-amount"><strong>${delta}</strong><p>${caption}</p></div>
      <dl class="mobile-point-fields">
        <div><dt>${icon('calendar')}得分时间</dt><dd><time datetime="${esc(item.createdAt)}">${fullTime(item.createdAt)}</time></dd></div>
        <div><dt>${icon('file')}得分形式</dt><dd>${source}</dd></div>
      </dl>
    </section>
    <section class="mobile-point-info" aria-labelledby="mobile-point-info-title">
      <h2 id="mobile-point-info-title">详情信息</h2>
      <dl class="mobile-point-fields">
        <div><dt>学生姓名</dt><dd>${esc(item.studentName)}</dd></div>
        <div><dt>变动类型</dt><dd>${pointTitles[item.kind] || '积分变动'}</dd></div>
        <div><dt>本次积分变动</dt><dd>${delta} 积分</dd></div>
        ${item.depositNumber ? `<div><dt>存款单号</dt><dd>${esc(item.depositNumber)}</dd></div>` : ''}
      </dl>
    </section>`;
  } else if (state.pointError === 'unavailable') {
    content = '<p class="mobile-point-state" role="status">该积分记录不可查看</p>';
  } else if (state.pointError === 'failed') {
    content = '<div class="mobile-point-state"><p role="alert">暂时无法读取积分详情</p><button type="button" class="btn" data-action="mobile-point-retry">重试</button></div>';
  } else {
    content = '<p class="mobile-point-state" role="status">正在读取积分详情…</p>';
  }
  return `<div class="mobile-stage original-stage"><main class="phone original-phone mobile-point-page">${heading}${content}</main></div>`;
}
function mobilePointsOverview(a) {
  const total = Number(a.total);
  const availableShare = total > 0 ? Number(a.available) / total * 100 : 0;
  const availablePercent = Math.round(availableShare * 10) / 10;
  const lockedPercent = total > 0 ? 100 - availablePercent : 0;
  return `<section class="points-overview">
    <div class="points-total"><h1>积分总额</h1><strong>${money(a.total)}</strong><span>积分</span></div>
    ${total > 0
      ? `<div class="points-pie" role="img" aria-label="可用积分 ${availablePercent.toFixed(1)}%，定期锁定积分 ${lockedPercent.toFixed(1)}%" style="--available-share:${availableShare}%"></div>`
      : '<div class="points-pie empty-pie" role="img" aria-label="暂无积分">暂无积分</div>'}
    <dl class="points-legend"><div><dt><i class="points-swatch available-swatch"></i>可用积分总额</dt><dd>${money(a.available)} 积分 <small>${availablePercent.toFixed(1)}%</small></dd></div><div><dt><i class="points-swatch locked-swatch"></i>定期锁定积分</dt><dd>${money(a.locked)} 积分 <small>${lockedPercent.toFixed(1)}%</small></dd></div></dl>
  </section>`;
}
function mobileWallet(a) {
  const history = state.points;
  return `<header class="original-wallet-header"><button class="original-back" aria-label="返回上一页" data-action="wallet-back">${icon('back')}</button><nav class="original-asset-tabs" aria-label="资产分类"><span>积分卡</span><span>勋章</span><span class="selected" aria-current="page">积分</span></nav><button type="button" class="prd-trigger wallet-prd-trigger" data-action="view-prd" aria-haspopup="dialog">PRD</button></header>
    <section class="original-account"><div class="original-student-cutout"><label class="original-student-select"><select id="student-select" aria-label="当前学生">${state.bootstrap.students.map(s => `<option value="${s.id}" ${s.id === state.studentId ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select><span>▾</span></label></div>
    <div class="original-summary"><div><strong>${walletNumber(a.earned)}</strong><span>累计获得积分</span></div><div><strong>${walletNumber(a.redeemed)}</strong><span>已兑换积分</span></div><div><button class="available-entry" data-action="mobile-overview"><strong>${walletNumber(a.available)}</strong><span>可用积分 ${icon('back')}</span></button></div></div>
    <button class="original-deposit-entry" data-action="mobile-bank"><span>校园银行</span><span class="entry-action">存入 / 查看 ${icon('back')}</span></button></section>
    <section class="original-score-section"><div class="original-score-heading"><h2>积分明细</h2><label><select id="wallet-period" aria-label="变动时间"><option value="all" ${!state.walletPeriod || state.walletPeriod === 'all' ? 'selected' : ''}>全部</option><option value="week" ${state.walletPeriod === 'week' ? 'selected' : ''}>近7天</option><option value="month" ${state.walletPeriod === 'month' ? 'selected' : ''}>近30天</option></select>${icon('back')}</label></div>
    <div class="original-score-list">${history.items.map(item => `<button class="original-score-card" data-action="mobile-point-detail" data-id="${esc(item.id)}"><div><strong>${pointTitles[item.kind] || '积分变动'}</strong><span class="score-change ${Number(item.availableDelta) <= 0 ? 'non-credit' : ''}">${signedPoints(item.availableDelta)} ${icon('back')}</span></div><div><time datetime="${esc(item.createdAt)}">${fullTime(item.createdAt)}</time><span class="score-cumulative">累计积分：<b>${walletNumber(item.cumulative)}</b></span></div></button>`).join('') || '<div class="original-empty">暂无积分明细</div>'}</div>
    ${history.total > history.pageSize ? `<div class="original-history-pager"><button class="btn" data-action="wallet-page" data-page="${history.page - 1}" ${history.page <= 1 ? 'disabled' : ''}>上一页</button><span>${history.page}</span><button class="btn" data-action="wallet-page" data-page="${history.page + 1}" ${history.page * history.pageSize >= history.total ? 'disabled' : ''}>下一页</button></div>` : ''}</section>
    <a class="original-market" href="./market.html" aria-label="积分超市">积分<br>超市</a>`;
}
function mobileBank(a) {
  const { school, products } = state.bootstrap, enabled = school.enabled && products.some(p => p.enabled), selected = products.find(p => p.id === state.productId);
  const live = localPreview(selected);
  return `<section class="bank-overview"><div class="overview-top"><span>${icon('bank')} 定期锁定积分总额</span><span class="overview-tag">到期自动到账</span></div><strong>${money(a.locked)}<small>积分</small></strong><div class="overview-bottom"><span>可用积分 <b>${money(a.available)}</b></span><span>累计到账利息 <b>+${money(a.interestPaid)}</b></span></div></section><section class="deposit-card"><div class="mobile-section-title"><h2>存一笔积分</h2><span>按月单利</span></div>${enabled ? `<div class="term-cards" role="group" aria-label="选择存期">${products.filter(p => p.enabled).map(p => `<button class="term-card ${p.id === state.productId ? 'selected' : ''}" data-action="select-product" data-id="${esc(p.id)}" aria-pressed="${p.id === state.productId}"><span>${termLabel(p)}</span><strong>${p.rate}<small>%</small></strong><span>月利率</span>${p.id === state.productId ? `<i>${icon('check')}</i>` : ''}</button>`).join('')}</div><form id="deposit-form" novalidate><label class="amount-label" for="deposit-amount">存入积分</label><div class="amount-input"><input id="deposit-amount" name="principal" inputmode="decimal" autocomplete="off" placeholder="请输入积分" value="${esc(state.principal)}"><button type="button" data-action="deposit-all">全部存入</button></div><p class="amount-help">${school.minimum}积分起存，可用 ${money(a.available)} 积分</p><div class="return-preview"><div><span>到期利息</span><strong id="live-interest">${live.interest}</strong></div><div><span>到期时间</span><b id="live-due">${live.due}</b></div></div><p class="lock-notice">${icon('clock')}存期内不可提前取出或使用，到期自动返还本息。</p><button class="mobile-primary" type="submit">确认存入</button></form>` : `<div class="closed-notice">${icon('info')}<strong>学校暂未开放新存款</strong><span>已有存款不受影响，仍会按原规则到期到账。</span></div>`}</section><section class="mobile-records"><div class="mobile-section-title"><h2>我的存款</h2><span>${state.records.total} 笔</span></div><div class="record-tabs" role="tablist" aria-label="我的存款状态">${[['', '全部'], ...Object.entries(statusNames)].map(([k, v]) => `<button role="tab" aria-selected="${state.mobileStatus === k}" class="${state.mobileStatus === k ? 'active' : ''}" data-action="mobile-status" data-status="${k}">${v}</button>`).join('')}</div>${state.records.items.length ? state.records.items.map(d => `<button class="mobile-record" data-action="detail" data-id="${esc(d.id)}"><div class="record-top"><span>${termLabel(d)}定期 <small>月利率 ${d.rate}%</small></span>${badge(d.status)}</div><div class="record-values"><div><span>存入本金</span><strong>${money(d.principal)}</strong></div><div><span>${d.status === 'settled' ? '已到账利息' : '到期利息'}</span><strong class="orange">+${money(d.expectedInterest)}</strong></div></div><div class="record-bottom"><span>${dateOnly(d.dueAt)} 00:00 ${d.status === 'settled' ? '已到期' : '到期'}</span><span>查看详情 ›</span></div></button>`).join('') : empty('暂无对应存款', '主动存入后，可在此查询每笔存款')}${state.records.total > 10 ? pagination(state.records) : ''}</section>`;
}
function localPreview(product) {
  let gain = '—';
  if (product && state.principal.length < 17 && /^(0|[1-9]\d*)(\.\d{1,2})?$/.test(state.principal)) {
    const [whole, fraction = ''] = state.principal.split('.');
    const n = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
    const rate = BigInt(product.rate.replace('.', ''));
    gain = `+${money(Number((n * rate * BigInt(product.months) + 5000n) / 10000n) / 100)}`;
  }
  let due = '—';
  if (product) {
    const start = Date.parse(`${dateOnly(state.bootstrap.now)}T00:00:00+08:00`);
    due = date(start + product.durationDays * 86_400_000);
  }
  return { interest: gain, due };
}
function render() {
  const previousTable = $('#point-records');
  const previousScroll = previousTable?.scrollLeft ?? 0;
  const selected = new Set(Array.from(previousTable?.querySelectorAll('input[data-point-record]:checked') ?? [], box => box.dataset.pointRecord));
  document.body.className = state.view === 'mobile' ? 'mobile-mode' : '';
  $('#app').innerHTML = demoBar() + (state.view === 'admin' ? adminShell() : mobileShell());
  const table = $('#point-records');
  if (previousTable && table) {
    table.scrollLeft = previousScroll;
    for (const box of table.querySelectorAll('input[data-point-record]')) box.checked = selected.has(box.dataset.pointRecord);
    syncPointSelection(table);
  }
}
function closeModal() { $('#modal-root').innerHTML = ''; state.modal = null; previousFocus?.focus(); }
function modal(title, content, { mobile = false, prd = null, trigger = document.activeElement } = {}) {
  state.modal ||= { type: 'information' };
  previousFocus = trigger;
  const navigation = prd?.length > 1 ? `<nav class="prd-jumps" aria-label="PRD 章节">
    ${prd.map(heading => `<button type="button" data-action="prd-jump" data-section="${esc(heading.id)}">${esc(heading.textContent)}</button>`).join('')}
  </nav>` : '';
  $('#modal-root').innerHTML = `<dialog class="modal ${mobile ? 'mobile-modal' : ''} ${prd ? 'prd-modal' : ''}" aria-labelledby="modal-title"><header><h2 id="modal-title">${esc(title)}</h2><button class="icon-btn" data-action="close-modal" aria-label="关闭">${icon('close')}</button></header>${navigation}<div class="modal-body">${content}</div></dialog>`;
  const dialog = $('#modal-root dialog');
  if (mobile) {
    const actions = dialog.querySelector('.modal-body > .modal-actions');
    if (actions) dialog.append(actions);
  }
  dialog.addEventListener('cancel', e => { if (state.busy) e.preventDefault(); else closeModal(); });
  dialog.addEventListener('click', e => { if (e.target === dialog && !state.busy) closeModal(); });
  dialog.showModal();
}
function showPrd(trigger) {
  const mobile = state.view === 'mobile';
  const selected = mobile ? state.mobilePage : state.adminPage === 'points' ? 'points' : state.tab;
  const template = $(`#prd-page-${selected}`);
  const title = template.content.querySelector('#prd-page-title').textContent;
  const sections = Array.from(template.content.querySelectorAll('h3[id], h4[id]'));
  state.modal = { type: 'prd' };
  modal(`${title} PRD`, template.innerHTML, { mobile, prd: sections, trigger });
}

function jumpToPrdSection(id) {
  const body = $('.prd-modal .modal-body');
  const heading = body.querySelector(`#${CSS.escape(id)}`);
  if (!heading) return;
  body.scrollTop += heading.getBoundingClientRect().top - body.getBoundingClientRect().top - 10;
  heading.tabIndex = -1;
  heading.focus({ preventScroll: true });
}
function showProduct(id) {
  const p = state.bootstrap.products.find(p => p.id === id);
  const available = state.bootstrap.termOptions.filter(term => !state.bootstrap.products.some(product => product.months === term.months));
  const termField = p
    ? `<input value="${termLabel(p)}" readonly>`
    : `<select name="months" required><option value="">请选择存期</option>${available.map(term => `<option value="${term.months}">${termLabel(term)}</option>`).join('')}</select>`;
  state.modal = { type: 'product', product: p };
  modal(p ? '编辑存期档位' : '新增存期档位', `<form id="product-form" novalidate><label class="form-field">存期${termField}</label><label class="form-field">月利率（%）<input name="rate" inputmode="decimal" value="${p?.rate ?? ''}" placeholder="0.00–100.00，最多两位小数"></label><label class="check-label product-enabled"><input name="enabled" type="checkbox" ${p?.enabled ? 'checked' : ''}>启用此档位</label><div class="inline-notice">${icon('info')}已有存款按存入时的利率和到期时间结算。</div><p id="form-error" role="alert" class="form-error"></p><footer class="modal-actions"><button type="button" class="btn" data-action="close-modal">取消</button><button class="btn primary" type="submit">保存档位</button></footer></form>`);
}
async function showDetail(id) {
  const d = await api(`/deposits/${encodeURIComponent(id)}`);
  const kinds = { deposit: '定期存入 · 本金锁定', principal_return: '到期本金返还', interest: '存款利息入账' };
  state.modal = { type: 'detail' };
  modal('存款详情', `<div class="detail-hero">${badge(d.status)}<span>存入本金</span><strong>${money(d.principal)}<small>积分</small></strong></div><dl class="detail-list"><div><dt>所属学生</dt><dd>${esc(d.studentName)} · ${esc(d.className)}</dd></div><div><dt>存期 / 月利率</dt><dd>${termLabel(d)} / ${d.rate}%</dd></div><div><dt>存入时间</dt><dd>${date(d.createdAt)}</dd></div><div><dt>到期时间</dt><dd>${date(d.dueAt)}</dd></div><div><dt>到期利息</dt><dd class="positive">+${money(d.expectedInterest)} 积分</dd></div><div><dt>本息合计</dt><dd>${money(d.total)} 积分</dd></div>${d.settledAt ? `<div><dt>实际到账时间</dt><dd>${date(d.settledAt)}</dd></div>` : ''}<div><dt>存款单号</dt><dd class="id-text">${esc(d.depositNumber)}</dd></div></dl><div class="inline-notice">${icon('info')}${d.status === 'settled' ? '本金和利息已自动转入可用积分；仅利息新增计入个人积分总额。' : d.settlementInProgress ? '存款已到期，系统正在处理到账，请稍后刷新查询，无需重复操作。' : '存期内不可提前取出或使用，到期日零点自动结算。'}</div><h3 class="ledger-title">积分流水</h3><div class="ledger-list">${d.ledger.map(l => `<div><span class="timeline-dot"></span><div><strong>${kinds[l.kind]}</strong><span>${date(l.createdAt)}</span></div><b>${Number(l.availableDelta) > 0 ? '+' : ''}${money(l.availableDelta)}</b></div>`).join('')}</div><footer class="modal-actions"><button class="btn primary" data-action="close-modal">关闭详情</button></footer>`, { mobile: state.view === 'mobile' });
}
function showConfirmation(q) {
  state.modal = { type: 'confirmation' };
  modal('确认存入积分', `<div class="confirm-owner">${icon('users')}为 ${esc(account().name)} 存入</div><div class="confirm-amount">${money(q.principal)}<small>积分</small></div><dl class="detail-list"><div><dt>存期</dt><dd>${termLabel(q)}</dd></div><div><dt>月利率</dt><dd>${q.rate}%（单利）</dd></div><div><dt>到期时间</dt><dd>${date(q.dueAt)}</dd></div><div><dt>到期利息</dt><dd class="orange">+${money(q.expectedInterest)} 积分</dd></div><div><dt>本息合计</dt><dd>${money(q.total)} 积分</dd></div></dl><div class="confirm-lock">${icon('clock')}确认后本金立即锁定，存期内不可提前取出或使用。到期本息自动到账。</div><p id="form-error" class="form-error" role="alert"></p><footer class="modal-actions"><button class="btn" data-action="close-modal">返回修改</button><button class="btn primary" data-action="confirm-deposit">确认存入并锁定</button></footer>`, { mobile: true });
}
async function switchProfile(profile) {
  closeModal(); await api('/demo/session', { profile }); state.view = ['parent', 'guardian'].includes(profile) ? 'mobile' : 'admin';
  state.studentId = ''; state.productId = ''; state.filters = {}; state.page = 1; state.tab = 'records'; state.principal = ''; state.quote = null; state.requestKey = null; state.mobileStatus = ''; state.mobilePage = 'wallet'; state.walletPage = 1; state.walletPeriod = 'all';
  state.adminPage = 'bank'; state.pointFilters = {}; state.pointPage = 1;
  state.pointEntry = null; state.pointId = ''; state.pointError = '';
  history.replaceState({}, '', state.view === 'mobile' ? mobileUrl() : adminUrl); await load(); telemetry('deposit_page_view');
}
async function loadMobilePointLocation() {
  const url = location.href;
  state.pointId = new URLSearchParams(location.search).get('point');
  state.pointEntry = null;
  state.pointError = '';
  state.mobilePage = state.pointId !== null ? 'point-detail' : 'wallet';
  const wallet = state.mobilePage === 'wallet' ? history.state?.pointWallet : null;
  if (wallet) {
    state.studentId = wallet.studentId;
    state.walletPeriod = wallet.period;
    state.walletPage = wallet.page;
  }
  if (state.mobilePage === 'point-detail' && state.bootstrap) {
    render();
    window.scrollTo(0, 0);
  }
  await load();
  if (location.href !== url) return;
  if (wallet) {
    $(`button[data-action="mobile-point-detail"][data-id="${CSS.escape(wallet.recordId)}"]`)?.focus({ preventScroll: true });
    window.scrollTo(0, wallet.scrollY);
  } else if (state.mobilePage === 'point-detail') {
    $('#mobile-point-title')?.focus({ preventScroll: true });
  }
}
async function action(button) {
  const a = button.dataset.action;
  if (a === 'close-modal') return closeModal();
  if (a === 'view-prd') return showPrd(button);
  if (a === 'prd-jump') return jumpToPrdSection(button.dataset.section);
  if (a === 'tools') { state.tools = !state.tools; return render(); }
  if (a === 'view') return switchProfile(button.dataset.view === 'mobile' ? 'parent' : 'admin');
  if (a === 'refresh') { if (!state.bootstrap) return location.reload(); await load(); return toast('数据已刷新'); }
  if (a === 'admin-page') { state.adminPage = button.dataset.page; return load(); }
  if (a === 'point-page') { state.pointPage = Number(button.dataset.page); return load(); }
  if (a === 'reset-point-filters') { state.pointFilters = {}; state.pointPage = 1; return load(); }
  if (a === 'tab') { state.tab = button.dataset.tab; state.page = 1; return load(); }
  if (a === 'reset-filters') { state.filters = {}; state.page = 1; return load(); }
  if (a === 'page') { state.page = Number(button.dataset.page); return load(); }
  if (a === 'select-product') { state.productId = button.dataset.id; state.quote = null; telemetry('deposit_product_selected', state.productId); return render(); }
  if (a === 'deposit-all') { state.principal = account().available; return render(); }
  if (a === 'mobile-status') { state.mobileStatus = button.dataset.status; state.page = 1; return load(); }
  if (a === 'mobile-back') { state.mobilePage = 'wallet'; state.walletPage = 1; return load(); }
  if (a === 'mobile-bank') { state.mobilePage = 'bank'; return load(); }
  if (a === 'mobile-overview') { state.mobilePage = 'overview'; return load(); }
  if (a === 'wallet-back') { window.history.back(); return; }
  if (a === 'wallet-page') { state.walletPage = Number(button.dataset.page); return load(); }
  if (a === 'mobile-point-detail') {
    const pointWallet = {
      studentId: state.studentId, period: state.walletPeriod || 'all', page: state.walletPage || 1,
      scrollY: window.scrollY, recordId: button.dataset.id,
    };
    history.replaceState({ pointWallet }, '');
    history.pushState({ pointFromWallet: true }, '', mobileUrl(button.dataset.id));
    return loadMobilePointLocation();
  }
  if (a === 'mobile-point-back') {
    if (history.state?.pointFromWallet) return history.back();
    history.replaceState({}, '', mobileUrl());
    return loadMobilePointLocation();
  }
  if (a === 'mobile-point-retry') return loadMobilePointLocation();
  if (a === 'point-detail') {
    const item = state.points.items.find(row => row.id === button.dataset.id);
    state.modal = { type: 'point-detail' };
    return modal('积分变动详情', `
      <dl class="detail-list">
        <div><dt>学生姓名</dt><dd>${esc(item.studentName)}</dd></div><div><dt>变动类型</dt><dd>${pointTitles[item.kind] || '积分变动'}</dd></div>
        <div><dt>变动时间</dt><dd>${fullTime(item.createdAt)}</dd></div><div><dt>可用积分变动</dt><dd>${signedPoints(item.availableDelta)} 积分</dd></div>
        <div><dt>变动后可用积分</dt><dd>${money(item.availableAfter)} 积分</dd></div>
        ${item.depositNumber ? `<div><dt>存款单号</dt><dd class="id-text">${esc(item.depositNumber)}</dd></div>` : ''}
      </dl><footer class="modal-actions"><button class="btn primary" data-action="close-modal">关闭</button></footer>`);
  }
  if (a === 'mobile-help') return modal('校园银行规则', `<div class="help-text"><p>1. 家长为当前绑定学生主动存入，允许多笔独立存款。</p><p>2. 到期利息 = 本金 × 月利率 × 存期月数，最终四舍五入保留两位小数。</p><p>3. 本金存期内不可使用，不支持提前取出。按北京时间存入日期加固定天数，在到期日 00:00 自动结算。</p><p>4. 1个月30天，2个月60天，3个月90天，6个月180天，12个月365天。周末及假期正常结算。</p><p>5. 后续调息、调整起存额及停用不改变已有存款的约定。</p><p>6. 已到账利息计入个人积分总额及排名；本金存入和返还不重复计入。</p></div><footer class="modal-actions"><button class="btn primary" data-action="close-modal">我已了解</button></footer>`, { mobile: true });
  if (a === 'product-new') return showProduct();
  if (a === 'product-edit') return showProduct(button.dataset.id);
  if (a === 'product-delete') {
    const product = state.bootstrap.products.find(p => p.id === button.dataset.id && p.canDelete);
    if (!product) return toast('档位状态已变更，请刷新后重试', true);
    state.modal = { type: 'product-delete', product };
    return modal('删除存期档位', `
      <p class="product-delete-copy">删除「${termLabel(product)}」档位后，可重新新增该存期。已有存款继续按原约定结算。</p>
      <p id="form-error" role="alert" class="form-error"></p>
      <footer class="modal-actions"><button type="button" class="btn" data-action="close-modal" autofocus>取消</button><button type="button" class="btn danger" data-action="confirm-product-delete">确认删除</button></footer>`, { trigger: button });
  }
  if (a === 'confirm-product-delete') {
    const { id, revision } = state.modal.product;
    try { await api('/products/delete', { id, revision }); }
    catch (error) {
      if (['STALE_CONFIG', 'NOT_FOUND', 'PRODUCT_ENABLED'].includes(error.code)) {
        closeModal();
        await load();
        return toast(error.message, true);
      }
      $('#form-error').textContent = error.message;
      return;
    }
    closeModal();
    await load();
    $('[data-action="product-new"]')?.focus();
    return toast('档位已删除');
  }
  if (a === 'detail') return showDetail(button.dataset.id);
  if (a === 'advance') { const failOnce = $('#fail-once')?.checked || false; const result = await api('/demo/advance', { studentId: state.view === 'mobile' ? state.studentId : undefined, failOnce }); await load(); return toast(result.results.some(r => !r.success) ? '已模拟结算失败，再次跳转可验证重试' : '已跳转演示时间，到期本息已自动结算'); }
  if (a === 'debit') return modal('模拟消费扣减', `<p class="subtle">仅对本地虚构账户执行。此操作用于验证定期本金无法被消费。</p><form id="debit-form" novalidate><label class="form-field">学生<select name="studentId">${state.bootstrap.students.map(s => `<option value="${s.id}">${esc(s.name)} · 可用${s.available} / 锁定${s.locked}</option>`).join('')}</select></label><label class="form-field">消费积分<input name="principal" inputmode="decimal" placeholder="请输入扣减积分"></label><p id="form-error" class="form-error" role="alert"></p><footer class="modal-actions"><button type="button" class="btn" data-action="close-modal">取消</button><button class="btn primary" type="submit">执行模拟扣减</button></footer></form>`);
  if (a === 'export') {
    const response = await demoFetch(`/api/export?${params()}`);
    if (!response.ok) throw new Error((await response.json()).message);
    const url = URL.createObjectURL(await response.blob()), link = document.createElement('a'); link.href = url; link.download = `积分定期存款_${dateOnly(state.bootstrap.now)}.xlsx`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 5000); return toast('已导出全部筛选结果');
  }
  if (a === 'confirm-deposit') {
    try {
      const result = await api('/deposits', { ...state.quote, requestKey: state.requestKey });
      closeModal(); state.principal = ''; state.quote = null; state.requestKey = null; state.mobileStatus = ''; state.page = 1; await load(); toast('存入成功，本金已锁定'); await showDetail(result.deposit.id);
    } catch (error) {
      if (['STALE_CONFIG', 'DISABLED', 'INSUFFICIENT_BALANCE', 'DEPOSIT_SEQUENCE_EXHAUSTED'].includes(error.code)) { closeModal(); state.quote = null; state.requestKey = null; await load(); toast(error.message, true); }
      else {
        const errorMessage = $('#form-error');
        if (!errorMessage) throw error;
        errorMessage.textContent = `${error.message}。可使用原请求重试，不会重复存入。`;
        errorMessage.scrollIntoView({ block: 'nearest' });
      }
    }
  }
}
function setBusy(busy) { state.busy = busy; document.querySelectorAll('button').forEach(b => { if (busy) { b.dataset.wasDisabled = b.disabled ? '1' : '0'; b.disabled = true; } else if (b.dataset.wasDisabled !== undefined) { b.disabled = b.dataset.wasDisabled === '1'; delete b.dataset.wasDisabled; } }); }
document.addEventListener('click', async e => {
  const button = e.target.closest('button[data-action]'); if (!button || button.disabled || state.busy) return;
  const prdAction = button.dataset.action === 'view-prd' || state.modal?.type === 'prd';
  if (!prdAction) setBusy(true);
  try { await action(button); } catch (error) { toast(error.message, true); } finally { if (!prdAction) setBusy(false); }
});
document.addEventListener('change', async e => {
  if (e.target.closest('#settings-form, #filter-form, #point-filter-form')) state.draftDirty = true;
  const pointTable = e.target.closest('#point-records');
  if (pointTable) {
    if (e.target.id === 'point-select-page') {
      for (const box of pointTable.querySelectorAll('input[data-point-record]')) box.checked = e.target.checked;
    }
    syncPointSelection(pointTable);
    return;
  }
  try {
    if (e.target.id === 'demo-profile') return await switchProfile(e.target.value);
    if (e.target.id === 'wallet-period') { state.walletPeriod = e.target.value; state.walletPage = 1; return await load(); }
    if (e.target.id === 'student-select') { state.studentId = e.target.value; state.page = 1; state.walletPage = 1; state.principal = ''; state.quote = null; state.requestKey = null; await load(); }
  } catch (error) { toast(error.message, true); }
});
document.addEventListener('input', e => {
  if (e.target.closest('#settings-form, #filter-form, #point-filter-form')) state.draftDirty = true;
  if (e.target.id === 'deposit-amount') {
    state.principal = e.target.value; state.quote = null; state.requestKey = null;
    const preview = localPreview(state.bootstrap.products.find(p => p.id === state.productId));
    $('#live-interest').textContent = preview.interest; $('#live-due').textContent = preview.due;
  }
});
document.addEventListener('submit', async e => {
  const form = e.target; if (!['filter-form', 'point-filter-form', 'settings-form', 'product-form', 'deposit-form', 'debit-form'].includes(form.id)) return;
  e.preventDefault(); if (state.busy) return; setBusy(true);
  try {
    const data = Object.fromEntries(new FormData(form));
    if (form.id === 'filter-form') { const old = state.filters; state.filters = data; state.page = 1; try { await load(); } catch (error) { state.filters = old; throw error; } }
    if (form.id === 'point-filter-form') {
      const old = state.pointFilters, page = state.pointPage;
      state.pointFilters = data; state.pointPage = 1;
      try { await load(); } catch (error) { state.pointFilters = old; state.pointPage = page; state.draftDirty = true; throw error; }
    }
    if (form.id === 'settings-form') { await api('/settings', { minimum: data.minimum, enabled: data.enabled === 'on', version: state.bootstrap.school.version }); await load(); toast('基础设置已保存，仅影响后续存入'); }
    if (form.id === 'product-form') {
      const product = state.modal?.product;
      const months = product?.months ?? Number(data.months);
      if (!state.bootstrap.termOptions.some(term => term.months === months)) throw new Error('请选择存期');
      const rate = data.rate.trim();
      if (!/^(0|[1-9]\d*)(\.\d{1,2})?$/.test(rate) || Number(rate) > 100) {
        throw new Error('月利率须在 0% 至 100% 之间，最多保留两位小数');
      }
      await api('/products', { id: product?.id, revision: product?.revision, months, rate, enabled: data.enabled === 'on' });
      closeModal();
      await load();
      toast('档位已保存，已有存款约定保持不变');
    }
    if (form.id === 'deposit-form') { state.quote = await api('/quote', { studentId: state.studentId, productId: state.productId, principal: data.principal }); state.requestKey = crypto.randomUUID(); telemetry('deposit_confirm_view', state.productId); showConfirmation(state.quote); }
    if (form.id === 'debit-form') { await api('/demo/debit', data); closeModal(); await load(); toast('模拟扣减成功，仅扣除可用积分'); }
  } catch (error) { const el = $('#form-error'); if (el) el.textContent = error.message; else toast(error.message, true); }
  finally { setBusy(false); }
});
try {
  const session = await api('/session');
  if ((state.view === 'mobile') !== (session.actor.role === 'parent')) await api('/demo/session', { profile: state.view === 'mobile' ? 'parent' : 'admin' });
  if (state.view === 'mobile') await loadMobilePointLocation();
  else await load();
  telemetry('deposit_page_view');
} catch (error) { $('#app').innerHTML = `<div class="boot-error"><h1>暂时无法读取积分账户</h1><p>${esc(error.message)}</p><button class="btn primary" data-action="refresh">重新加载</button></div>`; }
window.addEventListener('popstate', async () => {
  if (isMobileLocation() !== (state.view === 'mobile')) return location.reload();
  if (state.view !== 'mobile') return;
  closeModal();
  try { await loadMobilePointLocation(); } catch (error) { toast(error.message, true); }
});
// Reconcile background settlements and cross-tab configuration changes without interrupting input.
setInterval(async () => {
  if (state.busy || state.modal || state.draftDirty || !state.bootstrap || document.hidden || ['INPUT', 'SELECT'].includes(document.activeElement?.tagName)) return;
  if (state.view === 'mobile' && state.mobilePage === 'point-detail') return;
  try { await load(); } catch { /* Explicit actions retain visible error reporting. */ }
}, 15000);
