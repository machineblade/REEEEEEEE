const welcome = document.getElementById('welcome');
const usernameEl = document.getElementById('topbar-username');
const userJson = localStorage.getItem('user');

if (!userJson) {
window.location.href = '/login.html';
} else {
const user = JSON.parse(userJson);
if (usernameEl) usernameEl.textContent = user.username;
}