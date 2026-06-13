// ════════════════════════════════════════════════════════════
//  FIREBASE — importações via CDN
// ════════════════════════════════════════════════════════════
import { initializeApp }  from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
  getFirestore, collection, doc,
  addDoc, setDoc, deleteDoc,
  onSnapshot, query, orderBy,
  updateDoc, increment, serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

// ════════════════════════════════════════════════════════════
//  CONFIGURAÇÃO FIREBASE — credenciais fixas no código
//  (não pede mais para o usuário configurar)
// ════════════════════════════════════════════════════════════
const firebaseConfig = {
  apiKey:            "AIzaSyAUkleGF0bBmPUmSNFJV6spuIvxvfsejDM",
  authDomain:        "ifpa-cameta-39228.firebaseapp.com",
  projectId:         "ifpa-cameta-39228",
  storageBucket:     "ifpa-cameta-39228.firebasestorage.app",
  messagingSenderId: "1057210362487",
  appId:             "1:1057210362487:web:66089b2bb37ecbdf5ab472",
  measurementId:     "G-RTXW7YZMQ3"
};

// ════════════════════════════════════════════════════════════
//  CONFIGURAÇÕES DO SITE
//  ⚠ Mude o ADMIN_PIN para o PIN que preferir (4 dígitos)
// ════════════════════════════════════════════════════════════
const ADMIN_PIN = '1234';
const LIKED_KEY = 'ifpa_liked'; // opiniões que o usuário já curtiu

// ════════════════════════════════════════════════════════════
//  CONSTANTES DE DATA
// ════════════════════════════════════════════════════════════
const DIAS       = ['Segunda','Terça','Quarta','Quinta','Sexta'];
const DIAS_SHORT = ['SEG','TER','QUA','QUI','SEX'];
const MESES      = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];

// ════════════════════════════════════════════════════════════
//  ESTADO DA APLICAÇÃO
// ════════════════════════════════════════════════════════════
let db                = null;
let isAdmin           = false;
let currentSort       = 'likes';
let currentWeekOffset = 0;
let editingMerendaKey = null;

let opinioes      = [];
let eventos       = [];
let merenda       = {};
let likedOpinioes = JSON.parse(localStorage.getItem(LIKED_KEY) || '[]');

// ════════════════════════════════════════════════════════════
//  UTILITÁRIOS
// ════════════════════════════════════════════════════════════
function dateKey(d)  { return d.toISOString().slice(0, 10); }
function isToday(d)  { return dateKey(d) === dateKey(new Date()); }

function getWeekDates(offset) {
  const now    = new Date();
  const day    = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - (day === 0 ? 6 : day - 1) + offset * 7);
  return Array.from({ length: 5 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}

// ════════════════════════════════════════════════════════════
//  TOAST (notificação)
// ════════════════════════════════════════════════════════════
function toast(msg, tipo = '') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className   = 'show' + (tipo ? ' ' + tipo : '');
  clearTimeout(el._timer);
  el._timer = setTimeout(() => { el.className = ''; }, 3500);
}

// ════════════════════════════════════════════════════════════
//  TELA DE CARREGAMENTO
// ════════════════════════════════════════════════════════════
function hideLoading() {
  const el = document.getElementById('loading-screen');
  el.classList.add('hide');
  setTimeout(() => { el.style.display = 'none'; }, 600);
}

// ════════════════════════════════════════════════════════════
//  INICIALIZAÇÃO DO FIREBASE
// ════════════════════════════════════════════════════════════
function iniciarFirebase() {
  try {
    const app = initializeApp(firebaseConfig);
    db = getFirestore(app);

    // Esconde o modal de setup caso ainda esteja visível
    const modalSetup = document.getElementById('modal-setup');
    if (modalSetup) modalSetup.classList.remove('open');

    iniciarListeners();
  } catch (e) {
    console.error('Erro ao conectar ao Firebase:', e);
    hideLoading();
    toast('Erro ao conectar ao servidor. Recarregue a página.', 'error');
  }
}

// ════════════════════════════════════════════════════════════
//  LISTENERS EM TEMPO REAL
//  Atualiza o site automaticamente quando algo muda no Firebase
// ════════════════════════════════════════════════════════════
function iniciarListeners() {
  // Opiniões
  const qOp = query(collection(db, 'opinioes'), orderBy('createdAt', 'desc'));
  onSnapshot(qOp, snap => {
    opinioes = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderOpinioes(currentSort);
    atualizarStats();
  });

  // Eventos
  const qEv = query(collection(db, 'eventos'), orderBy('data'));
  onSnapshot(qEv, snap => {
    eventos = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderEventos();
    renderInicio();
    atualizarStats();
  });

  // Merenda
  onSnapshot(collection(db, 'merenda'), snap => {
    merenda = {};
    snap.docs.forEach(d => { merenda[d.id] = d.data().itens || []; });
    renderMerenda();
    renderInicio();
  });

  hideLoading();
}

// ════════════════════════════════════════════════════════════
//  NAVEGAÇÃO
// ════════════════════════════════════════════════════════════
window.showSection = function (id) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.getElementById('section-' + id).classList.add('active');
  document.getElementById('tab-' + id).classList.add('active');
  if (id === 'merenda') renderMerenda();
  if (id === 'inicio')  renderInicio();
};

// ════════════════════════════════════════════════════════════
//  SEÇÃO: INÍCIO
// ════════════════════════════════════════════════════════════
function atualizarStats() {
  const totLikes = opinioes.reduce((s, o) => s + (o.likes || 0), 0);
  document.getElementById('stat-opiniao').textContent = opinioes.length;
  document.getElementById('stat-eventos').textContent = eventos.length;
  document.getElementById('stat-likes').textContent   = totLikes;
}

function renderInicio() {
  atualizarStats();

  // Merenda de hoje
  const todayKey  = dateKey(new Date());
  const itensHoje = merenda[todayKey];
  const box       = document.getElementById('merenda-hoje-box');
  if (itensHoje && itensHoje.length) {
    box.innerHTML = itensHoje.map(i =>
      `<div style="display:flex;align-items:center;gap:8px;padding:3px 0">
         <span style="color:var(--verde-claro);font-size:16px">•</span>${i}
       </div>`
    ).join('');
  } else {
    box.innerHTML = '<span style="color:var(--cinza);font-style:italic;font-size:13px">Cardápio ainda não cadastrado para hoje</span>';
  }

  // Próximo evento
  const now  = new Date();
  const prox = [...eventos]
    .filter(e => new Date(e.data + 'T00:00:00') >= now)
    .sort((a, b) => a.data.localeCompare(b.data))[0];
  const pbox = document.getElementById('proximo-evento-box');
  if (prox) {
    const d = new Date(prox.data + 'T00:00:00');
    pbox.innerHTML = `
      <div style="display:flex;gap:14px;align-items:flex-start">
        <div style="background:var(--verde-escuro);color:#fff;border-radius:10px;min-width:50px;padding:8px 6px;text-align:center;flex-shrink:0">
          <div style="font-family:'Sora',sans-serif;font-size:20px;font-weight:700;line-height:1">${d.getDate()}</div>
          <div style="font-size:10px;opacity:0.75;text-transform:uppercase">${MESES[d.getMonth()]}</div>
        </div>
        <div>
          <span class="event-badge badge-${prox.cat}">${prox.cat.charAt(0).toUpperCase() + prox.cat.slice(1)}</span>
          <div style="font-family:'Sora',sans-serif;font-weight:600;font-size:15px;margin-bottom:4px">${prox.titulo}</div>
          <div style="font-size:12px;color:var(--cinza)">🕐 ${prox.hora || '—'} · 📍 ${prox.local || '—'}</div>
        </div>
      </div>`;
  } else {
    pbox.innerHTML = '<span style="color:var(--cinza);font-style:italic;font-size:13px">Nenhum evento próximo cadastrado</span>';
  }
}

// ════════════════════════════════════════════════════════════
//  SEÇÃO: OPINIÕES
// ════════════════════════════════════════════════════════════
window.enviarOpiniao = async function () {
  if (!db) return;
  const texto = document.getElementById('opiniao-texto').value.trim();
  const cat   = document.getElementById('opiniao-categoria').value;
  if (!texto) { toast('Escreva sua opinião antes de enviar.', 'error'); return; }

  const btn = document.getElementById('btn-enviar');
  btn.disabled = true; btn.textContent = 'Enviando...';

  try {
    await addDoc(collection(db, 'opinioes'), {
      texto, cat, likes: 0,
      createdAt: serverTimestamp(),
      data: new Date().toLocaleDateString('pt-BR')
    });
    document.getElementById('opiniao-texto').value = '';
    toast('✅ Opinião enviada! Obrigado pela contribuição.');
  } catch (e) {
    toast('Erro ao enviar: ' + e.message, 'error');
  }

  btn.disabled = false; btn.textContent = 'Enviar';
};

window.sortOpinioes = function (mode, btn) {
  currentSort = mode;
  document.querySelectorAll('.sort-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderOpinioes(mode);
};

function renderOpinioes(mode) {
  const list = [...opinioes];
  if (mode === 'likes') list.sort((a, b) => (b.likes || 0) - (a.likes || 0));

  const el = document.getElementById('opinions-list');
  if (!list.length) {
    el.innerHTML = '<div class="loading-msg">Ainda não há opiniões. Seja o primeiro a contribuir! 💡</div>';
    return;
  }
  el.innerHTML = list.map(o => {
    const liked = likedOpinioes.includes(o.id);
    return `<div class="opinion-card">
      <div class="opinion-body">
        <div class="opinion-text">${o.texto}</div>
        <div class="opinion-meta">
          <span class="opinion-tag">${o.cat}</span>
          <span>📅 ${o.data || ''}</span>
        </div>
      </div>
      <button class="like-btn ${liked ? 'liked' : ''}" onclick="toggleLike('${o.id}')" title="Votar">
        <span class="like-icon">👍</span>
        <span class="like-count">${o.likes || 0}</span>
      </button>
    </div>`;
  }).join('');
}

window.toggleLike = async function (id) {
  if (!db) return;
  const idx   = likedOpinioes.indexOf(id);
  const delta = idx === -1 ? 1 : -1;
  if (idx === -1) likedOpinioes.push(id);
  else likedOpinioes.splice(idx, 1);
  localStorage.setItem(LIKED_KEY, JSON.stringify(likedOpinioes));
  try {
    await updateDoc(doc(db, 'opinioes', id), { likes: increment(delta) });
  } catch (e) {
    toast('Erro ao registrar voto.', 'error');
  }
};

// ════════════════════════════════════════════════════════════
//  SEÇÃO: EVENTOS
// ════════════════════════════════════════════════════════════
function renderEventos() {
  document.getElementById('btn-add-evento').style.display = isAdmin ? 'block' : 'none';
  const grid = document.getElementById('events-grid');
  if (!eventos.length) {
    grid.innerHTML = '<div class="loading-msg">Nenhum evento cadastrado.</div>';
    return;
  }
  grid.innerHTML = eventos.map(e => {
    const d = new Date(e.data + 'T00:00:00');
    return `<div class="event-card">
      <div class="event-date-box">
        <div class="event-day">${d.getDate()}</div>
        <div class="event-month">${MESES[d.getMonth()]}</div>
      </div>
      <div class="event-body">
        <span class="event-badge badge-${e.cat}">${e.cat.charAt(0).toUpperCase() + e.cat.slice(1)}</span>
        <div class="event-title">${e.titulo}</div>
        <div class="event-desc">${e.desc || ''}</div>
        <div class="event-meta">
          <span>🕐 ${e.hora || '—'}</span>
          <span>📍 ${e.local || '—'}</span>
          ${isAdmin ? `<button onclick="deleteEvento('${e.id}')"
            style="margin-left:auto;background:none;border:none;color:#DC2626;cursor:pointer;font-size:12px;font-family:'DM Sans',sans-serif">
            ✕ Remover</button>` : ''}
        </div>
      </div>
    </div>`;
  }).join('');
}

window.openEventoModal = function () {
  document.getElementById('modal-evento').classList.add('open');
};

window.saveEvento = async function () {
  if (!db) return;
  const titulo = document.getElementById('evento-titulo').value.trim();
  const desc   = document.getElementById('evento-desc').value.trim();
  const data_  = document.getElementById('evento-data').value;
  const hora   = document.getElementById('evento-hora').value;
  const local  = document.getElementById('evento-local').value.trim();
  const cat    = document.getElementById('evento-cat').value;

  if (!titulo || !data_) { toast('Preencha pelo menos o título e a data.', 'error'); return; }

  const btn = document.getElementById('btn-save-evento');
  btn.disabled = true; btn.textContent = 'Salvando...';

  try {
    await addDoc(collection(db, 'eventos'), {
      titulo, desc, data: data_, hora, local, cat,
      createdAt: serverTimestamp()
    });
    closeModal('modal-evento');
    ['titulo','desc','data','hora','local'].forEach(f => {
      document.getElementById('evento-' + f).value = '';
    });
    toast('✅ Evento cadastrado!');
  } catch (e) {
    toast('Erro ao salvar: ' + e.message, 'error');
  }

  btn.disabled = false; btn.textContent = 'Salvar';
};

window.deleteEvento = async function (id) {
  if (!confirm('Remover este evento permanentemente?')) return;
  try {
    await deleteDoc(doc(db, 'eventos', id));
    toast('Evento removido.');
  } catch (e) {
    toast('Erro ao remover: ' + e.message, 'error');
  }
};

// ════════════════════════════════════════════════════════════
//  SEÇÃO: MERENDA
// ════════════════════════════════════════════════════════════
function renderMerenda() {
  const dates = getWeekDates(currentWeekOffset);
  const s = dates[0], e = dates[4];
  document.getElementById('week-label').textContent =
    `${s.getDate()} ${MESES[s.getMonth()]} – ${e.getDate()} ${MESES[e.getMonth()]}`;

  document.getElementById('merenda-grid').innerHTML = dates.map((d, i) => {
    const key   = dateKey(d);
    const itens = merenda[key] || [];
    const today = isToday(d);
    return `<div class="merenda-day ${today ? 'today' : ''}">
      <div class="merenda-day-header">
        <span>${DIAS_SHORT[i]} ${d.getDate()}/${String(d.getMonth()+1).padStart(2,'0')}</span>
        ${today ? '<span class="today-tag">HOJE</span>' : ''}
      </div>
      <div class="merenda-day-body">
        ${itens.length
          ? itens.map(it => `<div class="merenda-item"><div class="merenda-dot"></div><span>${it}</span></div>`).join('')
          : '<div class="merenda-empty">Cardápio não informado</div>'}
        ${isAdmin ? `<button class="merenda-edit-btn"
          onclick="openMerendaEdit('${key}', '${DIAS[i]} ${d.getDate()}/${d.getMonth()+1}')">
          ✏ Editar</button>` : ''}
      </div>
    </div>`;
  }).join('');
}

window.changeWeek = function (dir) {
  currentWeekOffset += dir;
  renderMerenda();
};

window.openMerendaEdit = function (key, label) {
  editingMerendaKey = key;
  document.getElementById('modal-merenda-title').textContent = `🍽 Editar Merenda – ${label}`;
  document.getElementById('merenda-input').value = (merenda[key] || []).join('\n');
  document.getElementById('modal-merenda').classList.add('open');
};

window.saveMerenda = async function () {
  if (!db || !editingMerendaKey) return;
  const raw   = document.getElementById('merenda-input').value;
  const itens = raw.split('\n').map(s => s.trim()).filter(Boolean);

  const btn = document.getElementById('btn-save-merenda');
  btn.disabled = true; btn.textContent = 'Salvando...';

  try {
    await setDoc(doc(db, 'merenda', editingMerendaKey), {
      itens, updatedAt: serverTimestamp()
    });
    closeModal('modal-merenda');
    toast('✅ Cardápio salvo!');
  } catch (e) {
    toast('Erro ao salvar: ' + e.message, 'error');
  }

  btn.disabled = false; btn.textContent = 'Salvar';
};

// ════════════════════════════════════════════════════════════
//  ADMIN
// ════════════════════════════════════════════════════════════
window.openAdminModal = function () {
  if (isAdmin) {
    isAdmin = false;
    const btn = document.getElementById('nav-admin-btn');
    btn.classList.remove('ativo');
    btn.textContent = '⚙ Admin';
    renderEventos();
    renderMerenda();
    toast('Modo admin desativado.');
    return;
  }
  document.getElementById('pin-input').value = '';
  document.getElementById('pin-error').style.display = 'none';
  document.getElementById('modal-admin').classList.add('open');
  setTimeout(() => document.getElementById('pin-input').focus(), 200);
};

window.checkPin = function () {
  const val = document.getElementById('pin-input').value;
  if (val.length === 4) {
    if (val === ADMIN_PIN) {
      isAdmin = true;
      closeModal('modal-admin');
      const btn = document.getElementById('nav-admin-btn');
      btn.classList.add('ativo');
      btn.textContent = '✓ Admin ON';
      renderEventos();
      renderMerenda();
      toast('✅ Modo admin ativado!');
    } else {
      document.getElementById('pin-error').style.display = 'block';
      document.getElementById('pin-input').value = '';
    }
  }
};

// ════════════════════════════════════════════════════════════
//  MODAIS
// ════════════════════════════════════════════════════════════
window.closeModal = function (id) {
  document.getElementById(id).classList.remove('open');
};

document.querySelectorAll('.modal-overlay').forEach(m => {
  m.addEventListener('click', e => {
    if (e.target === m && m.id !== 'modal-setup') m.classList.remove('open');
  });
});

// ════════════════════════════════════════════════════════════
//  INICIALIZAÇÃO — conecta automaticamente ao abrir o site
// ════════════════════════════════════════════════════════════
iniciarFirebase();