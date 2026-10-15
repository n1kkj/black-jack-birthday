const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { URL } = require('url');

const root = __dirname;
const publicDir = path.join(root, 'public');
const dataDir = path.join(root, 'data');
const uploadsDir = path.join(root, 'uploads');
const dataFile = path.join(dataDir, 'participants.json');
const port = Number(process.env.PORT) || 4173;

function ensureStorage() {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(uploadsDir, { recursive: true });
  if (!fs.existsSync(dataFile)) {
    fs.writeFileSync(dataFile, JSON.stringify({ participants: [] }, null, 2), 'utf8');
  }
}

function readState() {
  ensureStorage();
  try {
    const raw = fs.readFileSync(dataFile, 'utf8');
    const state = JSON.parse(raw);
    return { participants: Array.isArray(state.participants) ? state.participants : [] };
  } catch (error) {
    return { participants: [] };
  }
}

function writeState(state) {
  ensureStorage();
  fs.writeFileSync(dataFile, JSON.stringify(state, null, 2), 'utf8');
}

function json(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store'
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > 8 * 1024 * 1024) {
        reject(new Error('Слишком большой запрос'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
      } catch (error) {
        reject(new Error('Некорректные данные'));
      }
    });
    req.on('error', reject);
  });
}

function cleanName(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, 32);
}

function saveAvatar(dataUrl, token) {
  if (typeof dataUrl !== 'string') {
    return '';
  }
  const match = dataUrl.match(/^data:(image\/(png|jpeg|jpg|webp));base64,([a-zA-Z0-9+/=]+)$/);
  if (!match) {
    return '';
  }
  const extension = match[2] === 'jpeg' ? 'jpg' : match[2];
  const fileName = `${token}.${extension}`;
  fs.writeFileSync(path.join(uploadsDir, fileName), Buffer.from(match[3], 'base64'));
  return `/uploads/${fileName}`;
}

function removeAvatar(avatar) {
  if (typeof avatar !== 'string' || !avatar.startsWith('/uploads/')) {
    return;
  }
  const filePath = path.join(root, avatar.replace(/^\//, ''));
  if (filePath.startsWith(uploadsDir) && fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}

function publicParticipant(participant) {
  return {
    id: participant.id,
    token: participant.token,
    name: participant.name,
    avatar: participant.avatar,
    score: participant.score,
    createdAt: participant.createdAt,
    updatedAt: participant.updatedAt
  };
}

function handleApi(req, res, requestUrl) {
  if (req.method === 'GET' && requestUrl.pathname === '/api/state') {
    const state = readState();
    return json(res, 200, {
      participants: state.participants.map(publicParticipant),
      updatedAt: new Date().toISOString()
    });
  }

  if (req.method !== 'POST') {
    return json(res, 404, { error: 'Маршрут не найден' });
  }

  return readBody(req).then((body) => {
    const state = readState();

    if (requestUrl.pathname === '/api/register') {
      const name = cleanName(body.name);
      if (!name) {
        return json(res, 400, { error: 'Введите имя' });
      }
      const id = crypto.randomUUID();
      const token = crypto.randomBytes(32).toString('hex');
      const now = new Date().toISOString();
      const participant = {
        id,
        token,
        name,
        avatar: saveAvatar(body.avatar, token),
        score: 0,
        createdAt: now,
        updatedAt: now
      };
      state.participants.push(participant);
      writeState(state);
      return json(res, 201, { token, participant: publicParticipant(participant) });
    }

    if (requestUrl.pathname === '/api/admin/update') {
      const participant = state.participants.find((item) => item.id === body.id);
      const value = Number(body.value);
      if (!participant || !Number.isFinite(value)) {
        return json(res, 400, { error: 'Проверьте участника и значение' });
      }
      participant.score = body.mode === 'delta' ? participant.score + value : value;
      participant.updatedAt = new Date().toISOString();
      writeState(state);
      return json(res, 200, { participant: publicParticipant(participant) });
    }

    if (requestUrl.pathname === '/api/admin/reset') {
      const index = state.participants.findIndex((item) => item.id === body.id);
      if (index === -1) {
        return json(res, 404, { error: 'Участник не найден' });
      }
      const [removed] = state.participants.splice(index, 1);
      removeAvatar(removed.avatar);
      writeState(state);
      return json(res, 200, { removedId: removed.id });
    }

    if (requestUrl.pathname === '/api/admin/reset-all') {
      state.participants.forEach((participant) => removeAvatar(participant.avatar));
      state.participants = [];
      writeState(state);
      return json(res, 200, { ok: true });
    }

    return json(res, 404, { error: 'Маршрут не найден' });
  }).catch((error) => json(res, 400, { error: error.message || 'Ошибка запроса' }));
}

function serveStatic(req, res, requestUrl) {
  const requestedPath = requestUrl.pathname === '/' ? '/index.html' : requestUrl.pathname;
  const baseDir = requestedPath.startsWith('/uploads/') ? root : publicDir;
  const relativePath = requestedPath.startsWith('/uploads/') ? requestedPath.slice(1) : requestedPath.slice(1);
  const filePath = path.resolve(baseDir, relativePath);
  const resolvedBase = path.resolve(baseDir);
  if (!filePath.startsWith(`${resolvedBase}${path.sep}`) && filePath !== resolvedBase) {
    return json(res, 403, { error: 'Доступ запрещён' });
  }
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    return json(res, 404, { error: 'Файл не найден' });
  }
  const mimeTypes = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml'
  };
  res.writeHead(200, { 'Content-Type': mimeTypes[path.extname(filePath).toLowerCase()] || 'application/octet-stream' });
  fs.createReadStream(filePath).pipe(res);
}

ensureStorage();

const server = http.createServer((req, res) => {
  const requestUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (requestUrl.pathname.startsWith('/api/')) {
    handleApi(req, res, requestUrl);
    return;
  }
  serveStatic(req, res, requestUrl);
});

server.listen(port, '0.0.0.0', () => {
  console.log(`Фронт запущен: http://127.0.0.1:${port}`);
});
