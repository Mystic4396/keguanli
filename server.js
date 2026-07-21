// Deploy v2.1 - prospect memos
const express = require('express');
const https = require('https');
const path = require('path');

const app = express();
const compression = require('compression');
app.use(compression());
app.use(express.json());


const PORT = process.env.PORT || 3000;

const REDIS_URL = 'https://enhanced-gecko-136149.upstash.io';
const REDIS_TOKEN = 'gQAAAAAAAhPVAAIgcDE2ZWVhMDNiZTI5OTM0YjlkYTA3MzQ0Y2VmOTZmZmIxNQ';

// 多门店Redis Key映射
const STORE_KEY_MAP = {
  henglicheng: { db: "classmanager:db", backup: "classmanager:db:backup", perf: "classmanager:perf", perfBackup: "classmanager:perf:backup" },
  baolong: { db: "classmanager:db:baolong", backup: "classmanager:db:baolong:backup", perf: "classmanager:perf:baolong", perfBackup: "classmanager:perf:baolong:backup" },
  taihe: { db: "classmanager:db:taihe", backup: "classmanager:db:taihe:backup", perf: "classmanager:perf:taihe", perfBackup: "classmanager:perf:taihe:backup" },
  yangguang: { db: "classmanager:db:yangguang", backup: "classmanager:db:yangguang:backup", perf: "classmanager:perf:yangguang", perfBackup: "classmanager:perf:yangguang:backup" }
};
const STORE_LABELS = { henglicheng: "恒力城店", baolong: "宝龙店", taihe: "泰禾店", yangguang: "阳光天地店" };
function getKey(store, type) { const m = STORE_KEY_MAP[store]; return m ? m[type] : STORE_KEY_MAP.henglicheng[type]; }
function getDataKey(store) { return getKey(store, "db"); }
function getBackupKey(store) { return getKey(store, "backup"); }
function getPerfKey(store) { return getKey(store, "perf"); }
function getPerfBackupKey(store) { return getKey(store, "perfBackup"); }
function getStoreLabel(store) { return STORE_LABELS[store] || store; }

const DEFAULT_DATA = {
  coaches: [],
  students: [],
  records: [],
  nextId: 1
};

function redisReq(method, pathname, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(pathname, REDIS_URL);
    const opts = {
      hostname: u.hostname, path: u.pathname, method,
      headers: { 'Authorization': `Bearer ${REDIS_TOKEN}`, 'Content-Type': 'application/json' }
    };
    const req = https.request(opts, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        try {
          const d = Buffer.concat(chunks).toString('utf8');
          resolve(JSON.parse(d));
        } catch(e) { reject(new Error('Parse: '+Buffer.concat(chunks).toString('utf8').slice(0,100))); }
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

function isValidData(data) {
  return data
    && typeof data === 'object'
    && Array.isArray(data.coaches)
    && Array.isArray(data.students)
    && Array.isArray(data.records)
    && typeof data.nextId === 'number';
}

function safeParse(raw) {
  if (raw == null || raw === '') return null;
  try {
    let data = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (typeof data === 'string') data = JSON.parse(data);
    if (isValidData(data)) return data;
  } catch(e) {}
  if (typeof raw === 'string') {
    const idx = raw.indexOf('{');
    if (idx > 0) {
      try {
        let data = JSON.parse(raw.substring(idx));
        if (typeof data === 'string') data = JSON.parse(data);
        if (isValidData(data)) {
          console.warn('⚠️ Recovered data from corrupted Redis value (skipped prefix)');
          return data;
        }
      } catch(e) {}
    }
  }
  return null;
}

// 数据自修复：清理乱码和缺失字段，防止前端显示异常
const VALID_TYPES = new Set(['次卡', '月卡', '提高班']);
const TYPE_FIX_MAP = {}; // 动态匹配：含"提"和"班"→提高班，含"月"和"卡"→月卡，含"次"和"卡"→次卡

function sanitizeStudent(s) {
  let changed = false;
  // 1. 修复name中的替换字符(U+FFFD) - 无法自动还原，但记录警告
  if (s.name && s.name.includes('\ufffd')) {
    console.warn(`⚠️ Corrupted name detected: id=${s.id} name=${s.name}`);
    // 乱码名无法自动修，至少不crash
  }
  // 2. 修复type字段：乱码或缺失
  const t = s.type || '';
  if (!t) {
    // 无type：有expiry→月卡，否则→次卡
    s.type = s.expiry ? '月卡' : '次卡';
    changed = true;
  } else if (t.includes('\ufffd')) {
    // 乱码type：按billing或expiry推断
    if (s.billing || s.expiry) {
      // 如果有提高班相关字段(age/weight/height/run*/fitness/tech)，判为提高班
      const hasAdvFields = s.age != null || s.weight != null || s.height != null ||
                           s.run200m != null || s.fitness != null || s.tech != null;
      s.type = hasAdvFields ? '提高班' : (s.expiry ? '月卡' : '次卡');
    } else {
      s.type = s.expiry ? '月卡' : '次卡';
    }
    changed = true;
    console.warn(`⚠️ Fixed corrupted type: id=${s.id} → ${s.type}`);
  } else if (!VALID_TYPES.has(t)) {
    // 非法type（如半截中文）
    if (t.includes('提')) s.type = '提高班';
    else if (t.includes('月')) s.type = '月卡';
    else if (t.includes('次')) s.type = '次卡';
    else s.type = s.expiry ? '月卡' : '次卡';
    changed = true;
    console.warn(`⚠️ Fixed invalid type: id=${s.id} "${t}" → ${s.type}`);
  }
  // 3. 修复note中的替换字符
  if (s.note && s.note.includes('\ufffd')) {
    s.note = s.note.replace(/\ufffd/g, '');
    changed = true;
  }
  return changed;
}

function sanitizeData(data) {
  if (!data || !data.students) return false;
  let anyChanged = false;
  for (const s of data.students) {
    if (sanitizeStudent(s)) anyChanged = true;
  }
  return anyChanged;
}

async function readData(store) {
  const DATA_KEY = getDataKey(store);
  const BACKUP_KEY = getBackupKey(store);
  try {
    const r = await redisReq('GET', `/get/${DATA_KEY}`);
    const data = safeParse(r.result);
    if (data) {
      if (sanitizeData(data)) {
        console.log('🔧 Auto-repairing data, writing back...');
        writeData(data, store).catch(e => console.error('Auto-repair write failed:', e.message));
      }
      return data;
    }
  } catch(e) {
    console.error('Read error:', e.message);
  }
  console.warn('⚠️ Main data unreadable, trying backup...');
  try {
    const rb = await redisReq('GET', `/get/${BACKUP_KEY}`);
    const data = safeParse(rb.result);
    if (data) {
      if (sanitizeData(data)) {
        console.log('🔧 Auto-repairing data from backup, writing back...');
        writeData(data, store).catch(e => console.error('Auto-repair write failed:', e.message));
      }
      return data;
    }
  } catch(e) {
    console.error('Backup read error:', e.message);
  }
  console.error('❌ Both main and backup failed, using in-memory defaults. Redis NOT overwritten.');
  return JSON.parse(JSON.stringify(DEFAULT_DATA));
}

async function initRedisIfNeeded(store) {
  const DATA_KEY = getDataKey(store);
  const BACKUP_KEY = getBackupKey(store);
  try {
    const r = await redisReq('GET', `/get/${DATA_KEY}`);
    if (r.result == null || r.result === '') {
      console.log(`Redis is empty (${store}), initializing default data...`);
      await writeData(DEFAULT_DATA, store);
    } else {
      const data = safeParse(r.result);
      if (!data) {
        console.warn('⚠️ Existing data is corrupted, trying backup...');
        const rb = await redisReq('GET', `/get/${BACKUP_KEY}`);
        const backup = safeParse(rb.result);
        if (backup) {
          console.log('Restoring from backup...');
          await _rawWrite(DATA_KEY, backup);
        }
      } else {
        console.log(`Redis has valid data (${store}), skipping init.`);
      }
    }
  } catch(e) {
    console.error('Init check error:', e.message);
  }
}

async function _rawWrite(key, data) {
  // Use text/plain to avoid Upstash double-encoding Chinese characters
  const body = typeof data === 'string' ? data : JSON.stringify(data);
  return new Promise((resolve, reject) => {
    const u = new URL('/set/' + key, REDIS_URL);
    const opts = {
      hostname: u.hostname, path: u.pathname, method: 'POST',
      headers: { 'Authorization': 'Bearer ' + REDIS_TOKEN, 'Content-Type': 'text/plain' }
    };
    const req = require('https').request(opts, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => { try { const r = JSON.parse(Buffer.concat(chunks).toString('utf8')); resolve(r.result === 'OK'); } catch(e) { reject(e); } });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function writeData(data, store) {
  const DATA_KEY = getDataKey(store);
  const BACKUP_KEY = getBackupKey(store);
  if (!isValidData(data)) {
    console.error('❌ BLOCKED write: data validation failed. Students count:', data?.students?.length);
    return false;
  }
  if (data.students.length === 0) {
    try {
      const r = await redisReq('GET', `/get/${DATA_KEY}`);
      const existing = safeParse(r.result);
      if (existing && existing.students && existing.students.length > 0) {
        console.error(`❌ BLOCKED write: attempting to overwrite ${existing.students.length} students with empty list!`);
        return false;
      }
    } catch(e) {}
  }
  try {
    const current = await redisReq('GET', `/get/${DATA_KEY}`);
    if (current.result != null && current.result !== '') {
      await _rawWrite(BACKUP_KEY, current.result);
    }
  } catch(e) {
    console.warn('Backup before write failed (non-fatal):', e.message);
  }
  try {
    const result = await _rawWrite(DATA_KEY, data);
    // Verify write: async non-blocking read-back check
    redisReq('GET', `/get/${DATA_KEY}`).then(vr => {
      const vData = safeParse(vr.result);
      if (!vData || vData.students.length !== data.students.length) {
        console.error(`❌ WRITE VERIFICATION FAILED: expected ${data.students.length} students, got ${vData ? vData.students.length : 'null'}`);
      }
    }).catch(() => {});
    return result;
  } catch(e) {
    console.error('Write error:', e.message);
    return false;
  }
}

app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: '7d',
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) {
      res.set('Cache-Control', 'no-cache');
    }
  }
}));

// 所有数据API都支持store参数
// Lightweight ping for keep-alive (no Redis call)
app.get('/api/ping', (req, res) => res.json({ok:true,time:Date.now()}));

app.get('/api/data', async (req, res) => {
  const store = req.query.store || 'henglicheng';
  try {
    const data = await readData(store);
    res.json({ ...data, coaches: data.coaches.map(c => ({ username: c.username, name: c.name })) });
  } catch(e) {
    res.status(500).json({ error: '读取失败' });
  }
});

app.post('/api/login', async (req, res) => {
  const store = req.body.store || 'henglicheng';
  try {
    const data = await readData(store);
    const coach = data.coaches.find(c => c.username === req.body.username && c.password === req.body.password);
    if (!coach) return res.status(401).json({ error: '账号或密码错误' });
    res.json({ name: coach.name, username: coach.username });
  } catch(e) {
    res.status(500).json({ error: '登录失败' });
  }
});

function nowLocal(){const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')+'T'+String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0')+':'+String(d.getSeconds()).padStart(2,'0')}
// 原子扣课接口：由服务器计算课时，避免客户端全量覆盖导致并发丢失
app.post('/api/deduct', async (req, res) => {
  const store = req.body.store || 'henglicheng';
  try {
    const data = await readData(store);
    const coach = data.coaches.find(c => c.username === (req.body.auth||{}).username && c.password === (req.body.auth||{}).password);
    if (!coach) return res.status(401).json({ error: '未授权' });
    const { studentId, n, mode } = req.body;
    if (!studentId || !n || n <= 0) return res.status(400).json({ error: '参数不完整' });
    const stu = data.students.find(s => s.id === studentId);
    if (!stu) return res.status(404).json({ error: '学员不存在' });
    if (mode === 'mk') {
      // 月卡/提高班：已上课时+n
      stu.classes += n;
    } else {
      // 次卡：剩余课时-n
      if (stu.classes < n) return res.status(400).json({ error: '课时不足' });
      stu.classes -= n;
    }
    const record = { sid: studentId, sname: stu.name, coach: coach.name, time: nowLocal(), after: stu.classes, type: '扣', n };
    data.records.unshift(record);
    const ok = await writeData(data, store);
    ok ? res.json({ ok: true, student: stu, record }) : res.status(500).json({ error: '保存失败' });
  } catch(e) {
    console.error('Deduct error:', e.message);
    res.status(500).json({ error: '扣课失败' });
  }
});

app.put('/api/data', async (req, res) => {
  const store = req.body.store || 'henglicheng';
  try {
    const data = await readData(store);
    const coach = data.coaches.find(c => c.username === (req.body.auth||{}).username && c.password === (req.body.auth||{}).password);
    if (!coach) return res.status(401).json({ error: '未授权' });
    const u = req.body.updates || {};
    if (u.students) data.students = u.students;
    if (u.records) data.records = u.records;
    if (u.nextId !== undefined) data.nextId = u.nextId;
    const ok = await writeData(data, store);
    ok ? res.json({ ok: true }) : res.status(500).json({ error: '保存失败' });
  } catch(e) {
    console.error('PUT error:', e.message);
    res.status(500).json({ error: '保存失败' });
  }
});

app.get('/api/export', async (req, res) => {
  const store = req.query.store || 'henglicheng';
  try {
    const data = await readData(store);
    res.setHeader('Content-Disposition', `attachment; filename=keguanli_${store}_backup.json`);
    res.json(data);
  } catch(e) {
    res.status(500).json({ error: '导出失败' });
  }
});

app.get('/api/export-html', async (req, res) => {
  const store = req.query.store || 'henglicheng';
  try {
    const data = await readData(store);
    const now = new Date().toLocaleString('zh-CN', {timeZone:'Asia/Shanghai'});
    const stuMap = {};
    data.students.forEach(s => { stuMap[s.id] = { ...s, recs: [] }; });
    data.records.forEach(r => { if (stuMap[r.sid]) stuMap[r.sid].recs.push(r); });

    function groupByDay(recs) {
      const g = {};
      recs.forEach(r => {
        const d = new Date(r.time);
        const k = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
        if (!g[k]) g[k] = [];
        g[k].push(r);
      });
      return g;
    }

    let stuHtml = '';
    data.students.sort((a,b) => a.id.localeCompare(b.id)).forEach(s => {
      const recs = stuMap[s.id] ? stuMap[s.id].recs : [];
      const grouped = groupByDay(recs);
      const sortedDays = Object.keys(grouped).sort().reverse();
      let recHtml = '';
      if (sortedDays.length === 0) {
        recHtml = '<tr><td colspan="4" style="text-align:center;color:#999;padding:12px">暂无记录</td></tr>';
      } else {
        sortedDays.forEach(day => {
          recHtml += `<tr><td colspan="4" style="background:#f3f4f6;font-weight:600;padding:6px 10px;font-size:13px">${day}</td></tr>`;
          grouped[day].forEach(r => {
            const d = new Date(r.time);
            const t = String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0');
            const isAdd = r.type === '充';
            recHtml += `<tr><td style="padding:6px 10px">${t}</td><td style="padding:6px 10px;color:${isAdd?'#059669':'#dc2626'};font-weight:600">${isAdd?(r.n===0&&r.note?r.note:'充值 '+r.n+'节'):'扣减 '+r.n+'节'}</td><td style="padding:6px 10px">${r.coach}</td><td style="padding:6px 10px;font-weight:600">${r.n===0&&r.note?r.note:'余'+r.after+'节'}</td></tr>`;
          });
        });
      }
      const storeLabel = getStoreLabel(store);
      stuHtml += `<div style="margin-bottom:24px;background:#fff;border-radius:10px;box-shadow:0 1px 3px rgba(0,0,0,.08);overflow:hidden"><div style="background:#4F46E5;color:#fff;padding:12px 16px;display:flex;justify-content:space-between;align-items:center"><span style="font-size:16px;font-weight:600">${s.name}</span><span style="background:rgba(255,255,255,.2);padding:3px 12px;border-radius:20px;font-size:14px">剩余 ${s.classes} 节</span></div><div style="padding:8px 16px;color:#666;font-size:13px">编号：${s.id}${s.note ? '　备注：' + s.note : ''}　门店：${storeLabel}</div><table style="width:100%;border-collapse:collapse;font-size:14px"><tr style="background:#f9fafb;color:#666;font-size:12px"><th style="padding:6px 10px;text-align:left">时间</th><th style="padding:6px 10px;text-align:left">操作</th><th style="padding:6px 10px;text-align:left">教练</th><th style="padding:6px 10px;text-align:left">结果</th></tr>${recHtml}</table></div>`;
    });

    const storeLabel = getStoreLabel(store);
    const html = `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>课时管理备份报表 - ${storeLabel}</title><style>body{font-family:-apple-system,BlinkMacSystemFont,'PingFang SC','Microsoft YaHei',sans-serif;background:#f3f4f6;margin:0;padding:20px;color:#1f2937}h1{text-align:center;font-size:22px;margin-bottom:4px}.sub{text-align:center;color:#666;font-size:13px;margin-bottom:24px}.summary{display:flex;gap:12px;margin-bottom:24px;flex-wrap:wrap;justify-content:center}.scard{background:#fff;border-radius:10px;padding:14px 24px;box-shadow:0 1px 3px rgba(0,0,0,.08);text-align:center}.scard .v{font-size:24px;font-weight:700;color:#4F46E5}.scard .l{font-size:12px;color:#666;margin-top:2px}</style></head><body><h1>📊 课时管理备份报表</h1><div class="sub">门店：${storeLabel}　导出时间：${now}</div><div class="summary"><div class="scard"><div class="v">${data.students.length}</div><div class="l">学员总数</div></div><div class="scard"><div class="v">${data.records.length}</div><div class="l">操作记录</div></div><div class="scard"><div class="v">${data.records.filter(r=>r.type==='扣').reduce((a,r)=>a+r.n,0)}</div><div class="l">累计扣减</div></div><div class="scard"><div class="v">${data.records.filter(r=>r.type==='充').reduce((a,r)=>a+r.n,0)}</div><div class="l">累计充值</div></div></div>${stuHtml}</body></html>`;
    res.setHeader('Content-Disposition', `attachment; filename=keguanli_${store}_backup.html`);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch(e) {
    res.status(500).json({ error: '导出失败' });
  }
});

// ========== 业绩管理系统（独立数据，不影响原有学员数据）==========
const DEFAULT_PERF = {
  managerPassword: 'admin888',
  monthlyRevenue: {},
  coachBaseSalary: {
    shutiao: 0, chenzhe: 0, huyi: 0, bin: 0
  },
  partTimeHours: {},
  partTimeRate: 20,
  perfRecords: [],
  shoeCost: { junior: 195, senior: 750 },
  managerRate: 0.3,
  fixedCost: 5500,
  customCoaches: ['王教练', '李教练', '薯条教练', '小陈教练', '胡教练', '熊猫教练'],
  monthlyReports: {}
};

async function readPerf(store) {
  const PERF_KEY = getPerfKey(store);
  const PERF_BACKUP_KEY = getPerfBackupKey(store);
  try {
    const r = await redisReq('GET', `/get/${PERF_KEY}`);
    if (r.result == null || r.result === '') {
      await writePerfData(DEFAULT_PERF, store);
      return JSON.parse(JSON.stringify(DEFAULT_PERF));
    }
    let data = typeof r.result === 'string' ? JSON.parse(r.result) : r.result;
    if (typeof data === 'string') data = JSON.parse(data);
    const defaults = DEFAULT_PERF;
    for (const k of Object.keys(defaults)) {
      if (data[k] === undefined) data[k] = defaults[k];
    }
    return data;
  } catch(e) {
    console.error('Read perf error:', e.message);
    return JSON.parse(JSON.stringify(DEFAULT_PERF));
  }
}

async function writePerfData(data, store) {
  const PERF_KEY = getPerfKey(store);
  const PERF_BACKUP_KEY = getPerfBackupKey(store);
  try {
    const cur = await redisReq('GET', `/get/${PERF_KEY}`);
    if (cur.result != null && cur.result !== '') {
      await _rawWrite(PERF_BACKUP_KEY, cur.result);
    }
    return await _rawWrite(PERF_KEY, data);
  } catch(e) {
    console.error('Write perf error:', e.message);
    return false;
  }
}



const MANAGERS_KEY = 'classmanager:managers';

async function readManagers() {
  try {
    const r = await redisReq('GET', `/get/${MANAGERS_KEY}`);
    if (r.result) {
      let data = typeof r.result === 'string' ? JSON.parse(r.result) : r.result;
      if (typeof data === 'string') data = JSON.parse(data);
      if (Array.isArray(data) && data.length) return data;
    }
  } catch(e) { console.error('Read managers error:', e.message); }
  // Default managers
  return [
    {name:'陈哲',password:'admin888',shares:{henglicheng:0.3},stores:['henglicheng']},
    {name:'熊彬',password:'admin888',shares:{henglicheng:0.3},stores:['henglicheng']},
    {name:'叶川',password:'admin888',shares:{henglicheng:0.4},stores:['henglicheng']}
  ];
}

async function writeManagers(data) {
  return await _rawWrite(MANAGERS_KEY, data);
}

app.post('/api/perf/login', async (req, res) => {
  const store = req.body.store || 'henglicheng';
  const name = req.body.name || '';
  const password = req.body.password || '';
  try {
    const managers = await readManagers();
    const mgr = managers.find(m => m.name === name);
    if (!mgr || !mgr.stores.includes(store) || mgr.password !== password) {
      return res.status(401).json({ error: '密码错误或无权限' });
    }
    const storeShare = (mgr.shares && mgr.shares[store]) || mgr.share || 0;
    res.json({ ok: true, role: 'manager', share: storeShare });
  } catch(e) {
    res.status(500).json({ error: '登录失败' });
  }
});

// Get managers for a specific store (for login dropdown)
app.get('/api/managers', async (req, res) => {
  const store = req.query.store || 'henglicheng';
  try {
    const managers = await readManagers();
    const filtered = managers.filter(m => m.stores.includes(store)).map(m => ({name: m.name, share: (m.shares && m.shares[store]) || m.share || 0}));
    res.json(filtered);
  } catch(e) {
    res.status(500).json({ error: '获取失败' });
  }
});

app.get('/api/perf', async (req, res) => {
  const store = req.query.store || 'henglicheng';
  try {
    const data = await readPerf(store);
    const safe = { ...data };
    delete safe.managerPassword;
    res.json(safe);
  } catch(e) {
    res.status(500).json({ error: '读取失败' });
  }
});

app.put('/api/perf', async (req, res) => {
  const store = req.body.store || 'henglicheng';
  const mgrName = req.body.name || '';
  const mgrPwd = req.body.password || '';
  try {
    const perf = await readPerf(store);
    const managers = await readManagers();
    const mgr = managers.find(m => m.name === mgrName);
    if (!mgr || !mgr.stores.includes(store) || mgr.password !== mgrPwd) {
      return res.status(401).json({ error: '密码错误或无权限' });
    }
    const u = req.body.updates || {};
    if (u.perfRecords) perf.perfRecords = u.perfRecords;
    if (u.monthlyRevenue) perf.monthlyRevenue = u.monthlyRevenue;
    if (u.coachBaseSalary) perf.coachBaseSalary = u.coachBaseSalary;
    if (u.partTimeHours) perf.partTimeHours = u.partTimeHours;
    if (u.partTimeRate !== undefined) perf.partTimeRate = u.partTimeRate;
    if (u.shoeCost) perf.shoeCost = u.shoeCost;
    if (u.shoeCostJunior !== undefined) perf.shoeCostJunior = u.shoeCostJunior;
    if (u.shoeCostSenior !== undefined) perf.shoeCostSenior = u.shoeCostSenior;
    if (u.managerRate !== undefined) perf.managerRate = u.managerRate;
    if (u.fixedCost !== undefined) perf.fixedCost = u.fixedCost;
    if (u.customCoaches) perf.customCoaches = u.customCoaches;
    if (u.monthlyConfig) perf.monthlyConfig = u.monthlyConfig;
    if (u.monthlyReports) perf.monthlyReports = u.monthlyReports;
    if (u.prospectMemos) perf.prospectMemos = u.prospectMemos;
    const ok = await writePerfData(perf, store);
    ok ? res.json({ ok: true }) : res.status(500).json({ error: '保存失败' });
  } catch(e) {
    console.error('PUT perf error:', e.message);
    res.status(500).json({ error: '保存失败' });
  }
});


// 初始化两个门店
async function initAllStores() {
  await initRedisIfNeeded('henglicheng');
  await initRedisIfNeeded('taihe');
  await initRedisIfNeeded('yangguang');
  await initRedisIfNeeded('baolong');
}

initAllStores().then(() => {
  const APP_VERSION = '2.3-prospect';

// Admin API - auth check
function adminCheck(pwd) { return pwd === '123456'; }
const ADMIN_STORES = ['henglicheng', 'baolong', 'taihe', 'yangguang'];
const ADMIN_STORE_NAMES = { henglicheng: '恒力城', baolong: '宝龙', taihe: '泰禾', yangguang: '阳光天地' };

// List coaches with passwords
app.get('/api/admin/coaches', async (req, res) => {
  if (!adminCheck(req.query.pwd)) return res.status(401).json({ error: '未授权' });
  const result = [];
  for (const s of ADMIN_STORES) {
    try {
      const data = await readData(s);
      data.coaches.forEach(c => {
        const existing = result.find(x => x.username === c.username);
        if (!existing) result.push({ username: c.username, password: c.password, name: c.name, stores: [s] });
        else existing.stores.push(s);
      });
    } catch(e) {}
  }
  res.json(result);
});

// Add coach to specified stores
app.post('/api/admin/coaches', async (req, res) => {
  if (!adminCheck(req.body.pwd)) return res.status(401).json({ error: '未授权' });
  const { username, password, name, stores } = req.body;
  if (!username || !password || !name) return res.status(400).json({ error: '信息不完整' });
  const targetStores = stores || ADMIN_STORES;
  for (const s of targetStores) {
    try {
      const data = await readData(s);
      if (data.coaches.find(c => c.username === username)) continue;
      data.coaches.push({ username, password, name });
      await writeData(data, s);
      const perf = await readPerf(s);
      if (!perf.customCoaches.includes(name)) { perf.customCoaches.push(name); await writePerfData(perf, s); }
    } catch(e) { console.error('Add coach error:', e.message); }
  }
  res.json({ ok: true });
});

// Update coach: change info + sync stores
app.put('/api/admin/coaches', async (req, res) => {
  if (!adminCheck(req.body.pwd)) return res.status(401).json({ error: '未授权' });
  const { oldUsername, username, password, name, stores } = req.body;
  if (!oldUsername || !username || !password || !name) return res.status(400).json({ error: '信息不完整' });
  const targetStores = stores || ADMIN_STORES;
  for (const s of ADMIN_STORES) {
    try {
      const data = await readData(s);
      const c = data.coaches.find(x => x.username === oldUsername);
      const perf = await readPerf(s);
      if (targetStores.includes(s)) {
        // Should be in this store
        if (c) {
          const oldName = c.name;
          c.username = username; c.password = password; c.name = name;
          await writeData(data, s);
          if (perf.customCoaches) {
            const idx = perf.customCoaches.indexOf(oldName);
            if (idx >= 0) { perf.customCoaches[idx] = name; await writePerfData(perf, s); }
          }
        } else {
          // Add to this store
          data.coaches.push({ username, password, name });
          await writeData(data, s);
          if (!perf.customCoaches.includes(name)) { perf.customCoaches.push(name); await writePerfData(perf, s); }
        }
      } else {
        // Should NOT be in this store
        if (c) {
          data.coaches = data.coaches.filter(x => x.username !== oldUsername);
          await writeData(data, s);
          if (perf.customCoaches) {
            perf.customCoaches = perf.customCoaches.filter(n => n !== c.name);
            await writePerfData(perf, s);
          }
        }
      }
    } catch(e) { console.error('Update coach error:', e.message); }
  }
  res.json({ ok: true });
});

// Delete coach from all stores
app.delete('/api/admin/coaches', async (req, res) => {
  if (!adminCheck(req.query.pwd)) return res.status(401).json({ error: '未授权' });
  const username = req.query.username;
  if (!username) return res.status(400).json({ error: '缺少username' });
  for (const s of ADMIN_STORES) {
    try {
      const data = await readData(s);
      const coach = data.coaches.find(c => c.username === username);
      const coachName = coach ? coach.name : '';
      data.coaches = data.coaches.filter(c => c.username !== username);
      await writeData(data, s);
      // Remove from customCoaches in perf
      const perf = await readPerf(s);
      if (perf.customCoaches) {
        perf.customCoaches = perf.customCoaches.filter(n => n !== coachName);
        await writePerfData(perf, s);
      }
    } catch(e) { console.error('Delete coach error:', e.message); }
  }
  res.json({ ok: true });
});

// Admin: List all managers
app.get('/api/admin/managers', async (req, res) => {
  if (!adminCheck(req.query.pwd)) return res.status(401).json({ error: '未授权' });
  try {
    const managers = await readManagers();
    res.json(managers);
  } catch(e) { res.status(500).json({ error: '获取失败' }); }
});

// Admin: Add manager
app.post('/api/admin/managers', async (req, res) => {
  if (!adminCheck(req.body.pwd)) return res.status(401).json({ error: '未授权' });
  const { name, password, share, shares, stores } = req.body;
  if (!name || !password) return res.status(400).json({ error: '参数不完整' });
  try {
    const managers = await readManagers();
    if (managers.find(m => m.name === name)) return res.status(400).json({ error: '店长已存在' });
    // Build shares object from shares param or fallback to single share
    const sharesObj = shares || (share != null ? Object.fromEntries((stores || ['henglicheng']).map(s => [s, parseFloat(share) || 0])) : {});
    managers.push({ name, password, shares: sharesObj, stores: stores || ['henglicheng'] });
    await writeManagers(managers);
    res.json({ ok: true });
  } catch(e) { console.error('Add manager error:', e); res.status(500).json({ error: '添加失败: '+e.message }); }
});

// Admin: Update manager
app.put('/api/admin/managers', async (req, res) => {
  if (!adminCheck(req.body.pwd)) return res.status(401).json({ error: '未授权' });
  const { oldName, name, password, share, shares, stores } = req.body;
  if (!oldName || !name || !password) return res.status(400).json({ error: '参数不完整' });
  try {
    const managers = await readManagers();
    const idx = managers.findIndex(m => m.name === oldName);
    if (idx === -1) return res.status(404).json({ error: '店长不存在' });
    // Check name conflict (if renaming)
    if (name !== oldName && managers.find(m => m.name === name)) return res.status(400).json({ error: '店长名称已存在' });
    const sharesObj = shares || (share != null ? Object.fromEntries((stores || ['henglicheng']).map(s => [s, parseFloat(share) || 0])) : {});
    managers[idx] = { name, password, shares: sharesObj, stores: stores || ['henglicheng'] };
    await writeManagers(managers);
    res.json({ ok: true });
  } catch(e) { console.error('Update manager error:', e); res.status(500).json({ error: '更新失败: '+e.message }); }
});

// Admin: Delete manager
app.delete('/api/admin/managers', async (req, res) => {
  if (!adminCheck(req.query.pwd)) return res.status(401).json({ error: '未授权' });
  const name = req.query.name;
  if (!name) return res.status(400).json({ error: '参数不完整' });
  try {
    let managers = await readManagers();
    managers = managers.filter(m => m.name !== name);
    await writeManagers(managers);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: '删除失败' }); }
});

// Get only recharge records across all stores
app.get('/api/admin/records', async (req, res) => {
  if (!adminCheck(req.query.pwd)) return res.status(401).json({ error: '未授权' });
  let allRecords = [];
  for (const s of ADMIN_STORES) {
    try {
      const data = await readData(s);
      if (data.records) data.records.filter(r => r.type === '充' || r.type === '续').forEach((r, idx) => { allRecords.push({ ...r, _store: s, _idx: idx }); });
    } catch(e) {}
  }
  allRecords.sort((a, b) => (b.time || '').localeCompare(a.time || ''));
  res.json(allRecords);
});

// Delete a recharge record
app.delete('/api/admin/records', async (req, res) => {
  if (!adminCheck(req.query.pwd)) return res.status(401).json({ error: '未授权' });
  const { store, sid, time } = req.query;
  if (!store || !sid || !time) return res.status(400).json({ error: '参数不完整' });
  try {
    const data = await readData(store);
    const before = data.records.length;
    data.records = data.records.filter(r => !(r.sid === sid && r.time === time));
    if (data.records.length === before) return res.status(404).json({ error: '记录未找到' });
    await writeData(data, store);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: '删除失败' }); }
});

// ========== Pending Approval System ==========
const PENDING_KEY = 'classmanager:pending';

async function readPending() {
  try {
    const r = await redisReq('GET', `/get/${PENDING_KEY}`);
    if (r.result) {
      let data = typeof r.result === 'string' ? JSON.parse(r.result) : r.result;
      if (typeof data === 'string') data = JSON.parse(data);
      if (Array.isArray(data)) return data;
    }
  } catch(e) { console.error('Read pending error:', e.message); }
  return [];
}

async function writePending(data) {
  return await _rawWrite(PENDING_KEY, data);
}

// Coach: Submit pending request
app.post('/api/pending', async (req, res) => {
  const store = req.body.store || 'henglicheng';
  try {
    const sData = await readData(store);
    const coach = sData.coaches.find(c => c.username === (req.body.auth||{}).username && c.password === (req.body.auth||{}).password);
    if (!coach) return res.status(401).json({ error: '未授权' });
    const { type, details } = req.body;
    if (!type || !details) return res.status(400).json({ error: '参数不完整' });
    const pending = await readPending();
    const id = 'p' + Date.now();
    pending.unshift({ id, type, store, coach: coach.name, time: new Date().toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'}), status: 'pending', details });
    await writePending(pending);
    res.json({ ok: true, id });
  } catch(e) { console.error('Submit pending error:', e); res.status(500).json({ error: '提交失败' }); }
});

// Admin: List pending requests
app.get('/api/admin/pending', async (req, res) => {
  if (!adminCheck(req.query.pwd)) return res.status(401).json({ error: '未授权' });
  try {
    const pending = await readPending();
    res.json(pending.filter(p => p.status === 'pending'));
  } catch(e) { res.status(500).json({ error: '获取失败' }); }
});

// Admin: Approve pending request
app.post('/api/admin/pending/:id/approve', async (req, res) => {
  if (!adminCheck(req.body.pwd)) return res.status(401).json({ error: '未授权' });
  try {
    const pending = await readPending();
    const idx = pending.findIndex(p => p.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: '申请不存在' });
    if (pending[idx].status !== 'pending') return res.status(400).json({ error: '已处理' });
    const item = pending[idx];
    const store = item.store;
    const data = await readData(store);
    const d = item.details;
    const now = new Date().toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'});

    if (item.type === 'charge') {
      const stu = data.students.find(s => s.id === d.studentId);
      if (!stu) { pending[idx].status = 'approved'; pending[idx].reviewTime = now; await writePending(pending); return res.json({ ok: true, warn: '学员已不存在，已跳过' }); }
      stu.classes += d.n;
      data.records.unshift({ sid: d.studentId, sname: stu.name, coach: item.coach, time: now, after: stu.classes, type: '充', n: d.n });
    } else if (item.type === 'renew') {
      const stu = data.students.find(s => s.id === d.studentId);
      if (!stu) { pending[idx].status = 'approved'; pending[idx].reviewTime = now; await writePending(pending); return res.json({ ok: true, warn: '学员已不存在，已跳过' }); }
      const newExp = d.newExpiry || (() => { const curExp = stu.expiry ? new Date(stu.expiry) : null; const nowD = new Date(); const base = (curExp && curExp > nowD) ? new Date(curExp) : nowD; if (d.unit === '天') { base.setDate(base.getDate() + d.n); } else { base.setMonth(base.getMonth() + d.n); } return base.toISOString().slice(0,10); })();
      stu.expiry = newExp;
      data.records.unshift({ sid: d.studentId, sname: stu.name, coach: item.coach, time: now, after: newExp, type: '续', n: d.n||0, unit: d.unit||undefined });
    } else if (item.type === 'delete') {
      const stu = data.students.find(s => s.id === d.studentId);
      if (!stu) { pending[idx].status = 'approved'; pending[idx].reviewTime = now; await writePending(pending); return res.json({ ok: true, warn: '学员已不存在，已跳过' }); }
      data.students = data.students.filter(s => s.id !== d.studentId);
      data.records = data.records.filter(r => r.sid !== d.studentId);
    } else if (item.type === 'add') {
      // 同店编号唯一性校验
      if (data.students.find(s => s.id === d.student.id)) {
        pending[idx].status = 'approved'; pending[idx].reviewTime = now; await writePending(pending);
        return res.json({ ok: true, warn: '编号 ' + d.student.id + ' 已存在，已跳过该学员' });
      }
      data.students.push(d.student);
      data.nextId = Math.max(data.nextId, d.nextId || data.nextId);
      // 生成充值记录
      if (d.student.classes > 0) {
        data.records.unshift({ sid: d.student.id, sname: d.student.name, coach: item.coach, time: now, after: d.student.classes, type: '充', n: d.student.classes });
      } else if (d.student.type === '月卡' && d.student.expiry) {
        data.records.unshift({ sid: d.student.id, sname: d.student.name, coach: item.coach, time: now, after: d.student.expiry, type: '充', n: 0, note: '月卡 至 ' + d.student.expiry });
      }
    }

    await writeData(data, store);
    pending[idx].status = 'approved';
    pending[idx].reviewTime = now;
    await writePending(pending);
    res.json({ ok: true });
  } catch(e) { console.error('Approve error:', e); res.status(500).json({ error: '审批失败' }); }
});

// Admin: Reject pending request
app.post('/api/admin/pending/:id/reject', async (req, res) => {
  if (!adminCheck(req.body.pwd)) return res.status(401).json({ error: '未授权' });
  try {
    const pending = await readPending();
    const idx = pending.findIndex(p => p.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: '申请不存在' });
    if (pending[idx].status !== 'pending') return res.status(400).json({ error: '已处理' });
    pending[idx].status = 'rejected';
    pending[idx].reviewTime = new Date().toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'});
    await writePending(pending);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: '拒绝失败' }); }
});

app.listen(PORT, () => console.log('Running on ' + PORT));
});
// Build 1781206668
