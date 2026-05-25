const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json());

const DATA_FILE = path.join(__dirname, 'data.json');
const PORT = process.env.PORT || 3000;

function readData() {
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); }
  catch {
    return {
      coaches: [
        { username: 'coach1', password: '123456', name: '王教练' },
        { username: 'coach2', password: '123456', name: '李教练' }
      ],
      students: [],
      records: [],
      nextId: 1
    };
  }
}

function writeData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

if (!fs.existsSync(DATA_FILE)) writeData(readData());

app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/data', (req, res) => {
  const data = readData();
  const safe = { ...data, coaches: data.coaches.map(c => ({ username: c.username, name: c.name })) };
  res.json(safe);
});

app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  const data = readData();
  const coach = data.coaches.find(c => c.username === username && c.password === password);
  if (!coach) return res.status(401).json({ error: '账号或密码错误' });
  res.json({ name: coach.name, username: coach.username });
});

app.put('/api/data', (req, res) => {
  const { username, password } = req.body.auth || {};
  const data = readData();
  const coach = data.coaches.find(c => c.username === username && c.password === password);
  if (!coach) return res.status(401).json({ error: '未授权' });
  const updates = req.body.updates;
  if (updates.students !== undefined) data.students = updates.students;
  if (updates.records !== undefined) data.records = updates.records;
  if (updates.nextId !== undefined) data.nextId = updates.nextId;
  writeData(data);
  res.json({ ok: true });
});

app.listen(PORT, () => console.log('Server running on port ' + PORT));
