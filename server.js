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

// 只读，永远不写入Redis。读取失败时返回内存中的默认数据，不会覆盖Redis
async function readData() {
  try {
    const r = await redisReq('GET', `/get/${DATA_KEY}`);
    if (r.result != null) {
      let data = typeof r.result === 'string' ? JSON.parse(r.result) : r.result;
      // Safety: if still a string, parse again (handles old double-encoded data)
      if (typeof data === 'string') data = JSON.parse(data);
      if (data && data.coaches && Array.isArray(data.coaches)) {
        // 补充缺失的默认教练（不写入Redis，仅内存补充）
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
  // 读取失败时只返回内存默认值，绝不写回Redis
  console.warn('⚠️ Redis read failed, using in-memory defaults. Redis data is NOT overwritten.');
  return JSON.parse(JSON.stringify(DEFAULT_DATA));
}

// 检查Redis是否为空（首次部署），如果是则初始化
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

app.get('/api/export', async (req, res) => {
  try {
    const data = await readData();
    res.setHeader('Content-Disposition', 'attachment; filename=keguanli_backup.json');
    res.json(data);
  } catch(e) {
    res.status(500).json({ error: '导出失败' });
  }
});

// 启动时只在Redis完全为空时才写入默认数据
initRedisIfNeeded().then(() => {
  app.listen(PORT, () => console.log('Running on ' + PORT));
});
