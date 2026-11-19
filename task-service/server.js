import express from 'express';
import mongoose from 'mongoose';

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 4004;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://mongo:27017/task_manager';
const NOTIFICATION_SERVICE_URL =
  process.env.NOTIFICATION_SERVICE_URL || 'http://notification-service:4005';

const taskSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, index: true },
    title: { type: String, required: true, trim: true },
    completed: { type: Boolean, default: false },
  },
  { timestamps: true }
);

const Task = mongoose.model('Task', taskSchema);

function requireUserId(req, res, next) {
  const userId = req.header('x-user-id');
  if (!userId) {
    return res.status(401).json({ error: 'User context required' });
  }
  req.userId = userId;
  next();
}

async function emitNotification(payload) {
  try {
    await fetch(`${NOTIFICATION_SERVICE_URL}/notify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    console.error('Failed to send notification:', err.message);
  }
}

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'task-service' });
});

app.get('/tasks', requireUserId, async (req, res) => {
  try {
    const tasks = await Task.find({ userId: req.userId }).sort({ createdAt: -1 });
    return res.json({ tasks });
  } catch (err) {
    console.error('Get tasks error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/tasks', requireUserId, async (req, res) => {
  try {
    const { title } = req.body || {};
    if (!title || !title.trim()) {
      return res.status(400).json({ error: 'title is required' });
    }

    const task = await Task.create({
      userId: req.userId,
      title: title.trim(),
      completed: false,
    });

    await emitNotification({
      event: 'TASK_CREATED',
      userId: req.userId,
      message: `Task created: "${task.title}"`,
      meta: { taskId: task._id.toString() },
    });

    return res.status(201).json({ task });
  } catch (err) {
    console.error('Create task error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

app.put('/tasks/:id', requireUserId, async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid task ID' });
    }

    const updates = {};
    if (typeof req.body?.title === 'string' && req.body.title.trim()) {
      updates.title = req.body.title.trim();
    }
    if (typeof req.body?.completed === 'boolean') {
      updates.completed = req.body.completed;
    }

    const task = await Task.findOneAndUpdate(
      { _id: id, userId: req.userId },
      updates,
      { new: true }
    );

    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    await emitNotification({
      event: 'TASK_UPDATED',
      userId: req.userId,
      message: `Task updated: "${task.title}" (completed: ${task.completed})`,
      meta: { taskId: task._id.toString() },
    });

    return res.json({ task });
  } catch (err) {
    console.error('Update task error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

app.delete('/tasks/:id', requireUserId, async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid task ID' });
    }

    const task = await Task.findOneAndDelete({ _id: id, userId: req.userId });
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    await emitNotification({
      event: 'TASK_DELETED',
      userId: req.userId,
      message: `Task deleted: "${task.title}"`,
      meta: { taskId: task._id.toString() },
    });

    return res.json({ message: 'Task deleted', id: task._id.toString() });
  } catch (err) {
    console.error('Delete task error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

async function start() {
  await mongoose.connect(MONGO_URI);
  console.log('task-service connected to MongoDB');
  app.listen(PORT, () => {
    console.log(`task-service listening on port ${PORT}`);
  });
}

start().catch((err) => {
  console.error('Failed to start task-service:', err);
  process.exit(1);
});
