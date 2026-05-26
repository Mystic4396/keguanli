const express = require('express');
const https = require('https');
const path = require('path');

const app = express();
app.use(express.json());
const PORT = process.env.PORT || 3000;

const REDIS_URL = 'https://enhanced-gecko-136149.upstash.io';
const REDIS_TOKEN = 'gQAAAAAAAhPVAAIgcDE2ZWVhMDNiZTI5OTM0YjlkYTA3MzQ0Y2VmOTZmZmIxNQ';
const DATA_KEY = 'classmanager:db';

const DEFAULT_DATA = {
  coaches: [
    { username: 'coach1', password: '123456', name: '王教练' },
    { username: 'coach2', password: '123456', name: '李教练' },
    { username: 'shutiao', password: '123456', name: '薯条教练' }
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

async function readData() {
  try {
    const r = await redisReq('GET', `/get/${DATA_KEY}`);
    if (r.result != null) {
      let data = typeof r.result === 'string' ? JSON.parse(r.result) : r.result;
      if (typeof data === 'string') data = JSON.parse(data);
      if (data && data.coaches && Array.isArray(data.coaches)) {
        for (const rc of DEFAULT_DATA.coaches) {
          if (!data.coaches.find(c => c.username === rc.username)) {
            data.coaches.push(rc);
          }
        }
        return data;
      }
    }
  } catch(e) {
    console.error('Read error:', e.message);
  }
  console.warn('Redis read failed, using in-memory defaults. Redis data is NOT overwritten.');
  return JSON.parse(JSON.stringify(DEFAULT_DATA));
}

async function initRedisIfNeeded() {
  try {
    const r = await redisReq('GET', `/get/${DATA_KEY}`);
    if (r.result == null || r.result === '') {
      console.log('Redis is empty, initializing default data...');
      await writeData(DEFAULT_DATA);
    } else {
      console.log('Redis has data, skipping init.');
    }
  } catch(e) {
    console.error('Init check error:', e.message);
  }
}

async function writeData(data) {
  try {
    const body = JSON.stringify(data);
    const r = await redisReq('POST', `/set/${DATA_KEY}`, body);
    return r.result === 'OK';
  } catch(e) {
    console.error('Write error:', e.message);
    return false;
  }
}

app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/data', async (req, res) => {
  try {
    const data = await readData();
    res.json({ ...data, coaches: data.coaches.map(c => ({ username: c.username, name: c.name })) });
  } catch(e) {
    res.status(500).json({ error: '读取失败' });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const data = await readData();
    const coach = data.coaches.find(c => c.username === req.body.username && c.password === req.body.password);
    if (!coach) return res.status(401).json({ error: '账号或密码错误' });
    res.json({ name: coach.name, username: coach.username });
  } catch(e) {
    res.status(500).json({ error: '登录失败' });
  }
});

app.put('/api/data', async (req, res) => {
  try {
    const data = await readData();
    const coach = data.coaches.find(c => c.username === (req.body.auth||{}).username && c.password === (req.body.auth||{}).password);
    if (!coach) return res.status(401).json({ error: '未授权' });
    const u = req.body.updates || {};
    if (u.students) data.students = u.students;
    if (u.records) data.records = u.records;
    if (u.nextId !== undefined) data.nextId = u.nextId;
    const ok = await writeData(data);
    ok ? res.json({ ok: true }) : res.status(500).json({ error: '保存失败' });
  } catch(e) {
    console.error('PUT error:', e.message);
    res.status(500).json({ error: '保存失败' });
  }
});

// JSON 备份导出
app.get('/api/export', async (req, res) => {
  try {
    const data = await readData();
    res.setHeader('Content-Disposition', 'attachment; filename=keguanli_backup.json');
    res.json(data);
  } catch(e) {
    res.status(500).json({ error: '导出失败' });
  }
});

// HTML 报表导出 - 双击浏览器打开即可查看
app.get('/api/export-html', async (req, res) => {
  try {
    const data = await readData();
    const now = new Date().toLocaleString('zh-CN', {timeZone:'Asia/Shanghai'});

    // 按学员分组记录
    const stuMap = {};
    data.students.forEach(s => { stuMap[s.id] = { ...s, recs: [] }; });
    data.records.forEach(r => {
      if (stuMap[r.sid]) stuMap[r.sid].recs.push(r);
    });

    // 按天分组函数
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
            recHtml += `<tr>
              <td style="padding:6px 10px">${t}</td>
              <td style="padding:6px 10px;color:${isAdd?'#059669':'#dc2626'};font-weight:600">${isAdd?'充值':'扣减'} ${r.n}节</td>
              <td style="padding:6px 10px">${r.coach}</td>
              <td style="padding:6px 10px;font-weight:600">余${r.after}节</td>
            </tr>`;
          });
        });
      }

      stuHtml += `
      <div style="margin-bottom:24px;background:#fff;border-radius:10px;box-shadow:0 1px 3px rgba(0,0,0,.08);overflow:hidden">
        <div style="background:#4F46E5;color:#fff;padding:12px 16px;display:flex;justify-content:space-between;align-items:center">
          <span style="font-size:16px;font-weight:600">${s.name}</span>
          <span style="background:rgba(255,255,255,.2);padding:3px 12px;border-radius:20px;font-size:14px">剩余 ${s.classes} 节</span>
        </div>
        <div style="padding:8px 16px;color:#666;font-size:13px">编号：${s.id}${s.note ? '　备注：' + s.note : ''}</div>
        <table style="width:100%;border-collapse:collapse;font-size:14px">
          <tr style="background:#f9fafb;color:#666;font-size:12px"><th style="padding:6px 10px;text-align:left">时间</th><th style="padding:6px 10px;text-align:left">操作</th><th style="padding:6px 10px;text-align:left">教练</th><th style="padding:6px 10px;text-align:left">结果</th></tr>
          ${recHtml}
        </table>
      </div>`;
    });

    const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>课时管理备份报表</title>
<style>
body{font-family:-apple-system,BlinkMacSystemFont,'PingFang SC','Microsoft YaHei',sans-serif;background:#f3f4f6;margin:0;padding:20px;color:#1f2937}
h1{text-align:center;font-size:22px;margin-bottom:4px}
.sub{text-align:center;color:#666;font-size:13px;margin-bottom:24px}
.summary{display:flex;gap:12px;margin-bottom:24px;flex-wrap:wrap;justify-content:center}
.scard{background:#fff;border-radius:10px;padding:14px 24px;box-shadow:0 1px 3px rgba(0,0,0,.08);text-align:center}
.scard .v{font-size:24px;font-weight:700;color:#4F46E5}
.scard .l{font-size:12px;color:#666;margin-top:2px}
</style>
</head>
<body>
<h1>📊 课时管理备份报表</h1>
<div class="sub">导出时间：${now}</div>
<div class="summary">
  <div class="scard"><div class="v">${data.students.length}</div><div class="l">学员总数</div></div>
  <div class="scard"><div class="v">${data.records.length}</div><div class="l">操作记录</div></div>
  <div class="scard"><div class="v">${data.records.filter(r=>r.type==='扣').reduce((a,r)=>a+r.n,0)}</div><div class="l">累计扣减</div></div>
  <div class="scard"><div class="v">${data.records.filter(r=>r.type==='充').reduce((a,r)=>a+r.n,0)}</div><div class="l">累计充值</div></div>
</div>
${stuHtml}
</body>
</html>`;

    res.setHeader('Content-Disposition', 'attachment; filename=keguanli_backup.html');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch(e) {
    res.status(500).json({ error: '导出失败' });
  }
});

initRedisIfNeeded().then(() => {
  app.listen(PORT, () => console.log('Running on ' + PORT));
});
