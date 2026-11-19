import { useEffect, useState } from 'react';

const STORAGE_TOKEN_KEY = 'tm_token';
const STORAGE_USER_KEY = 'tm_user';

export default function App() {
  const [token, setToken] = useState(() => localStorage.getItem(STORAGE_TOKEN_KEY) || '');
  const [user, setUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_USER_KEY) || 'null');
    } catch {
      return null;
    }
  });

  const [mode, setMode] = useState('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [tasks, setTasks] = useState([]);
  const [newTitle, setNewTitle] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [profileName, setProfileName] = useState('');
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');

  function authHeaders() {
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    };
  }

  function handleLogout() {
    localStorage.removeItem(STORAGE_TOKEN_KEY);
    localStorage.removeItem(STORAGE_USER_KEY);
    setToken('');
    setUser(null);
    setTasks([]);
    setStatus('');
    setError('');
  }

  async function loadDashboard(activeToken) {
    setError('');
    try {
      const [profileRes, tasksRes] = await Promise.all([
        fetch('/api/users/profile', {
          headers: { Authorization: `Bearer ${activeToken}` },
        }),
        fetch('/api/tasks', {
          headers: { Authorization: `Bearer ${activeToken}` },
        }),
      ]);

      if (profileRes.status === 401 || tasksRes.status === 401) {
        handleLogout();
        return;
      }

      const profileData = await profileRes.json();
      const tasksData = await tasksRes.json();

      if (profileRes.ok && profileData.user) {
        setUser(profileData.user);
        setProfileName(profileData.user.name);
        localStorage.setItem(STORAGE_USER_KEY, JSON.stringify(profileData.user));
      }
      if (tasksRes.ok) {
        setTasks(tasksData.tasks || []);
      }
    } catch {
      setError('Unable to reach server');
    }
  }

  useEffect(() => {
    if (token) {
      loadDashboard(token);
    }
  }, [token]);

  async function handleAuthSubmit(e) {
    e.preventDefault();
    setError('');
    setStatus('');

    const endpoint = mode === 'login' ? '/api/auth/login' : '/api/auth/register';
    const payload =
      mode === 'login' ? { email, password } : { name, email, password };

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Authentication failed');
        return;
      }

      localStorage.setItem(STORAGE_TOKEN_KEY, data.token);
      localStorage.setItem(STORAGE_USER_KEY, JSON.stringify(data.user));
      setToken(data.token);
      setUser(data.user);
      setProfileName(data.user.name);
      setName('');
      setEmail('');
      setPassword('');
    } catch {
      setError('Unable to reach authentication service');
    }
  }

  async function handleCreateTask(e) {
    e.preventDefault();
    if (!newTitle.trim()) return;
    setError('');
    setStatus('');

    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ title: newTitle.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Could not create task');
        return;
      }
      setTasks((prev) => [data.task, ...prev]);
      setNewTitle('');
    } catch {
      setError('Failed to create task');
    }
  }

  async function handleToggleComplete(task) {
    setError('');
    try {
      const res = await fetch(`/api/tasks/${task._id}`, {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify({ completed: !task.completed }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Could not update task');
        return;
      }
      setTasks((prev) => prev.map((t) => (t._id === task._id ? data.task : t)));
    } catch {
      setError('Failed to update task');
    }
  }

  async function handleSaveEdit(id) {
    if (!editingTitle.trim()) return;
    setError('');
    try {
      const res = await fetch(`/api/tasks/${id}`, {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify({ title: editingTitle.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Could not update task');
        return;
      }
      setTasks((prev) => prev.map((t) => (t._id === id ? data.task : t)));
      setEditingId(null);
      setEditingTitle('');
    } catch {
      setError('Failed to update task');
    }
  }

  async function handleDeleteTask(id) {
    setError('');
    try {
      const res = await fetch(`/api/tasks/${id}`, {
        method: 'DELETE',
        headers: authHeaders(),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Could not delete task');
        return;
      }
      setTasks((prev) => prev.filter((t) => t._id !== id));
    } catch {
      setError('Failed to delete task');
    }
  }

  async function handleProfileUpdate(e) {
    e.preventDefault();
    if (!profileName.trim()) return;
    setError('');
    setStatus('');
    try {
      const res = await fetch('/api/users/profile', {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify({ name: profileName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Could not update profile');
        return;
      }
      setUser(data.user);
      localStorage.setItem(STORAGE_USER_KEY, JSON.stringify(data.user));
      setStatus('Profile updated');
    } catch {
      setError('Failed to update profile');
    }
  }

  const pageStyle = {
    backgroundColor: '#ffffff',
    color: '#111111',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    minHeight: '100vh',
    margin: 0,
    padding: '40px 20px',
  };

  const containerStyle = {
    maxWidth: '540px',
    margin: '0 auto',
  };

  const inputStyle = {
    padding: '8px 10px',
    border: '1px solid #cccccc',
    backgroundColor: '#ffffff',
    color: '#111111',
    fontSize: '14px',
  };

  const buttonStyle = {
    padding: '8px 12px',
    border: '1px solid #111111',
    backgroundColor: '#ffffff',
    color: '#111111',
    fontSize: '14px',
    cursor: 'pointer',
  };

  if (!token) {
    return (
      <div style={pageStyle}>
        <div style={containerStyle}>
          <h1 style={{ fontSize: '20px', fontWeight: 600, marginBottom: '16px' }}>
            {mode === 'login' ? 'Sign In' : 'Register'}
          </h1>

          <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
            <button
              type="button"
              style={{
                ...buttonStyle,
                backgroundColor: mode === 'login' ? '#111111' : '#ffffff',
                color: mode === 'login' ? '#ffffff' : '#111111',
              }}
              onClick={() => {
                setMode('login');
                setError('');
              }}
            >
              Login
            </button>
            <button
              type="button"
              style={{
                ...buttonStyle,
                backgroundColor: mode === 'register' ? '#111111' : '#ffffff',
                color: mode === 'register' ? '#ffffff' : '#111111',
              }}
              onClick={() => {
                setMode('register');
                setError('');
              }}
            >
              Register
            </button>
          </div>

          <form
            onSubmit={handleAuthSubmit}
            style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}
          >
            {mode === 'register' && (
              <input
                type="text"
                placeholder="Name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                style={inputStyle}
                required
              />
            )}
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={inputStyle}
              required
            />
            <input
              type="password"
              placeholder="Password (min 6 chars)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={inputStyle}
              required
            />
            <button type="submit" style={buttonStyle}>
              {mode === 'login' ? 'Login' : 'Create Account'}
            </button>
          </form>

          {error && (
            <p style={{ color: '#b91c1c', marginTop: '12px', fontSize: '14px' }}>
              {error}
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={pageStyle}>
      <div style={containerStyle}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            borderBottom: '1px solid #e5e5e5',
            paddingBottom: '12px',
            marginBottom: '24px',
          }}
        >
          <div>
            <h1 style={{ fontSize: '20px', fontWeight: 600, margin: 0 }}>Tasks</h1>
            <p style={{ fontSize: '13px', color: '#555555', margin: '4px 0 0' }}>
              {user?.name} ({user?.email})
            </p>
          </div>
          <button type="button" style={buttonStyle} onClick={handleLogout}>
            Logout
          </button>
        </div>

        <form
          onSubmit={handleCreateTask}
          style={{ display: 'flex', gap: '8px', marginBottom: '24px' }}
        >
          <input
            type="text"
            placeholder="New task..."
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            style={{ ...inputStyle, flex: 1 }}
          />
          <button type="submit" style={buttonStyle}>
            Add
          </button>
        </form>

        <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 32px' }}>
          {tasks.length === 0 && (
            <li style={{ color: '#666666', fontSize: '14px' }}>No tasks yet.</li>
          )}
          {tasks.map((task) => (
            <li
              key={task._id}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '8px',
                padding: '10px 0',
                borderBottom: '1px solid #eeeeee',
              }}
            >
              {editingId === task._id ? (
                <div style={{ display: 'flex', gap: '6px', flex: 1 }}>
                  <input
                    type="text"
                    value={editingTitle}
                    onChange={(e) => setEditingTitle(e.target.value)}
                    style={{ ...inputStyle, flex: 1 }}
                  />
                  <button
                    type="button"
                    style={buttonStyle}
                    onClick={() => handleSaveEdit(task._id)}
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    style={buttonStyle}
                    onClick={() => setEditingId(null)}
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <>
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      flex: 1,
                      cursor: 'pointer',
                      textDecoration: task.completed ? 'line-through' : 'none',
                      color: task.completed ? '#777777' : '#111111',
                      fontSize: '14px',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={Boolean(task.completed)}
                      onChange={() => handleToggleComplete(task)}
                    />
                    <span>{task.title}</span>
                  </label>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button
                      type="button"
                      style={buttonStyle}
                      onClick={() => {
                        setEditingId(task._id);
                        setEditingTitle(task.title);
                      }}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      style={buttonStyle}
                      onClick={() => handleDeleteTask(task._id)}
                    >
                      Delete
                    </button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>

        <form
          onSubmit={handleProfileUpdate}
          style={{
            borderTop: '1px solid #e5e5e5',
            paddingTop: '16px',
            display: 'flex',
            gap: '8px',
            alignItems: 'center',
          }}
        >
          <input
            type="text"
            placeholder="Update display name"
            value={profileName}
            onChange={(e) => setProfileName(e.target.value)}
            style={{ ...inputStyle, flex: 1 }}
          />
          <button type="submit" style={buttonStyle}>
            Update Profile
          </button>
        </form>

        {status && (
          <p style={{ color: '#15803d', marginTop: '10px', fontSize: '13px' }}>
            {status}
          </p>
        )}
        {error && (
          <p style={{ color: '#b91c1c', marginTop: '10px', fontSize: '13px' }}>
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
