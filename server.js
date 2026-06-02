const express = require('express');
const https = require('https');
const path = require('path');

const app = express();
app.use(express.json());
const PORT = process.env.PORT || 3000;

const REDIS_URL = 'https://enhanced-gecko-136149.upstash.io';
const REDIS_TOKEN = 'gQAAAAAAAhPVAAIgcDE2ZWVhMDNiZTI5OTM0YjlkYTA3MzQ0Y2VmOTZmZmIxNQ';

// 多门店Redis Key映射
function getDataKey(store) { return store === 'baolong' ? 'classmanager:db:baolong' : 'classmanager:db'; }
function getBackupKey(store) { return store === 'baolong' ? 'classmanager:db:baolong:backup' : 'classmanager:db:backup'; }
function getPerfKey(store) { return store === 'baolong' ? 'classmanager:perf:baolong' : 'classmanager:perf'; }
function getPerfBackupKey(store) { return store === 'baolong' ? 'classmanager:perf:baolong:backup' : 'classmanager:perf:backup'; }

const DEFAULT_DATA = {
  coaches: [
    { username: 'coach1', password: '123456', name: '王教练' },
    { username: 'coach2', password: '123456', name: '李教练' },
    { username: 'shutiao', password: '123456', name: '薯条教练' },
    { username: 'chenzhe', password: '123456', name: '小陈教练' },
    { username: 'huyi', password: '123456', name: '胡教练' },
    { username: 'bin', password: '123456', name: '熊猫教练' }
  ],
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
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch(e) { reject(new Error('Parse: '+d.slice(0,100))); } });
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

async function readData(store) {
  const DATA_KEY = getDataKey(store);
  const BACKUP_KEY = getBackupKey(store);
  try {
    const r = await redisReq('GET', `/get/${DATA_KEY}`);
    const data = safeParse(r.result);
    if (data) {
      for (const rc of DEFAULT_DATA.coaches) {
        if (!data.coaches.find(c => c.username === rc.username)) {
          data.coaches.push(rc);
        }
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
      console.warn('✅ Recovered from backup!');
      for (const rc of DEFAULT_DATA.coaches) {
        if (!data.coaches.find(c => c.username === rc.username)) {
          data.coaches.push(rc);
        }
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
  const body = JSON.stringify(data);
  const r = await redisReq('POST', `/set/${key}`, body);
  return r.result === 'OK';
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
    return await _rawWrite(DATA_KEY, data);
  } catch(e) {
    console.error('Write error:', e.message);
    return false;
  }
}

app.use(express.static(path.join(__dirname, 'public')));

// 所有数据API都支持store参数
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
            recHtml += `<tr><td style="padding:6px 10px">${t}</td><td style="padding:6px 10px;color:${isAdd?'#059669':'#dc2626'};font-weight:600">${isAdd?'充值':'扣减'} ${r.n}节</td><td style="padding:6px 10px">${r.coach}</td><td style="padding:6px 10px;font-weight:600">余${r.after}节</td></tr>`;
          });
        });
      }
      const storeLabel = store === 'baolong' ? '宝龙店' : '恒力城店';
      stuHtml += `<div style="margin-bottom:24px;background:#fff;border-radius:10px;box-shadow:0 1px 3px rgba(0,0,0,.08);overflow:hidden"><div style="background:#4F46E5;color:#fff;padding:12px 16px;display:flex;justify-content:space-between;align-items:center"><span style="font-size:16px;font-weight:600">${s.name}</span><span style="background:rgba(255,255,255,.2);padding:3px 12px;border-radius:20px;font-size:14px">剩余 ${s.classes} 节</span></div><div style="padding:8px 16px;color:#666;font-size:13px">编号：${s.id}${s.note ? '　备注：' + s.note : ''}　门店：${storeLabel}</div><table style="width:100%;border-collapse:collapse;font-size:14px"><tr style="background:#f9fafb;color:#666;font-size:12px"><th style="padding:6px 10px;text-align:left">时间</th><th style="padding:6px 10px;text-align:left">操作</th><th style="padding:6px 10px;text-align:left">教练</th><th style="padding:6px 10px;text-align:left">结果</th></tr>${recHtml}</table></div>`;
    });

    const storeLabel = store === 'baolong' ? '宝龙店' : '恒力城店';
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
    coach1: 0, coach2: 0, shutiao: 0, chenzhe: 0, huyi: 0, bin: 0
  },
  partTimeHours: {},
  partTimeRate: 20,
  perfRecords: [],
  shoeCost: { junior: 200, senior: 750 },
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

app.post('/api/perf/login', async (req, res) => {
  const store = req.body.store || 'henglicheng';
  try {
    const data = await readPerf(store);
    if (req.body.password === data.managerPassword) {
      res.json({ ok: true, role: 'manager' });
    } else {
      res.status(401).json({ error: '密码错误' });
    }
  } catch(e) {
    res.status(500).json({ error: '登录失败' });
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
  try {
    const perf = await readPerf(store);
    if (req.body.password !== perf.managerPassword) {
      return res.status(401).json({ error: '密码错误' });
    }
    const u = req.body.updates || {};
    if (u.perfRecords) perf.perfRecords = u.perfRecords;
    if (u.monthlyRevenue) perf.monthlyRevenue = u.monthlyRevenue;
    if (u.coachBaseSalary) perf.coachBaseSalary = u.coachBaseSalary;
    if (u.partTimeHours) perf.partTimeHours = u.partTimeHours;
    if (u.partTimeRate !== undefined) perf.partTimeRate = u.partTimeRate;
    if (u.shoeCost) perf.shoeCost = u.shoeCost;
    if (u.managerRate !== undefined) perf.managerRate = u.managerRate;
    if (u.fixedCost !== undefined) perf.fixedCost = u.fixedCost;
    if (u.customCoaches) perf.customCoaches = u.customCoaches;
    if (u.monthlyReports) perf.monthlyReports = u.monthlyReports;
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
  await initRedisIfNeeded('baolong');
}

initAllStores().then(() => {
  app.listen(PORT, () => console.log('Running on ' + PORT));
});
