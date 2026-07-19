const SAVE_KEY = 'fangxiao-escape-save-v1';

const state = {
  roomIndex: 0,
  questionIndex: 0,
  score: 0,
  hintsUsed: new Set(), // keys "roomIndex-questionIndex"
  answeredCorrectly: new Set(), // keys "roomIndex-questionIndex"
  timerHandle: null,
  secondsLeft: 0,
};

const WRONG_PENALTY = 5;
const HINT_PENALTY = 3;

function qKey(roomIndex, questionIndex) {
  return `${roomIndex}-${questionIndex}`;
}

function currentRoom() {
  return window.GAME_DATA.rooms[state.roomIndex];
}

function currentQuestion() {
  return currentRoom().questions[state.questionIndex];
}

function el(id) {
  return document.getElementById(id);
}

function show(id) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.add('hidden'));
  el(id).classList.remove('hidden');
}

function updateScoreDisplay() {
  el('room-score').textContent = `分數：${state.score}`;
}

// --- 音訊：檔案缺失時靜音繼續，不拋錯、不阻斷遊戲 ---
function playRoomBgm(room) {
  const audio = el('bgm-audio');
  const src = `audio/room${room.id}-bgm.wav`;
  if (audio.getAttribute('src') === src) return;
  audio.setAttribute('src', src);
  audio.play().catch(() => {});
}

function playSfx(name) {
  const audio = el('sfx-audio');
  audio.setAttribute('src', `audio/sfx-${name}.wav`);
  audio.play().catch(() => {});
}

function saveState() {
  const serializable = {
    roomIndex: state.roomIndex,
    score: state.score,
    hintsUsed: Array.from(state.hintsUsed),
    answeredCorrectly: Array.from(state.answeredCorrectly),
  };
  localStorage.setItem(SAVE_KEY, JSON.stringify(serializable));
}

function loadState() {
  const raw = localStorage.getItem(SAVE_KEY);
  if (!raw) return false;
  try {
    const parsed = JSON.parse(raw);
    state.roomIndex = parsed.roomIndex || 0;
    state.score = parsed.score || 0;
    state.hintsUsed = new Set(parsed.hintsUsed || []);
    state.answeredCorrectly = new Set(parsed.answeredCorrectly || []);
    return true;
  } catch (e) {
    return false;
  }
}

function renderRoom() {
  const room = currentRoom();
  state.questionIndex = 0;
  state.secondsLeft = room.timeLimitSec;
  el('room-title').textContent = `第${room.id}台｜${room.name}．${room.theme}`;
  el('room-scene-img').src = room.sceneImage;
  el('room-scene-img').onerror = () => {
    el('room-scene-img').style.background = '#3a3128';
    el('room-scene-img').removeAttribute('src');
  };
  el('room-intro-text').textContent = room.intro;
  updateScoreDisplay();
  show('screen-room');
  renderQuestion();
  startTimer();
  playRoomBgm(room);
}

function renderQuestion() {
  const room = currentRoom();
  const q = currentQuestion();
  el('room-progress').textContent = `第 ${state.questionIndex + 1} / ${room.questions.length} 題`;
  el('question-source-title').textContent = q.sourceTitle || '';
  el('question-passage').innerHTML = q.passage || '';
  el('question-note').textContent = q.note || '';
  el('question-stem').innerHTML = q.stem;
  const imgEl = el('question-image');
  if (q.image) {
    imgEl.src = q.image;
    imgEl.classList.remove('hidden');
  } else {
    imgEl.src = '';
    imgEl.classList.add('hidden');
  }
  el('hint-text').classList.add('hidden');
  el('hint-text').textContent = '';
  el('feedback').textContent = '';

  const optionsBox = el('question-options');
  optionsBox.innerHTML = '';
  const alreadyAnswered = state.answeredCorrectly.has(qKey(state.roomIndex, state.questionIndex));
  Object.entries(q.options).forEach(([letter, text]) => {
    const btn = document.createElement('button');
    btn.textContent = `${letter}. ${text}`;
    btn.dataset.letter = letter;
    if (alreadyAnswered) {
      btn.disabled = true;
      if (letter === q.answer) btn.classList.add('correct');
    } else {
      btn.addEventListener('click', () => selectAnswer(letter));
    }
    optionsBox.appendChild(btn);
  });
}

function selectAnswer(letter) {
  const q = currentQuestion();
  const key = qKey(state.roomIndex, state.questionIndex);
  const buttons = Array.from(el('question-options').children);
  buttons.forEach((b) => { b.disabled = true; });

  if (letter === q.answer) {
    state.answeredCorrectly.add(key);
    buttons.find((b) => b.dataset.letter === letter).classList.add('correct');
    el('feedback').textContent = '查核通過！';
    el('feedback').style.color = 'var(--good)';
    playSfx('correct');
    saveState();
    setTimeout(goToNextQuestionOrFinishRoom, 900);
  } else {
    state.score -= WRONG_PENALTY;
    updateScoreDisplay();
    const wrongBtn = buttons.find((b) => b.dataset.letter === letter);
    wrongBtn.classList.add('wrong');
    el('feedback').textContent = `查核失誤，扣 ${WRONG_PENALTY} 分，再試一次`;
    el('feedback').style.color = 'var(--bad)';
    playSfx('wrong');
    buttons.forEach((b) => { b.disabled = false; });
    wrongBtn.disabled = true;
  }
}

function goToNextQuestionOrFinishRoom() {
  const room = currentRoom();
  if (state.questionIndex + 1 < room.questions.length) {
    state.questionIndex += 1;
    renderQuestion();
  } else {
    finishRoom();
  }
}

function useHint() {
  const q = currentQuestion();
  const key = qKey(state.roomIndex, state.questionIndex);
  if (!state.hintsUsed.has(key)) {
    state.hintsUsed.add(key);
    state.score -= HINT_PENALTY;
    updateScoreDisplay();
    playSfx('hint');
  }
  const shortExplain = q.explain.split('。')[0] + '。';
  el('hint-text').textContent = `提示：${shortExplain}`;
  el('hint-text').classList.remove('hidden');
}

function formatTime(totalSeconds) {
  const m = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
  const s = Math.floor(totalSeconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

function startTimer() {
  stopTimer();
  el('room-timer').textContent = formatTime(state.secondsLeft);
  state.timerHandle = setInterval(() => {
    state.secondsLeft -= 1;
    el('room-timer').textContent = formatTime(Math.max(0, state.secondsLeft));
    if (state.secondsLeft <= 0) {
      lockRoom();
    }
  }, 1000);
}

function stopTimer() {
  if (state.timerHandle) {
    clearInterval(state.timerHandle);
    state.timerHandle = null;
  }
}

function lockRoom() {
  stopTimer();
  playSfx('timeout');
  show('screen-lockout');
}

function finishRoom() {
  stopTimer();
  saveState();
  showReflection();
}

function showReflection() {
  const room = currentRoom();
  el('reflection-prompt').textContent = room.reflectionPrompt;
  el('reflection-input').value = '';
  show('screen-reflection');
}

function advanceToNextRoomOrEnding() {
  if (state.roomIndex + 1 < window.GAME_DATA.rooms.length) {
    state.roomIndex += 1;
    saveState();
    renderRoom();
  } else {
    showEnding();
  }
}

function computeWeakCategories() {
  const wrongByCat = {};
  window.GAME_DATA.rooms.forEach((room, rIdx) => {
    room.questions.forEach((q, qIdx) => {
      const key = qKey(rIdx, qIdx);
      const wasCorrectEventually = state.answeredCorrectly.has(key);
      const usedHint = state.hintsUsed.has(key);
      if (usedHint || !wasCorrectEventually) {
        wrongByCat[q.cat] = (wrongByCat[q.cat] || 0) + 1;
      }
    });
  });
  return Object.entries(wrongByCat).sort((a, b) => b[1] - a[1]);
}

function showEnding() {
  const ending = window.GAME_DATA.ending;
  el('ending-title').textContent = ending.title;
  el('ending-text').textContent = ending.text;
  show('screen-ending');
  playSfx('win');

  requestAnimationFrame(() => {
    el('door-animation').classList.add('open');
  });

  const weak = computeWeakCategories();
  const totalQuestions = window.GAME_DATA.rooms.reduce((n, r) => n + r.questions.length, 0);
  const statsHtml = [
    `<p>最終分數：${state.score}</p>`,
    `<p>總題數：${totalQuestions}，動用提示題數：${state.hintsUsed.size}</p>`,
    weak.length
      ? `<p>本回合較弱的知識點分類：${weak.map(([cat, n]) => `${cat}（${n}題）`).join('、')}</p>`
      : '<p>本回合沒有明顯弱點分類，六台全部一次查核通過！</p>',
  ].join('');
  el('summary-stats').innerHTML = statsHtml;

  localStorage.removeItem(SAVE_KEY);
}

el('hint-btn').addEventListener('click', useHint);
el('retry-btn').addEventListener('click', () => {
  renderRoom();
});
el('reflection-continue-btn').addEventListener('click', () => {
  advanceToNextRoomOrEnding();
});
el('start-btn').addEventListener('click', () => {
  el('game-title').textContent = window.GAME_DATA.title;
  loadState();
  renderRoom();
});
document.addEventListener('DOMContentLoaded', () => {
  el('game-title').textContent = window.GAME_DATA.title;
});

window.__ESCAPE_GAME__ = {
  state, currentRoom, currentQuestion, renderRoom, renderQuestion, selectAnswer,
  goToNextQuestionOrFinishRoom, qKey, WRONG_PENALTY, HINT_PENALTY, useHint,
  startTimer, stopTimer, lockRoom, finishRoom, showReflection, advanceToNextRoomOrEnding,
  showEnding, computeWeakCategories, saveState, loadState, playSfx, playRoomBgm,
};
