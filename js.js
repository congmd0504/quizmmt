// =============================================
//  QUIZ APP — Mạng Máy Tính (từng câu, 4 phần)
// =============================================

// ---------- SECTIONS ----------
const SECTIONS = [
  { label: 'Phần 1', range: [1, 10] },
  { label: 'Phần 2', range: [11, 20] },
  { label: 'Phần 3', range: [21, 30] },
  { label: 'Phần 4', range: [31, 40] },
];

// ---------- STATE ----------
let allQuestions  = [];
let currentSection = 0;       // 0-3
let sectionList   = [];       // câu của phần hiện tại (có thể đã shuffle)
let currentIndex  = 0;        // vị trí trong sectionList
let answered      = {};       // { id: { chosen, correct, revealed? } }
let notLearned    = new Set();
let shuffleOpts   = false;
let filterMode    = false;    // true = chỉ hiện câu chưa thuộc

// ---------- LOAD ----------
fetch('mang_may_tinh_40_cau.json')
  .then(r => r.json())
  .then(data => {
    allQuestions = data.questions;
    loadSavedState();
    initSection(0);
  })
  .catch(err => {
    document.getElementById('quizMain').innerHTML =
      `<div class="empty-state"><div class="empty-icon">⚠️</div><p>Lỗi tải JSON: ${err.message}</p></div>`;
  });

// ---------- SAVE / LOAD ----------
function saveState() {
  localStorage.setItem('quiz_answered_v2', JSON.stringify(answered));
  localStorage.setItem('quiz_notLearned_v2', JSON.stringify([...notLearned]));
}
function loadSavedState() {
  try {
    const a = localStorage.getItem('quiz_answered_v2');
    const n = localStorage.getItem('quiz_notLearned_v2');
    if (a) answered   = JSON.parse(a);
    if (n) notLearned = new Set(JSON.parse(n));
  } catch(e) {}
}
function clearAllState() {
  answered   = {};
  notLearned = new Set();
  filterMode = false;
  localStorage.removeItem('quiz_answered_v2');
  localStorage.removeItem('quiz_notLearned_v2');
}

// ---------- SHUFFLE ----------
function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---------- SECTION INIT ----------
function getSectionQuestions(sectionIdx) {
  const [from, to] = SECTIONS[sectionIdx].range;
  return allQuestions.filter(q => q.id >= from && q.id <= to);
}

function getWorkingList() {
  if (filterMode) {
    return sectionList.filter(q => notLearned.has(q.id));
  }
  return sectionList;
}

function initSection(idx, jumpToFirst = true) {
  currentSection = idx;
  sectionList    = getSectionQuestions(idx);
  if (jumpToFirst) currentIndex = 0;
  renderSectionTabs();
  renderQuestion();
  updateDots();
  updateStats();
  updateProgress();
}

// ---------- RENDER SECTION TABS ----------
function renderSectionTabs() {
  document.querySelectorAll('.tab-btn').forEach((btn, i) => {
    btn.classList.toggle('active', i === currentSection);
    // Đánh dấu phần đã hoàn thành
    const qs = getSectionQuestions(i);
    const done = qs.every(q => answered[q.id]);
    btn.classList.toggle('tab-done', done);
  });
}

// ---------- RENDER QUESTION ----------
function renderQuestion() {
  const list = getWorkingList();

  // Filter mode nhưng không có câu
  if (filterMode && list.length === 0) {
    document.getElementById('quizMain').innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">✅</div>
        <p>Không có câu chưa thuộc trong phần này!</p>
      </div>`;
    updateNav(0, 0);
    updateDots();
    return;
  }

  // Đảm bảo quizMain có card
  if (!document.getElementById('questionCard')) {
    document.getElementById('quizMain').innerHTML = `
      <div class="card" id="questionCard">
        <div class="card-top">
          <span class="card-num" id="cardNum"></span>
          <div class="card-actions">
            <button class="btn btn-outline btn-sm btn-reveal" id="btnReveal">👁 Đáp án</button>
            <button class="btn btn-outline btn-sm btn-mark" id="btnMark">⚑ Chưa thuộc</button>
          </div>
        </div>
        <p class="card-question" id="questionText"></p>
        <ul class="options-list" id="optionsList"></ul>
        <div class="card-feedback hidden" id="cardFeedback"></div>
        <div class="card-note hidden" id="cardNote"></div>
      </div>`;
    // Gắn lại listener cho reveal & mark
    document.getElementById('btnReveal').addEventListener('click', onReveal);
    document.getElementById('btnMark').addEventListener('click', onMark);
  }

  // Clamp index
  if (currentIndex >= list.length) currentIndex = list.length - 1;
  if (currentIndex < 0) currentIndex = 0;

  const q        = list[currentIndex];
  const ans      = answered[q.id];
  const isAnswered = !!ans;
  const isNL    = notLearned.has(q.id);

  // --- Card classes ---
  const card = document.getElementById('questionCard');
  card.className = 'card';
  if (isAnswered && ans.correct)  card.classList.add('answered-correct');
  if (isAnswered && !ans.correct) card.classList.add('answered-wrong');
  if (isNL)                       card.classList.add('not-learned');

  // --- Card num: hiện theo vị trí, không phải ID gốc ---
  document.getElementById('cardNum').textContent = `Câu ${currentIndex + 1}`;

  // --- Question ---
  document.getElementById('questionText').textContent = q.question;

  // --- Options ---
  let keys = Object.keys(q.options);
  if (shuffleOpts && !isAnswered) keys = shuffleArray(keys);

  const opts = document.getElementById('optionsList');
  opts.innerHTML = keys.map(key => {
    const text = q.options[key];
    let cls = 'option-item';
    if (isAnswered) {
      cls += ' disabled';
      if (key === q.answer) cls += ' reveal-correct';
      if (key === ans.chosen && ans.chosen !== q.answer) cls += ' selected-wrong';
    }
    return `<li class="${cls}" data-key="${key}">
      <span class="option-key">${key}.</span>
      <span>${text}</span>
    </li>`;
  }).join('');

  // Click listener cho options
  if (!isAnswered) {
    opts.querySelectorAll('.option-item').forEach(el => {
      el.addEventListener('click', () => onChoose(q.id, el.dataset.key));
    });
  }

  // --- Feedback ---
  const fb = document.getElementById('cardFeedback');
  if (isAnswered) {
    fb.className = 'card-feedback ' + (ans.correct ? 'ok' : 'err');
    if (ans.correct) {
      fb.innerHTML = '✅ Chính xác!';
    } else if (ans.revealed) {
      fb.innerHTML = `📖 Đáp án: <strong>${q.answer}. ${q.options[q.answer]}</strong>`;
    } else {
      fb.innerHTML = `❌ Sai! Đáp án đúng: <strong>${q.answer}. ${q.options[q.answer]}</strong>`;
    }
  } else {
    fb.className = 'card-feedback hidden';
    fb.textContent = '';
  }

  // --- Note ---
  const noteEl = document.getElementById('cardNote');
  if (q.note && isAnswered) {
    noteEl.className = 'card-note';
    noteEl.textContent = '💡 ' + q.note;
  } else {
    noteEl.className = 'card-note hidden';
  }

  // --- Mark button ---
  const markBtn = document.getElementById('btnMark');
  if (isNL) {
    markBtn.textContent = '✓ Đã thuộc';
    markBtn.classList.add('btn-mark-active');
  } else {
    markBtn.textContent = '⚑ Chưa thuộc';
    markBtn.classList.remove('btn-mark-active');
  }

  // --- Reveal button ---
  const revealBtn = document.getElementById('btnReveal');
  revealBtn.style.display = isAnswered ? 'none' : '';

  // --- Nav & dots ---
  updateNav(currentIndex, list.length);
  updateDots();
  updateProgress();
}

// ---------- NAV ----------
function updateNav(idx, total) {
  const list = getWorkingList();
  const len  = list.length;
  document.getElementById('btnPrev').disabled = idx <= 0;
  document.getElementById('btnNext').disabled = idx >= len - 1;
  document.getElementById('navIndicator').textContent =
    len > 0 ? `${idx + 1} / ${len}` : '0 / 0';
}

// ---------- DOTS ----------
function updateDots() {
  const list   = getWorkingList();
  const dotNav = document.getElementById('dotNav');
  dotNav.innerHTML = list.map((q, i) => {
    const ans  = answered[q.id];
    const isNL = notLearned.has(q.id);
    let cls = 'dot';
    if (i === currentIndex) cls += ' active';
    else if (ans && ans.correct)  cls += ' dot-correct';
    else if (ans && ans.revealed) cls += ' dot-reveal';
    else if (ans && !ans.correct) cls += ' dot-wrong';
    if (isNL) cls += ' dot-not-learned';
    return `<span class="${cls}" data-idx="${i}" title="Câu ${i + 1}"></span>`;
  }).join('');

  dotNav.querySelectorAll('.dot').forEach(d => {
    d.addEventListener('click', () => {
      currentIndex = parseInt(d.dataset.idx);
      renderQuestion();
    });
  });
}

// ---------- PROGRESS ----------
function updateProgress() {
  const list  = getWorkingList();
  const total = list.length;
  const done  = list.filter(q => answered[q.id]).length;
  const pct   = total > 0 ? Math.round((done / total) * 100) : 0;
  document.getElementById('progressBar').style.setProperty('--progress', pct + '%');
  document.getElementById('progressText').textContent = `${done} / ${total}`;
}

// ---------- STATS ----------
function updateStats() {
  const correct = Object.values(answered).filter(a => a.correct).length;
  document.getElementById('statCorrect').textContent    = `${correct} ✓`;
  document.getElementById('statNotLearned').textContent = `${notLearned.size} ⚑`;
}

// ---------- EVENTS ----------
function onChoose(id, key) {
  if (answered[id]) return;
  const q = allQuestions.find(x => x.id === id);
  const correct = key === q.answer;
  answered[id] = { chosen: key, correct };
  saveState();
  renderQuestion();
  updateStats();

  // Kiểm tra hoàn thành phần
  const list = getWorkingList();
  const allDone = list.every(q2 => answered[q2.id]);
  if (allDone) {
    setTimeout(() => showResult(list), 500);
  }
}

function onReveal() {
  const list = getWorkingList();
  if (list.length === 0) return;
  const q = list[currentIndex];
  if (answered[q.id]) return;
  answered[q.id] = { chosen: null, correct: false, revealed: true };
  saveState();
  renderQuestion();
  updateStats();
}

function onMark() {
  const list = getWorkingList();
  if (list.length === 0) return;
  const q = list[currentIndex];
  if (notLearned.has(q.id)) notLearned.delete(q.id);
  else notLearned.add(q.id);
  saveState();
  renderQuestion();
  updateStats();
}

// ---------- SECTION TABS ----------
document.getElementById('sectionTabs').addEventListener('click', e => {
  const btn = e.target.closest('.tab-btn');
  if (!btn) return;
  const idx = parseInt(btn.dataset.section);
  filterMode = false;
  document.getElementById('filterBadge').classList.add('hidden');
  initSection(idx);
});

// ---------- TOOLBAR ----------
document.getElementById('btnShuffle').addEventListener('click', () => {
  const original = getSectionQuestions(currentSection);
  const firstQ   = original[0]; // câu đầu tiên của phần (câu 1, 11, 21, 31)
  let shuffled   = shuffleArray(original);
  // Đảm bảo câu đầu tiên luôn ở vị trí 0
  const pos = shuffled.findIndex(q => q.id === firstQ.id);
  if (pos !== 0) {
    shuffled.splice(pos, 1);
    shuffled.unshift(firstQ);
  }
  sectionList  = shuffled;
  currentIndex = 0;
  renderQuestion();
  updateDots();
});

document.getElementById('btnShuffleOpts').addEventListener('click', () => {
  shuffleOpts = !shuffleOpts;
  const btn = document.getElementById('btnShuffleOpts');
  btn.textContent = shuffleOpts ? '🔄 Đáp án ✓' : '🔄 Tráo đáp án';
  renderQuestion();
});

document.getElementById('btnShowNotLearned').addEventListener('click', () => {
  filterMode = true;
  currentIndex = 0;
  document.getElementById('filterBadge').classList.remove('hidden');
  renderQuestion();
  updateDots();
  updateProgress();
});

document.getElementById('btnClearFilter').addEventListener('click', () => {
  filterMode = false;
  currentIndex = 0;
  document.getElementById('filterBadge').classList.add('hidden');
  renderQuestion();
  updateDots();
  updateProgress();
});

document.getElementById('btnRestart').addEventListener('click', () => {
  if (!confirm('Làm lại từ đầu? Toàn bộ tiến trình sẽ bị xóa.')) return;
  clearAllState();
  document.getElementById('filterBadge').classList.add('hidden');
  document.getElementById('btnShuffleOpts').textContent = '🔄 Tráo đáp án';
  shuffleOpts = false;
  initSection(currentSection);
});

// ---------- NAV BUTTONS ----------
document.getElementById('btnPrev').addEventListener('click', () => {
  if (currentIndex > 0) { currentIndex--; renderQuestion(); }
});
document.getElementById('btnNext').addEventListener('click', () => {
  const list = getWorkingList();
  if (currentIndex < list.length - 1) { currentIndex++; renderQuestion(); }
});

// Swipe gesture (mobile)
let touchStartX = 0;
document.getElementById('quizMain').addEventListener('touchstart', e => {
  touchStartX = e.changedTouches[0].screenX;
}, { passive: true });
document.getElementById('quizMain').addEventListener('touchend', e => {
  const dx = e.changedTouches[0].screenX - touchStartX;
  if (Math.abs(dx) < 50) return;
  const list = getWorkingList();
  if (dx < 0 && currentIndex < list.length - 1) { currentIndex++; renderQuestion(); }
  if (dx > 0 && currentIndex > 0) { currentIndex--; renderQuestion(); }
}, { passive: true });

// ---------- RESULT ----------
function showResult(list) {
  const correct = list.filter(q => answered[q.id]?.correct).length;
  const total   = list.length;
  const pct     = Math.round((correct / total) * 100);
  document.getElementById('resultEmoji').textContent  = pct === 100 ? '🏆' : pct >= 70 ? '🎉' : '😅';
  document.getElementById('resultTitle').textContent  = pct === 100 ? 'Xuất sắc! Perfect!' : pct >= 70 ? 'Làm tốt lắm!' : 'Cần ôn thêm!';
  document.getElementById('resultDesc').textContent   =
    `${SECTIONS[currentSection].label}: đúng ${correct}/${total} câu (${pct}%)`;
  document.getElementById('resultPanel').classList.remove('hidden');
  renderSectionTabs();
}

document.getElementById('btnResultRestart').addEventListener('click', () => {
  // Chỉ xóa phần hiện tại
  const qs = getSectionQuestions(currentSection);
  qs.forEach(q => delete answered[q.id]);
  saveState();
  document.getElementById('resultPanel').classList.add('hidden');
  filterMode = false;
  document.getElementById('filterBadge').classList.add('hidden');
  initSection(currentSection);
});

document.getElementById('btnResultClose').addEventListener('click', () => {
  document.getElementById('resultPanel').classList.add('hidden');
});

// --- Gắn listener cố định cho btnReveal, btnMark (đã có trong HTML) ---
// Dùng delegation để không bị duplicate
document.getElementById('quizMain').addEventListener('click', e => {
  if (e.target.closest('#btnReveal')) onReveal();
  if (e.target.closest('#btnMark'))   onMark();
});
