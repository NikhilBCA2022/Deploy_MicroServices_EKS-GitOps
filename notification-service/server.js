import express from 'express';

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 4005;
const notifications = [];

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'notification-service' });
});

app.post('/notify', (req, res) => {
  const { event, userId, message, meta } = req.body || {};
  if (!event || !message) {
    return res.status(400).json({ error: 'event and message are required' });
  }

  const entry = {
    id: `${Date.now()}-${notifications.length + 1}`,
    event,
    userId: userId || null,
    message,
    meta: meta || {},
    timestamp: new Date().toISOString(),
  };

  notifications.push(entry);
  console.log(`[NOTIFICATION] [${entry.timestamp}] [${entry.event}] ${entry.message}`);
  return res.status(201).json({ notification: entry });
});

app.get('/notifications', (req, res) => {
  res.json({ notifications });
});

app.listen(PORT, () => {
  console.log(`notification-service listening on port ${PORT}`);
});
