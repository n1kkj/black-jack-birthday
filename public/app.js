const app = document.querySelector('#app');
const avatarFile = document.querySelector('#avatar-file');
const toast = document.querySelector('#toast');
const tokenKey = 'blackjack-birthday-token';
const qrTargetUrl = 'http://91.107.127.150:4173/#leaderboard';
const state = { participants: [], avatar: '', mode: 'delta', pollId: null, stream: null, signature: '' };

function getRoute() {
  return window.location.hash.replace('#', '') || 'leaderboard';
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;' }[character]));
}

function initials(name) {
  return escapeHtml(String(name).split(' ').slice(0, 2).map((word) => word[0]).join('').toUpperCase());
}

function formatScore(score) {
  return `${Number(score).toLocaleString('ru-RU')} фишек`;
}

function renderRegisterAction() {
  return localStorage.getItem(tokenKey)
    ? '<span class="button-secondary button-disabled">Профиль активен</span>'
    : '<a class="button register-action" href="#register">Зарегистрироваться <span>→</span></a>';
}

function avatarMarkup(participant, className) {
  const fallback = initials(participant.name);
  return `<div class="${className}">${participant.avatar ? `<img src="${participant.avatar}" alt="">` : fallback}</div>`;
}

function showToast(message, isError) {
  toast.textContent = message;
  toast.className = `toast show${isError ? ' error' : ''}`;
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => { toast.className = 'toast'; }, 3000);
}

async function api(url, options) {
  const response = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...options });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error || 'Что-то пошло не так');
  }
  return payload;
}

function getStateSignature(participants) {
  return participants.map((participant) => [participant.id, participant.name, participant.avatar, participant.score].join(':')).join('|');
}

async function loadState() {
  const payload = await api('/api/state');
  const participants = payload.participants.sort((first, second) => second.score - first.score || first.name.localeCompare(second.name, 'ru'));
  const signature = getStateSignature(participants);
  const changed = signature !== state.signature;
  state.participants = participants;
  state.signature = signature;
  const token = localStorage.getItem(tokenKey);
  if (token && !state.participants.some((participant) => participant.token === token)) {
    localStorage.removeItem(tokenKey);
    if (getRoute() !== 'register') {
      showToast('Ваш профиль сброшен администратором', true);
      window.location.hash = 'register';
    }
  }
  return { participants: state.participants, changed };
}

function startPolling() {
  window.clearInterval(state.pollId);
  state.pollId = window.setInterval(async () => {
    try {
      const result = await loadState();
      if (!result.changed) return;
      if (getRoute() === 'leaderboard') renderLeaderboard();
      if (getRoute() === 'admin') renderAdminList();
    } catch (error) {
      document.querySelectorAll('.refresh-label strong').forEach((element) => { element.textContent = 'OFFLINE'; });
    }
  }, 2000);
}

function renderRegister() {
  if (localStorage.getItem(tokenKey)) {
    window.location.hash = 'leaderboard';
    return;
  }
  app.innerHTML = `
    <section class="view register-layout">
      <div class="register-copy">
        <p class="eyebrow">A private table for one special night</p>
        <h1 class="title">Welcome to the<br><span>birthday table.</span></h1>
        <p class="intro">Зарегистрируйся, выбери аватар и следи, как меняется расклад за игровым столом. Счёт обновляется в реальном времени.</p>
        <div class="suit-row"><span>♠</span><span>♥</span><span>♦</span><span>♣</span></div>
      </div>
      <div class="shell-card register-card">
        <p class="card-label">01 / Join the game</p>
        <div class="avatar-picker">
          <div id="avatar-preview" class="avatar-preview">?</div>
          <div class="avatar-actions">
            <div class="button-row">
              <button class="button-secondary" id="upload-avatar" type="button">Загрузить фото</button>
              <button class="button-secondary" id="selfie-avatar" type="button">Сделать селфи</button>
            </div>
            <p class="muted-copy">Аватар необязателен — можно оставить инициалы.</p>
          </div>
        </div>
        <form id="register-form">
          <div class="field">
            <label class="input-label" for="name">Как тебя зовут?</label>
            <input class="text-input" id="name" name="name" maxlength="32" autocomplete="name" placeholder="Например, Дима" required>
          </div>
          <button class="button register-submit" type="submit">Войти за стол <span>→</span></button>
        </form>
        <a class="helper-link" href="#leaderboard">Смотреть лидерборд без регистрации</a>
      </div>
    </section>`;
  bindRegister();
}

function bindRegister() {
  const nameInput = document.querySelector('#name');
  const preview = document.querySelector('#avatar-preview');
  document.querySelector('#upload-avatar').addEventListener('click', () => avatarFile.click());
  avatarFile.onchange = async () => {
    const [file] = avatarFile.files;
    if (!file) return;
    state.avatar = await readFile(file);
    preview.innerHTML = `<img src="${state.avatar}" alt="Предпросмотр аватара">`;
  };
  document.querySelector('#selfie-avatar').addEventListener('click', openCamera);
  nameInput.addEventListener('input', () => {
    if (!state.avatar) preview.textContent = initials(nameInput.value || '?');
  });
  document.querySelector('#register-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = event.currentTarget.querySelector('button[type="submit"]');
    button.disabled = true;
    button.textContent = 'Сохраняем…';
    try {
      const payload = await api('/api/register', { method: 'POST', body: JSON.stringify({ name: nameInput.value, avatar: state.avatar }) });
      localStorage.setItem(tokenKey, payload.token);
      state.avatar = '';
      showToast('Профиль создан. Добро пожаловать!');
      window.location.hash = 'leaderboard';
    } catch (error) {
      showToast(error.message, true);
      button.disabled = false;
      button.textContent = 'Войти за стол →';
    }
  });
}

function readFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function openCamera() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    showToast('Камера недоступна в этом браузере', true);
    return;
  }
  try {
    state.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
    const modal = document.createElement('div');
    modal.className = 'camera-modal';
    modal.innerHTML = `<div class="camera-box"><video autoplay playsinline></video><div class="button-row"><button class="button" id="capture-selfie">Снять фото</button><button class="button-secondary" id="close-camera">Отмена</button></div></div>`;
    document.body.append(modal);
    const video = modal.querySelector('video');
    video.srcObject = state.stream;
    modal.querySelector('#close-camera').addEventListener('click', () => closeCamera(modal));
    modal.querySelector('#capture-selfie').addEventListener('click', () => {
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
      canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
      state.avatar = canvas.toDataURL('image/jpeg', .82);
      document.querySelector('#avatar-preview').innerHTML = `<img src="${state.avatar}" alt="Предпросмотр аватара">`;
      closeCamera(modal);
    });
  } catch (error) {
    showToast('Не получилось открыть камеру', true);
  }
}

function closeCamera(modal) {
  if (state.stream) state.stream.getTracks().forEach((track) => track.stop());
  state.stream = null;
  modal.remove();
}

function renderLeaderboard() {
  const participants = state.participants;
  const top = participants.slice(0, 3);
  const rest = participants.slice(3);
  const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&margin=12&data=${encodeURIComponent(qrTargetUrl)}`;
  app.innerHTML = `
    <section class="view leaderboard-view">
      <div class="leaderboard-heading">
        <div><p class="eyebrow">Tonight's table</p><h1 class="title">The <span>leaderboard.</span></h1></div>
        <div class="leaderboard-tools"><div class="refresh-label"><strong>● LIVE UPDATES</strong>Каждые 2 секунды</div>${renderRegisterAction()}</div>
      </div>
      <div class="leaderboard-content"><div class="shell-card leaderboard-card">
        ${participants.length ? `<div class="podium">${top.map((participant, index) => podiumMarkup(participant, index)).join('')}</div><div class="leader-list">${rest.map((participant, index) => rowMarkup(participant, index + 4)).join('')}</div>` : `<div class="empty-state"><strong>Стол пока пуст</strong>Стань первым игроком сегодня.</div>`}
      </div><aside class="shell-card qr-card"><p class="card-label">02 / Join the table</p><div class="qr-frame"><img src="${qrImageUrl}" alt="QR-код для перехода на лидерборд"></div><strong>Сканируй, чтобы войти</strong><p>Наведи камеру и открой страницу вечеринки.</p><code>${qrTargetUrl.replace('https://', '')}</code></aside></div>
    </section>`;
}

function podiumMarkup(participant, index) {
  return `<div class="podium-item"><span class="podium-crown">${index === 0 ? '♛' : '✦'}</span>${avatarMarkup(participant, 'participant-avatar')}<span class="podium-place">${index + 1} PLACE</span><span class="podium-name">${escapeHtml(participant.name)}</span><span class="podium-score">${formatScore(participant.score)}</span></div>`;
}

function rowMarkup(participant, rank) {
  return `<div class="leader-row"> <span class="leader-rank">${rank}</span><div class="leader-person">${avatarMarkup(participant, 'participant-avatar')}<span class="leader-name">${escapeHtml(participant.name)}</span></div><span class="leader-score">${formatScore(participant.score)}</span></div>`;
}

function renderAdmin() {
  app.innerHTML = `
    <section class="view admin-view">
      <div class="section-heading"><div><p class="eyebrow">Dealer's desk</p><h1 class="title">Control <span>room.</span></h1></div><p>Здесь можно менять очки участников и сбрасывать профили для новой регистрации.</p></div>
      <div class="admin-grid">
        <div class="shell-card admin-card">
          <h2>Обновить счёт</h2><p>Выбери игрока и поставь новое значение или добавь ход.</p>
          <label class="input-label" for="admin-participant">Участник</label>
          <select class="select-input" id="admin-participant"></select>
          <div class="mode-switch"><button class="mode-button active" data-mode="delta" type="button">Изменить на</button><button class="mode-button" data-mode="set" type="button">Поставить</button></div>
          <label class="input-label" for="admin-value">Количество фишек</label>
          <input class="number-input" id="admin-value" type="number" value="100" step="1">
          <div class="admin-actions"><button class="button" id="save-score" type="button">Сохранить ход</button><a class="button-secondary" href="#leaderboard">Открыть табло</a></div>
        </div>
        <div class="shell-card admin-card"><h2>Игроки за столом</h2><p>Нажми ↻, чтобы удалить профиль и разрешить повторную регистрацию с этого устройства.</p><div class="participant-admin-list" id="admin-list"></div><div class="admin-actions"><button class="button-danger" id="reset-all" type="button">Сбросить всех</button></div></div>
      </div>
    </section>`;
  bindAdmin();
  renderAdminList();
}

function renderAdminList() {
  const select = document.querySelector('#admin-participant');
  const list = document.querySelector('#admin-list');
  if (!select || !list) return;
  const selected = select.value;
  select.innerHTML = state.participants.length ? state.participants.map((participant) => `<option value="${participant.id}">${escapeHtml(participant.name)} · ${formatScore(participant.score)}</option>`).join('') : '<option value="">Нет участников</option>';
  if (state.participants.some((participant) => participant.id === selected)) select.value = selected;
  list.innerHTML = state.participants.length ? state.participants.map((participant) => `<div class="admin-person">${avatarMarkup(participant, 'participant-avatar')}<span class="admin-person-name">${escapeHtml(participant.name)}</span><span class="admin-person-score">${formatScore(participant.score)}</span><button class="icon-reset" data-reset="${participant.id}" type="button" title="Сбросить профиль">↻</button></div>`).join('') : '<div class="admin-empty">Участников пока нет.</div>';
  list.querySelectorAll('[data-reset]').forEach((button) => button.addEventListener('click', () => resetParticipant(button.dataset.reset)));
}

function bindAdmin() {
  document.querySelectorAll('.mode-button').forEach((button) => button.addEventListener('click', () => {
    state.mode = button.dataset.mode;
    document.querySelectorAll('.mode-button').forEach((item) => item.classList.toggle('active', item === button));
  }));
  document.querySelector('#save-score').addEventListener('click', saveScore);
  document.querySelector('#reset-all').addEventListener('click', async () => {
    if (!state.participants.length || !window.confirm('Удалить всех участников и их аватары?')) return;
    try { await api('/api/admin/reset-all', { method: 'POST', body: '{}' }); await loadState(); renderAdminList(); showToast('Стол очищен'); } catch (error) { showToast(error.message, true); }
  });
}

async function saveScore() {
  const id = document.querySelector('#admin-participant').value;
  const value = Number(document.querySelector('#admin-value').value);
  if (!id || !Number.isFinite(value)) { showToast('Выбери участника и введи число', true); return; }
  try { await api('/api/admin/update', { method: 'POST', body: JSON.stringify({ id, value, mode: state.mode }) }); await loadState(); renderAdminList(); showToast('Счёт обновлён'); } catch (error) { showToast(error.message, true); }
}

async function resetParticipant(id) {
  const participant = state.participants.find((item) => item.id === id);
  if (!participant || !window.confirm(`Сбросить профиль ${participant.name}?`)) return;
  try { await api('/api/admin/reset', { method: 'POST', body: JSON.stringify({ id }) }); await loadState(); renderAdminList(); showToast('Профиль сброшен'); } catch (error) { showToast(error.message, true); }
}

async function render() {
  try { await loadState(); } catch (error) { showToast('Сервер пока не отвечает', true); }
  const route = getRoute();
  if (route === 'register') renderRegister();
  else if (route === 'admin') renderAdmin();
  else renderLeaderboard();
  startPolling();
}

window.addEventListener('hashchange', render);
render();
