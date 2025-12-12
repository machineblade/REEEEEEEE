// api/_users.js
const fs = require('fs');
const path = require('path');

const dataPath = path.join(process.cwd(), 'libs', 'data.json');

function loadUsers() {
  try {
    const raw = fs.readFileSync(dataPath, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    console.error('Failed to read data.json:', e);
    return [];
  }
}

function saveUsers(users) {
  try {
    fs.writeFileSync(dataPath, JSON.stringify(users, null, 2));
  } catch (e) {
    console.error('Failed to write data.json:', e);
  }
}

module.exports = { loadUsers, saveUsers };
