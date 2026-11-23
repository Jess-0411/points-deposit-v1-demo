import { BusinessError, DEMO_PROFILES, DepositService } from './core.mjs';
import { workbook } from './xlsx.mjs';

const storageKey = 'yyide.points-deposit-v1.sqlite';
const profileKey = 'yyide.points-deposit-v1.profile';
const xlsxType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function encode(bytes) {
  const chunks = [];
  for (let start = 0; start < bytes.length; start += 8192) {
    chunks.push(String.fromCharCode(...bytes.subarray(start, start + 8192)));
  }
  return btoa(chunks.join(''));
}

function decode(snapshot) {
  return Uint8Array.from(atob(snapshot), character => character.charCodeAt(0));
}

function useService(SQL, storage, clock, operation) {
  const snapshot = storage.getItem(storageKey);
  const sqlite = new SQL.Database(snapshot ? decode(snapshot) : undefined);
  let changed = !snapshot;
  const connection = class {
    exec(sql) { sqlite.exec(sql); }
    close() { sqlite.close(); }
    prepare(sql) {
      function read(args, first) {
        const statement = sqlite.prepare(sql, args);
        try {
          if (first) return statement.step() ? statement.getAsObject() : undefined;
          const rows = [];
          while (statement.step()) rows.push(statement.getAsObject());
          return rows;
        } finally {
          statement.free();
        }
      }
      return {
        get: (...args) => read(args, true),
        all: (...args) => read(args, false),
        run(...args) {
          sqlite.run(sql, args);
          changed = true;
          return { changes: sqlite.getRowsModified() };
        },
      };
    }
  };
  try {
    const service = new DepositService(':memory:', { DatabaseSync: connection, clock });
    try {
      return operation(service);
    } finally {
      // The core commits or rolls back before returning. Persist only a complete database.
      if (changed) storage.setItem(storageKey, encode(sqlite.export()));
    }
  } finally {
    sqlite.close();
  }
}

function downloadWorkbook(service, actor, filters) {
  service.admin(actor);
  const result = service.list(actor, filters, { all: true });
  if (!result.total) throw new BusinessError('当前筛选条件下无可导出数据');
  const labels = { active: '存款中', pending: '待到账', settled: '已到账' };
  const date = iso => iso ? new Date(Date.parse(iso) + 28_800_000).toISOString().replace('T', ' ').slice(0, 19) : '';
  const columns = ['学生姓名', '学号', '班级', '存款单号', '本金（积分）', '存期（月）', '月利率（%）', '存入时间（北京时间）', '到期时间（北京时间）', '到期利息（积分）', '本息合计（积分）', '状态', '实际到账时间（北京时间）'];
  const rows = result.items.map(deposit => [
    deposit.studentName, deposit.studentNumber, deposit.className, deposit.id, Number(deposit.principal),
    deposit.months, Number(deposit.rate), date(deposit.createdAt), date(deposit.dueAt),
    Number(deposit.expectedInterest), Number(deposit.total), labels[deposit.status], date(deposit.settledAt),
  ]);
  service.audit(actor, 'records_exported', { filters, count: result.total });
  return new Response(workbook([columns, ...rows]), { headers: { 'Content-Type': xlsxType } });
}

function route(service, profiles, url, method, data) {
  const currentProfile = profiles.getItem(profileKey);
  const actor = Object.hasOwn(DEMO_PROFILES, currentProfile) ? DEMO_PROFILES[currentProfile] : DEMO_PROFILES.admin;
  const path = url.pathname;
  if (method === 'GET') {
    if (path === '/api/session') return { actor, demo: true };
    if (path === '/api/bootstrap') return service.bootstrap(actor);
    if (path === '/api/point-history') return service.pointHistory(actor, data);
    if (path === '/api/deposits') return service.list(actor, data);
    if (path === '/api/logs') return service.logs(actor, data);
    if (path === '/api/export') return downloadWorkbook(service, actor, data);
    const details = /^\/api\/deposits\/([^/]+)$/.exec(path);
    if (details) return service.detail(actor, decodeURIComponent(details[1]));
  }
  if (method === 'POST') {
    if (path === '/api/demo/session') {
      if (!Object.hasOwn(DEMO_PROFILES, data.profile)) throw new BusinessError('演示角色不存在');
      profiles.setItem(profileKey, data.profile);
      return service.bootstrap(DEMO_PROFILES[data.profile]);
    }
    if (path === '/api/settings') return service.updateSettings(actor, data);
    if (path === '/api/products') return service.saveProduct(actor, data);
    if (path === '/api/quote') return service.quote(actor, data);
    if (path === '/api/deposits') return Response.json(service.createDeposit(actor, data), { status: 201 });
    if (path === '/api/demo/debit') return service.debit(actor, data.studentId, data.principal);
    if (path === '/api/demo/advance') return service.advanceDemo(actor, data);
    if (path === '/api/events') {
      if (!['deposit_page_view', 'deposit_product_selected', 'deposit_confirm_view'].includes(data.event)) {
        throw new BusinessError('埋点事件无效');
      }
      service.emit(actor, data.event, { productId: typeof data.productId === 'string' ? data.productId.slice(0, 80) : undefined });
      return { ok: true };
    }
  }
  throw new BusinessError('接口不存在', 404, 'NOT_FOUND');
}

export function createBrowserApi({ sql, storage, profiles, locks, clock = Date.now }) {
  async function run(operation) {
    const SQL = await sql;
    const task = () => useService(SQL, storage, clock, operation);
    return locks ? locks.request(storageKey, task) : task();
  }

  return {
    async fetch(path, { method = 'GET', body } = {}) {
      try {
        const url = new URL(path, 'https://demo.invalid');
        const data = method === 'POST' ? JSON.parse(body || '{}') : Object.fromEntries(url.searchParams);
        const result = await run(service => {
          service.settleDue();
          return route(service, profiles, url, method, data);
        });
        return result instanceof Response ? result : Response.json(result);
      } catch (error) {
        if (error instanceof BusinessError) return Response.json({ message: error.message, code: error.code }, { status: error.status });
        console.error(error);
        return Response.json({ message: '浏览器暂时无法读取或保存演示数据，请重试。', code: 'DEMO_STORAGE_ERROR' }, { status: 500 });
      }
    },
    settle: () => run(service => service.settleDue()),
  };
}

let browserApi;
export async function demoFetch(path, options) {
  if (!browserApi) {
    try {
      browserApi = createBrowserApi({
        sql: globalThis.initSqlJs({ locateFile: file => new URL('./vendor/' + file, import.meta.url).href }),
        storage: localStorage,
        profiles: sessionStorage,
        locks: navigator.locks,
      });
      setInterval(() => {
        if (!document.hidden) browserApi.settle().catch(console.error);
      }, 1000);
    } catch (error) {
      console.error(error);
      return Response.json({ message: '浏览器暂时无法启动积分演示，请重试。', code: 'DEMO_START_ERROR' }, { status: 500 });
    }
  }
  return browserApi.fetch(path, options);
}
