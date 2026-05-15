const STORAGE_KEY = 'oralSurgeryQuizPrefs';
const LETTERS = ['A', 'B', 'C', 'D', 'E'];

let mode = 'random';
let feedbackMode = 'instant';
let theme = 'parchment';
let textSize = 'medium';
let questionCount = 10;
let lectureFrom = 1;
let lectureTo = 21;
let useCustomLectures = false;
let selectedLectures = new Set();

let quizQuestions = [];
let current = 0;
let correct = 0;
let wrong = 0;
let answered = false;
let userAnswers = [];

function getLectureList() {
  return typeof LECTURES !== 'undefined' ? LECTURES : [];
}

function getLectureName(id) {
  const lec = getLectureList().find((l) => l.id === id);
  return lec ? lec.name : 'Lecture ' + id;
}

function countByLecture() {
  const counts = {};
  if (typeof ALL_QUESTIONS === 'undefined') return counts;
  ALL_QUESTIONS.forEach((q) => {
    counts[q.lecture] = (counts[q.lecture] || 0) + 1;
  });
  return counts;
}

function isLectureIncluded(lectureId) {
  if (useCustomLectures) return selectedLectures.has(lectureId);
  const from = Math.min(lectureFrom, lectureTo);
  const to = Math.max(lectureFrom, lectureTo);
  return lectureId >= from && lectureId <= to;
}

function getFilteredQuestions() {
  if (typeof ALL_QUESTIONS === 'undefined') return [];
  return ALL_QUESTIONS.filter((q) => isLectureIncluded(q.lecture));
}

function getTotalQuestions() {
  return getFilteredQuestions().length;
}

function loadPrefs() {
  try {
    const p = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    if (p.theme) selectTheme(p.theme, false);
    if (p.textSize) selectTextSize(p.textSize, false);
    if (p.feedbackMode) selectFeedback(p.feedbackMode, false);
    if (p.mode) selectMode(p.mode, false);
    if (p.lectureFrom != null) lectureFrom = p.lectureFrom;
    if (p.lectureTo != null) lectureTo = p.lectureTo;
    if (p.useCustomLectures) useCustomLectures = true;
    if (Array.isArray(p.selectedLectures)) {
      selectedLectures = new Set(p.selectedLectures);
    }
  } catch (_) {}
}

function savePrefs() {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      theme,
      textSize,
      feedbackMode,
      mode,
      lectureFrom,
      lectureTo,
      useCustomLectures,
      selectedLectures: [...selectedLectures],
    })
  );
}

function initLectureUI() {
  const fromSel = document.getElementById('lecture-from');
  const toSel = document.getElementById('lecture-to');
  const grid = document.getElementById('lecture-checkboxes');
  if (!fromSel || !toSel || !grid) return;

  const counts = countByLecture();
  const lectures = getLectureList();
  const ids = lectures.length
    ? lectures.map((l) => l.id)
    : Object.keys(counts).map(Number).sort((a, b) => a - b);

  fromSel.innerHTML = '';
  toSel.innerHTML = '';
  grid.innerHTML = '';

  ids.forEach((id) => {
    const label = getLectureName(id);
    const count = counts[id] || 0;
    const optFrom = document.createElement('option');
    optFrom.value = id;
    optFrom.textContent = id + ' — ' + label.replace(/^Lecture \d+ — /, '');
    fromSel.appendChild(optFrom);

    const optTo = optFrom.cloneNode(true);
    toSel.appendChild(optTo);

    const row = document.createElement('label');
    row.className = 'lecture-check';
    const checked =
      selectedLectures.size === 0 ? true : selectedLectures.has(id);
    row.innerHTML =
      '<input type="checkbox" data-lecture="' +
      id +
      '" ' +
      (checked ? 'checked' : '') +
      ' onchange="onLectureCheckboxChange()">' +
      '<span>' +
      escapeHtml(label) +
      '</span>' +
      '<span class="lec-count">' +
      count +
      '</span>';
    grid.appendChild(row);
  });

  if (selectedLectures.size === 0) {
    ids.forEach((id) => selectedLectures.add(id));
  }

  fromSel.value = String(lectureFrom);
  toSel.value = String(lectureTo);
  syncLectureRangeToSelects();
  updateLectureSummary();
}

function syncLectureRangeToSelects() {
  const fromSel = document.getElementById('lecture-from');
  const toSel = document.getElementById('lecture-to');
  if (!fromSel || !toSel) return;
  if (fromSel.querySelector('option[value="' + lectureFrom + '"]')) {
    fromSel.value = String(lectureFrom);
  }
  if (toSel.querySelector('option[value="' + lectureTo + '"]')) {
    toSel.value = String(lectureTo);
  }
}

function setLectureRange(from, to) {
  lectureFrom = from;
  lectureTo = to;
  useCustomLectures = false;
  syncLectureRangeToSelects();
  document.querySelectorAll('#lecture-checkboxes input').forEach((cb) => {
    const id = parseInt(cb.dataset.lecture, 10);
    cb.checked = id >= Math.min(from, to) && id <= Math.max(from, to);
  });
  onLectureCheckboxChange(false);
  savePrefs();
  updateLectureSummary();
  updateTotalsUI();
}

function onLectureRangeChange() {
  const fromSel = document.getElementById('lecture-from');
  const toSel = document.getElementById('lecture-to');
  lectureFrom = parseInt(fromSel.value, 10);
  lectureTo = parseInt(toSel.value, 10);
  useCustomLectures = false;

  const from = Math.min(lectureFrom, lectureTo);
  const to = Math.max(lectureFrom, lectureTo);
  document.querySelectorAll('#lecture-checkboxes input').forEach((cb) => {
    const id = parseInt(cb.dataset.lecture, 10);
    cb.checked = id >= from && id <= to;
  });
  onLectureCheckboxChange(false);
  savePrefs();
  updateLectureSummary();
  updateTotalsUI();
}

function onLectureCheckboxChange(save = true) {
  useCustomLectures = true;
  selectedLectures.clear();
  document.querySelectorAll('#lecture-checkboxes input:checked').forEach((cb) => {
    selectedLectures.add(parseInt(cb.dataset.lecture, 10));
  });
  if (save) savePrefs();
  updateLectureSummary();
  updateTotalsUI();
}

function updateLectureSummary() {
  const el = document.getElementById('lecture-filter-summary');
  if (!el) return;
  const total = getTotalQuestions();
  if (useCustomLectures) {
    const ids = [...selectedLectures].sort((a, b) => a - b);
    if (!ids.length) {
      el.textContent = 'No lectures selected — choose at least one.';
      return;
    }
    el.textContent =
      total +
      ' questions from ' +
      ids.length +
      ' lecture(s): ' +
      ids.join(', ');
  } else {
    const from = Math.min(lectureFrom, lectureTo);
    const to = Math.max(lectureFrom, lectureTo);
    el.textContent =
      total +
      ' questions from lectures ' +
      from +
      ' to ' +
      to +
      ' (' +
      getLectureName(from).replace(/^Lecture \d+ — /, '') +
      ' … ' +
      getLectureName(to).replace(/^Lecture \d+ — /, '') +
      ')';
  }
}

function selectTheme(t, save = true) {
  theme = t;
  document.documentElement.dataset.theme = t;
  document.querySelectorAll('.theme-btn').forEach((b) => {
    b.classList.toggle('active', b.dataset.themeId === t);
  });
  if (save) savePrefs();
}

function selectTextSize(s, save = true) {
  textSize = s;
  document.documentElement.dataset.textSize = s;
  document.querySelectorAll('.size-btn').forEach((b) => {
    b.classList.toggle('active', b.dataset.size === s);
  });
  if (save) savePrefs();
}

function selectFeedback(f, save = true) {
  feedbackMode = f;
  document.getElementById('fb-instant').classList.toggle('active', f === 'instant');
  document.getElementById('fb-deferred').classList.toggle('active', f === 'deferred');
  if (save) savePrefs();
}

function selectMode(m, save = true) {
  mode = m;
  document.getElementById('mode-random').classList.toggle('active', m === 'random');
  document.getElementById('mode-ordered').classList.toggle('active', m === 'ordered');
  if (save) savePrefs();
}

function selectPreset(n, ev) {
  const total = getTotalQuestions();
  questionCount = n === 'all' ? total : Math.min(n, total);
  document.querySelectorAll('.preset-btn').forEach((b) => {
    if (b.closest('.count-row')) b.classList.remove('active');
  });
  if (ev && ev.target) ev.target.classList.add('active');
  document.getElementById('custom-count').value = '';
}

function selectCustom(v) {
  const n = parseInt(v, 10);
  const total = getTotalQuestions();
  if (!isNaN(n) && n >= 1) {
    questionCount = Math.min(n, total);
    document.querySelectorAll('.count-row .preset-btn').forEach((b) =>
      b.classList.remove('active')
    );
  }
}

function updateTotalsUI() {
  const bankTotal =
    typeof ALL_QUESTIONS !== 'undefined' ? ALL_QUESTIONS.length : 0;
  const filtered = getTotalQuestions();
  document.getElementById('total-count-label').textContent = bankTotal;
  document.getElementById('total-available').textContent = filtered;
  document.getElementById('custom-count').max = filtered || 1;
  const allBtn = document.getElementById('preset-all');
  if (allBtn) allBtn.textContent = 'All ' + filtered;
  if (questionCount > filtered) questionCount = filtered || 10;
  updateLectureSummary();
}

function startQuiz() {
  const pool = getFilteredQuestions();
  if (!pool.length) {
    alert(
      'No questions match your lecture filter. Widen the range or select more lectures.'
    );
    return;
  }
  if (questionCount < 1) questionCount = 10;

  let ordered = pool.map((q, i) => ({ ...q, origIdx: i }));
  if (mode === 'random') ordered = shuffleArray(ordered);
  quizQuestions = ordered.slice(0, Math.min(questionCount, pool.length));

  current = 0;
  correct = 0;
  wrong = 0;
  answered = false;
  userAnswers = new Array(quizQuestions.length).fill(null);

  document.getElementById('score-pill').classList.toggle('hidden', feedbackMode === 'deferred');

  show('quiz-screen');
  renderQuestion();
}

function renderQuestion() {
  const q = quizQuestions[current];
  const total = quizQuestions.length;
  const pct = Math.round((current / total) * 100);

  document.getElementById('prog-text').textContent =
    'Question ' + (current + 1) + ' of ' + total;
  document.getElementById('prog-pct').textContent = pct + '%';
  document.getElementById('prog-fill').style.width = pct + '%';

  if (feedbackMode === 'instant') {
    recalcScores();
    document.getElementById('score-correct').textContent = correct;
    document.getElementById('score-wrong').textContent = wrong;
  }

  const lecShort = getLectureName(q.lecture).replace(/^Lecture \d+ — /, '');
  document.getElementById('q-num').textContent =
    'L' + q.lecture + ' · ' + lecShort + ' · Question ' + (current + 1);
  document.getElementById('q-text').textContent = q.q;

  const ol = document.getElementById('options-list');
  ol.innerHTML = '';
  const saved = userAnswers[current];

  q.opts.forEach((opt, i) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'option-btn';
    btn.innerHTML =
      '<span class="opt-letter">' +
      LETTERS[i] +
      '.</span><span>' +
      escapeHtml(opt) +
      '</span>';
    btn.onclick = () => selectAnswer(i);
    if (saved === i) btn.classList.add('selected');
    ol.appendChild(btn);
  });

  const fb = document.getElementById('feedback-box');
  fb.className = 'feedback-box';
  fb.innerHTML = '';

  const nb = document.getElementById('next-btn');
  nb.textContent = current === total - 1 ? 'Finish' : 'Next';

  if (saved !== null) {
    answered = true;
    if (feedbackMode === 'instant') revealAnswer(saved);
    else nb.disabled = false;
  } else {
    answered = false;
    nb.disabled = true;
  }

  const content = document.getElementById('q-content');
  content.classList.remove('fade-in');
  void content.offsetWidth;
  content.classList.add('fade-in');
}

function selectAnswer(chosen) {
  if (answered) return;
  answered = true;
  userAnswers[current] = chosen;

  if (feedbackMode === 'instant') {
    revealAnswer(chosen);
  } else {
    document.querySelectorAll('.option-btn').forEach((btn, i) => {
      btn.disabled = true;
      if (i === chosen) btn.classList.add('selected');
    });
    document.getElementById('next-btn').disabled = false;
  }
}

function revealAnswer(chosen) {
  const q = quizQuestions[current];
  const correct_i = q.ans;

  document.querySelectorAll('.option-btn').forEach((btn, i) => {
    btn.disabled = true;
    if (i === correct_i) btn.classList.add('correct');
    else if (i === chosen) btn.classList.add('wrong');
    else btn.classList.add('reveal');
  });

  const fb = document.getElementById('feedback-box');
  if (chosen === correct_i) {
    fb.className = 'feedback-box show correct-fb';
    fb.innerHTML =
      'Correct. Answer: <strong>' +
      LETTERS[correct_i] +
      '. ' +
      escapeHtml(q.opts[correct_i]) +
      '</strong>';
  } else {
    fb.className = 'feedback-box show wrong-fb';
    fb.innerHTML =
      'Incorrect. Correct: <strong>' +
      LETTERS[correct_i] +
      '. ' +
      escapeHtml(q.opts[correct_i]) +
      '</strong>';
  }

  recalcScores();
  document.getElementById('score-correct').textContent = correct;
  document.getElementById('score-wrong').textContent = wrong;
  document.getElementById('next-btn').disabled = false;
}

function recalcScores() {
  correct = 0;
  wrong = 0;
  quizQuestions.forEach((q, i) => {
    const ua = userAnswers[i];
    if (ua !== null) {
      if (ua === q.ans) correct++;
      else wrong++;
    }
  });
}

function nextQuestion() {
  if (current === quizQuestions.length - 1) showResults();
  else {
    current++;
    renderQuestion();
  }
}

function showResults() {
  recalcScores();
  const total = quizQuestions.length;
  const pct = total ? Math.round((correct / total) * 100) : 0;

  document.getElementById('res-pct').textContent = pct + '%';
  document.getElementById('res-correct').textContent = correct;
  document.getElementById('res-wrong').textContent = wrong;
  document.getElementById('res-total').textContent = total;

  let grade;
  let gradeClass;
  if (pct >= 90) {
    grade = 'Excellent — A';
    gradeClass = 'grade-A';
  } else if (pct >= 75) {
    grade = 'Good — B';
    gradeClass = 'grade-B';
  } else if (pct >= 60) {
    grade = 'Pass — C';
    gradeClass = 'grade-C';
  } else {
    grade = 'Fail — D';
    gradeClass = 'grade-D';
  }

  const gb = document.getElementById('res-grade');
  gb.textContent = grade;
  gb.className = 'grade-badge ' + gradeClass;

  const rl = document.getElementById('review-list');
  rl.innerHTML = '';
  quizQuestions.forEach((q, i) => {
    const ua = userAnswers[i];
    const wasCorrect = ua === q.ans;
    const div = document.createElement('div');
    if (ua === null) div.className = 'review-item unanswered';
    else div.className = 'review-item ' + (wasCorrect ? 'was-correct' : 'was-wrong');

    let inner =
      '<div class="review-q"><strong>Q' +
      (i + 1) +
      ' (L' +
      q.lecture +
      ').</strong> ' +
      escapeHtml(q.q) +
      '</div><div class="review-a">';
    if (ua === null) {
      inner += '<span class="your-ans">Not answered</span>';
    } else if (!wasCorrect) {
      inner +=
        '<span class="your-ans">Your answer: ' +
        LETTERS[ua] +
        '. ' +
        escapeHtml(q.opts[ua]) +
        '</span>';
    }
    inner +=
      '<span class="correct-ans">Correct: ' +
      LETTERS[q.ans] +
      '. ' +
      escapeHtml(q.opts[q.ans]) +
      '</span></div>';
    div.innerHTML = inner;
    rl.appendChild(div);
  });

  show('results-screen');
}

function goSetup() {
  show('setup-screen');
}

function quitQuiz() {
  if (confirm('Quit and return to setup?')) show('setup-screen');
}

function show(screenId) {
  ['setup-screen', 'quiz-screen', 'results-screen'].forEach((id) => {
    document.getElementById(id).style.display =
      id === screenId ? (id === 'setup-screen' ? 'flex' : 'block') : 'none';
  });
  window.scrollTo(0, 0);
}

function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function escapeHtml(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

document.addEventListener('DOMContentLoaded', () => {
  loadPrefs();
  initLectureUI();
  updateTotalsUI();
});
