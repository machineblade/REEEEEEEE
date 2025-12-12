const { loadUsers } = require('./_users.js');

export default function handler(req, res) {
  try {
    const users = loadUsers();
    return res.status(200).json(users);
  } catch (e) {
    console.error('debug-data error:', e);
    return res.status(500).json({ error: 'Failed to read data.json' });
  }
}
