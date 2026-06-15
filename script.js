// ════════════════════════════════════════════════════════════
//  FIREBASE — importações via CDN
// ════════════════════════════════════════════════════════════
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
  getFirestore, collection, doc,
  addDoc, setDoc, deleteDoc,
  onSnapshot, query, orderBy,
  updateDoc, increment, serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

// ════════════════════════════════════════════════════════════
//  CONFIGURAÇÃO FIREBASE
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
//  CONFIGURAÇÕES
// ════════════════════════════════════════════════════════════
const ADMIN_PIN    = '1234';
const LIKED_KEY    = 'ifpa_liked';
const COOLDOWN_KEY = 'ifpa_ultimo_comentario';
const COOLDOWN_MS  = 3 * 60 * 1000;
const AVALIADO_KEY = 'ifpa_avaliado'; // dias que o usuário já avaliou

// ════════════════════════════════════════════════════════════
//  CONSTANTES
// ════════════════════════════════════════════════════════════
const DIAS       = ['Segunda','Terça','Quarta','Quinta','Sexta'];
const DIAS_SHORT = ['SEG','TER','QUA','QUI','SEX'];
const MESES      = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];

// ════════════════════════════════════════════════════════════
//  ESTADO
// ════════════════════════════════════════════════════════════
let db                = null;
let isAdmin           = false;
let currentSort       = 'likes';
let currentWeekOffset = 0;
let editingMerendaKey = null;
let cooldownInterval  = null;
let eventoTabAtual    = 'proximos';
let filtroCategoria   = null;  // filtro de categoria ativo
let avaliacaoKey      = null;  // dia sendo avaliado

let opinioes      = [];
let eventos       = [];
let merenda       = {};
let avaliacoes    = {}; // { 'YYYY-MM-DD': { '😋': 3, '😊': 5, ... } }
let membros       = [];
let likedOpinioes = JSON.parse(localStorage.getItem(LIKED_KEY)    || '[]');
let avaliadoDias  = JSON.parse(localStorage.getItem(AVALIADO_KEY) || '[]');

// ════════════════════════════════════════════════════════════
//  UTILITÁRIOS
// ════════════════════════════════════════════════════════════
function dateKey(d) { return d.toISOString().slice(0, 10); }
function isToday(d) { return dateKey(d) === dateKey(new Date()); }

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
//  TOAST
// ════════════════════════════════════════════════════════════
function toast(msg, tipo = '') {
  const el  = document.getElementById('toast');
  el.textContent = msg;
  el.className   = 'show' + (tipo ? ' ' + tipo : '');
  clearTimeout(el._timer);
  el._timer = setTimeout(() => { el.className = ''; }, 3500);
}

// ════════════════════════════════════════════════════════════
//  LOADING
// ════════════════════════════════════════════════════════════
function hideLoading() {
  const el = document.getElementById('loading-screen');
  el.classList.add('hide');
  setTimeout(() => { el.style.display = 'none'; }, 600);
}

// ════════════════════════════════════════════════════════════
//  FIREBASE
// ════════════════════════════════════════════════════════════
function iniciarFirebase() {
  try {
    const app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    iniciarListeners();
  } catch (e) {
    console.error('Erro Firebase:', e);
    hideLoading();
    toast('Erro ao conectar. Recarregue a página.', 'error');
  }
}

function iniciarListeners() {
  // Opiniões
  onSnapshot(query(collection(db, 'opinioes'), orderBy('createdAt', 'desc')), snap => {
    opinioes = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderOpinioes(currentSort);
    renderCatCounters();
    atualizarStats();
  });

  // Eventos
  onSnapshot(query(collection(db, 'eventos'), orderBy('data')), snap => {
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

  // Avaliações da merenda
  onSnapshot(collection(db, 'avaliacoes'), snap => {
    avaliacoes = {};
    snap.docs.forEach(d => { avaliacoes[d.id] = d.data(); });
    renderMerenda();
  });

  // Membros
  onSnapshot(query(collection(db, 'membros'), orderBy('createdAt', 'asc')), snap => {
    membros = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderGremio();
  });

  hideLoading();
  verificarCooldown();
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
  if (id === 'gremio')  renderGremio();
};

// ════════════════════════════════════════════════════════════
//  INÍCIO
// ════════════════════════════════════════════════════════════
function atualizarStats() {
  const totLikes = opinioes.reduce((s, o) => s + (o.likes || 0), 0);
  document.getElementById('stat-opiniao').textContent = opinioes.length;
  document.getElementById('stat-eventos').textContent = eventos.length;
  document.getElementById('stat-likes').textContent   = totLikes;
}

function renderInicio() {
  atualizarStats();

  // Merenda hoje
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
//  OPINIÕES — cooldown
// ════════════════════════════════════════════════════════════
function verificarCooldown() {
  const ultimo   = parseInt(localStorage.getItem(COOLDOWN_KEY) || '0');
  const restante = COOLDOWN_MS - (Date.now() - ultimo);
  if (restante > 0) iniciarCooldownUI(restante);
}

function iniciarCooldownUI(msRestante) {
  const btn   = document.getElementById('btn-enviar');
  const aviso = document.getElementById('cooldown-aviso');
  const timer = document.getElementById('cooldown-timer');
  btn.disabled        = true;
  aviso.style.display = 'block';
  clearInterval(cooldownInterval);
  let segundos = Math.ceil(msRestante / 1000);
  const tick = () => {
    const m = Math.floor(segundos / 60);
    const s = segundos % 60;
    timer.textContent = `${m}:${String(s).padStart(2, '0')}`;
    if (segundos <= 0) {
      clearInterval(cooldownInterval);
      btn.disabled        = false;
      aviso.style.display = 'none';
    }
    segundos--;
  };
  tick();
  cooldownInterval = setInterval(tick, 1000);
}

// ════════════════════════════════════════════════════════════
//  OPINIÕES — contador por categoria
// ════════════════════════════════════════════════════════════
function renderCatCounters() {
  const contagem = {};
  opinioes.forEach(o => { contagem[o.cat] = (contagem[o.cat] || 0) + 1; });
  const strip = document.getElementById('cat-counter-strip');
  if (!strip) return;

  // Botão "Todas"
  let html = `<div class="cat-counter-item ${!filtroCategoria ? 'active' : ''}"
    onclick="filtrarCategoria(null)">
    Todas <span class="cat-counter-num">${opinioes.length}</span>
  </div>`;

  Object.entries(contagem).sort((a,b) => b[1]-a[1]).forEach(([cat, n]) => {
    html += `<div class="cat-counter-item ${filtroCategoria === cat ? 'active' : ''}"
      onclick="filtrarCategoria('${cat}')">
      ${cat} <span class="cat-counter-num">${n}</span>
    </div>`;
  });
  strip.innerHTML = html;
}

window.filtrarCategoria = function(cat) {
  filtroCategoria = cat;
  renderCatCounters();
  renderOpinioes(currentSort);
};

// ════════════════════════════════════════════════════════════
//  OPINIÕES — envio e renderização
// ════════════════════════════════════════════════════════════
window.enviarOpiniao = async function () {
  if (!db) return;

  const ultimo   = parseInt(localStorage.getItem(COOLDOWN_KEY) || '0');
  const restante = COOLDOWN_MS - (Date.now() - ultimo);
  if (restante > 0) { iniciarCooldownUI(restante); return; }

  const texto = document.getElementById('opiniao-texto').value.trim();
  const cat   = document.getElementById('opiniao-categoria').value;
  const nome  = document.getElementById('opiniao-nome').value.trim()  || 'Anônimo';
  const turma = document.getElementById('opiniao-turma').value.trim() || '';
  if (!texto) { toast('Escreva sua opinião antes de enviar.', 'error'); return; }

  const btn = document.getElementById('btn-enviar');
  btn.disabled = true; btn.textContent = 'Enviando...';

  try {
    await addDoc(collection(db, 'opinioes'), {
      texto, cat, nome, turma, likes: 0,
      createdAt: serverTimestamp(),
      data: new Date().toLocaleDateString('pt-BR')
    });
    document.getElementById('opiniao-texto').value = '';
    document.getElementById('opiniao-nome').value  = '';
    document.getElementById('opiniao-turma').value = '';
    localStorage.setItem(COOLDOWN_KEY, String(Date.now()));
    iniciarCooldownUI(COOLDOWN_MS);
    toast('✅ Opinião enviada! Obrigado pela contribuição.');
  } catch (e) {
    btn.disabled    = false;
    btn.textContent = 'Enviar';
    toast('Erro ao enviar: ' + e.message, 'error');
  }
};

window.sortOpinioes = function (mode, btn) {
  currentSort = mode;
  document.querySelectorAll('.sort-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderOpinioes(mode);
};

function renderOpinioes(mode) {
  let list = [...opinioes];
  if (filtroCategoria) list = list.filter(o => o.cat === filtroCategoria);
  if (mode === 'likes') list.sort((a, b) => (b.likes || 0) - (a.likes || 0));

  const el = document.getElementById('opinions-list');
  if (!list.length) {
    el.innerHTML = `<div class="loading-msg">${filtroCategoria ? 'Nenhuma opinião nesta categoria.' : 'Ainda não há opiniões. Seja o primeiro! 💡'}</div>`;
    return;
  }
  el.innerHTML = list.map(o => {
    const liked = likedOpinioes.includes(o.id);
    const autor = o.nome && o.nome !== 'Anônimo'
      ? `${o.nome}${o.turma ? ' · ' + o.turma : ''}`
      : o.turma || 'Anônimo';
    return `<div class="opinion-card">
      <div class="opinion-body">
        <div class="opinion-text">${o.texto}</div>
        <div class="opinion-meta">
          <span class="opinion-tag">${o.cat}</span>
          <span>👤 ${autor}</span>
          <span>📅 ${o.data || ''}</span>
          ${isAdmin
            ? `<button class="opinion-del-btn" onclick="deleteOpiniao('${o.id}')">🗑 Remover</button>`
            : ''}
        </div>
      </div>
      <button class="like-btn ${liked ? 'liked' : ''}" onclick="toggleLike('${o.id}')">
        <span class="like-icon">👍</span>
        <span class="like-count">${o.likes || 0}</span>
      </button>
    </div>`;
  }).join('');
}

window.deleteOpiniao = async function (id) {
  if (!confirm('Remover esta opinião permanentemente?')) return;
  try {
    await deleteDoc(doc(db, 'opinioes', id));
    toast('Opinião removida.');
  } catch (e) { toast('Erro: ' + e.message, 'error'); }
};

window.toggleLike = async function (id) {
  if (!db) return;
  const idx   = likedOpinioes.indexOf(id);
  const delta = idx === -1 ? 1 : -1;
  if (idx === -1) likedOpinioes.push(id);
  else likedOpinioes.splice(idx, 1);
  localStorage.setItem(LIKED_KEY, JSON.stringify(likedOpinioes));
  try {
    await updateDoc(doc(db, 'opinioes', id), { likes: increment(delta) });
  } catch (e) { toast('Erro ao votar.', 'error'); }
};

// ════════════════════════════════════════════════════════════
//  EVENTOS — próximos e histórico
// ════════════════════════════════════════════════════════════
window.switchEventoTab = function(tab) {
  eventoTabAtual = tab;
  document.getElementById('etab-proximos').classList.toggle('active', tab === 'proximos');
  document.getElementById('etab-historico').classList.toggle('active', tab === 'historico');
  renderEventos();
};

function renderEventos() {
  document.getElementById('btn-add-evento').style.display = isAdmin ? 'block' : 'none';
  const now    = new Date();
  const grid   = document.getElementById('events-grid');

  const proximos  = eventos.filter(e => new Date(e.data + 'T00:00:00') >= now);
  const historico = eventos.filter(e => new Date(e.data + 'T00:00:00') <  now)
                           .sort((a,b) => b.data.localeCompare(a.data));

  const lista = eventoTabAtual === 'proximos' ? proximos : historico;

  if (!lista.length) {
    grid.innerHTML = `<div class="loading-msg">${eventoTabAtual === 'proximos' ? 'Nenhum evento próximo.' : 'Nenhum evento no histórico.'}</div>`;
    return;
  }
  grid.innerHTML = lista.map(e => {
    const d       = new Date(e.data + 'T00:00:00');
    const passado = eventoTabAtual === 'historico';
    return `<div class="event-card ${passado ? 'passado' : ''}">
      <div class="event-date-box">
        <div class="event-day">${d.getDate()}</div>
        <div class="event-month">${MESES[d.getMonth()]}</div>
      </div>
      <div class="event-body">
        <span class="event-badge badge-${e.cat}">${e.cat.charAt(0).toUpperCase() + e.cat.slice(1)}</span>
        ${passado ? '<span class="event-badge" style="background:#F3F4F6;color:#6B7280;margin-left:4px">Realizado</span>' : ''}
        <div class="event-title">${e.titulo}</div>
        <div class="event-desc">${e.desc || ''}</div>
        <div class="event-meta">
          <span>🕐 ${e.hora || '—'}</span>
          <span>📍 ${e.local || '—'}</span>
          ${isAdmin
            ? `<button onclick="deleteEvento('${e.id}')"
                style="margin-left:auto;background:none;border:none;color:#DC2626;cursor:pointer;font-size:12px;font-family:'DM Sans',sans-serif">
                ✕ Remover</button>`
            : ''}
        </div>
      </div>
    </div>`;
  }).join('');
}

window.openEventoModal = function () { document.getElementById('modal-evento').classList.add('open'); };

window.saveEvento = async function () {
  if (!db) return;
  const titulo = document.getElementById('evento-titulo').value.trim();
  const desc   = document.getElementById('evento-desc').value.trim();
  const data_  = document.getElementById('evento-data').value;
  const hora   = document.getElementById('evento-hora').value;
  const local  = document.getElementById('evento-local').value.trim();
  const cat    = document.getElementById('evento-cat').value;
  if (!titulo || !data_) { toast('Preencha título e data.', 'error'); return; }
  const btn = document.getElementById('btn-save-evento');
  btn.disabled = true; btn.textContent = 'Salvando...';
  try {
    await addDoc(collection(db, 'eventos'), { titulo, desc, data: data_, hora, local, cat, createdAt: serverTimestamp() });
    closeModal('modal-evento');
    ['titulo','desc','data','hora','local'].forEach(f => { document.getElementById('evento-'+f).value=''; });
    toast('✅ Evento cadastrado!');
  } catch (e) { toast('Erro: ' + e.message, 'error'); }
  btn.disabled = false; btn.textContent = 'Salvar';
};

window.deleteEvento = async function (id) {
  if (!confirm('Remover este evento?')) return;
  try { await deleteDoc(doc(db, 'eventos', id)); toast('Evento removido.'); }
  catch (e) { toast('Erro: ' + e.message, 'error'); }
};

// ════════════════════════════════════════════════════════════
//  MERENDA + AVALIAÇÃO
// ════════════════════════════════════════════════════════════
function renderMerenda() {
  const dates = getWeekDates(currentWeekOffset);
  const s = dates[0], e = dates[4];
  document.getElementById('week-label').textContent =
    `${s.getDate()} ${MESES[s.getMonth()]} – ${e.getDate()} ${MESES[e.getMonth()]}`;

  document.getElementById('merenda-grid').innerHTML = dates.map((d, i) => {
    const key      = dateKey(d);
    const itens    = merenda[key] || [];
    const today    = isToday(d);
    const jaAvaliei = avaliadoDias.includes(key);
    const notas    = avaliacoes[key] || {};
    const totalAv  = Object.values(notas).reduce((s,n) => s+n, 0);

    // Barra de avaliações
    const notasHTML = totalAv > 0
      ? `<div class="merenda-notas">
          ${['😋','😊','😐','😕'].map(e => `
            <div class="merenda-nota-item">
              <span class="merenda-nota-emoji">${e}</span>
              <span class="merenda-nota-count">${notas[e] || 0}</span>
            </div>`).join('')}
        </div>`
      : '';

    // Botão de avaliar (só se houver cardápio e não avaliou ainda)
    const avaliarBtn = itens.length && !jaAvaliei
      ? `<button class="merenda-avaliar-btn" onclick="openAvaliacaoModal('${key}', '${DIAS[i]} ${d.getDate()}/${d.getMonth()+1}')">
           ⭐ Avaliar merenda
         </button>`
      : jaAvaliei
        ? `<div style="font-size:11px;color:var(--cinza);text-align:center;margin-top:6px">✓ Você já avaliou</div>`
        : '';

    return `<div class="merenda-day ${today ? 'today' : ''}">
      <div class="merenda-day-header">
        <span>${DIAS_SHORT[i]} ${d.getDate()}/${String(d.getMonth()+1).padStart(2,'0')}</span>
        ${today ? '<span class="today-tag">HOJE</span>' : ''}
      </div>
      <div class="merenda-day-body">
        ${itens.length
          ? itens.map(it => `<div class="merenda-item"><div class="merenda-dot"></div><span>${it}</span></div>`).join('')
          : '<div class="merenda-empty">Cardápio não informado</div>'}
        ${notasHTML}
        ${avaliarBtn}
        ${isAdmin ? `<button class="merenda-edit-btn" onclick="openMerendaEdit('${key}','${DIAS[i]} ${d.getDate()}/${d.getMonth()+1}')">✏ Editar</button>` : ''}
      </div>
    </div>`;
  }).join('');
}

window.changeWeek = function (dir) { currentWeekOffset += dir; renderMerenda(); };

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
  const btn   = document.getElementById('btn-save-merenda');
  btn.disabled = true; btn.textContent = 'Salvando...';
  try {
    await setDoc(doc(db, 'merenda', editingMerendaKey), { itens, updatedAt: serverTimestamp() });
    closeModal('modal-merenda');
    toast('✅ Cardápio salvo!');
  } catch (e) { toast('Erro: ' + e.message, 'error'); }
  btn.disabled = false; btn.textContent = 'Salvar';
};

window.openAvaliacaoModal = function (key, label) {
  avaliacaoKey = key;
  document.getElementById('modal-avaliacao-title').textContent = `⭐ Avaliar – ${label}`;
  document.getElementById('modal-avaliacao').classList.add('open');
};

window.salvarAvaliacao = async function (emoji) {
  if (!db || !avaliacaoKey) return;
  try {
    const ref   = doc(db, 'avaliacoes', avaliacaoKey);
    const dados = {};
    dados[emoji] = increment(1);
    await updateDoc(ref, dados).catch(async () => {
      // Documento não existe ainda: cria com valor 1
      const novo = { '😋': 0, '😊': 0, '😐': 0, '😕': 0 };
      novo[emoji] = 1;
      await setDoc(ref, novo);
    });
    avaliadoDias.push(avaliacaoKey);
    localStorage.setItem(AVALIADO_KEY, JSON.stringify(avaliadoDias));
    closeModal('modal-avaliacao');
    toast('✅ Obrigado pela avaliação!');
  } catch (e) { toast('Erro ao avaliar: ' + e.message, 'error'); }
};

// ════════════════════════════════════════════════════════════
//  GRÊMIO
// ════════════════════════════════════════════════════════════
function renderGremio() {
  document.getElementById('btn-add-membro').style.display = isAdmin ? 'block' : 'none';
  const grid = document.getElementById('gremio-grid');
  if (!membros.length) {
    grid.innerHTML = '<div class="loading-msg">Nenhum membro cadastrado ainda.</div>';
    return;
  }
  grid.innerHTML = membros.map(m => `
    <div class="membro-card">
      <div class="membro-foto-wrap">
        ${m.foto
          ? `<img src="${m.foto}" alt="${m.nome}" onerror="this.parentElement.innerHTML='<div class=membro-foto-placeholder>👤</div>'">`
          : '<div class="membro-foto-placeholder">👤</div>'}
      </div>
      <div class="membro-body">
        ${m.cargo ? `<div class="membro-cargo">${m.cargo}</div>` : ''}
        <div class="membro-nome">${m.nome}</div>
        <div class="membro-info">
          ${m.idade     ? `<span>🎂 ${m.idade} anos</span>`  : ''}
          ${m.turma     ? `<span>📚 ${m.turma}</span>`       : ''}
          ${m.email     ? `<span>✉️ <a href="mailto:${m.email}">${m.email}</a></span>` : ''}
          ${m.instagram ? `<span>📸 <a href="https://instagram.com/${m.instagram.replace('@','')}" target="_blank">${m.instagram}</a></span>` : ''}
        </div>
      </div>
      ${isAdmin ? `<button class="membro-del-btn" onclick="deleteMembro('${m.id}')">✕ Remover</button>` : ''}
    </div>`
  ).join('');
}

window.openMembroModal = function () {
  ['foto','nome','idade','turma','cargo','email','instagram'].forEach(f => {
    document.getElementById('membro-'+f).value = '';
  });
  document.getElementById('modal-membro').classList.add('open');
};

window.saveMembro = async function () {
  if (!db) return;
  const nome      = document.getElementById('membro-nome').value.trim();
  const foto      = document.getElementById('membro-foto').value.trim();
  const idade     = document.getElementById('membro-idade').value.trim();
  const turma     = document.getElementById('membro-turma').value.trim();
  const cargo     = document.getElementById('membro-cargo').value.trim();
  const email     = document.getElementById('membro-email').value.trim();
  const instagram = document.getElementById('membro-instagram').value.trim();
  if (!nome) { toast('O nome é obrigatório.', 'error'); return; }
  const btn = document.getElementById('btn-save-membro');
  btn.disabled = true; btn.textContent = 'Salvando...';
  try {
    await addDoc(collection(db, 'membros'), { nome, foto, idade, turma, cargo, email, instagram, createdAt: serverTimestamp() });
    closeModal('modal-membro');
    toast('✅ Membro adicionado!');
  } catch (e) { toast('Erro: ' + e.message, 'error'); }
  btn.disabled = false; btn.textContent = 'Salvar';
};

window.deleteMembro = async function (id) {
  if (!confirm('Remover este membro?')) return;
  try { await deleteDoc(doc(db, 'membros', id)); toast('Membro removido.'); }
  catch (e) { toast('Erro: ' + e.message, 'error'); }
};

// ════════════════════════════════════════════════════════════
//  ADMIN
// ════════════════════════════════════════════════════════════
window.openAdminModal = function () {
  if (isAdmin) {
    isAdmin = false;
    const btn = document.getElementById('nav-admin-btn');
    btn.classList.remove('ativo'); btn.textContent = '⚙ Admin';
    renderEventos(); renderMerenda(); renderOpinioes(currentSort); renderGremio();
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
      btn.classList.add('ativo'); btn.textContent = '✓ Admin ON';
      renderEventos(); renderMerenda(); renderOpinioes(currentSort); renderGremio();
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
window.closeModal = function (id) { document.getElementById(id).classList.remove('open'); };

document.querySelectorAll('.modal-overlay').forEach(m => {
  m.addEventListener('click', e => { if (e.target === m) m.classList.remove('open'); });
});

// ════════════════════════════════════════════════════════════
//  INICIALIZAÇÃO
// ════════════════════════════════════════════════════════════
iniciarFirebase();