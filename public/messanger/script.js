const menuButton = document.getElementById('menuButton');
const sidebar = document.getElementById('sidebar');
const contactList = document.getElementById('contactList');
const newContactInput = document.getElementById('newContactInput');
const addContactButton = document.getElementById('addContactButton');
const messagesEl = document.getElementById('messages');
const messageForm = document.getElementById('messageForm');
const messageInput = document.getElementById('messageInput');
const currentChatNameEl = document.getElementById('currentChatName');
const currentUserLabel = document.getElementById('currentUserLabel');
const logoutButton = document.getElementById('logoutButton');

let supabaseClient = null;
let currentUser = null;
let contacts = [];
let currentChat = null;
let currentChannel = null;
let messageCache = [];

async function loadEnv() {
  const res = await fetch('/api/env');
  if (!res.ok) {
    throw new Error('Failed to load env');
  }
  return await res.json();
}

async function initSupabase() {
  const env = await loadEnv();
  supabaseClient = window.supabase.createClient(
    env.SUPABASE_URL,
    env.SUPABASE_ANON_KEY
  );
}

async function loadCurrentUser() {
  const userJson = localStorage.getItem('user');
  if (!userJson) {
    window.location.href = '/login.html';
    return;
  }

  const user = JSON.parse(userJson);
  currentUser = { username: user.username };
  currentUserLabel.textContent = 'Logged in as ' + user.username;
}

async function loadContacts() {
  if (!currentUser) return;
  const { data, error } = await supabaseClient
    .from('contacts')
    .select('contact_username')
    .eq('owner_username', currentUser.username)
    .order('contact_username', { ascending: true });

  contacts = [];
  if (error) {
    console.error('loadContacts error:', error);
    return;
  }
  if (data) {
    contacts = data.map(row => row.contact_username);
  }
}

async function addContact(username) {
  if (!currentUser) return;
  if (!username || username === currentUser.username) return;
  if (contacts.includes(username)) return;

  const owner = currentUser.username;
  const contact = username;

  const { error } = await supabaseClient.from('contacts').insert([
    { owner_username: owner, contact_username: contact },
    { owner_username: contact, contact_username: owner }
  ]);

  if (error) {
    console.error('addContact error:', error);
    return;
  }

  await loadContacts();
  renderContacts();
}

function renderContacts() {
  contactList.innerHTML = '';
  contacts.forEach(username => {
    const li = document.createElement('li');
    li.className = 'contact-item' + (username === currentChat ? ' active' : '');
    li.dataset.username = username;

    const avatar = document.createElement('div');
    avatar.className = 'contact-avatar';
    avatar.textContent = username.charAt(0).toUpperCase();

    const name = document.createElement('div');
    name.className = 'contact-name';
    name.textContent = username;

    li.appendChild(avatar);
    li.appendChild(name);
    contactList.appendChild(li);
  });
}

function renderMessages(list) {
  messagesEl.innerHTML = '';
  
  const sorted = [...list].sort((a, b) => {
    const timeA = new Date(a.created_at).getTime();
    const timeB = new Date(b.created_at).getTime();
    return timeA - timeB;
  });
  
  sorted.forEach(msg => {
    const row = document.createElement('div');
    const isSent = msg.sender_username === currentUser.username;
    row.className = 'message-row ' + (isSent ? 'sent' : 'received');

    const bubble = document.createElement('div');
    bubble.className = 'message-bubble';
    bubble.textContent = msg.content;

    const meta = document.createElement('div');
    meta.className = 'message-meta';
    const time = new Date(msg.created_at);
    meta.textContent = time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const wrapper = document.createElement('div');
    wrapper.appendChild(bubble);
    wrapper.appendChild(meta);

    row.appendChild(wrapper);
    messagesEl.appendChild(row);
  });
  
  messagesEl.scrollTop = messagesEl.scrollHeight;
}


async function fetchMessages(withUser) {
  if (!currentUser || !withUser) return [];
  const me = currentUser.username;

  const { data, error } = await supabaseClient
    .from('messages')
    .select('*')
    .or(
      `and(sender_username.eq.${me},receiver_username.eq.${withUser}),` +
      `and(sender_username.eq.${withUser},receiver_username.eq.${me})`
    )
    .order('created_at', { ascending: true });

  if (error) {
    console.error('fetchMessages error', error);
    return [];
  }
  return data || [];
}

async function loadMessages(withUser) {
  messagesEl.innerHTML = '';
  if (!withUser) {
    currentChatNameEl.textContent = 'No chat selected';
    messageCache = [];
    return;
  }

  currentChatNameEl.textContent = withUser;
  messageCache = await fetchMessages(withUser);
  renderMessages(messageCache);
  subscribeToRealtime(withUser);
}

function subscribeToRealtime(withUser) {
  if (currentChannel) {
    supabaseClient.removeChannel(currentChannel);
    currentChannel = null;
  }
  if (!currentUser || !withUser) return;

  const me = currentUser.username;

  currentChannel = supabaseClient
    .channel('messages:' + me + ':' + withUser)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'messages'
      },
      payload => {
        const msg = payload.new;
        const inThisConversation =
          (msg.sender_username === me && msg.receiver_username === withUser) ||
          (msg.sender_username === withUser && msg.receiver_username === me);

        if (inThisConversation) {
          const alreadyExists = messageCache.some(
            m => m.content === msg.content && 
                 m.sender_username === msg.sender_username && 
                 m.receiver_username === msg.receiver_username &&
                 !m.id  // Optimistic messages don't have an id
          );

          if (!alreadyExists) {
            messageCache.push(msg);
            renderMessages(messageCache);
          }
        }
      }
    )
    .subscribe();
}



async function sendMessage(content) {
  if (!currentUser || !currentChat || !content.trim()) return;

  const me = currentUser.username;
  const text = content.trim();

  const optimistic = {
    sender_username: me,
    receiver_username: currentChat,
    content: text,
    created_at: new Date().toISOString(),
    temp: true
  };

  messageCache.push(optimistic);
  renderMessages(messageCache);

  const { data, error } = await supabaseClient
    .from('messages')
    .insert({
      sender_username: me,
      receiver_username: currentChat,
      content: text
    })
    .select();

  if (error) {
    console.error('sendMessage insert error', error);
    messageCache = messageCache.filter(m => !m.temp);
    renderMessages(messageCache);
    return;
  }

  if (data && data.length > 0) {
    const index = messageCache.findIndex(m => m.temp && m.content === text);
    if (index !== -1) {
      messageCache[index] = data[0];
    }
    renderMessages(messageCache);
  }

  await new Promise(resolve => setTimeout(resolve, 50));
}



menuButton.addEventListener('click', () => {
  if (sidebar.classList.contains('open')) {
    sidebar.classList.remove('open');
  } else {
    sidebar.classList.add('open');
  }
});

addContactButton.addEventListener('click', () => {
  if (!currentUser) return;
  const name = newContactInput.value.trim();
  newContactInput.value = '';
  addContact(name);
});

contactList.addEventListener('click', e => {
  const item = e.target.closest('.contact-item');
  if (!item) return;
  const username = item.dataset.username;
  currentChat = username;
  renderContacts();
  loadMessages(username);
  sidebar.classList.remove('open');
});

messageForm.addEventListener('submit', e => {
  e.preventDefault();
  const value = messageInput.value;
  messageInput.value = '';
  sendMessage(value);
});

logoutButton.addEventListener('click', () => {
  localStorage.removeItem('user');
  window.location.href = '/login.html';
});

(async function init() {
  await initSupabase();
  await loadCurrentUser();
  if (!currentUser) return;
  await loadContacts();
  renderContacts();
})();



