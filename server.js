const express = require('express');
const https = require('https');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

// Upstash Redis REST API config
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

// Redis REST API helper
function redisRequest(method, pathname, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(pathname, REDIS_URL);
    const options = {
      hostname: url.hostname,
      path: url.pathname,
      method: method,
      headers: {
        'Authorization': `Bearer ${REDIS_TOKEN}`,
        'Content-Type': 'application/json'
      }
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch(e) { reject(new Error('Parse error: ' + data)); }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function readData() {
  try {
    const res = await redisRequest('GET', `/get/${DATA_KEY}`);
    if (res.result) {
      const data = typeof res.result === 'string' ? JSON.parse(res.result) : res.result;
      // Migration: ensure all coaches exist
      const required = DEFAULT_DATA.coaches;
      let changed = false;
      for (const rc of required) {
        if (!data.coaches.find(c => c.username === rc.username)) {
          data.coaches.push(rc);
          changed = true;
        }
      }
      if (changed) await writeData(data);
      return data;
    }
  } catch(e) { console.error('Redis read error:', e.message); }
  // Fallback: write default and return
  await writeData(DEFAULT_DATA);
  return JSON.parse(JSON.stringify(DEFAULT_DATA));
}

async function writeData(data) {
  try {
    const res = await redisRequest('POST', `/set/${DATA_KEY}`, JSON.stringify(data));
    return res.result === 'OK';
  } catch(e) { console.error('Redis write error:', e.message); return false; }
}

// Serve frontend
app.use(express.static(path.join(__dirname, 'public')));

// API: Read data
app.get('/api/data', async (req, res) => {
  try {
    const data = await readData();
    const safe = { ...data, coaches: data.coaches.map(c => ({ username: c.username, name: c.name })) };
    res.json(safe);
  } catch(e) { res.status(500).json({ error: '读取数据失败' }); }
});

// API: Coach login
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const data = await readData();
    const coach = data.coaches.find(c => c.username === username && c.password === password);
    if (!coach) return res.status(401).json({ error: '账号或密码错误' });
    res.json({ name: coach.name, username: coach.username });
  } catch(e) { res.status(500).json({ error: '登录失败' }); }
});

// API: Write data
app.put('/api/data', async (req, res) => {
  const { username, password } = req.body.auth || {};
  try {
    const data = await readData();
    const coach = data.coaches.find(c => c.username === username && c.password === password);
    if (!coach) return res.status(401).json({ error: '未授权' });
    const updates = req.body.updates;
    if (updates.students !== undefined) data.students = updates.students;
    if (updates.records !== undefined) data.records = updates.records;
    if (updates.nextId !== undefined) data.nextId = updates.nextId;
    const ok = await writeData(data);
    if (ok) res.json({ ok: true });
    else res.status(500).json({ error: '保存失败' });
  } catch(e) { res.status(500).json({ error: '保存失败' }); }
});

app.listen(PORT, () => console.log('Server running on port ' + PORT));
