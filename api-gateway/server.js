import express from 'express';
import jwt from 'jsonwebtoken';

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 4000;
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_me';
const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL || 'http://auth-service:4002';
const USER_SERVICE_URL = process.env.USER_SERVICE_URL || 'http://user-service:4003';
const TASK_SERVICE_URL = process.env.TASK_SERVICE_URL || 'http://task-service:4004';
const NOTIFICATION_SERVICE_URL =
  process.env.NOTIFICATION_SERVICE_URL || 'http://notification-service:4005';

function verifyToken(req, res, next) {
  const authHeader = req.header('authorization') || '';
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer' || !parts[1]) {
    return res.status(401).json({ error: 'Missing or invalid Authorization header' });
  }

  try {
    const payload = jwt.verify(parts[1], JWT_SECRET);
    req.userId = payload.userId;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

async function forwardRequest(targetUrl, req, res) {
  try {
    const headers = { 'Content-Type': 'application/json' };
    if (req.userId) {
      headers['x-user-id'] = req.userId;
    }

    const options = {
      method: req.method,
      headers,
    };

    if (!['GET', 'HEAD'].includes(req.method) && req.body && Object.keys(req.body).length > 0) {
      options.body = JSON.stringify(req.body);
    }

    const response = await fetch(targetUrl, options);
    const data = await response.json().catch(() => ({}));
    return res.status(response.status).json(data);
  } catch (err) {
    console.error('Gateway forward error:', err.message);
    return res.status(502).json({ error: 'Upstream service unavailable' });
  }
}

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'api-gateway' });
});

app.post('/api/auth/register', (req, res) =>
  forwardRequest(`${AUTH_SERVICE_URL}/register`, req, res)
);
app.post('/api/auth/login', (req, res) =>
  forwardRequest(`${AUTH_SERVICE_URL}/login`, req, res)
);

app.get('/api/users/profile', verifyToken, (req, res) =>
  forwardRequest(`${USER_SERVICE_URL}/profile`, req, res)
);
app.put('/api/users/profile', verifyToken, (req, res) =>
  forwardRequest(`${USER_SERVICE_URL}/profile`, req, res)
);

app.get('/api/tasks', verifyToken, (req, res) =>
  forwardRequest(`${TASK_SERVICE_URL}/tasks`, req, res)
);
app.post('/api/tasks', verifyToken, (req, res) =>
  forwardRequest(`${TASK_SERVICE_URL}/tasks`, req, res)
);
app.put('/api/tasks/:id', verifyToken, (req, res) =>
  forwardRequest(`${TASK_SERVICE_URL}/tasks/${req.params.id}`, req, res)
);
app.delete('/api/tasks/:id', verifyToken, (req, res) =>
  forwardRequest(`${TASK_SERVICE_URL}/tasks/${req.params.id}`, req, res)
);

app.get('/api/notifications', verifyToken, (req, res) =>
  forwardRequest(`${NOTIFICATION_SERVICE_URL}/notifications`, req, res)
);

app.listen(PORT, () => {
  console.log(`api-gateway listening on port ${PORT}`);
});
