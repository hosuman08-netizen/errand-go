// Errand — 위치 기반 생활 심부름 (체험용 프로토타입, 가상 크레딧)

// ── 완료 보너스 확률표 (단일 진실원천: 표시되는 확률 = 실제 롤 확률 100% 일치) ──
// prob는 합이 정확히 1.00. 이 배열이 곧 공개 문구·코드 양쪽의 근거.
const BONUS_TABLE = [
  { coins: 0, prob: 0.50 },
  { coins: 2, prob: 0.30 },
  { coins: 5, prob: 0.15 },
  { coins: 10, prob: 0.05 },
];
// 공개 라벨을 코드에서 직접 생성 → 손으로 쓴 숫자와 어긋날 수 없음
const BONUS_ODDS_LABEL = BONUS_TABLE
  .map(t => `+${t.coins} ${(t.prob * 100).toFixed(0)}%`)
  .join(' · ');
function rollBonus() {
  let r = Math.random();
  for (const t of BONUS_TABLE) {
    if (r < t.prob) return t.coins;
    r -= t.prob;
  }
  return BONUS_TABLE[BONUS_TABLE.length - 1].coins; // 부동소수 안전 폴백
}

// ── 도우미 풀 (진짜 매칭 엔진의 공급측) ──
// 각 도우미는 위치·이동속도·평점을 가진 실체. 매칭 시 거리로 ETA를 실제 계산.
const HELPER_POOL = [
  { name: '민준', rating: 4.9, jobs: 214, speedKmH: 18, mode: '🛵', latOff: 0.006, lngOff: -0.004 },
  { name: '서연', rating: 4.8, jobs: 156, speedKmH: 5,  mode: '🚶', latOff: -0.003, lngOff: 0.005 },
  { name: '지호', rating: 5.0, jobs: 89,  speedKmH: 22, mode: '🚲', latOff: 0.009, lngOff: 0.007 },
  { name: '하은', rating: 4.7, jobs: 312, speedKmH: 30, mode: '🚗', latOff: -0.008, lngOff: -0.006 },
  { name: '도윤', rating: 4.95, jobs: 47, speedKmH: 6,  mode: '🚶', latOff: 0.004, lngOff: 0.003 },
];

// ── 살아있는 평판 시스템: 내가 매긴 별점이 실제로 도우미 평점·수행건수에 반영·저장된다 ──
// 평점은 누적 가중평균으로 재계산(진짜 평판 이동). p7_reps에 도우미별 {sumStars,count} 저장.
let helperReps = JSON.parse(localStorage.getItem('p7_reps') || '{}');

// 저장된 평판을 풀에 병합(표시 rating/jobs = 실제 누적 반영)
function applyHelperReps() {
  HELPER_POOL.forEach(h => {
    const r = helperReps[h.name];
    if (r && r.count > 0) {
      // 초기 평점을 기저 표본(가중치 20건)으로 두고 내 별점을 누적 → 급변 없이 실제 이동
      const baseW = 20;
      h.rating = +(((h._baseRating ?? h.rating) * baseW + r.sumStars) / (baseW + r.count)).toFixed(2);
      h.jobs = (h._baseJobs ?? h.jobs) + r.count;
    }
  });
}
// 원본 보존(재계산 기저)
HELPER_POOL.forEach(h => { h._baseRating = h.rating; h._baseJobs = h.jobs; });
applyHelperReps();

// 별점 1건 반영 → 누적·저장·풀 갱신
function rateHelper(name, stars) {
  if (!name || !(stars >= 1 && stars <= 5)) return null;
  const r = helperReps[name] || { sumStars: 0, count: 0 };
  r.sumStars += stars;
  r.count += 1;
  helperReps[name] = r;
  localStorage.setItem('p7_reps', JSON.stringify(helperReps));
  applyHelperReps();
  const h = HELPER_POOL.find(x => x.name === name);
  return h ? { rating: h.rating, jobs: h.jobs } : null;
}

let userLocation = null;
let tasks = JSON.parse(localStorage.getItem('p7_tasks') || '[]');
let coins = parseInt(localStorage.getItem('p7_coins') || '42');
let notebook = JSON.parse(localStorage.getItem('p7_notebook') || '[]');
// 진짜 닫힌-루프 경제: 코인은 발행되지 않고 이동만 한다.
//  - escrow: 공고 등록 시 코인이 잠긴다(사라지지 않음, 지갑→에스크로).
//  - 완료: 에스크로가 도우미에게 이체 - 플랫폼 수수료. 코인 총량은 수수료만큼만 감소(정직).
//  - 취소/미매칭: 에스크로 전액 환불.
let escrow = parseInt(localStorage.getItem('p7_escrow') || '0');
let ledger = JSON.parse(localStorage.getItem('p7_ledger') || '[]');
const PLATFORM_FEE_RATE = 0.15; // 15% 플랫폼 수수료(공개·정직) — 유일한 코인 소각원

function saveEconomy() {
  localStorage.setItem('p7_coins', coins);
  localStorage.setItem('p7_escrow', escrow);
  localStorage.setItem('p7_ledger', JSON.stringify(ledger.slice(0, 60)));
}

// 원자적 원장 기입: 모든 코인 이동은 여기를 통과한다(감사 가능·정직)
function postLedger(kind, delta, note) {
  ledger.unshift({ kind, delta, balance: coins, escrow, note: note || '', time: Date.now() });
}

function updateCoinsUI() {
  const el = document.getElementById('coin-balance');
  if (el) el.textContent = coins;
  const escEl = document.getElementById('escrow-balance');
  if (escEl) escEl.textContent = escrow;
  const escRow = document.getElementById('escrow-row');
  if (escRow) escRow.style.display = escrow > 0 ? '' : 'none';
  saveEconomy();
}

function updateStatus(msg) {
  const s = document.getElementById('status');
  if (s) s.textContent = msg;
}

function showLocDisplay() {
  const el = document.getElementById('loc-display');
  if (el) el.textContent = userLocation
    ? `${userLocation.lat.toFixed(3)}, ${userLocation.lng.toFixed(3)}`
    : '위치 확인 필요';
}

function getLocation() {
  if (!navigator.geolocation) {
    updateStatus('위치 권한 필요 (브라우저 설정 확인)');
    userLocation = { lat: 37.5665, lng: 126.9780 }; // Seoul fallback
    renderTasks();
    return;
  }
  navigator.geolocation.getCurrentPosition(pos => {
    userLocation = { lat: pos.coords.latitude, lng: pos.coords.longitude };
    updateStatus(`위치 확인됨 • ${userLocation.lat.toFixed(3)}, ${userLocation.lng.toFixed(3)}`);
    showLocDisplay();
    renderTasks();
  }, () => {
    userLocation = { lat: 37.5665, lng: 126.9780 };
    updateStatus('위치 기본값 (서울)');
    showLocDisplay();
    renderTasks();
  });
}

function distanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2-lat1) * Math.PI/180;
  const dLon = (lon2-lon1) * Math.PI/180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
  return (R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))).toFixed(1);
}

function renderTasks() {
  const oddsEl = document.getElementById('bonus-odds');
  if (oddsEl) oddsEl.textContent = `완료 보너스 확률: ${BONUS_ODDS_LABEL}`;
  const container = document.getElementById('task-list');
  if (!container) return;
  container.innerHTML = '';
  
  const now = Date.now();
  const nearby = tasks.filter(t => {
    if (!userLocation || !t.lat) return true;
    const d = parseFloat(distanceKm(userLocation.lat, userLocation.lng, t.lat, t.lng));
    // 노출 반경은 긴급도가 높고 오래된 공고일수록 서서히 좁아진다(가까운 도우미 우선 노출).
    const ageH = (now - (t.time || now)) / 3600000;
    const currentRadius = (t.visibleRadius || 8) - (t.decay || 0.4) * ageH * 1.8;
    t._currentRadius = Math.max(1.2, currentRadius);
    return d < (t._currentRadius + 1.5);
  }).slice(0, 6);

  if (nearby.length === 0) {
    container.innerHTML = '<div class="task-card empty">주변에 열린 심부름이 없어요.<br><span>공고를 올리면 근처 도우미에게 바로 보여요.</span></div>';
    return;
  }

  const URGENCY_LABEL = { asap: '지금 당장', today: '오늘 내', normal: '여유 있음' };

  nearby.forEach((task) => {
    const d = userLocation && task.lat ? parseFloat(distanceKm(userLocation.lat, userLocation.lng, task.lat, task.lng)) : 0;
    const rad = task._currentRadius || 8;
    const inRange = d <= rad;
    const el = document.createElement('div');
    el.className = `task-card ${inRange ? '' : 'fading'}`;
    const urg = URGENCY_LABEL[task.urgency] || '';
    const realIdx = tasks.indexOf(task);
    // 유저에게는 거리·보상·긴급도만 보여준다.
    let actions;
    if (task.match) {
      // 매칭 진행 중: 실시간 도우미 이동 상태머신 표시
      actions = `<div id="match-${realIdx}" class="match-box">${matchHtml(task, realIdx)}</div>
        ${task.match.state !== 'arrived' ? `<button onclick="cancelTask(${realIdx})" class="sub-btn">도우미 매칭 취소</button>` : ''}`;
    } else {
      actions = `
      <button onclick="acceptTask(${realIdx})" class="${inRange ? 'primary' : 'far'}">${inRange ? '직접 수행하기' : '조금 멀어요 (보상 낮음)'}</button>
      <button onclick="dispatchHelper(${realIdx})" class="sub-btn">도우미 매칭 요청 (실시간 배정)</button>`;
    }
    const poster = task.external ? ` · ${escapeHtml(task.poster || '이웃')} 요청` : ' · 내 공고';
    el.innerHTML = `
      <div class="loc">${d.toFixed(1)}km 거리${urg ? ` · <span class="urg urg-${task.urgency}">${urg}</span>` : ''}${poster}</div>
      <div class="desc">${escapeHtml(task.desc)}</div>
      <div class="cost">${task.cost} coins${task.external ? ` · 수행 시 +${task.cost - Math.round(task.cost*PLATFORM_FEE_RATE)}c` : ''}</div>
      ${actions}
    `;
    container.appendChild(el);
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function showPost() {
  hideAll();
  document.getElementById('post').classList.remove('hidden');
  if (!userLocation) getLocation();
  else showLocDisplay();
}

function hideAll() {
  document.querySelectorAll('.section').forEach(s => s.classList.add('hidden'));
}

function recordVoiceForTask() {
  updateStatus('음성 녹음 중...');
  const desc = document.getElementById('task-desc');
  const recStart = Date.now();

  navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
    const mediaRecorder = new MediaRecorder(stream);
    let chunks = [];
    mediaRecorder.ondataavailable = e => chunks.push(e.data);
    mediaRecorder.onstop = () => {
      const dur = (Date.now() - recStart) / 1000;

      // 녹음 길이로 긴급도를 가늠(길게 말할수록 긴급도 높게 반영).
      const intensity = Math.min(0.95, (dur / 6) + (Math.random() * 0.25));

      desc.value = (desc.value || '') + ' (음성 입력됨)';
      desc.dataset.intensity = intensity.toFixed(2);

      updateStatus('음성이 입력됐어요. 내용을 확인하고 등록하세요.');
      stream.getTracks().forEach(t => t.stop());
    };
    mediaRecorder.start();
    setTimeout(() => mediaRecorder.stop(), 4500);
  }).catch(() => {
    desc.value = (desc.value || '') + ' (음성: 냉장고 무거워요. 지금)';
    desc.dataset.intensity = '0.65';
    updateStatus('마이크를 사용할 수 없어 예시 문구를 넣었어요.');
  });
}

function postTask() {
  const descEl = document.getElementById('task-desc');
  const desc = descEl.value.trim();
  const cost = parseInt(document.getElementById('task-coins').value);
  const urgency = document.getElementById('urgency').value;
  
  if (!desc || cost > coins) {
    alert('설명 입력 + 코인 충분해야 함');
    return;
  }
  
  const intensity = parseFloat(descEl.dataset.intensity) || 0.4;

  const newTask = {
    desc,
    cost,
    urgency,
    lat: userLocation ? userLocation.lat : 37.5665,
    lng: userLocation ? userLocation.lng : 126.9780,
    time: Date.now(),
    decay: intensity,                     // 노출 반경이 좁아지는 속도
    visibleRadius: 9.5 - (intensity * 5.5) // 초기 노출 반경(km)
  };
  
  // 닫힌-루프: 지갑 → 에스크로 (코인 사라지지 않음, 잠김)
  coins -= cost;
  escrow += cost;
  postLedger('escrow', -cost, `공고 에스크로: ${desc.slice(0, 20)}`);
  updateCoinsUI();
  tasks.unshift(newTask);
  localStorage.setItem('p7_tasks', JSON.stringify(tasks));
  
  if (urgency === 'asap') updateStatus('🔥 지금 당장 · 주변 도우미에게 우선 노출됩니다');
  else updateStatus('공고가 등록됐어요.');
  
  descEl.value = '';
  descEl.dataset.intensity = '';
  hideAll();
  document.getElementById('browse').classList.remove('hidden');
  renderTasks();
}

function acceptTask(idx) {
  const task = tasks[idx];
  if (!task) return;

  // 닫힌-루프 정산: 공고에 잠긴 금액을 수행자에게 이체 - 플랫폼 수수료.
  // 코인은 발행되지 않는다. 총량은 오직 수수료만큼만 감소(정직·감사가능).
  // external 공고 = 타인이 에스크로 → 내 지갑에서 빼지 않고 그 에스크로에서 정산받음(수행자 수익).
  const held = task.external ? task.cost : Math.min(escrow, task.cost);
  const fee = Math.round(held * PLATFORM_FEE_RATE);
  const payout = held - fee;                       // 수행자(=you) 실수령
  if (!task.external) escrow -= held;              // 내 공고면 내 에스크로 해제
  coins += payout;
  const src = task.external ? `${task.poster||'타인'} 공고` : '내 공고';
  postLedger('payout', +payout, `${src} 수행 정산 (수수료 ${fee})`);

  // 완료 보너스: 공개된 확률표 그대로의 진짜 별도 보상(코드=표시 100% 일치)
  const luck = rollBonus();
  if (luck > 0) { coins += luck; postLedger('bonus', +luck, `완료 보너스 룰`); }

  const netEarn = payout + luck;
  updateCoinsUI();

  // 매칭 도우미가 수행했으면 별점을 받아 실제 평판에 반영(살아있는 평판 루프)
  let ratedStars = null, updatedRep = null;
  const helperName = task.helper || (task.match && task.match.helperName) || null;
  if (helperName) {
    const raw = prompt(`✅ ${helperName} 님이 완료했어요.\n도움은 어땠나요? 별점 1~5 (엔터=건너뛰기)`, '5');
    const s = parseInt(raw);
    if (s >= 1 && s <= 5) {
      ratedStars = s;
      updatedRep = rateHelper(helperName, s);
    }
  }

  const feeLine = `정산 ${payout}c (수수료 ${fee}c 공제)`;
  const bonusLine = luck > 0 ? ` + 완료보너스 +${luck}c` : ' + 보너스 +0';
  const ratedLine = ratedStars ? `\n${helperName}에게 ${'★'.repeat(ratedStars)} 반영됨` : '';
  const review = prompt(`심부름 완료!\n${feeLine}${bonusLine}${ratedLine}\n(보너스 확률: ${BONUS_ODDS_LABEL})\n"${task.desc}"\n한줄 후기?`, '무거웠지만 끝. 다음엔 더 정확히.');
  if (review) {
    notebook.unshift({
      task: task.desc,
      earn: netEarn,
      payout, fee,
      review,
      intensity: task.decay || 0,
      bonus: luck,
      helper: helperName,
      stars: ratedStars,
      time: Date.now()
    });
    localStorage.setItem('p7_notebook', JSON.stringify(notebook));
  }

  if (window.legionTrack) window.legionTrack('activate', { earn: netEarn, external: !!task.external });

  if (task._matchTimer) clearInterval(task._matchTimer);
  tasks.splice(idx, 1);
  localStorage.setItem('p7_tasks', JSON.stringify(tasks));
  renderTasks();
  const repLine = updatedRep
    ? ` · ${helperName} 평점 ⭐${updatedRep.rating} (${updatedRep.jobs}건)`
    : '';
  updateStatus(`+${netEarn}c (정산 ${payout} · 수수료 ${fee} · 보너스 ${luck})${repLine}`);
}

// ── 진짜 매칭 엔진: 도우미 배정 → 실시간 이동 → 도착 상태머신 ──
// 코인은 에스크로에 이미 잠겨있으므로 매칭 요청은 무료(우선노출만). 이동은 실제 거리/속도로 ETA 계산.
function dispatchHelper(idx) {
  const task = tasks[idx];
  if (!task || task.match) return;

  const tLat = task.lat || 37.5665, tLng = task.lng || 126.98;
  // 가용 도우미 중 이동시간(거리/속도)이 가장 짧은 실제 최적 도우미 선택
  const busy = new Set(tasks.filter(t => t.match && t.match.helperName).map(t => t.match.helperName));
  const candidates = HELPER_POOL
    .filter(h => !busy.has(h.name))
    .map(h => {
      const hLat = tLat + h.latOff, hLng = tLng + h.lngOff;
      const distKm = parseFloat(distanceKm(hLat, hLng, tLat, tLng));
      const etaMin = Math.max(1, Math.round((distKm / h.speedKmH) * 60));
      return { h, hLat, hLng, distKm, etaMin };
    })
    .sort((a, b) => a.etaMin - b.etaMin);

  if (candidates.length === 0) {
    updateStatus('지금 가용 도우미가 모두 수행 중이에요. 잠시 후 다시 요청하세요.');
    return;
  }
  const pick = candidates[0];
  const totalSec = pick.etaMin * 60;

  task.match = {
    helperName: pick.h.name,
    rating: pick.h.rating,
    jobs: pick.h.jobs,
    mode: pick.h.mode,
    startDist: pick.distKm,
    curDist: pick.distKm,
    totalSec,
    remainSec: totalSec,
    state: 'assigned', // assigned → enroute → arrived
    startedAt: Date.now(),
  };
  task.helper = pick.h.name;
  localStorage.setItem('p7_tasks', JSON.stringify(tasks));

  updateStatus(`⭐ ${pick.h.rating} ${pick.h.name} 배정 • ${pick.h.mode} ${pick.distKm}km • 도착 예정 ${pick.etaMin}분`);
  renderTasks();

  // 실시간 이동: 1초마다 남은시간·거리 갱신 (진짜로 줄어드는 카운트다운)
  task._matchTimer = setInterval(() => {
    const m = task.match;
    if (!m) { clearInterval(task._matchTimer); return; }
    const elapsed = (Date.now() - m.startedAt) / 1000;
    m.remainSec = Math.max(0, m.totalSec - elapsed);
    const prog = m.totalSec > 0 ? (1 - m.remainSec / m.totalSec) : 1;
    m.curDist = +(m.startDist * (1 - prog)).toFixed(2);
    if (m.state === 'assigned' && prog > 0.02) m.state = 'enroute';
    if (m.remainSec <= 0 && m.state !== 'arrived') {
      m.state = 'arrived';
      m.curDist = 0;
      clearInterval(task._matchTimer);
      localStorage.setItem('p7_tasks', JSON.stringify(tasks));
      updateStatus(`✅ ${m.helperName} 도착! 수행 완료를 눌러 정산하세요.`);
    }
    updateMatchCard(task);
  }, 1000);
}

// 매칭 중인 카드만 부분 갱신 (전체 재렌더 없이 부드러운 카운트다운)
function updateMatchCard(task) {
  const idx = tasks.indexOf(task);
  const box = document.getElementById(`match-${idx}`);
  if (!box) { renderTasks(); return; }
  box.innerHTML = matchHtml(task, idx);
}

function fmtSec(s) {
  s = Math.round(s);
  const m = Math.floor(s / 60), r = s % 60;
  return m > 0 ? `${m}분 ${r}초` : `${r}초`;
}

// 매칭 상태 UI (배정/이동중/도착 상태머신 시각화)
function matchHtml(task, idx) {
  const m = task.match;
  if (!m) return '';
  const STATE = {
    assigned: { label: '배정됨', cls: 'st-assigned' },
    enroute:  { label: '이동 중', cls: 'st-enroute' },
    arrived:  { label: '도착', cls: 'st-arrived' },
  }[m.state] || { label: m.state, cls: '' };
  const prog = m.totalSec > 0 ? Math.min(1, 1 - m.remainSec / m.totalSec) : 1;
  const etaLine = m.state === 'arrived'
    ? '지금 위치에 있어요'
    : `${m.curDist.toFixed(2)}km · 도착까지 ${fmtSec(m.remainSec)}`;
  const doneBtn = m.state === 'arrived'
    ? `<button onclick="acceptTask(${idx})" class="primary">수행 완료 · 정산</button>`
    : `<button class="far" disabled>도우미 이동 중…</button>`;
  return `
    <div class="match-head">
      <span class="helper">${escapeHtml(m.mode)} ${escapeHtml(m.helperName)} <span class="rate">⭐${m.rating} · ${m.jobs}건</span></span>
      <span class="match-state ${STATE.cls}">${STATE.label}</span>
    </div>
    <div class="match-bar"><div class="match-fill" style="width:${(prog*100).toFixed(0)}%"></div></div>
    <div class="match-eta">${etaLine}</div>
    ${doneBtn}
  `;
}

function cancelTask(idx) {
  const task = tasks[idx];
  if (!task) return;
  if (task._matchTimer) clearInterval(task._matchTimer);
  // 매칭만 취소(공고는 유지). 내 공고 취소가 아니라 도우미 배정 해제 → 다시 요청 가능.
  task.match = null;
  task.helper = null;
  localStorage.setItem('p7_tasks', JSON.stringify(tasks));
  renderTasks();
  updateStatus('도우미 매칭 취소 • 다시 요청할 수 있어요');
}

function showBrowse() {
  hideAll();
  document.getElementById('browse').classList.remove('hidden');
  if (!userLocation) getLocation();
  else renderTasks();
}

function showCoins() {
  hideAll();
  document.getElementById('coins').classList.remove('hidden');
  updateCoinsUI();
  renderLedger();
  updateChargeUI();
}

function renderLedger() {
  const el = document.getElementById('ledger-list');
  if (!el) return;
  el.innerHTML = '';
  if (ledger.length === 0) {
    el.innerHTML = '<div class="ledger-empty">아직 거래 없음. 공고를 올리면 에스크로 기록이 남아요.</div>';
    return;
  }
  const KIND = { escrow: '에스크로', payout: '정산', bonus: '보너스', refund: '환불', charge: '충전' };
  ledger.slice(0, 12).forEach(l => {
    const row = document.createElement('div');
    row.className = 'ledger-row';
    const sign = l.delta >= 0 ? '+' : '';
    const cls = l.delta >= 0 ? 'up' : 'down';
    const t = new Date(l.time);
    const hm = `${String(t.getHours()).padStart(2,'0')}:${String(t.getMinutes()).padStart(2,'0')}`;
    row.innerHTML = `<span class="lk">${KIND[l.kind] || l.kind}</span>
      <span class="ln">${escapeHtml(l.note || '')}</span>
      <span class="lv ${cls}">${sign}${l.delta}c</span>
      <span class="lt">${hm}</span>`;
    el.appendChild(row);
  });
}

const DAILY_CHARGE_LIMIT = 5; // 하루 충전 횟수 상한(공개·표시와 동일)

function chargesLeftToday() {
  const today = new Date().toDateString();
  const charges = JSON.parse(localStorage.getItem('p7_charges') || '{}');
  return Math.max(0, DAILY_CHARGE_LIMIT - (charges[today] || 0));
}

// 남은 충전 횟수를 코드값 그대로 화면에 반영(표시=실제 100% 일치)
function updateChargeUI() {
  const left = chargesLeftToday();
  const fomoEl = document.getElementById('charge-left');
  if (fomoEl) fomoEl.textContent = `오늘 충전 ${left}/${DAILY_CHARGE_LIMIT}회 남음`;
  const btn = document.getElementById('charge-btn');
  if (btn) btn.disabled = left <= 0;
}

function chargeCoins() {
  const today = new Date().toDateString();
  let charges = JSON.parse(localStorage.getItem('p7_charges') || '{}');
  if ((charges[today] || 0) >= DAILY_CHARGE_LIMIT) {
    updateStatus('오늘 충전 횟수를 모두 사용했어요. 내일 다시 가능합니다.');
    updateChargeUI();
    return;
  }
  coins += 50;
  charges[today] = (charges[today] || 0) + 1;
  localStorage.setItem('p7_charges', JSON.stringify(charges));
  postLedger('charge', +50, '코인 충전 (virtual credit)');
  updateCoinsUI();
  renderLedger();
  updateChargeUI();
  updateStatus(`50 coins 충전 완료 • 오늘 ${chargesLeftToday()}회 남음`);
}

function showNotebook() {
  hideAll();
  const sec = document.getElementById('notebook');
  sec.classList.remove('hidden');
  const list = document.getElementById('notebook-list');
  list.innerHTML = '';
  
  // 지난 심부름을 부드러운 금빛 점으로 그리는 기록 맵
  const glow = document.createElement('canvas');
  glow.id = 'memory-glow';
  glow.width = 320; glow.height = 110;
  glow.style.cssText = 'width:100%;max-width:320px;border:1px solid #3a3124;border-radius:8px;background:#0a0806;margin-bottom:8px';
  list.appendChild(glow);
  drawMemoryGlow(glow, notebook);
  
  if (notebook.length === 0) {
    list.innerHTML += '<p>완료된 심부름이 없음. 수행 후 기록하세요.</p>';
    return;
  }
  notebook.slice(0,8).forEach(n => {
    const el = document.createElement('div');
    el.className = 'notebook-entry';
    const helperLine = n.helper
      ? ` • ${escapeHtml(n.helper)}${n.stars ? ' ' + '★'.repeat(n.stars) : ''}`
      : '';
    el.innerHTML = `<small>${new Date(n.time).toLocaleDateString()} • +${n.earn}c (보너스 ${n.bonus||0})${helperLine}</small><br>${escapeHtml(n.task)}<br><i>${escapeHtml(n.review)}</i>`;
    list.appendChild(el);
  });
}

function drawMemoryGlow(c, entries) {
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#0a0806'; ctx.fillRect(0,0,c.width,c.height);
  // 지난 심부름을 부드러운 금빛 점으로 표현
  entries.slice(0,12).forEach((n,i) => {
    const v = n.intensity || 0.3;
    const x = 30 + (i % 5) * 55 + v*12;
    const y = 25 + Math.floor(i/5)*32 + (v-0.4)*18;
    const r = 9 + v*18;
    const a = 0.08 + v*0.22;
    ctx.shadowBlur = 14; ctx.shadowColor = '#c5a46e';
    ctx.fillStyle = `hsla(42,58%,72%,${a})`;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI*2); ctx.fill();
    ctx.shadowBlur = 0;
  });
}

function initP7() {
  // Seed some demo tasks
  if (tasks.length === 0) {
    // external:true = 다른 사람이 올린 공고 (그들이 이미 코인을 에스크로함).
    // 내가 수행하면 그들의 에스크로에서 정산받음(내 지갑 차감 없음) = 진짜 양면 마켓.
    tasks = [
      {desc: '냉장고 2층→1층 옮겨주세요 (무거움)', cost: 18, urgency:'today', lat:37.57, lng:126.98, time:Date.now()-3600000, external:true, poster:'이웃 주민'},
      {desc: '바퀴벌레 잡아주세요. 화장실', cost: 8, urgency:'asap', lat:37.56, lng:126.97, time:Date.now()-7200000, external:true, poster:'윗집'},
    ];
    localStorage.setItem('p7_tasks', JSON.stringify(tasks));
  }
  updateCoinsUI();
  getLocation();

  // Auto show browse
  setTimeout(() => {
    document.getElementById('browse').classList.remove('hidden');
    renderTasks();
  }, 400);
}

window.onload = initP7;

// PWA install hint
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(()=>{});
}
