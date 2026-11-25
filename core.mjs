const randomUUID = () => globalThis.crypto.randomUUID();

export class BusinessError extends Error {
  constructor(message, status = 400, code = 'INVALID_REQUEST') { super(message); this.status = status; this.code = code; }
}
const fail = (message, status, code) => { throw new BusinessError(message, status, code); };
export const DEMO_PROFILES = Object.freeze({
  admin: { id: 'admin-a', name: '学校管理员', role: 'admin', schoolId: 'school-a' },
  viewer: { id: 'viewer-a', name: '四年级（1）班班主任', role: 'viewer', schoolId: 'school-a', className: '四年级（1）班' },
  parent: { id: 'parent-a', name: '家长', role: 'parent', schoolId: 'school-a', studentIds: ['s01', 's02'] },
  guardian: { id: 'parent-shared', name: '另一位绑定家长', role: 'parent', schoolId: 'school-a', studentIds: ['s01'] },
  otherSchool: { id: 'admin-b', name: '另一学校管理员', role: 'admin', schoolId: 'school-b' },
});
const MAX_UNITS = 1_000_000_000_000;
const MAX_MONTHLY_RATE = 10_000;
const DAY_MS = 86_400_000;
const TERM_DAYS = Object.freeze({ 1: 30, 2: 60, 3: 90, 6: 180, 12: 365 });
const canUseProduct = product => product.enabled && Object.hasOwn(TERM_DAYS, product.months) && product.rate <= MAX_MONTHLY_RATE;
export function units(value, label = '积分') {
  const text = String(value ?? '').trim();
  if (!/^(0|[1-9]\d*)(\.\d{1,2})?$/.test(text)) fail(`${label}须为非负数，最多保留两位小数`);
  const [whole, decimal = ''] = text.split('.');
  const n = BigInt(whole) * 100n + BigInt(decimal.padEnd(2, '0'));
  if (n > BigInt(MAX_UNITS)) fail(`${label}超出可支持范围`);
  return Number(n);
}
export const amount = n => (n / 100).toFixed(2);
export function interest(principal, rate, months) {
  const result = (BigInt(principal) * BigInt(rate) * BigInt(months) + 5000n) / 10000n;
  if (result > BigInt(MAX_UNITS)) fail('到期利息超出可支持范围');
  return Number(result);
}
export const localDate = value => new Date(new Date(value).getTime() + 28_800_000).toISOString().slice(0, 10);
export function dueDate(start, months) {
  if (!Object.hasOwn(TERM_DAYS, months)) fail('存期只能选择1、2、3、6或12个月');
  const due = new Date(Date.parse(`${localDate(start)}T00:00:00+08:00`) + TERM_DAYS[months] * DAY_MS);
  if (!Number.isFinite(due.getTime()) || new Date(due.getTime() + 28_800_000).getUTCFullYear() > 9999) fail('存期超出可支持日期范围');
  return due.toISOString();
}
const iso = value => new Date(value).toISOString();
const fingerprint = value => JSON.stringify(value);

export class DepositService {
  constructor(filename = ':memory:', { clock = () => Date.now(), seed = true, DatabaseSync } = {}) {
    this.clock = clock;
    this.db = new DatabaseSync(filename);
    this.db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=MEMORY; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS settings (school_id TEXT PRIMARY KEY, name TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 0, minimum INTEGER NOT NULL DEFAULT 100 CHECK(minimum>0), version INTEGER NOT NULL DEFAULT 1);
      CREATE TABLE IF NOT EXISTS products (id TEXT PRIMARY KEY, school_id TEXT NOT NULL REFERENCES settings(school_id), months INTEGER NOT NULL CHECK(months>0), rate INTEGER NOT NULL CHECK(rate>=0), enabled INTEGER NOT NULL DEFAULT 0, revision INTEGER NOT NULL DEFAULT 1, UNIQUE(school_id,months));
      CREATE TABLE IF NOT EXISTS students (id TEXT PRIMARY KEY, school_id TEXT NOT NULL REFERENCES settings(school_id), number TEXT NOT NULL, name TEXT NOT NULL, class_name TEXT NOT NULL, available INTEGER NOT NULL CHECK(available>=0), locked INTEGER NOT NULL DEFAULT 0 CHECK(locked>=0), earned INTEGER NOT NULL, interest_paid INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS deposits (id TEXT PRIMARY KEY, school_id TEXT NOT NULL REFERENCES settings(school_id), student_id TEXT NOT NULL REFERENCES students(id), actor_id TEXT NOT NULL, product_id TEXT NOT NULL REFERENCES products(id), months INTEGER NOT NULL, rate INTEGER NOT NULL, principal INTEGER NOT NULL CHECK(principal>0), expected_interest INTEGER NOT NULL, rule_version TEXT NOT NULL, created_at TEXT NOT NULL, due_at TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('active','pending','settled')), settled_at TEXT, attempts INTEGER NOT NULL DEFAULT 0, retry_at TEXT, last_error TEXT);
      CREATE INDEX IF NOT EXISTS deposits_due ON deposits(status,due_at);
      CREATE INDEX IF NOT EXISTS deposits_school_student ON deposits(school_id,student_id,created_at);
      CREATE TABLE IF NOT EXISTS deposit_sequences (
        school_id TEXT NOT NULL REFERENCES settings(school_id),
        deposit_day TEXT NOT NULL,
        last_number INTEGER NOT NULL CHECK(last_number BETWEEN 1 AND 999999),
        PRIMARY KEY(school_id,deposit_day)
      );
      CREATE TABLE IF NOT EXISTS requests (actor_id TEXT NOT NULL, request_key TEXT NOT NULL, fingerprint TEXT NOT NULL, deposit_id TEXT NOT NULL REFERENCES deposits(id), PRIMARY KEY(actor_id,request_key));
      CREATE TABLE IF NOT EXISTS ledger (id TEXT PRIMARY KEY, school_id TEXT NOT NULL, student_id TEXT NOT NULL, deposit_id TEXT, kind TEXT NOT NULL, available_delta INTEGER NOT NULL, locked_delta INTEGER NOT NULL, earned_delta INTEGER NOT NULL, balance INTEGER NOT NULL, created_at TEXT NOT NULL, UNIQUE(deposit_id,kind));
      CREATE TABLE IF NOT EXISTS audit (id INTEGER PRIMARY KEY AUTOINCREMENT, school_id TEXT NOT NULL, actor_id TEXT NOT NULL, event TEXT NOT NULL, detail TEXT NOT NULL, created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY AUTOINCREMENT, school_id TEXT NOT NULL, actor_id TEXT NOT NULL, event TEXT NOT NULL, detail TEXT NOT NULL, created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY,value TEXT NOT NULL);
      INSERT OR IGNORE INTO meta VALUES('offset','0');`);
    if (seed && !this.db.prepare('SELECT 1 FROM settings LIMIT 1').get()) this.seed();
    this.ensureDepositNumbers();
  }
  close() { this.db.close(); }
  now() { return iso(this.clock() + Number(this.db.prepare("SELECT value FROM meta WHERE key='offset'").get().value)); }
  tx(fn) { this.db.exec('BEGIN IMMEDIATE'); try { const result = fn(); this.db.exec('COMMIT'); return result; } catch (e) { this.db.exec('ROLLBACK'); throw e; } }
  ensureDepositNumbers() {
    const hasColumn = () => this.db.prepare("SELECT 1 FROM pragma_table_info('deposits') WHERE name='deposit_number'").get();
    if (hasColumn() && !this.db.prepare('SELECT 1 FROM deposits WHERE deposit_number IS NULL LIMIT 1').get()) return;

    this.tx(() => {
      if (!hasColumn()) {
        this.db.prepare('ALTER TABLE deposits ADD COLUMN deposit_number TEXT').run();
        this.db.prepare('CREATE UNIQUE INDEX deposits_unique_number ON deposits(deposit_number,school_id)').run();
      }
      const history = this.db.prepare(`
        SELECT id,school_id,created_at FROM deposits WHERE deposit_number IS NULL
        ORDER BY school_id,created_at,id
      `).all();
      const update = this.db.prepare('UPDATE deposits SET deposit_number=? WHERE id=?');
      for (const deposit of history) {
        update.run(this.allocateDepositNumber(deposit.school_id, deposit.created_at), deposit.id);
      }
    });
  }
  allocateDepositNumber(schoolId, createdAt) {
    const day = localDate(createdAt).replaceAll('-', '');
    const advanced = this.db.prepare(`
      INSERT INTO deposit_sequences(school_id,deposit_day,last_number) VALUES(?,?,1)
      ON CONFLICT(school_id,deposit_day) DO UPDATE SET last_number=last_number+1 WHERE last_number<999999
    `).run(schoolId, day);
    if (!advanced.changes) fail('当天存款单号已用完，请次日再试', 409, 'DEPOSIT_SEQUENCE_EXHAUSTED');
    const { last_number: sequence } = this.db.prepare(
      'SELECT last_number FROM deposit_sequences WHERE school_id=? AND deposit_day=?',
    ).get(schoolId, day);
    return day + String(sequence).padStart(6, '0');
  }
  audit(actor, event, detail) { this.db.prepare('INSERT INTO audit(school_id,actor_id,event,detail,created_at) VALUES(?,?,?,?,?)').run(actor.schoolId, actor.id, event, JSON.stringify(detail), this.now()); }
  emit(actor, event, detail = {}) { this.db.prepare('INSERT INTO events(school_id,actor_id,event,detail,created_at) VALUES(?,?,?,?,?)').run(actor.schoolId, actor.id, event, JSON.stringify(detail), this.now()); }
  admin(actor) { if (actor.role !== 'admin') fail('无规则配置或管理操作权限', 403, 'FORBIDDEN'); }
  student(actor, id) {
    const s = this.db.prepare('SELECT * FROM students WHERE id=? AND school_id=?').get(id, actor.schoolId);
    if (!s || (actor.role === 'parent' && !actor.studentIds.includes(id)) || (actor.role === 'viewer' && s.class_name !== actor.className)) fail('无该学生的数据访问权限', 403, 'FORBIDDEN');
    return s;
  }
  scope(actor, alias = 's') {
    let sql = `${alias}.school_id=?`; const args = [actor.schoolId];
    if (actor.role === 'parent') { sql += ` AND ${alias}.id IN (${actor.studentIds.map(() => '?').join(',')})`; args.push(...actor.studentIds); }
    if (actor.role === 'viewer') { sql += ` AND ${alias}.class_name=?`; args.push(actor.className); }
    return { sql, args };
  }
  account(actor, id) {
    const s = this.student(actor, id);
    const rank = this.db.prepare('SELECT COUNT(*)+1 n FROM students WHERE school_id=? AND earned>?').get(actor.schoolId, s.earned).n;
    const redeemed = this.db.prepare("SELECT COALESCE(SUM(CASE WHEN kind='opening' THEN MAX(earned_delta-available_delta,0) WHEN kind='debit' THEN -available_delta ELSE 0 END),0) total FROM ledger WHERE student_id=?").get(id).total;
    return { id: s.id, name: s.name, number: s.number, className: s.class_name, available: amount(s.available), locked: amount(s.locked), earned: amount(s.earned), redeemed: amount(redeemed), interestPaid: amount(s.interest_paid), rank };
  }
  pointHistory(actor, filters = {}) {
    this.student(actor, filters.studentId);
    const period = filters.period || 'all', requestedPage = Number(filters.page || 1), pageSize = 10;
    if (!['all', 'week', 'month'].includes(period)) fail('得分时间范围无效');
    if (!Number.isSafeInteger(requestedPage) || requestedPage < 1 || requestedPage > 1_000_000) fail('分页参数无效');
    let where = 'l.student_id=? AND l.earned_delta>0'; const args = [filters.studentId];
    if (period !== 'all') { where += ' AND l.created_at>=?'; args.push(iso(new Date(this.now()).getTime() - (period === 'week' ? 7 : 30) * 86400000)); }
    const total = this.db.prepare(`SELECT COUNT(*) total FROM ledger l WHERE ${where}`).get(...args).total;
    const page = Math.min(requestedPage, Math.max(1, Math.ceil(total / pageSize)));
    const rows = this.db.prepare(`SELECT l.*,(SELECT SUM(p.earned_delta) FROM ledger p WHERE p.student_id=l.student_id AND p.rowid<=l.rowid) cumulative FROM ledger l WHERE ${where} ORDER BY l.created_at DESC,l.rowid DESC LIMIT ? OFFSET ?`).all(...args, pageSize, (page - 1) * pageSize);
    const titles = { opening: '历史积分', interest: '存款利息', evaluation: '德育评价' };
    return { items: rows.map(l => ({ id: l.id, title: titles[l.kind] || '积分获得', kind: l.kind, points: amount(l.earned_delta), cumulative: amount(l.cumulative), createdAt: l.created_at, depositId: l.deposit_id })), total, page, pageSize };
  }
  bootstrap(actor) {
    const { sql, args } = this.scope(actor);
    const students = this.db.prepare(`SELECT s.* FROM students s WHERE ${sql} ORDER BY s.number`).all(...args).map(s => this.account(actor, s.id));
    const setting = this.db.prepare('SELECT * FROM settings WHERE school_id=?').get(actor.schoolId);
    const termOptions = Object.entries(TERM_DAYS).map(([months, durationDays]) => ({ months: Number(months), durationDays }));
    const products = this.db.prepare('SELECT * FROM products WHERE school_id=? ORDER BY months').all(actor.schoolId)
      .filter(p => Object.hasOwn(TERM_DAYS, p.months) && (actor.role !== 'parent' || canUseProduct(p)))
      .map(p => ({ id: p.id, months: p.months, durationDays: TERM_DAYS[p.months], rate: amount(p.rate), enabled: !!canUseProduct(p), revision: p.revision, ruleVersion: `${setting.version}:${p.revision}` }));
    return { actor, now: this.now(), school: { id: setting.school_id, name: setting.name, enabled: !!setting.enabled, minimum: amount(setting.minimum), version: setting.version }, students, products, termOptions };
  }
  updateSettings(actor, data) {
    this.admin(actor); const minimum = units(data.minimum, '最低起存额');
    if (!minimum) fail('最低起存额不得小于0.01积分');
    if (typeof data.enabled !== 'boolean') fail('功能状态无效');
    return this.tx(() => {
      const old = this.db.prepare('SELECT * FROM settings WHERE school_id=?').get(actor.schoolId);
      if (data.version !== old.version) fail('配置已被更新，请刷新后重试', 409, 'STALE_CONFIG');
      if (data.enabled && !this.db.prepare('SELECT months,rate,enabled FROM products WHERE school_id=? AND enabled=1').all(actor.schoolId).some(canUseProduct)) fail('请先启用至少一个存期档位');
      this.db.prepare('UPDATE settings SET minimum=?,enabled=?,version=version+1 WHERE school_id=?').run(minimum, Number(data.enabled), actor.schoolId);
      this.audit(actor, 'settings_changed', { before: { minimum: old.minimum, enabled: old.enabled }, after: { minimum, enabled: data.enabled } });
      return this.bootstrap(actor);
    });
  }
  saveProduct(actor, data) {
    this.admin(actor);
    const months = Number(data.months);
    if (!Object.hasOwn(TERM_DAYS, months)) fail('存期只能选择1、2、3、6或12个月');
    const rate = units(data.rate, '月利率');
    if (rate > MAX_MONTHLY_RATE) fail('月利率须在 0% 至 100% 之间');
    if (typeof data.enabled !== 'boolean') fail('档位状态无效');
    return this.tx(() => {
      const old = data.id ? this.db.prepare('SELECT * FROM products WHERE id=? AND school_id=?').get(data.id, actor.schoolId) : null;
      if (data.id && !old) fail('档位不存在', 404);
      if (old && data.revision !== old.revision) fail('档位已被更新，请刷新后重试', 409, 'STALE_CONFIG');
      if (this.db.prepare('SELECT id FROM products WHERE school_id=? AND months=? AND id<>?').get(actor.schoolId, months, data.id || '')) fail('该存期档位已存在，请编辑已有档位');
      if (old && months !== old.months) fail('已有档位不可修改存期，请新增档位');
      const id = old?.id || randomUUID();
      if (old) this.db.prepare('UPDATE products SET rate=?,enabled=?,revision=revision+1 WHERE id=?').run(rate, Number(data.enabled), id);
      else this.db.prepare('INSERT INTO products(id,school_id,months,rate,enabled) VALUES(?,?,?,?,?)').run(id, actor.schoolId, months, rate, Number(data.enabled));
      this.audit(actor, old ? 'product_changed' : 'product_created', { productId: id, months, rate, enabled: data.enabled, previousRate: old?.rate });
      return this.bootstrap(actor);
    });
  }
  quote(actor, data, start = this.now()) {
    if (actor.role !== 'parent') fail('请使用绑定学生的家长身份存入', 403, 'FORBIDDEN');
    const student = this.student(actor, data.studentId);
    const setting = this.db.prepare('SELECT * FROM settings WHERE school_id=?').get(actor.schoolId);
    if (!setting.enabled) fail('学校暂未开放积分定期存款', 409, 'DISABLED');
    const product = this.db.prepare('SELECT * FROM products WHERE id=? AND school_id=? AND enabled=1').get(data.productId, actor.schoolId);
    if (!product || !canUseProduct(product)) fail('该档位已停用，请重新选择', 409, 'DISABLED');
    const principal = units(data.principal, '存入积分');
    if (principal < setting.minimum) fail(`最低起存额为${amount(setting.minimum)}积分`);
    if (principal > student.available) fail('可用积分不足，定期本金不可再次存入', 409, 'INSUFFICIENT_BALANCE');
    const expectedInterest = interest(principal, product.rate, product.months);
    if (student.available + student.locked + expectedInterest > MAX_UNITS || student.earned + expectedInterest > MAX_UNITS) fail('本息合计超出账户可支持范围');
    return { studentId: student.id, productId: product.id, principal: amount(principal), months: product.months, durationDays: TERM_DAYS[product.months], rate: amount(product.rate), expectedInterest: amount(expectedInterest), total: amount(principal + expectedInterest), dueAt: dueDate(start, product.months), ruleVersion: `${setting.version}:${product.revision}`, quotedAt: start };
  }
  createDeposit(actor, data) {
    if (typeof data.requestKey !== 'string' || !/^[a-zA-Z0-9_-]{8,120}$/.test(data.requestKey)) fail('缺少有效的请求标识');
    this.student(actor, data.studentId);
    const hash = fingerprint([data.studentId, data.productId, String(data.principal), data.ruleVersion, data.dueAt]);
    return this.tx(() => {
      const previous = this.db.prepare('SELECT * FROM requests WHERE actor_id=? AND request_key=?').get(actor.id, data.requestKey);
      if (previous) {
        if (previous.fingerprint !== hash) fail('相同请求标识不能提交不同存款', 409, 'IDEMPOTENCY_CONFLICT');
        return { deposit: this.detail(actor, previous.deposit_id), replayed: true };
      }
      const quote = this.quote(actor, data);
      if (data.ruleVersion !== quote.ruleVersion || data.dueAt !== quote.dueAt) fail('规则或到期时间已变化，请重新试算并确认', 409, 'STALE_CONFIG');
      const id = randomUUID(), principal = units(quote.principal), expected = units(quote.expectedInterest);
      const changed = this.db.prepare('UPDATE students SET available=available-?,locked=locked+? WHERE id=? AND available>=?').run(principal, principal, data.studentId, principal);
      if (!changed.changes) fail('可用积分不足', 409, 'INSUFFICIENT_BALANCE');
      const depositNumber = this.allocateDepositNumber(actor.schoolId, quote.quotedAt);
      this.db.prepare("INSERT INTO deposits(id,school_id,student_id,actor_id,product_id,months,rate,principal,expected_interest,rule_version,created_at,due_at,status,deposit_number) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,'active',?)").run(id, actor.schoolId, data.studentId, actor.id, quote.productId, quote.months, units(quote.rate), principal, expected, quote.ruleVersion, quote.quotedAt, quote.dueAt, depositNumber);
      this.ledger(data.studentId, id, 'deposit', -principal, principal, 0);
      this.db.prepare('INSERT INTO requests VALUES(?,?,?,?)').run(actor.id, data.requestKey, hash, id);
      this.audit(actor, 'deposit_created', { depositId: id, studentId: data.studentId, principal, ruleVersion: quote.ruleVersion });
      this.emit(actor, 'deposit_result', { success: true, depositId: id, months: quote.months });
      return { deposit: this.detail(actor, id), replayed: false };
    });
  }
  ledger(studentId, depositId, kind, availableDelta, lockedDelta, earnedDelta) {
    const s = this.db.prepare('SELECT * FROM students WHERE id=?').get(studentId);
    this.db.prepare('INSERT INTO ledger VALUES(?,?,?,?,?,?,?,?,?,?)').run(randomUUID(), s.school_id, studentId, depositId, kind, availableDelta, lockedDelta, earnedDelta, s.available, this.now());
  }
  settleDue({ failIds = [] } = {}) {
    const now = this.now();
    const rows = this.db.prepare("SELECT id FROM deposits WHERE status<>'settled' AND due_at<=? AND (retry_at IS NULL OR retry_at<=?) ORDER BY due_at").all(now, now);
    const results = [];
    for (const { id } of rows) {
      try {
        const settled = this.tx(() => {
          const d = this.db.prepare("SELECT * FROM deposits WHERE id=? AND status<>'settled'").get(id);
          if (!d) return false;
          const s = this.db.prepare('SELECT * FROM students WHERE id=?').get(d.student_id);
          if (failIds.includes(id)) throw new Error('模拟结算服务暂不可用');
          if (s.locked < d.principal) throw new Error('账户锁定本金校验失败');
          if (s.available + d.principal + d.expected_interest > MAX_UNITS || s.earned + d.expected_interest > MAX_UNITS) throw new Error('账户金额超出可支持范围');
          this.db.prepare('UPDATE students SET available=available+?,locked=locked-? WHERE id=?').run(d.principal, d.principal, d.student_id);
          this.ledger(d.student_id, id, 'principal_return', d.principal, -d.principal, 0);
          this.db.prepare('UPDATE students SET available=available+?,earned=earned+?,interest_paid=interest_paid+? WHERE id=?').run(d.expected_interest, d.expected_interest, d.expected_interest, d.student_id);
          this.ledger(d.student_id, id, 'interest', d.expected_interest, 0, d.expected_interest);
          this.db.prepare("UPDATE deposits SET status='settled',settled_at=?,attempts=attempts+1,last_error=NULL,retry_at=NULL WHERE id=?").run(now, id);
          this.audit({ id: 'settlement-worker', schoolId: d.school_id }, 'deposit_settled', { depositId: id, principal: d.principal, interest: d.expected_interest });
          return true;
        });
        if (settled) results.push({ id, success: true });
      } catch (error) {
        this.tx(() => {
          this.db.prepare("UPDATE deposits SET status='pending',attempts=attempts+1,last_error=?,retry_at=? WHERE id=? AND status<>'settled'").run(error.message, iso(new Date(now).getTime() + 60_000), id);
          const d = this.db.prepare('SELECT school_id FROM deposits WHERE id=?').get(id);
          this.audit({ id: 'settlement-worker', schoolId: d.school_id }, 'settlement_failed', { depositId: id, reason: error.message });
        });
        results.push({ id, success: false });
      }
    }
    return results;
  }
  decorate(row, now = this.now()) {
    const settled = row.status === 'settled';
    const durationDays = (Date.parse(localDate(row.due_at)) - Date.parse(localDate(row.created_at))) / DAY_MS;
    return { id: row.id, depositNumber: row.deposit_number, studentId: row.student_id, studentName: row.name, studentNumber: row.number, className: row.class_name, actorId: row.actor_id, principal: amount(row.principal), months: row.months, durationDays, rate: amount(row.rate), expectedInterest: amount(row.expected_interest), total: amount(row.principal + row.expected_interest), ruleVersion: row.rule_version, createdAt: row.created_at, dueAt: row.due_at, settledAt: row.settled_at, status: settled ? 'settled' : 'active', settlementInProgress: !settled && row.due_at <= now, attempts: row.attempts, lastError: row.last_error };
  }
  detail(actor, id) {
    const row = this.db.prepare('SELECT d.*,s.name,s.number,s.class_name FROM deposits d JOIN students s ON s.id=d.student_id WHERE d.id=? AND d.school_id=?').get(id, actor.schoolId);
    if (!row) fail('存款不存在或无访问权限', 404, 'NOT_FOUND');
    this.student(actor, row.student_id);
    const ledger = this.db.prepare('SELECT kind,available_delta,locked_delta,earned_delta,balance,created_at FROM ledger WHERE deposit_id=? ORDER BY rowid').all(id).map(r => ({ kind: r.kind, availableDelta: amount(r.available_delta), lockedDelta: amount(r.locked_delta), earnedDelta: amount(r.earned_delta), balance: amount(r.balance), createdAt: r.created_at }));
    return { ...this.decorate(row), ledger };
  }
  list(actor, filters = {}, { all = false } = {}) {
    const { sql: scope, args: scopeArgs } = this.scope(actor);
    const args = [...scopeArgs];
    let where = scope;
    if (filters.studentId) { this.student(actor, filters.studentId); where += ' AND s.id=?'; args.push(filters.studentId); }
    for (const [key, column] of [['name', 's.name'], ['number', 's.number'], ['className', 's.class_name']]) {
      if (filters[key]?.trim()) { where += ` AND instr(${column},?)>0`; args.push(filters[key].trim()); }
    }
    for (const [startKey, endKey, column] of [['start', 'end', 'd.created_at'], ['dueStart', 'dueEnd', 'd.due_at']]) {
      for (const key of [startKey, endKey]) if (filters[key]) {
        const date = filters[key];
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(`${date}T00:00:00+08:00`)) || localDate(`${date}T00:00:00+08:00`) !== date) fail('日期格式无效');
      }
      if (filters[startKey] && filters[endKey] && filters[startKey] > filters[endKey]) fail('开始日期不得晚于结束日期');
      if (filters[startKey]) { where += ` AND ${column}>=?`; args.push(iso(`${filters[startKey]}T00:00:00+08:00`)); }
      if (filters[endKey]) { where += ` AND ${column}<?`; args.push(iso(Date.parse(`${filters[endKey]}T00:00:00+08:00`) + 86_400_000)); }
    }
    if (filters.status && !['active', 'pending', 'settled'].includes(filters.status)) fail('存款状态无效');
    const now = this.now();
    if (filters.status === 'active') where += " AND d.status<>'settled'";
    if (filters.status === 'pending') { where += " AND d.status<>'settled' AND d.due_at<=?"; args.push(now); }
    if (filters.status === 'settled') where += " AND d.status='settled'";
    const page = filters.page === undefined || filters.page === '' ? 1 : Number(filters.page), pageSize = 10;
    if (!Number.isSafeInteger(page) || page < 1 || page > 1_000_000) fail('分页参数无效');
    const deposits = 'FROM deposits d JOIN students s ON s.id=d.student_id';
    const summary = this.db.prepare(`
      SELECT COUNT(*) count,
        COALESCE(SUM(CASE WHEN d.status<>'settled' THEN d.principal ELSE 0 END),0) locked,
        COALESCE(SUM(CASE WHEN d.status='settled' THEN d.expected_interest ELSE 0 END),0) paid,
        COALESCE(SUM(CASE WHEN d.status<>'settled' AND d.due_at<=? THEN 1 ELSE 0 END),0) pending
      ${deposits} WHERE ${scope}
    `).get(now, ...scopeArgs);
    const total = where === scope ? summary.count : this.db.prepare(`SELECT COUNT(*) count ${deposits} WHERE ${where}`).get(...args).count;
    const rows = this.db.prepare(`SELECT d.*,s.name,s.number,s.class_name ${deposits} WHERE ${where} ORDER BY d.created_at DESC,d.deposit_number ${all ? '' : 'LIMIT ? OFFSET ?'}`).all(...args, ...(all ? [] : [pageSize, (page - 1) * pageSize]));
    return { items: rows.map(row => this.decorate(row, now)), total, page, pageSize, summary: { count: summary.count, locked: amount(summary.locked), paid: amount(summary.paid), pending: summary.pending } };
  }
  logs(actor, filters = {}) {
    if (actor.role === 'parent') fail('无管理日志权限', 403, 'FORBIDDEN');
    if (actor.role === 'viewer') fail('无管理日志权限', 403, 'FORBIDDEN');
    const requestedPage = filters.page === undefined || filters.page === '' ? 1 : Number(filters.page), pageSize = 10;
    if (!Number.isSafeInteger(requestedPage) || requestedPage < 1 || requestedPage > 1_000_000) fail('分页参数无效');
    const total = this.db.prepare('SELECT COUNT(*) total FROM audit WHERE school_id=?').get(actor.schoolId).total;
    const page = Math.min(requestedPage, Math.max(1, Math.ceil(total / pageSize)));
    const items = this.db.prepare('SELECT id,actor_id,event,created_at FROM audit WHERE school_id=? ORDER BY id DESC LIMIT ? OFFSET ?').all(actor.schoolId, pageSize, (page - 1) * pageSize);
    return { items, total, page, pageSize };
  }
  debit(actor, studentId, principal) {
    this.admin(actor); this.student(actor, studentId); const value = units(principal, '扣减积分');
    if (!value) fail('扣减积分须大于0');
    return this.tx(() => {
      if (!this.db.prepare('UPDATE students SET available=available-? WHERE id=? AND available>=?').run(value, studentId, value).changes) fail('可用积分不足，不得使用锁定本金', 409, 'INSUFFICIENT_BALANCE');
      this.ledger(studentId, null, 'debit', -value, 0, 0); this.audit(actor, 'demo_debit', { studentId, principal: value });
      return this.account(actor, studentId);
    });
  }
  advanceDemo(actor, { studentId, failOnce = false } = {}) {
    if (studentId) this.student(actor, studentId);
    const scope = this.scope(actor);
    const next = this.db.prepare(`SELECT d.id,d.due_at,d.retry_at FROM deposits d JOIN students s ON s.id=d.student_id WHERE ${scope.sql} AND d.status<>'settled' ${studentId ? 'AND s.id=?' : ''} ORDER BY COALESCE(d.retry_at,d.due_at) LIMIT 1`).get(...scope.args, ...(studentId ? [studentId] : []));
    if (!next) fail('当前范围没有未结清的存款');
    const target = Math.max(new Date(this.now()).getTime(), new Date(next.retry_at || next.due_at).getTime()) + 1000;
    this.db.prepare("UPDATE meta SET value=? WHERE key='offset'").run(String(target - this.clock()));
    this.audit(actor, 'demo_clock_advanced', { to: this.now(), failOnce });
    return { now: this.now(), results: this.settleDue({ failIds: failOnce ? [next.id] : [] }) };
  }
  seed() {
    const admin = DEMO_PROFILES.admin, now = new Date(this.now()).getTime();
    this.tx(() => {
      this.db.prepare('INSERT INTO settings(school_id,name,enabled) VALUES(?,?,?)').run('school-a', '一德演示小学', 1);
      this.db.prepare('INSERT INTO settings(school_id,name,enabled) VALUES(?,?,?)').run('school-b', '另一所演示学校', 0);
      for (const school of ['school-a', 'school-b']) for (const [months, rate] of [[1, 100], [2, 150], [3, 200]]) this.db.prepare('INSERT INTO products(id,school_id,months,rate,enabled) VALUES(?,?,?,?,?)').run(`${school}-p${months}`, school, months, rate, Number(school === 'school-a'));
      const names = ['林小满', '林知夏', '陈星宇', '周沐阳', '许安宁', '沈书言', '苏予安', '江一诺', '叶嘉禾', '陆明轩', '宋可欣', '顾星辰'];
      names.forEach((name, index) => {
        const id = `s${String(index + 1).padStart(2, '0')}`, className = `四年级（${Math.floor(index / 4) + 1}）班`, available = 185300 - index * 5000;
        this.db.prepare('INSERT INTO students(id,school_id,number,name,class_name,available,earned) VALUES(?,?,?,?,?,?,?)').run(id, 'school-a', `202604${String(index + 1).padStart(3, '0')}`, name, className, available, available + 100000);
        this.ledger(id, null, 'opening', available, 0, available + 100000);
        const months = index % 3 + 1, principal = 10000 + index * 1000, start = iso(now - (index % 8 + 3) * 86400000), due = dueDate(start, months), rate = [100, 150, 200][months - 1];
        const depositId = `sample-${index + 1}`;
        this.db.prepare('UPDATE students SET available=available-?,locked=locked+? WHERE id=?').run(principal, principal, id);
        this.db.prepare("INSERT INTO deposits(id,school_id,student_id,actor_id,product_id,months,rate,principal,expected_interest,rule_version,created_at,due_at,status) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,'active')").run(depositId, 'school-a', id, 'demo-parent', `school-a-p${months}`, months, rate, principal, interest(principal, rate, months), '1:1', start, due);
        this.ledger(id, depositId, 'deposit', -principal, principal, 0);
      });
      this.db.prepare('INSERT INTO students(id,school_id,number,name,class_name,available,earned) VALUES(?,?,?,?,?,?,?)').run('b01', 'school-b', '202601001', '另一校学生', '一年级（1）班', 50000, 50000);
      this.ledger('b01', null, 'opening', 50000, 0, 50000);
      const start = iso(now - 100 * 86400000), principal = 15000;
      this.db.prepare('UPDATE students SET available=available-?,locked=locked+? WHERE id=?').run(principal, principal, 's01');
      this.db.prepare("INSERT INTO deposits(id,school_id,student_id,actor_id,product_id,months,rate,principal,expected_interest,rule_version,created_at,due_at,status) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,'active')").run('sample-matured', 'school-a', 's01', 'demo-parent', 'school-a-p1', 1, 100, principal, 150, '1:1', start, dueDate(start, 1));
      this.ledger('s01', 'sample-matured', 'deposit', -principal, principal, 0);
      this.audit(admin, 'demo_initialized', { description: '虚构演示数据；演示学校已启用，新增学校默认关闭。' });
    });
    this.settleDue();
  }
}
