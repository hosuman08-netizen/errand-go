
/* LEGION_WAVE_43_session_counter */
try{if(!sessionStorage.getItem('lw_p7_errand_ap_session_counter')){sessionStorage.setItem('lw_p7_errand_ap_session_counter','1');localStorage.setItem('lw_p7_errand_ap_session_counter',String((+(localStorage.getItem('lw_p7_errand_ap_session_counter')||0))+1));}}catch(e){}
/* ============================================================
   Errand — 화면 (요청자/헬퍼 양면 · 추적 · 증빙 · 분쟁 · 안전)
   ============================================================ */

const ui = {
  role: 'requester',      // requester | helper
  view: 'home',
  modal: null,
  loc: null,
  locAccuracy: null,
  draft: { cat: null, sub: null, desc: '', photoKey: null, priceMode: 'fixed', urgency: 'today', cost: null },
  queueCat: 'all',        // 헬퍼 콜 큐 카테고리 필터
  queueSort: 'near',      // near | pay | urgent
  hpTab: 'info',          // 헬퍼 프로필 모달 탭: info | reviews
  hpId: null,             // 현재 열린 헬퍼 id
  reviewsOpen: false,     // 후기 아코디언 펼침
};


/* ── 5H retention loop (local) ─────────────────────────────── */
function dayKey(off) {
  const d = new Date(); d.setDate(d.getDate() + (off || 0));
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function bumpErrandStreak(kind) {
  try {
    let st = JSON.parse(localStorage.getItem('errand_streak') || '{}');
    const t0 = dayKey(0);
    if (st.last !== t0) {
      const y = dayKey(-1), y2 = dayKey(-2);
      if (st.last && st.last !== y && st.last === y2 && (st.count || 0) >= 3) {
        const ready = !st.shieldLast || ((new Date(t0) - new Date(st.shieldLast)) / 86400000) >= 7;
        if (ready) { st.shieldLast = t0; st.last = y; try { legionTrack('streak_freeze', { count: st.count }); } catch (e) {} }
      }
      st.count = (st.last === y) ? (st.count || 0) + 1 : 1;
      st.last = t0;
      localStorage.setItem('errand_streak', JSON.stringify(st));
      try { legionTrack('streak', { count: st.count, kind: kind || 'act' }); } catch (e) {}
    }
    const dk = 'errand_day_' + t0;
    let day = JSON.parse(localStorage.getItem(dk) || '{"posts":0,"done":0}');
    if (kind === 'post') day.posts = (day.posts || 0) + 1;
    if (kind === 'done') day.done = (day.done || 0) + 1;
    localStorage.setItem(dk, JSON.stringify(day));
    return st;
  } catch (e) { return { count: 0 }; }
}
function errandLoopStrip() {
  try {
    const st = JSON.parse(localStorage.getItem('errand_streak') || '{}');
    const sc = st.count || 0;
    const day = JSON.parse(localStorage.getItem('errand_day_' + dayKey(0)) || '{"posts":0,"done":0}');
    const end = new Date(); end.setHours(24, 0, 0, 0);
    const ms = Math.max(0, end - Date.now());
    const clock = Math.floor(ms / 3600000) + 'h ' + Math.floor((ms % 3600000) / 60000) + 'm';
    const active = (typeof jobs !== 'undefined') ? jobs.filter(j => !isTerminal(j.status)).length : 0;
    return `<div class="card" style="margin:10px 0;padding:10px;border:1px solid #2a2438;border-radius:12px;font-size:12px;display:flex;flex-wrap:wrap;gap:6px;align-items:center">
      <span>🔥 ${sc}일</span><span>오늘 올림 ${day.posts || 0}</span><span>완료 ${day.done || 0}</span><span>진행 ${active}</span><span>리셋 ${clock}</span>
      <button type="button" class="ghost" style="margin-left:auto;padding:6px 10px" onclick="shareErrandBoard()">📤 보드 공유</button>
    </div>`;
  } catch (e) { return ''; }
}
function shareErrandBoard() {
  try {
    const st = JSON.parse(localStorage.getItem('errand_streak') || '{}');
    const day = JSON.parse(localStorage.getItem('errand_day_' + dayKey(0)) || '{}');
    const text = `Errand Go · 🔥${st.count || 0}일 · 오늘 올림 ${day.posts || 0} · https://hosuman08-netizen.github.io/errand-go/`;
    if (navigator.share) navigator.share({ text }).catch(() => {});
    else if (navigator.clipboard) navigator.clipboard.writeText(text);
    try { legionTrack('share_peak', {}); } catch (e) {}
    toast('공유 문구 준비됨');
  } catch (e) {}
}

function esc(s) {
  return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function $(id) { return document.getElementById(id); }
function fmtSec(s) {
  s = Math.max(0, Math.round(s));
  const m = Math.floor(s / 60), r = s % 60;
  return m > 0 ? `${m}분 ${r}초` : `${r}초`;
}
function fmtTime(ts) {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
function toast(msg, tone) {
  const t = $('toast');
  if (!t) return;
  t.textContent = msg;
  t.className = 'toast show' + (tone ? ' ' + tone : '');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { t.className = 'toast'; }, 3200);
}

/* ── 위치 ───────────────────────────────────────────────────── */
function initLocation() {
  const set = (lat, lng, acc, label) => {
    ui.loc = { lat, lng };
    ui.locAccuracy = acc;
    const el = $('loc-line');
    if (el) el.innerHTML = `📍 ${esc(label)} <span class="mono">${lat.toFixed(4)}, ${lng.toFixed(4)}</span>` +
      (acc ? ` <span class="dim">· 오차 ±${Math.round(acc)}m</span>` : '');
    render();
  };
  if (!navigator.geolocation) { set(37.5665, 126.9780, null, '기본 위치 (서울시청)'); return; }
  navigator.geolocation.getCurrentPosition(
    p => set(p.coords.latitude, p.coords.longitude, p.coords.accuracy, '현재 위치'),
    () => set(37.5665, 126.9780, null, '기본 위치 (서울시청) · 권한 없음'),
    { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 }
  );
}

/* ── 네비게이션 ─────────────────────────────────────────────── */
const NAV = {
  requester: [
    { id: 'home', label: '내 심부름', icon: '📋' },
    { id: 'post', label: '올리기', icon: '➕' },
    { id: 'wallet', label: '지갑', icon: '🪙' },
    { id: 'history', label: '기록', icon: '📓' },
  ],
  helper: [
    { id: 'queue', label: '콜 큐', icon: '📣' },
    { id: 'myjobs', label: '내 수행', icon: '🧰' },
    { id: 'earnings', label: '수익금', icon: '💰' },
    { id: 'profile', label: '프로필', icon: '🪪' },
  ],
};
function setRole(role) {
  ui.role = role;
  ui.view = NAV[role][0].id;
  render();
}
function go(view) { ui.view = view; render(); window.scrollTo({ top: 0, behavior: 'smooth' }); }

/* ── 최상위 렌더 ────────────────────────────────────────────── */
function render() {
  const nav = NAV[ui.role];
  $('role-switch').innerHTML = ['requester', 'helper'].map(r =>
    `<button class="${ui.role === r ? 'on' : ''}" onclick="setRole('${r}')">${r === 'requester' ? '요청자' : '헬퍼'}</button>`
  ).join('');
  $('nav').innerHTML = nav.map(n =>
    `<button class="${ui.view === n.id ? 'on' : ''}" onclick="go('${n.id}')"><span>${n.icon}</span>${n.label}</button>`
  ).join('');

  const views = {
    home: viewHome, post: viewPost, wallet: viewWallet, history: viewHistory,
    queue: viewQueue, myjobs: viewMyJobs, earnings: viewEarnings, profile: viewProfile,
  };
  $('main').innerHTML = (views[ui.view] || viewHome)();
  afterRender();
}

/* 렌더 후 캔버스 등 명령형 작업 */
function afterRender() {
  document.querySelectorAll('canvas[data-map]').forEach(c => {
    const job = findJob(c.getAttribute('data-map'));
    if (job) drawMap(c, job);
  });
  const sigCanvas = document.querySelector('canvas[data-sig]');
  if (sigCanvas) initSignaturePad(sigCanvas);
}

/* ============================================================
   요청자 — 내 심부름 (주인공: 진행 중 추적 카드)
   ============================================================ */
function viewHome() {
  let loop = errandLoopStrip();
  const mine = jobs.filter(j => j.side === 'requester' && !isTerminal(j.status));
  const pending = jobs.filter(j => j.side === 'requester' && isTerminal(j.status) && j.review && !j.review.mine).slice(0, 3);

  let h = loop;
  if (mine.length === 0 && pending.length === 0) {
    h += `<div class="empty">
      <div class="empty-icon">🧺</div>
      <div class="empty-title">진행 중인 심부름이 없어요</div>
      <div class="empty-sub">카테고리를 고르고 금액을 정하면<br>반경 안의 헬퍼에게 바로 알림이 갑니다.</div>
      <button class="primary block" onclick="go('post')">심부름 올리기</button>
    </div>`;
  }
  mine.forEach(j => { h += trackCard(j); });
  pending.forEach(j => { h += reviewPrompt(j); });

  if (mine.length > 0 || pending.length > 0) {
    h += `<button class="ghost block mt16" onclick="go('post')">➕ 심부름 하나 더 올리기</button>`;
  }
  h += trustStrip();
  return h;
}

/* ── 추적 카드: 상태 · 타임라인 · 지도 · ETA · 헬퍼 · 액션 ─── */
function subName(job) {
  const s = job.sub ? findSub(job.cat, job.sub) : null;
  return s ? s.name : null;
}
function trackCard(job) {
  const st = STATES[job.status];
  const cat = findCat(job.cat);
  const sub = subName(job);
  const cost = job.agreedCost || job.cost;

  let body;
  if (job.status === 'screening') body = screeningBody(job);
  else if (job.status === 'open') body = openBody(job);
  else if (job.status === 'disputed' || job.status === 'review') body = disputeBody(job);
  else body = liveBody(job);

  return `<section class="card hero">
    <div class="card-top">
      <div class="cat-badge">${cat.icon} ${esc(cat.name)}${sub ? ` <span class="sub-b">${esc(sub)}</span>` : ''}</div>
      <span class="pill" style="--c:${st.color}">${st.label}</span>
    </div>
    <h2 class="job-desc">${esc(job.desc)}</h2>
    <div class="meta-row">
      <span class="cost">${cost}c</span>
      <span class="dim">· ${URGENCY_MODES[job.urgency].label}</span>
      <span class="dim">· 반경 ${job.radiusKm}km</span>
      ${job.photoKey ? `<button class="link" onclick="showPhoto('${job.photoKey}','요청 사진')">📎 첨부 사진</button>` : ''}
    </div>
    ${timeline(job)}
    ${body}
  </section>`;
}

function timeline(job) {
  const cur = STATES[job.status].step;
  const bad = job.status === 'disputed' || job.status === 'review';
  return `<ol class="timeline${bad ? ' bad' : ''}">` + TIMELINE_STEPS.map((s, i) =>
    `<li class="${i < cur ? 'done' : i === cur ? 'now' : ''}"><i></i><span>${s}</span></li>`
  ).join('') + `</ol>`;
}

function screeningBody(job) {
  const left = Math.max(0, SIM.screenSec - elapsedSec(job.statusAt));
  return `<div class="state-note">
    금지 항목 자동 검수 중 · ${fmtSec(left)} 남음
    <div class="dim sm">실제 서비스의 공고 승인 대기(${SIM.screenRealLabel})를 ${SIM.screenSec}초로 압축했습니다.</div>
  </div>`;
}

function openBody(job) {
  const mode = URGENCY_MODES[job.urgency];
  const left = job.window ? Math.max(0, (job.window.endsAt - Date.now()) / 1000) : 0;
  const pct = job.window ? Math.min(100, 100 - (left / job.window.sec) * 100) : 0;

  if (job.matchMode === 'broadcast') {
    const n = eligibleHelpers(job).length;
    return `<div class="state-note">
      <b>${mode.label}</b> · ${esc(mode.rule)}
      <div class="bar mt8"><i style="width:${pct}%"></i></div>
      <div class="dim sm mt4">반경 ${mode.radiusKm}km 헬퍼 <b>${n}명</b>에게 알림 발송됨 · 수락 대기 ${fmtSec(left)}</div>
    </div>
    <button class="ghost block mt8" onclick="doCancel('${job.id}')">공고 취소 (전액 환불)</button>`;
  }

  const apps = job.applicants;
  const list = apps.length === 0
    ? `<div class="dim sm center pad8">지원자를 기다리는 중… ${fmtSec(left)} 남음<br>제한시간 내 0명이면 자동으로 전액 환불됩니다.</div>`
    : apps.map(a => applicantRow(job, a)).join('');

  return `<div class="state-note">
    <b>${mode.label}</b> · ${esc(mode.rule)}
    <div class="bar mt8"><i style="width:${pct}%"></i></div>
    <div class="dim sm mt4">지원 ${apps.length}/${job.cap}명 · 접수 마감까지 ${fmtSec(left)}${job.priceMode === 'auction' ? ` · 역경매 (실제 ${SIM.bidRealMin}분 → 체험 ${job.window ? job.window.sec : SIM.bidSec}초)` : ''}</div>
  </div>
  <div class="applicants">${list}</div>
  <button class="ghost block mt8" onclick="doCancel('${job.id}')">공고 취소 (전액 환불)</button>`;
}

function applicantRow(job, a) {
  const h = findHelper(a.helperId);
  if (!h) return '';
  const isNew = h.jobs < NEW_HELPER_JOBS_THRESHOLD;
  const diff = a.bid - job.cost;
  return `<div class="applicant">
    <div class="ava">${h.avatar}</div>
    <div class="who">
      <div class="nm">${esc(h.name)} <span class="dim sm">${h.gender}·${h.age}</span>
        ${h.idVerified ? '<span class="verified" title="신분증·백그라운드 체크 완료">✓ 인증</span>' : ''}
        ${isNew ? '<span class="tag-new">신규</span>' : ''}
        ${a.skilled ? `<span class="tag-skill">${esc(findCat(job.cat).name)} 경험</span>` : ''}
      </div>
      <div class="dim sm">⭐ ${h.rating} · ${h.jobs}건 · ${esc(h.vehicle)} · ${a.distKm}km / ${a.etaMin}분</div>
    </div>
    <div class="bidcol">
      <div class="bid">${a.bid}c${diff !== 0 ? `<span class="diff ${diff < 0 ? 'lo' : 'hi'}">${diff > 0 ? '+' : ''}${diff}</span>` : ''}</div>
      <button class="mini primary" onclick="doAssign('${job.id}','${h.id}',${a.bid})">선택</button>
      <button class="mini link" onclick="showHelper('${h.id}')">프로필</button>
    </div>
  </div>`;
}

/* 배정 이후: 지도 + ETA + 헬퍼 카드 + 채팅/신고 */
function liveBody(job) {
  const h = findHelper(job.helperId);
  const t = job.track;
  let etaLine = '';
  if (job.status === 'enroute' && t) {
    const remainRealMin = Math.max(1, Math.ceil(t.remainSec * TIME_COMPRESS / 60));
    const prog = Math.min(1, Math.max(0, t.progress || 0));
    const phase = t.stale ? '위치 신호 지연' : prog < 0.15 ? '헬퍼가 출발했어요' : prog < 0.85 ? '이동 중이에요' : '곧 도착해요';
    etaLine = `<div class="eta live">
      <div class="eta-top"><span class="live-dot${t.stale ? ' off' : ''}"></span><b>${phase}</b>
        <span class="dim">· <b>${remainRealMin}분</b> 후 도착</span></div>
      <div class="bar mt8"><i style="width:${(prog * 100).toFixed(0)}%"></i></div>
      <div class="dim sm mt4">${(t.curDist === undefined ? t.startDist : t.curDist).toFixed(2)}km 남음 · ${(prog * 100).toFixed(0)}% 이동 · 체험 ${fmtSec(t.remainSec || 0)}</div>
      ${t.stale ? '<div class="stale">⚠ 위치 신호 지연 — 마지막 확인 위치를 표시 중</div>' : ''}
    </div>`;
  } else if (job.status === 'assigned') {
    etaLine = `<div class="eta"><b>출발 준비 중</b> <span class="dim">· 곧 위치 공유가 시작됩니다</span></div>`;
  } else if (job.status === 'arrived') {
    etaLine = `<div class="eta"><b>현장 도착</b> <span class="dim">· 곧 수행을 시작합니다</span></div>`;
  } else if (job.status === 'working' && job.work) {
    const pct = Math.min(100, elapsedSec(job.work.startedAt) / job.work.totalSec * 100);
    etaLine = `<div class="eta"><b>수행 중</b> <span class="dim">· 표준 소요 ${job.work.min}분</span>
      <div class="bar mt8"><i style="width:${pct}%"></i></div></div>`;
  } else if (job.status === 'hold') {
    const left = Math.max(0, (job.hold.until - Date.now()) / 1000);
    etaLine = `<div class="eta">
      <b>지급 보류 중</b> <span class="dim">· ${fmtSec(left)} 후 자동 지급</span>
      <div class="dim sm mt4">실제 ${SIM.holdRealH}시간의 보류기간을 ${SIM.holdSec}초로 압축. 이 기간에만 이의제기가 가능합니다.</div>
    </div>`;
  }

  const showMap = job.status === 'enroute' || job.status === 'arrived';
  const msgs = job.chat.filter(c => c.from !== 'me' && c.from !== 'system').length;

  let actions = '';
  if (job.status === 'assigned' || job.status === 'enroute') {
    actions = `<button class="ghost block" onclick="doCancel('${job.id}')">심부름 취소 (이동 보상 ${CANCEL_AFTER_ASSIGN_FEE}c 공제)</button>`;
  } else if (job.status === 'pod' || job.status === 'hold') {
    actions = `<div class="row-2">
      <button class="primary" onclick="confirmNow('${job.id}')">확인하고 바로 지급</button>
      <button class="warn" onclick="openDisputeModal('${job.id}')">이의제기</button>
    </div>`;
  }

  return `
    ${showMap ? `<canvas data-map="${job.id}" class="map" width="720" height="360"></canvas>` : ''}
    ${etaLine}
    ${h ? helperStrip(job, h) : ''}
    ${job.pod ? podBlock(job) : ''}
    <div class="row-2 mt8">
      <button class="ghost" onclick="openChat('${job.id}')">💬 채팅${msgs ? ` <b>${msgs}</b>` : ''}</button>
      <button class="ghost danger" onclick="openReport('${job.id}')">🚨 신고</button>
    </div>
    ${actions}`;
}

function helperStrip(job, h) {
  return `<div class="helper-strip" onclick="showHelper('${h.id}')">
    <div class="ava lg">${h.avatar}</div>
    <div class="who">
      <div class="nm">${esc(h.name)} <span class="dim sm">${h.gender}·${h.age}세</span>
        ${h.idVerified ? '<span class="verified">✓ 신원확인</span>' : ''}
        ${isSuspended(h.id) ? '<span class="tag-sus">활동정지</span>' : ''}</div>
      <div class="dim sm">⭐ ${h.rating} · 누적 ${h.jobs}건 · ${esc(h.vehicle)}</div>
    </div>
    <span class="chev">›</span>
  </div>`;
}

function podBlock(job) {
  const p = job.pod;
  return `<div class="pod">
    <div class="pod-head">완료 증빙 (POD)</div>
    <div class="pod-grid">
      <button class="pod-thumb" onclick="showPhoto('${p.photoKey}','완료 사진')">🖼️<span>사진</span></button>
      <button class="pod-thumb" onclick="showPhoto('${p.sigKey}','전자서명')">✍️<span>서명</span></button>
      <div class="pod-meta">
        <div>🕒 ${new Date(p.at).toLocaleString('ko-KR')}</div>
        <div>📍 ${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}</div>
        <div class="mono dim">무결성 해시 ${esc(p.hash)}</div>
      </div>
    </div>
    ${p.note ? `<div class="pod-note">"${esc(p.note)}"</div>` : ''}
    <div class="dim sm">에스크로는 완료 버튼이 아니라 이 증빙 제출을 기준으로 해제됩니다.</div>
  </div>`;
}

function disputeBody(job) {
  const d = job.dispute;
  const reviewing = job.status === 'review';
  return `<div class="dispute">
    <div class="d-head">${reviewing ? '운영팀 심사 진행 중' : '이의제기 접수 — 자금 동결'}</div>
    <div class="d-row"><span>사유</span><b>${esc(d.reason)}</b></div>
    ${d.claim ? `<div class="d-row"><span>내용</span><b>${esc(d.claim)}</b></div>` : ''}
    <div class="d-row"><span>이행 주장</span><b>${d.totalItems}개 중 ${d.doneItems}개</b></div>
    <div class="d-row"><span>헬퍼 증거</span><b>${job.pod && job.pod.complete ? 'POD 완비 (사진·서명·시각·좌표)' : 'POD 불완전'}</b></div>
    <div class="d-row"><span>요청자 증거</span><b>${d.evidencePhotoKey ? '사진 제출됨' : '미제출'}</b></div>
    ${!d.evidencePhotoKey && !reviewing ? `<button class="ghost block mt8" onclick="addEvidence('${job.id}')">📷 증거 사진 추가</button>` : ''}
    <div class="dim sm mt8">심사 결과에 따라 전액 환불 · 부분 지급 · 전액 지급 중 하나로 종결됩니다.</div>
  </div>`;
}

/* ── 리뷰 (이중맹검) ─────────────────────────────────────────── */
function reviewPrompt(job) {
  const h = job.helperId ? findHelper(job.helperId) : null;
  const r = job.review;
  const left = Math.max(0, (r.windowEnds - Date.now()) / 1000);
  return `<section class="card">
    <div class="card-top"><div class="cat-badge">${findCat(job.cat).icon} 완료</div>
      <span class="pill" style="--c:${STATES[job.status].color}">${STATES[job.status].label}</span></div>
    <div class="job-desc sm">${esc(job.desc)}</div>
    <div class="blind-note">양측이 모두 작성하거나 기한이 끝날 때까지 <b>서로의 후기는 공개되지 않습니다.</b>
      <div class="dim sm">보복성 후기를 막기 위한 동시 공개 방식 · 실제 ${r.realDays}일 → 체험 ${fmtSec(left)} 남음</div></div>
    <div class="stars" id="stars-${job.id}">${[1, 2, 3, 4, 5].map(s =>
      `<button onclick="pickStar('${job.id}',${s})">☆</button>`).join('')}</div>
    <div class="rv-tags-label dim sm">좋았던 점을 골라주세요 (여러 개 가능)</div>
    <div class="rv-tags" id="rvtags-${job.id}">${REVIEW_TAGS.map(t =>
      `<button type="button" class="chip" data-tag="${t.id}" onclick="toggleRvTag(this)">${t.icon} ${esc(t.label)}</button>`).join('')}</div>
    <textarea id="rv-${job.id}" rows="2" placeholder="${h ? esc(h.name) + ' 님은 어땠나요? (선택)' : '후기를 남겨주세요 (선택)'}"></textarea>
    <button class="primary block" onclick="doReview('${job.id}')">후기 제출</button>
  </section>`;
}
function pickStar(jobId, s) {
  const box = $('stars-' + jobId); if (!box) return;
  box.dataset.picked = s;
  Array.prototype.forEach.call(box.children, (b, i) => { b.textContent = i < s ? '★' : '☆'; });
}
function toggleRvTag(btn) { btn.classList.toggle('on'); }
function doReview(jobId) {
  const job = findJob(jobId); if (!job) return;
  const box = $('stars-' + jobId);
  const stars = parseInt(box && box.dataset.picked) || 0;
  if (!stars) { toast('별점을 선택해 주세요'); return; }
  const ta = $('rv-' + jobId);
  const tagBox = $('rvtags-' + jobId);
  const tags = tagBox ? Array.prototype.slice.call(tagBox.querySelectorAll('.chip.on')).map(b => b.getAttribute('data-tag')) : [];
  submitReview(job, stars, ta ? ta.value : '', tags);
  toast(job.review.revealed
    ? '후기 공개됨 — 상대 후기도 함께 열렸습니다'
    : '제출 완료 · 상대가 작성하면 동시에 공개됩니다', 'ok');
  render();
}

/* ── 신뢰 스트립 ────────────────────────────────────────────── */
function trustStrip() {
  return `<div class="trust">
    <div class="t-item"><b>🔒 에스크로</b><span>심부름비는 앱이 보관하고 완료 증빙 제출 후에 지급됩니다.</span></div>
    <div class="t-item"><b>✓ 신원확인</b><span>전 헬퍼 신분증·백그라운드 체크·자격 테스트 통과.</span></div>
    <div class="t-item"><b>🛡 보증 ${GUARANTEE_COINS}c</b><span>플랫폼 과실로 인한 손해는 한도 내 보상합니다.</span></div>
    <div class="bypass">${esc(POLICY.bypassBan)}</div>
  </div>`;
}

/* ============================================================
   요청자 — 심부름 올리기
   ============================================================ */
function viewPost() {
  const d = ui.draft;
  const cat = d.cat ? findCat(d.cat) : null;
  const sub = d.cat && d.sub ? findSub(d.cat, d.sub) : null;
  const mode = URGENCY_MODES[d.urgency];
  const rec = cat ? (d.sub ? subRecommend(d.cat, d.sub) : cat.mid) : 12;
  const cost = d.cost === null ? rec : d.cost;
  const workMin = sub ? sub.wm : (cat ? (WORK_MIN[cat.id] || 25) : 25);

  return `
  <section class="card">
    <h2 class="sec-title">1 · 무슨 일인가요</h2>
    <div class="cat-grid">${CATEGORIES.map(c =>
      `<button class="cat ${d.cat === c.id ? 'on' : ''}" onclick="pickCat('${c.id}')">
        <span class="ic">${c.icon}</span><span class="nm">${esc(c.name)}</span></button>`).join('')}</div>
    ${cat ? `<div class="sub-chips">${(cat.subs || []).map(s =>
      `<button class="chip ${d.sub === s.id ? 'on' : ''}" onclick="pickSub('${s.id}')">${esc(s.name)}</button>`).join('')}</div>` : ''}
    ${cat ? `<div class="cat-hint">${esc(cat.hint)}${cat.twoPerson ? ' · 2인 작업 권장' : ''}${sub ? ` · 표준 소요 <b>${workMin}분</b>` : ''}</div>` : ''}
  </section>

  <section class="card">
    <h2 class="sec-title">2 · 자세히 알려주세요</h2>
    <textarea id="desc" rows="3" oninput="ui.draft.desc=this.value"
      placeholder="${cat ? esc(cat.hint) : '예: 냉장고를 2층에서 1층으로 옮겨주세요. 무거워요.'}">${esc(d.desc || '')}</textarea>
    <div class="row-2">
      <button class="ghost" onclick="recordVoice()">🎙️ 음성으로 말하기</button>
      <button class="ghost" onclick="attachPhoto()">📷 ${d.photoKey ? '사진 변경' : '사진 첨부'}</button>
    </div>
    ${d.photoKey ? `<div class="thumb-row"><img src="${getBlob(d.photoKey)}" alt="첨부 사진">
      <div class="dim sm">물건·장소 사진 한 장이 설명 열 줄을 대신합니다.<br>분쟁이 생기면 '요청 시점 상태' 증거가 됩니다.</div></div>` : ''}
    <div class="dim sm">사진은 이 기기 메모리에만 보관되며 서버로 전송되지 않습니다.</div>
  </section>

  <section class="card">
    <h2 class="sec-title">3 · 얼마를 드릴까요</h2>
    ${cat ? `<div class="price-guide">
      <div class="pg-bar"><i class="rec" style="left:${priceMarkPct(cat, rec)}%"></i><i class="mark" style="left:${priceMarkPct(cat, cost)}%"></i></div>
      <div class="pg-labels"><span>${cat.lo}c</span><span class="mid">권장 ${rec}c</span><span>${cat.hi}c</span></div>
      <div class="dim sm">${esc(sub ? sub.name : cat.name)} 최근 성사가 범위입니다. ${cost < rec ? '<b class="warn-txt">권장가보다 낮아 매칭이 늦어질 수 있어요.</b>' : '권장가 이상이면 빠르게 매칭됩니다.'}</div>
    </div>` : `<div class="dim sm">카테고리를 먼저 고르면 시세를 보여드려요.</div>`}
    <input id="cost" type="number" min="3" value="${cost}" oninput="onCostInput(this.value)">
    <div class="seg">${Object.keys(PRICE_MODES).map(k =>
      `<button class="${d.priceMode === k ? 'on' : ''}" onclick="setDraft('priceMode','${k}')">${PRICE_MODES[k].label}</button>`).join('')}</div>
    <div class="dim sm">${esc(PRICE_MODES[d.priceMode].desc)}</div>
  </section>

  <section class="card">
    <h2 class="sec-title">4 · 언제 필요한가요</h2>
    <div class="seg">${URGENCY_ORDER.map(u =>
      `<button class="${d.urgency === u ? 'on' : ''}" onclick="setDraft('urgency','${u}')">${URGENCY_MODES[u].label}</button>`).join('')}</div>
    <div class="mode-box">
      <div class="mode-title" style="color:${mode.color}">${esc(mode.short)}</div>
      <div class="mode-rule">${esc(mode.rule)}</div>
      <div class="mode-facts">
        <div><span>알림 반경</span><b>${mode.radiusKm}km</b></div>
        <div><span>수락 방식</span><b>${mode.mode === 'broadcast' ? '선착순 자동' : '지원 후 선택'}</b></div>
        <div><span>지원자 상한</span><b>${mode.cap}명</b></div>
        <div><span>범위 내 헬퍼</span><b>${countHelpersInRadius(mode.radiusKm)}명</b></div>
      </div>
      <div class="dim sm">긴급도는 표시 문구가 아니라 위 세 값을 실제로 바꾸는 스위치입니다.</div>
    </div>
  </section>

  <section class="card summary">
    <h2 class="sec-title">5 · 확인하고 등록</h2>
    <div class="s-row"><span>심부름비 (에스크로 예치)</span><b>${cost}c</b></div>
    <div class="s-row"><span>지금 내 잔액</span><b>${econ.coins}c</b></div>
    <div class="s-row dim"><span>플랫폼 수수료</span><b>헬퍼 인출 단계에서 공제</b></div>
    <div class="s-note">${esc(POLICY.matchFailRefund)}</div>
    <div class="s-note">${esc(POLICY.bypassBan)}</div>
    <div class="legal">${esc(LEGAL.intermediary)}<br>${esc(LEGAL.escrowProvider)}</div>
    <button class="primary block big" onclick="doPost()">${cost}c 예치하고 공고 등록</button>
  </section>`;
}
function setDraft(k, v) { ui.draft[k] = v; render(); }
function onCostInput(v) { ui.draft.cost = parseInt(v) || 0; }
function priceMarkPct(cat, cost) {
  const p = (cost - cat.lo) / Math.max(1, cat.hi - cat.lo) * 100;
  return Math.max(0, Math.min(100, p));
}
function countHelpersInRadius(km) {
  if (!ui.loc) return HELPERS.length;
  return HELPERS.filter(h => !isSuspended(h.id) &&
    distanceKm(ui.loc.lat + h.latOff * OFFSET_SCALE, ui.loc.lng + h.lngOff * OFFSET_SCALE, ui.loc.lat, ui.loc.lng) <= km).length;
}
function pickCat(id) {
  const cat = findCat(id);
  ui.draft.cat = id;
  ui.draft.sub = (cat.subs && cat.subs[0]) ? cat.subs[0].id : null;
  ui.draft.cost = ui.draft.sub ? subRecommend(id, ui.draft.sub) : cat.mid;
  render();
}
function pickSub(subId) {
  if (!ui.draft.cat) return;
  ui.draft.sub = subId;
  ui.draft.cost = subRecommend(ui.draft.cat, subId);   // 세부유형 바꾸면 권장가로 재설정
  render();
}

function doPost() {
  const d = ui.draft;
  const descEl = $('desc');
  const desc = descEl ? descEl.value : '';
  const costEl = $('cost');
  const cost = parseInt(costEl ? costEl.value : 0) || 0;
  if (!d.cat) { toast('카테고리를 골라주세요'); return; }
  if (desc.trim().length < 5) { toast('내용을 조금 더 자세히 적어주세요'); return; }
  if (cost < 3) { toast('금액은 3c 이상이어야 해요'); return; }
  if (cost > econ.coins) { toast(`잔액 부족 — ${cost - econ.coins}c 더 필요해요`, 'bad'); go('wallet'); return; }
  if (!ui.loc) { toast('위치를 확인하는 중이에요'); return; }

  const subLabel = d.sub ? findSub(d.cat, d.sub) : null;
  moveToEscrow(cost, `공고 예치 · ${findCat(d.cat).name}${subLabel ? ' / ' + subLabel.name : ''}`);
  createJob({
    cat: d.cat, sub: d.sub, desc: desc.trim(), photoKey: d.photoKey, cost,
    priceMode: d.priceMode, urgency: d.urgency, lat: ui.loc.lat, lng: ui.loc.lng,
  });
  ui.draft = { cat: null, sub: null, desc: '', photoKey: null, priceMode: 'fixed', urgency: 'today', cost: null };
  toast(`${cost}c 예치 완료 · 자동 심사 후 알림이 발송됩니다`, 'ok');
  go('home');
}

function doAssign(jobId, helperId, bid) {
  const job = findJob(jobId); if (!job) return;
  const r = assignHelper(job, helperId, bid);
  if (r === 'insufficient') { toast('낙찰가 차액만큼 잔액이 부족해요', 'bad'); return; }
  toast(`${findHelper(helperId).name} 배정 완료`, 'ok');
  render();
}
function doCancel(jobId) {
  const job = findJob(jobId); if (!job) return;
  const msg = job.helperId
    ? `헬퍼가 이미 이동 중입니다.\n이동 보상 ${CANCEL_AFTER_ASSIGN_FEE}c를 제외하고 환불됩니다. 취소할까요?`
    : '공고를 취소하고 전액 환불받을까요?';
  if (!confirm(msg)) return;
  const r = cancelJob(job, 'requester');
  toast(`취소 완료 · ${r.refunded}c 환불${r.fee ? ` (이동 보상 ${r.fee}c 공제)` : ''}`, 'ok');
  render();
}
function confirmNow(jobId) {
  const job = findJob(jobId); if (!job) return;
  const s = settleJob(job, 1);
  if (window.legionTrack) window.legionTrack('activate', { cat: job.cat, cost: s.gross });
  showResult(job, s);
}

/* ============================================================
   지갑
   ============================================================ */
function viewWallet() {
  const left = chargesLeftToday();
  const rate = feeRateFor(econ.cumWithdrawn);
  return `
  <section class="card center">
    <div class="bal-label">사용 가능</div>
    <div class="balance">${econ.coins}<span>c</span></div>
    ${econ.escrow > 0 ? `<div class="escrow">🔒 에스크로 잠김 ${econ.escrow}c · 정산 또는 취소 시 해제</div>` : ''}
    <button class="primary block" onclick="doCharge()" ${left <= 0 ? 'disabled' : ''}>🪙 코인 충전 (${CHARGE_COINS}c)</button>
    <div class="dim sm">오늘 ${left}/${DAILY_CHARGE_LIMIT}회 남음 · 가상 크레딧이며 실제 화폐가 아닙니다.</div>
  </section>

  <details class="card acc" open>
    <summary>수수료 ${(rate * 100).toFixed(1)}%가 사는 것</summary>
    <div class="dim sm mb8">수수료는 중개료가 아니라 보호비용입니다. 완료 시점이 아니라 헬퍼가 수익금을 인출할 때 공제됩니다.</div>
    ${FEE_BUYS.map(f => `<div class="fee-row">
      <div class="fb-bar"><i style="width:${(f.share * 100).toFixed(0)}%"></i></div>
      <div class="fb-txt"><b>${esc(f.k)}</b> <span class="dim">${(f.share * 100).toFixed(0)}%</span>
        <div class="dim sm">${esc(f.note)}</div></div>
    </div>`).join('')}
    <div class="dim sm">구성 합계 ${(FEE_BUYS_SUM * 100).toFixed(0)}% · 보증 한도 ${GUARANTEE_COINS}c</div>
  </details>

  <details class="card acc">
    <summary>취소 · 노쇼 · 매칭 실패 정책</summary>
    ${Object.keys(POLICY).map(k => `<div class="pol">${esc(POLICY[k])}</div>`).join('')}
  </details>

  <details class="card acc">
    <summary>거래 원장 (${econ.ledger.length}건)</summary>
    ${ledgerHtml()}
  </details>

  <div class="legal card">${esc(LEGAL.intermediary)}<br><br>${esc(LEGAL.escrowProvider)}<br><br>${esc(LEGAL.simulation)}</div>`;
}
function ledgerHtml() {
  if (econ.ledger.length === 0) return '<div class="dim sm center pad8">아직 거래가 없습니다.</div>';
  const KIND = { escrow: '예치', release: '지급', refund: '환불', earn: '수익', bonus: '보너스', charge: '충전', withdraw: '인출' };
  return econ.ledger.slice(0, 20).map(l => `<div class="led">
    <span class="lk">${KIND[l.kind] || esc(l.kind)}</span>
    <span class="ln">${esc(l.note)}</span>
    <span class="lv ${l.delta >= 0 ? 'up' : 'down'}">${l.delta >= 0 ? '+' : ''}${l.delta}c</span>
    <span class="lt mono">${fmtTime(l.time)}</span>
  </div>`).join('');
}
function doCharge() {
  const r = chargeCoins();
  if (r === null) { toast('오늘 충전 횟수를 모두 사용했어요'); return; }
  toast(`${r}c 충전 완료`, 'ok');
  render();
}

/* ============================================================
   기록
   ============================================================ */
function viewHistory() {
  const done = jobs.filter(j => isTerminal(j.status));
  if (done.length === 0)
    return `<div class="empty"><div class="empty-icon">📓</div><div class="empty-title">아직 기록이 없어요</div>
      <div class="empty-sub">완료·취소된 심부름이 여기에 쌓입니다.</div></div>`;

  return done.map(j => {
    const h = j.helperId ? findHelper(j.helperId) : null;
    const s = j.settle;
    return `<section class="card">
      <div class="card-top">
        <div class="cat-badge">${findCat(j.cat).icon} ${esc(findCat(j.cat).name)}${subName(j) ? ` <span class="sub-b">${esc(subName(j))}</span>` : ''}</div>
        <span class="pill" style="--c:${STATES[j.status].color}">${STATES[j.status].label}</span>
      </div>
      <div class="job-desc sm">${esc(j.desc)}</div>
      <div class="dim sm">${new Date(j.statusAt).toLocaleString('ko-KR')}${h ? ` · ${h.avatar} ${esc(h.name)}` : ''}</div>
      ${s ? `<div class="settle-row">
        <span>${j.side === 'helper' ? '수익 적립' : '헬퍼 지급'} <b>${s.gross}c</b></span>
        ${s.refund ? `<span>환불 <b>${s.refund}c</b></span>` : ''}
        ${s.bonus ? `<span>보너스 <b>+${s.bonus}c</b></span>` : ''}
        ${s.ratio < 1 ? `<span class="warn-txt">부분 지급 ${Math.round(s.ratio * 100)}%</span>` : ''}
      </div>` : ''}
      ${j.cancelInfo ? `<div class="dim sm">환불 ${j.cancelInfo.refunded}c${j.cancelInfo.fee ? ` · 공제 ${j.cancelInfo.fee}c` : ''}${j.cancelInfo.why ? ` · ${esc(j.cancelInfo.why)}` : ''}</div>` : ''}
      ${j.dispute && j.dispute.verdict ? `<div class="verdict">⚖️ ${esc(j.dispute.verdict.why)}</div>` : ''}
      ${j.review ? reviewBlock(j, j.review) : ''}
      ${s && s.ratio >= 1 ? `<button class="ghost block mt8" onclick="shareJob('${j.id}')">공유하기</button>` : ''}
    </section>`;
  }).join('');
}
function reviewBlock(job, r) {
  if (!r.mine && !r.theirs) return '';
  if (!r.revealed) {
    return `<div class="blind-note sm">
      ${r.mine ? '내 후기 제출 완료' : '내 후기 미작성'} · ${r.theirs ? '상대 후기 도착함 (비공개)' : '상대 후기 대기 중'}
      <div class="dim sm">양측 제출 또는 기한 만료 시 동시에 공개됩니다.</div></div>`;
  }
  return `<div class="reviews">
    ${r.mine ? `<div class="rv"><b>내 후기</b> <span class="st">${'★'.repeat(r.mine.stars)}</span>${rvTagChips(r.mine.tags)}${r.mine.text ? `<div>${esc(r.mine.text)}</div>` : ''}</div>` : ''}
    ${r.theirs ? `<div class="rv"><b>헬퍼 후기</b> <span class="st">${'★'.repeat(r.theirs.stars)}</span>${rvTagChips(r.theirs.tags)}${r.theirs.text ? `<div>${esc(r.theirs.text)}</div>` : ''}</div>` : ''}
  </div>`;
}
function rvTagChips(tags) {
  if (!Array.isArray(tags) || !tags.length) return '';
  return `<div class="rv-chiprow">${tags.map(id => {
    const t = findReviewTag(id); return t ? `<span class="chip static">${t.icon} ${esc(t.label)}</span>` : '';
  }).join('')}</div>`;
}

/* ============================================================
   헬퍼 모드
   ============================================================ */
const NEIGHBOR_JOBS = [
  { desc: '냉장고 2층 → 1층 옮겨주세요. 두 명이면 좋아요.', cat: 'move', sub: 'furni', urgency: 'today', poster: '이웃 주민', dLat: 0.012, dLng: 0.008 },
  { desc: '원룸 이사 짐 나르기 도와주세요. 엘리베이터 있어요.', cat: 'move', sub: 'moving', urgency: 'normal', poster: '502호', dLat: -0.016, dLng: 0.011 },
  { desc: '화장실에 바퀴벌레 나왔어요. 지금 좀 와주세요.', cat: 'pest', sub: 'catch', urgency: 'asap', poster: '윗집', dLat: -0.004, dLng: 0.006 },
  { desc: '창틀 틈으로 벌레가 들어와요. 방충 처리 부탁해요.', cat: 'pest', sub: 'seal', urgency: 'today', poster: '1층 세대', dLat: 0.006, dLng: 0.013 },
  { desc: '약국에서 처방약 찾아다 주세요. 접수증 있어요.', cat: 'delivery', sub: 'pharm', urgency: 'asap', poster: '3층 어르신', dLat: 0.007, dLng: -0.005 },
  { desc: '편의점에서 생수 2박스랑 우유 사다 주세요.', cat: 'delivery', sub: 'store', urgency: 'asap', poster: '옆 동 주민', dLat: -0.003, dLng: -0.004 },
  { desc: '계약서 원본 부동산에 전달해 주세요. 봉투 준비됨.', cat: 'delivery', sub: 'doc', urgency: 'today', poster: '단골 요청자', dLat: 0.009, dLng: 0.002 },
  { desc: '강아지 30분 산책 부탁드려요. 소형견입니다.', cat: 'pet', sub: 'walk', urgency: 'normal', poster: '단골 요청자', dLat: -0.009, dLng: -0.011 },
  { desc: '고양이 병원 동행 부탁해요. 이동장 있어요.', cat: 'pet', sub: 'vet', urgency: 'today', poster: '3동 주민', dLat: 0.014, dLng: -0.009 },
  { desc: '책상 조립 도와주세요. 부품은 다 있습니다.', cat: 'assemble', sub: 'furni', urgency: 'today', poster: '신규 이웃', dLat: 0.015, dLng: 0.003 },
  { desc: '거실 커튼 봉이랑 선반 설치해 주세요.', cat: 'assemble', sub: 'mount', urgency: 'normal', poster: '201호', dLat: -0.007, dLng: 0.009 },
  { desc: '이사 후 집 정리·수납 도와주세요. 3시간 예상.', cat: 'clean', sub: 'organize', urgency: 'normal', poster: '새 입주민', dLat: 0.011, dLng: -0.013 },
  { desc: '분리수거랑 대형 폐기물 내놓아 주세요.', cat: 'clean', sub: 'waste', urgency: 'today', poster: '4층 세대', dLat: -0.005, dLng: 0.004 },
  { desc: '한정판 오픈런 대기 부탁해요. 오전 내 필요.', cat: 'wait', sub: 'queue', urgency: 'today', poster: '학생', dLat: 0.017, dLng: 0.006 },
];
function ensureQueue() {
  if (!ui.loc) return [];
  if (!ui._queue) {
    ui._queue = NEIGHBOR_JOBS.map((n, i) => {
      const lat = ui.loc.lat + n.dLat, lng = ui.loc.lng + n.dLng;
      const cost = subRecommend(n.cat, n.sub);       // 시세 = 세부유형 권장가(결정적)
      return {
        id: 'q' + i, desc: n.desc, cat: n.cat, sub: n.sub, cost, urgency: n.urgency, poster: n.poster,
        lat, lng, distKm: distanceKm(lat, lng, ui.loc.lat, ui.loc.lng), taken: false,
      };
    });
  }
  return ui._queue;
}
/* 콜 큐 정렬 — 가까운 순 / 보수 높은 순 / 급한 순(결정적) */
const QUEUE_SORTS = { near: '가까운 순', pay: '보수 순', urgent: '급한 순' };
const URGENCY_RANK = { asap: 0, today: 1, normal: 2 };
function sortQueue(list, mode) {
  const a = list.slice();
  if (mode === 'pay') a.sort((x, y) => y.cost - x.cost || x.distKm - y.distKm);
  else if (mode === 'urgent') a.sort((x, y) => URGENCY_RANK[x.urgency] - URGENCY_RANK[y.urgency] || x.distKm - y.distKm);
  else a.sort((x, y) => x.distKm - y.distKm);
  return a;
}
function viewQueue() {
  const all = ensureQueue().filter(x => !x.taken);
  const mine = jobs.filter(j => j.side === 'helper' && !isTerminal(j.status));

  /* 카테고리 필터: 실제로 콜이 있는 카테고리만 칩으로 노출 + 건수 배지 */
  const counts = {};
  all.forEach(t => { counts[t.cat] = (counts[t.cat] || 0) + 1; });
  const cats = CATEGORIES.filter(c => counts[c.id]);
  let filtered = ui.queueCat === 'all' ? all : all.filter(t => t.cat === ui.queueCat);
  filtered = sortQueue(filtered, ui.queueSort);

  let h = `<div class="hint-bar">내 위치 반경 안에서 들어온 요청입니다. 수락하면 요청자의 예치금이 이 수행 건에 묶입니다.</div>`;
  if (mine.length > 0) h += `<div class="hint-bar warn">진행 중인 수행 ${mine.length}건 — <button class="link" onclick="go('myjobs')">내 수행 보기</button></div>`;

  h += `<div class="q-filter">
    <button class="chip ${ui.queueCat === 'all' ? 'on' : ''}" onclick="setQueueCat('all')">전체 <b>${all.length}</b></button>
    ${cats.map(c => `<button class="chip ${ui.queueCat === c.id ? 'on' : ''}" onclick="setQueueCat('${c.id}')">${c.icon} ${esc(c.name)} <b>${counts[c.id]}</b></button>`).join('')}
  </div>
  <div class="q-sort">${Object.keys(QUEUE_SORTS).map(k =>
    `<button class="${ui.queueSort === k ? 'on' : ''}" onclick="setQueueSort('${k}')">${QUEUE_SORTS[k]}</button>`).join('')}</div>`;

  if (filtered.length === 0) return h + `<div class="empty"><div class="empty-icon">📣</div><div class="empty-title">이 조건의 콜이 없어요</div>
    <div class="empty-sub">필터를 바꾸거나 잠시 후 다시 확인해 주세요.</div></div>`;

  return h + filtered.map(t => {
    const cat = findCat(t.cat);
    const sub = t.sub ? findSub(t.cat, t.sub) : null;
    const mode = URGENCY_MODES[t.urgency];
    const inRange = t.distKm <= mode.radiusKm;
    const perMin = (t.cost / (sub ? sub.wm : 25)).toFixed(2);
    return `<section class="card call">
      <div class="card-top">
        <div class="cat-badge">${cat.icon} ${esc(cat.name)}${sub ? ` <span class="sub-b">${esc(sub.name)}</span>` : ''}</div>
        <span class="pill" style="--c:${mode.color}">${mode.label}</span>
      </div>
      <div class="job-desc sm">${esc(t.desc)}</div>
      <div class="meta-row"><span class="cost">${t.cost}c</span>
        <span class="dim">· ${t.distKm.toFixed(1)}km · ${esc(t.poster)}</span></div>
      <div class="call-facts">
        <div><span>표준 소요</span><b>${sub ? sub.wm : 25}분</b></div>
        <div><span>분당 보수</span><b>${perMin}c</b></div>
        <div><span>수락 방식</span><b>${mode.mode === 'broadcast' ? '선착순' : '지원'}</b></div>
      </div>
      <div class="dim sm">${esc(mode.short)} · 완료 시 ${t.cost}c 수익금 적립 (수수료는 인출 시 공제)</div>
      <button class="primary block" onclick="acceptCall('${t.id}')" ${inRange ? '' : 'disabled'}>
        ${inRange ? (mode.mode === 'broadcast' ? '지금 수락 (선착순)' : '지원하기') : `반경 밖 (${mode.radiusKm}km 초과)`}</button>
    </section>`;
  }).join('');
}
function setQueueCat(id) { ui.queueCat = id; render(); }
function setQueueSort(k) { ui.queueSort = k; render(); }
function acceptCall(qid) {
  const t = ensureQueue().find(x => x.id === qid); if (!t) return;
  t.taken = true;
  const mode = URGENCY_MODES[t.urgency];
  const job = {
    id: 'j' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    side: 'helper', cat: t.cat, sub: t.sub || null, desc: t.desc, cost: t.cost, agreedCost: t.cost,
    priceMode: 'fixed', urgency: t.urgency, lat: t.lat, lng: t.lng,
    createdAt: Date.now(), status: 'assigned', statusAt: Date.now(),
    applicants: [], helperId: null, poster: t.poster,
    chat: [{ from: 'system', at: Date.now(), text: `${t.poster} 님과 연결되었습니다. 전화번호는 공개되지 않습니다.` }],
    reports: [], events: [], radiusKm: mode.radiusKm, matchMode: mode.mode, cap: mode.cap,
    distKm: t.distKm, photoKey: null,
  };
  job._rng = rngFor(job.id);
  jobs.unshift(job); saveJobs();
  toast('수락 완료 · 현장으로 이동해 주세요', 'ok');
  go('myjobs');
}

function viewMyJobs() {
  const mine = jobs.filter(j => j.side === 'helper' && !isTerminal(j.status));
  if (mine.length === 0)
    return `<div class="empty"><div class="empty-icon">🧰</div><div class="empty-title">진행 중인 수행이 없어요</div>
      <button class="primary block" onclick="go('queue')">콜 큐 보기</button></div>`;

  return mine.map(j => {
    const cat = findCat(j.cat);
    const st = STATES[j.status];
    let action = '';
    if (j.status === 'assigned') action = `<button class="primary block" onclick="helperAdvance('${j.id}','enroute')">출발하기</button>`;
    else if (j.status === 'enroute') action = `<button class="primary block" onclick="helperAdvance('${j.id}','arrived')">현장 도착 확인</button>`;
    else if (j.status === 'arrived') action = `<button class="primary block" onclick="helperAdvance('${j.id}','working')">수행 시작</button>`;
    else if (j.status === 'working') action = `<button class="primary block" onclick="openPodModal('${j.id}')">완료 증빙 제출</button>`;
    else if (j.status === 'hold') {
      const left = Math.max(0, (j.hold.until - Date.now()) / 1000);
      action = `<div class="state-note">지급 보류 중 · ${fmtSec(left)} 후 수익금 적립
        <div class="dim sm">요청자는 이 기간에만 이의제기할 수 있습니다.</div></div>`;
    }
    const jsub = subName(j);
    return `<section class="card hero">
      <div class="card-top"><div class="cat-badge">${cat.icon} ${esc(cat.name)}${jsub ? ` <span class="sub-b">${esc(jsub)}</span>` : ''}</div>
        <span class="pill" style="--c:${st.color}">${st.label}</span></div>
      <h2 class="job-desc">${esc(j.desc)}</h2>
      <div class="meta-row"><span class="cost">${j.cost}c</span>
        <span class="dim">· ${(j.distKm || 0).toFixed(1)}km · ${esc(j.poster || '요청자')}</span></div>
      ${timeline(j)}
      ${j.work && j.status === 'working' ? `<div class="eta"><b>수행 중</b> <span class="dim">· 표준 소요 ${j.work.min}분</span></div>` : ''}
      ${j.pod ? podBlock(j) : ''}
      <div class="row-2 mt8">
        <button class="ghost" onclick="openChat('${j.id}')">💬 채팅</button>
        <button class="ghost danger" onclick="doHelperCancel('${j.id}')">수행 포기</button>
      </div>
      ${action}
    </section>`;
  }).join('');
}
function helperAdvance(jobId, next) {
  const job = findJob(jobId); if (!job) return;
  const LABEL = { enroute: '이동 시작 — 위치 공유 켜짐', arrived: '현장 도착', working: '수행 시작' };
  if (next === 'working') { const wm = workMinFor(job); job.work = { startedAt: Date.now(), totalSec: wm * 60 / TIME_COMPRESS, min: wm }; }
  setStatus(job, next, LABEL[next]);
  toast(LABEL[next], 'ok');
  render();
}
function doHelperCancel(jobId) {
  const job = findJob(jobId); if (!job) return;
  if (!confirm('수행을 포기하면 요청자에게 전액 환불되고 노쇼 기록이 남습니다. 계속할까요?')) return;
  cancelJob(job, 'helper');
  toast('수행 포기 처리됨 · 노쇼 기록이 남았습니다', 'bad');
  render();
}

function viewEarnings() {
  const rate = feeRateFor(econ.cumWithdrawn);
  const next = nextFeeTier(econ.cumWithdrawn);
  return `
  <section class="card center">
    <div class="bal-label">인출 가능 수익금</div>
    <div class="balance">${econ.earnings}<span>c</span></div>
    <div class="dim sm">누적 인출 ${econ.cumWithdrawn}c · 현재 수수료율 <b>${(rate * 100).toFixed(1)}%</b></div>
    <button class="primary block" onclick="doWithdraw()" ${econ.earnings <= 0 ? 'disabled' : ''}>전액 인출하기</button>
    ${next
      ? `<div class="dim sm">누적 ${next.minCum}c를 넘기면 수수료가 ${(next.rate * 100).toFixed(1)}%로 낮아집니다 (${next.minCum - econ.cumWithdrawn}c 남음)</div>`
      : `<div class="dim sm">최저 요율 구간에 도달했습니다.</div>`}
  </section>

  <details class="card acc" open>
    <summary>인출 구간별 수수료율</summary>
    <div class="dim sm mb8">완료 즉시 심부름비 전액이 수익금에 적립되고, 수수료는 인출할 때 누적 인출액 구간에 따라 공제됩니다.</div>
    ${FEE_TIERS.map((t, i) => {
      const upper = FEE_TIERS[i + 1];
      return `<div class="tier ${rate === t.rate ? 'on' : ''}">
        <span>누적 ${t.minCum}c ${upper ? `~ ${upper.minCum - 1}c` : '이상'}</span>
        <b>${(t.rate * 100).toFixed(1)}%</b></div>`;
    }).join('')}
  </details>

  <details class="card acc">
    <summary>거래 원장</summary>${ledgerHtml()}
  </details>`;
}
function doWithdraw() {
  const r = withdraw(econ.earnings);
  if (!r) { toast('인출할 수익금이 없어요'); return; }
  toast(`${r.amount}c 인출 · 수수료 ${(r.rate * 100).toFixed(1)}% (${r.fee}c) 공제 → ${r.net}c 입금`, 'ok');
  render();
}

function viewProfile() {
  ui.hpId = null; // 이 화면의 후기 아코디언은 모달이 아님
  const st = myHelperStats();
  // 내 등급: 완료 수행건 + 요청자 평점으로 규칙 판정(헬퍼 데이터와 동일 기준)
  const myRating = st.rating != null ? st.rating : 4.9;
  const myTier = (function () {
    let out = HELPER_TIERS[0];
    for (const t of HELPER_TIERS) if (st.jobsCount >= t.minJobs && myRating >= t.minRating) out = t;
    return out;
  })();
  const next = HELPER_TIERS.find(t => t.minJobs > myTier.minJobs) || null;
  const toNext = next ? Math.max(0, next.minJobs - st.jobsCount) : 0;
  const ratingLine = st.rating != null
    ? `${starStr(st.rating)} <b>${st.rating.toFixed(2)}</b> <span class="dim sm">· 요청자 평가 ${st.ratedCount}건</span>`
    : `<span class="dim sm">아직 받은 평가가 없습니다 — 첫 수행을 완료해 보세요</span>`;

  return `
  <section class="card center hp-me">
    <div class="ava xl">🙂</div>
    <div class="hp-me-name">나의 헬퍼 프로필 ${tierBadge(myTier)}</div>
    <div class="hp-me-rating">${ratingLine}</div>
    ${next ? `<div class="tier-next">
      <div class="dim sm">다음 등급 <b style="color:${next.color}">${next.icon} ${next.label}</b>까지 ${toNext > 0 ? `${toNext}건 더` : '평점 조건 충족 시 승급'}</div>
      <div class="bar mt4"><i style="width:${Math.min(100, next.minJobs ? st.jobsCount / next.minJobs * 100 : 100).toFixed(0)}%"></i></div>
    </div>` : `<div class="dim sm mt4">최고 등급에 도달했습니다 👑</div>`}
    <div class="dim sm mt8">요청자는 매칭 전에 헬퍼의 성별·나이·얼굴·평점·누적 수행건수·후기를 확인할 수 있습니다.</div>
  </section>
  <section class="card">
    <h2 class="sec-title">내 활동 지표</h2>
    <div class="stat-row">
      <div class="stat"><b>${st.jobsCount}</b><span>완료 수행</span></div>
      <div class="stat"><b>${econ.cumWithdrawn}c</b><span>누적 인출</span></div>
      <div class="stat"><b>${econ.earnings}c</b><span>미인출 수익금</span></div>
    </div>
    <div class="dim sm mt8">분쟁률이 ${(DISPUTE_AUTO_SUSPEND.rate * 100)}%를 넘으면(최소 ${DISPUTE_AUTO_SUSPEND.minJobs}건 이상) 자동으로 활동이 정지됩니다.</div>
  </section>
  <section class="card">
    <h2 class="sec-title">요청자에게 받은 후기</h2>
    ${st.received.length
      ? reviewListHtml(st.received, { note: '요청자가 남긴 후기는 이중맹검 기간이 끝난 뒤 공개됩니다.' })
      : `<div class="dim center pad8">아직 받은 후기가 없습니다.<br>심부름을 완료하면 요청자의 후기가 이곳에 쌓입니다.</div>`}
  </section>
  <section class="card">
    <h2 class="sec-title">검증 완료 항목</h2>
    <div class="verify-list">
      <div class="v-row done"><b>✓ 신분증 등록</b><span>실명·생년월일 확인 완료</span></div>
      <div class="v-row done"><b>✓ 주소 등록</b><span>활동 지역 설정 완료</span></div>
      <div class="v-row done"><b>✓ 프로필 사진</b><span>요청자에게 공개됩니다</span></div>
      <div class="v-row done"><b>✓ 백그라운드 체크</b><span>결격 사유 없음</span></div>
      <div class="v-row done"><b>✓ 헬퍼 자격 테스트</b><span>안전·응대 과정 통과</span></div>
    </div>
  </section>
  <section class="card">
    <h2 class="sec-title">활동 중인 헬퍼</h2>
    ${HELPERS.map(h => {
      const s = sanctionOf(h.id);
      const t = helperTier(h.id);
      return `<div class="helper-strip" onclick="showHelper('${h.id}')">
        <div class="ava lg">${h.avatar}</div>
        <div class="who"><div class="nm">${esc(h.name)} ${isSuspended(h.id) ? '<span class="tag-sus">활동정지</span>' : tierBadge(t)}
          ${s.warns ? `<span class="tag-warn">경고 ${s.warns}</span>` : ''}</div>
          <div class="dim sm">⭐ ${h.rating} · ${h.jobs}건 · ${esc(h.vehicle)}</div></div>
        <span class="chev">›</span></div>`;
    }).join('')}
  </section>`;
}

/* ============================================================
   지도
   ============================================================ */
function drawMap(c, job) {
  const t = job.track;
  const x = c.getContext('2d');
  const W = c.width, H = c.height;
  x.clearRect(0, 0, W, H);
  x.fillStyle = '#0d0b08'; x.fillRect(0, 0, W, H);
  if (!t) return;

  const span = Math.max(0.002, Math.abs(t.origin.lat - job.lat) * 1.6, Math.abs(t.origin.lng - job.lng) * 1.6);
  const cx = W / 2, cy = H / 2;
  const scale = Math.min(W, H) * 0.36 / span;
  const P = (lat, lng) => ({ x: cx + (lng - job.lng) * scale, y: cy - (lat - job.lat) * scale });

  x.strokeStyle = '#171310'; x.lineWidth = 1;
  for (let i = 0; i < W; i += 40) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, H); x.stroke(); }
  for (let i = 0; i < H; i += 40) { x.beginPath(); x.moveTo(0, i); x.lineTo(W, i); x.stroke(); }

  x.strokeStyle = 'rgba(197,164,110,0.18)'; x.lineWidth = 1.5;
  [0.3, 0.6, 0.9].forEach(r => { x.beginPath(); x.arc(cx, cy, Math.min(W, H) * 0.36 * r, 0, Math.PI * 2); x.stroke(); });

  if (t.path && t.path.length > 1) {
    x.strokeStyle = 'rgba(217,180,81,0.55)'; x.lineWidth = 2.5; x.lineJoin = 'round';
    x.beginPath();
    t.path.forEach((p, i) => { const q = P(p.lat, p.lng); if (i) x.lineTo(q.x, q.y); else x.moveTo(q.x, q.y); });
    x.stroke();
  }

  const cur = P(t.sm.lat, t.sm.lng);
  x.setLineDash([6, 6]); x.strokeStyle = 'rgba(139,111,71,0.5)'; x.lineWidth = 2;
  x.beginPath(); x.moveTo(cur.x, cur.y); x.lineTo(cx, cy); x.stroke(); x.setLineDash([]);

  x.fillStyle = '#c5a46e';
  x.beginPath(); x.arc(cx, cy, 7, 0, Math.PI * 2); x.fill();
  x.strokeStyle = 'rgba(197,164,110,0.35)'; x.lineWidth = 2;
  x.beginPath(); x.arc(cx, cy, 14, 0, Math.PI * 2); x.stroke();
  x.fillStyle = '#8b6f47'; x.font = '11px system-ui'; x.textAlign = 'center';
  x.fillText('요청 위치', cx, cy + 30);

  const stale = t.stale;
  x.globalAlpha = stale ? 0.45 : 1;
  x.fillStyle = stale ? '#8b6f47' : '#d9b451';
  x.beginPath(); x.arc(cur.x, cur.y, 9, 0, Math.PI * 2); x.fill();
  x.fillStyle = '#0d0b08'; x.font = 'bold 11px system-ui';
  const h = findHelper(job.helperId);
  x.fillText(h ? h.name.charAt(0) : '?', cur.x, cur.y + 4);
  x.globalAlpha = 1;
  if (stale) {
    x.fillStyle = '#8b6f47'; x.font = '10px system-ui';
    x.fillText('신호 지연', cur.x, cur.y - 16);
  }
}

/* ============================================================
   모달
   ============================================================ */
function openModal(title, html, cls) {
  ui.modal = title;
  $('modal').className = 'modal open' + (cls ? ' ' + cls : '');
  $('modal-body').innerHTML =
    `<div class="m-head"><h3>${esc(title)}</h3><button class="x" onclick="closeModal()">✕</button></div>${html}`;
  afterRender();
}
function closeModal() { ui.modal = null; ui.hpId = null; ui.hpTab = 'info'; ui.reviewsOpen = false; $('modal').className = 'modal'; render(); }

function showPhoto(key, title) {
  const src = getBlob(key);
  openModal(title || '이미지', src
    ? `<img class="full-img" src="${src}" alt="${esc(title)}">
       <div class="dim sm mt8">프로그램이 생성한 시뮬레이션 증빙입니다. 실제 촬영본이 아닙니다.</div>`
    : `<div class="dim center pad8">이미지를 찾을 수 없습니다.<br>사진은 기기 메모리에만 보관되어 새로고침하면 사라집니다.</div>`);
}

/* ── 평판 프로필 렌더 조각(재사용) ─────────────────────────── */
function tierBadge(tier) {
  return `<span class="tier-badge" style="--tc:${tier.color}">${tier.icon} ${esc(tier.label)}</span>`;
}
function starStr(n) { const s = Math.max(0, Math.min(5, Math.round(n))); return '★★★★★'.slice(0, s) + '<span class="st-off">' + '★★★★★'.slice(s) + '</span>'; }
function timeAgo(ts) {
  const d = Math.max(0, Math.floor((Date.now() - ts) / 86400000));
  if (d <= 0) return '오늘'; if (d === 1) return '어제'; if (d < 7) return `${d}일 전`;
  if (d < 30) return `${Math.floor(d / 7)}주 전`; if (d < 365) return `${Math.floor(d / 30)}개월 전`;
  return `${Math.floor(d / 365)}년 전`;
}
function metricsGridHtml(m) {
  if (!m) return '';
  const cell = (v, label) => `<div class="mx-cell"><b>${v}</b><span>${label}</span></div>`;
  return `<div class="mx-grid">
    ${cell(m.onTime + '%', '정시 도착률')}
    ${cell(m.accept + '%', '수락률')}
    ${cell(m.completion + '%', '완료율')}
    ${cell(m.repeat + '%', '재의뢰율')}
    ${cell('~' + m.respSec + '초', '평균 응답')}
    ${cell(m.tenure + '개월', '활동 기간')}
  </div>`;
}
function ratingDistHtml(id) {
  const h = findHelper(id); if (!h) return '';
  const dist = ratingDist(id);
  const maxPct = Math.max(1, ...dist.map(d => d.pct));
  return `<div class="rdist">
    <div class="rdist-head"><b class="rdist-avg">${h.rating.toFixed(2)}</b><div class="rdist-sub">${starStr(h.rating)}<div class="dim sm">${h.jobs}건 평가</div></div></div>
    <div class="rdist-bars">${dist.map(d => `<div class="rd-row"><span class="rd-k">${d.star}★</span>
      <div class="rd-bar"><i style="width:${(d.pct / maxPct * 100).toFixed(0)}%"></i></div>
      <span class="rd-v">${d.pct}%</span></div>`).join('')}</div>
  </div>`;
}
function reviewCardHtml(r) {
  const cat = findCat(r.catId);
  const tagChips = (r.tags || []).map(id => { const t = findReviewTag(id); return t ? `<span class="rv-tag">${t.icon} ${esc(t.label)}</span>` : ''; }).join('');
  return `<div class="rv-card${r.mine ? ' mine' : ''}">
    <div class="rv-card-top">
      <span class="rv-st">${starStr(r.stars)}</span>
      <span class="rv-meta">${cat.icon} ${esc(cat.name)} · ${esc(r.reviewer)} · ${timeAgo(r.at)}</span>
    </div>
    ${r.text ? `<div class="rv-text">${esc(r.text)}</div>` : ''}
    ${tagChips ? `<div class="rv-tagrow">${tagChips}</div>` : ''}
    ${r.mine ? '<span class="rv-mine-badge">내가 남긴 후기</span>' : ''}
  </div>`;
}
function reviewListHtml(reviews, opts) {
  opts = opts || {};
  if (!reviews.length) return `<div class="dim center pad8">아직 공개된 후기가 없습니다.<br>이중맹검 기간이 끝나면 후기가 공개됩니다.</div>`;
  const shownN = ui.reviewsOpen ? reviews.length : Math.min(3, reviews.length);
  const cards = reviews.slice(0, shownN).map(reviewCardHtml).join('');
  const more = reviews.length > 3
    ? `<button class="rv-more" onclick="toggleReviews()">${ui.reviewsOpen ? '접기 ▲' : `후기 ${reviews.length}개 모두 보기 ▼`}</button>`
    : '';
  const note = opts.note ? `<div class="dim sm mt8">${esc(opts.note)}</div>` : '';
  return `<div class="rv-list">${cards}</div>${more}${note}`;
}
function toggleReviews() { ui.reviewsOpen = !ui.reviewsOpen; if (ui.hpId) showHelper(ui.hpId); else render(); }

function setHpTab(t) { ui.hpTab = t; ui.reviewsOpen = false; if (ui.hpId) showHelper(ui.hpId); }

function showHelper(id) {
  const h = findHelper(id); if (!h) return;
  ui.hpId = id;
  const s = sanctionOf(id);
  const rep = helperReps[id] || { count: 0, completed: 0, disputes: 0 };
  const tier = helperTier(id);
  const m = helperMetrics(id);
  const reviews = helperReviews(id);
  const suspended = isSuspended(id);

  const header = `
    <div class="hp-top">
      <div class="ava xl">${h.avatar}</div>
      <div class="hp-id">
        <div class="hp-name">${esc(h.name)} <span class="dim">${h.gender}·${h.age}세</span></div>
        <div class="hp-badges">${suspended ? `<span class="tier-badge susp">🚫 활동정지</span>` : tierBadge(tier)}
          ${h.idVerified ? '<span class="verified">✓ 신원확인</span>' : ''}</div>
        <div class="dim sm mt4">⭐ ${h.rating} · 누적 ${h.jobs}건 · ${esc(h.vehicle)} · ${esc(h.joined)} 가입</div>
      </div>
    </div>
    <div class="hp-tier-note dim sm">${tier.icon} ${esc(tier.label)} 등급 · ${esc(tier.desc)}</div>
    <div class="hp-tabs">
      <button class="hp-tab ${ui.hpTab === 'info' ? 'on' : ''}" data-hptab="info" onclick="setHpTab('info')">프로필</button>
      <button class="hp-tab ${ui.hpTab === 'reviews' ? 'on' : ''}" data-hptab="reviews" onclick="setHpTab('reviews')">후기 ${reviews.length}</button>
    </div>`;

  let body;
  if (ui.hpTab === 'reviews') {
    body = `${ratingDistHtml(id)}
      ${reviewListHtml(reviews, { note: '후기는 이중맹검(양측 제출·기한 만료 후 공개) 방식으로 수집되며, 프로그램이 생성한 시뮬레이션 후기와 회원님이 남긴 실제 후기가 함께 표시됩니다.' })}`;
  } else {
    body = `
      <div class="hp-intro">"${esc(h.intro)}"</div>
      ${metricsGridHtml(m)}
      ${tagCloudHtml(id)}
      <div class="verify-list">
        <div class="v-row done"><b>✓ 신분증 확인</b><span>실명 확인 완료</span></div>
        <div class="v-row done"><b>✓ 백그라운드 체크</b><span>${esc(h.bgCheck)}</span></div>
        <div class="v-row done"><b>✓ 헬퍼 자격 테스트</b><span>${h.quiz}점 통과</span></div>
      </div>
      <div class="stat-row">
        <div class="stat"><b>${rep.completed || 0}</b><span>내 요청 완료</span></div>
        <div class="stat"><b>${rep.count || 0}</b><span>내가 준 평가</span></div>
        <div class="stat"><b>${(disputeRate(id) * 100).toFixed(0)}%</b><span>분쟁률</span></div>
      </div>
      ${suspended ? `<div class="sanction">🚫 현재 ${s.permanent ? '영구' : '30일'} 활동정지 — 매칭 풀에서 제외됨</div>` : ''}
      ${(s.log || []).length ? `<div class="sanction-log"><b>제재 이력</b>${s.log.map(l =>
        `<div>${new Date(l.at).toLocaleDateString('ko-KR')} · ${esc(SANCTIONS[l.kind] ? SANCTIONS[l.kind].label : l.kind)} — ${esc(l.why)}</div>`).join('')}</div>` : ''}
      <div class="dim sm">전문 분야: ${h.cats.map(c => esc(findCat(c).name)).join(' · ')}</div>`;
  }
  openModal(h.name + ' 헬퍼', header + body);
}

function tagCloudHtml(helperId) {
  const cloud = helperTagCloud(helperId);
  if (!cloud.length) return '';
  const max = cloud[0].count;
  return `<div class="tagcloud">
    <div class="tc-head">최근 받은 칭찬</div>
    <div class="tc-body">${cloud.slice(0, 6).map(c =>
      `<span class="tc ${c.mine ? 'mine' : ''}" style="--w:${Math.max(0.4, c.count / max).toFixed(2)}">
        ${c.tag.icon} ${esc(c.tag.label)} <b>${c.count}</b>${c.mine ? '<i class="tc-me">내 평가</i>' : ''}</span>`).join('')}</div>
  </div>`;
}

/* ── 채팅 ───────────────────────────────────────────────────── */
function openChat(jobId) {
  const job = findJob(jobId); if (!job) return;
  ui._chatJob = jobId;
  openModal('채팅', `
    <div class="chat-note">전화번호는 양측 모두에게 공개되지 않습니다. 앱 안에서만 연락하세요.</div>
    <div id="chat-body" class="chat-body">${chatHtml(job)}</div>
    <div class="chat-in">
      <input id="chat-input" placeholder="메시지를 입력하세요" onkeydown="if(event.key==='Enter')sendMsg()">
      <button class="primary" onclick="sendMsg()">전송</button>
    </div>
    <div class="dim sm">${esc(POLICY.bypassBan)}</div>
  `, 'chat');
  const b = $('chat-body'); if (b) b.scrollTop = b.scrollHeight;
}
function chatHtml(job) {
  if (job.chat.length === 0) return '<div class="dim center pad8">아직 메시지가 없습니다.</div>';
  return job.chat.map(c => `<div class="msg ${c.from}">
    ${c.from === 'system' ? `<div class="sys">${esc(c.text)}</div>`
      : `<div class="bub">${esc(c.text)}</div><div class="ts">${fmtTime(c.at)}</div>`}
  </div>`).join('');
}
function sendMsg() {
  const job = findJob(ui._chatJob); if (!job) return;
  const inp = $('chat-input'); if (!inp) return;
  const v = (inp.value || '').trim();
  if (!v) return;
  const warned = sendChat(job, 'me', v);
  inp.value = '';
  const b = $('chat-body');
  if (b) { b.innerHTML = chatHtml(job); b.scrollTop = b.scrollHeight; }
  if (warned) toast('연락처·직접 결제 관련 내용은 자동으로 가려집니다', 'bad');
  if (job.side === 'requester' && job.helperId) {
    helperReply(job);
    setTimeout(() => {
      const bb = $('chat-body');
      if (bb && ui.modal === '채팅') { bb.innerHTML = chatHtml(job); bb.scrollTop = bb.scrollHeight; }
    }, 1100);
  }
}

/* ── 신고 ───────────────────────────────────────────────────── */
function openReport(jobId) {
  ui._reportJob = jobId;
  openModal('신고하기', `
    <div class="dim sm mb8">접수된 신고는 안전팀이 확인한 뒤 등급에 따라 제재를 집행합니다.</div>
    ${REPORT_REASONS.map(r => `<button class="report-row" onclick="doReport('${r.id}')">
      <b>${esc(r.label)}</b>
      <span class="dim sm">조치 · ${esc(SANCTIONS[r.sanction].label)} — ${esc(SANCTIONS[r.sanction].desc)}</span>
    </button>`).join('')}
    <textarea id="report-memo" rows="2" placeholder="상황을 적어주세요 (선택)"></textarea>
  `);
}
function doReport(reasonId) {
  const job = findJob(ui._reportJob); if (!job) return;
  const memoEl = $('report-memo');
  const r = reportHelper(job, reasonId, memoEl ? memoEl.value : '');
  closeModal();
  if (!r) return;
  toast(`신고 접수 · 안전팀 확인 완료 → ${r.result ? SANCTIONS[r.result.kind].label : '기록됨'}`, 'bad');
  render();
}

/* ── 이의제기 ───────────────────────────────────────────────── */
function openDisputeModal(jobId) {
  ui._dispJob = jobId;
  openModal('이의제기', `
    <div class="dim sm mb8">이의제기를 하면 지급이 즉시 중단되고 자금이 동결됩니다. 양측 증거를 모아 운영팀이 심사합니다.</div>
    <label>사유</label>
    <select id="disp-reason">
      <option>일부만 수행됨</option>
      <option>요청 내용과 다르게 수행됨</option>
      <option>물품 파손·분실</option>
      <option>수행하지 않았는데 완료 처리됨</option>
    </select>
    <label>요청 항목 중 실제로 완료된 개수</label>
    <div class="row-2">
      <input id="disp-done" type="number" min="0" value="2">
      <input id="disp-total" type="number" min="1" value="3">
    </div>
    <div class="dim sm">부분 이행은 심부름에서 흔한 경우입니다. 이행 비율만큼만 지급되고 나머지는 환불됩니다.</div>
    <label>상황 설명</label>
    <textarea id="disp-claim" rows="2" placeholder="무엇이 어떻게 달랐는지 적어주세요"></textarea>
    <button class="warn block" onclick="doDispute()">이의제기 접수 (자금 동결)</button>
  `);
}
function doDispute() {
  const job = findJob(ui._dispJob); if (!job) return;
  const reasonEl = $('disp-reason'), doneEl = $('disp-done'), totalEl = $('disp-total'), claimEl = $('disp-claim');
  const total = Math.max(1, parseInt(totalEl ? totalEl.value : 1) || 1);
  const done = Math.min(total, Math.max(0, parseInt(doneEl ? doneEl.value : 0) || 0));
  if (!openDispute(job, reasonEl ? reasonEl.value : '기타', claimEl ? claimEl.value : '', done, total)) {
    toast('지금은 이의제기할 수 없는 상태예요'); return;
  }
  closeModal();
  toast('이의제기 접수 · 자금이 동결되었습니다', 'bad');
  render();
}
function addEvidence(jobId) {
  pickPhoto(key => {
    const job = findJob(jobId); if (!job) return;
    attachDisputeEvidence(job, key);
    toast('증거 사진이 첨부되었습니다', 'ok');
    render();
  });
}

/* ── POD 제출 (헬퍼 측) ─────────────────────────────────────── */
function openPodModal(jobId) {
  ui._podJob = jobId;
  ui._podPhoto = null;
  openModal('완료 증빙 제출', `
    <div class="dim sm mb8">사진 · 전자서명 · 시각 · GPS 좌표가 함께 기록됩니다. 이 증빙이 제출되어야 에스크로가 해제됩니다.</div>
    <button class="ghost block" onclick="podPhoto()">📷 완료 사진 촬영·선택</button>
    <div id="pod-photo-slot"></div>
    <label>요청자 서명</label>
    <canvas data-sig class="sigpad" width="640" height="200"></canvas>
    <div class="row-2">
      <button class="ghost" onclick="clearSig()">서명 지우기</button>
      <button class="ghost" onclick="usePresetSig()">서명 예시 넣기</button>
    </div>
    <label>메모</label>
    <textarea id="pod-note" rows="2" placeholder="완료 상태를 간단히 적어주세요"></textarea>
    <button class="primary block" onclick="doSubmitPod()">증빙 제출하고 정산 요청</button>
  `);
}
function podPhoto() {
  pickPhoto(key => {
    ui._podPhoto = key;
    const slot = $('pod-photo-slot');
    if (slot) slot.innerHTML = `<img class="full-img mt8" src="${getBlob(key)}" alt="완료 사진">`;
  });
}
function doSubmitPod() {
  const job = findJob(ui._podJob); if (!job) return;
  const sigCanvas = document.querySelector('canvas[data-sig]');
  if (!ui._podPhoto) { toast('완료 사진이 필요합니다', 'bad'); return; }
  if (!sigCanvas || sigCanvas.dataset.drawn !== '1') { toast('요청자 서명이 필요합니다', 'bad'); return; }
  const noteEl = $('pod-note');
  submitPOD(job, {
    photoKey: ui._podPhoto,
    sigKey: putBlob(sigCanvas.toDataURL('image/png')),
    note: noteEl ? noteEl.value : '',
  });
  closeModal();
  toast('증빙 제출 완료 · 보류기간 후 수익금이 적립됩니다', 'ok');
  render();
}

/* 서명 패드 */
function initSignaturePad(c) {
  if (c.dataset.init === '1') return;
  c.dataset.init = '1';
  const x = c.getContext('2d');
  x.fillStyle = '#f5f1e6'; x.fillRect(0, 0, c.width, c.height);
  x.strokeStyle = '#1a1712'; x.lineWidth = 3; x.lineCap = 'round'; x.lineJoin = 'round';
  let drawing = false;
  const pos = e => {
    const r = c.getBoundingClientRect();
    const p = e.touches ? e.touches[0] : e;
    return { x: (p.clientX - r.left) * (c.width / r.width), y: (p.clientY - r.top) * (c.height / r.height) };
  };
  const start = e => { e.preventDefault(); drawing = true; const p = pos(e); x.beginPath(); x.moveTo(p.x, p.y); };
  const move = e => { if (!drawing) return; e.preventDefault(); const p = pos(e); x.lineTo(p.x, p.y); x.stroke(); c.dataset.drawn = '1'; };
  const end = () => { drawing = false; };
  c.addEventListener('mousedown', start);
  c.addEventListener('mousemove', move);
  window.addEventListener('mouseup', end);
  c.addEventListener('touchstart', start, { passive: false });
  c.addEventListener('touchmove', move, { passive: false });
  c.addEventListener('touchend', end);
}
function clearSig() {
  const c = document.querySelector('canvas[data-sig]'); if (!c) return;
  const x = c.getContext('2d');
  x.fillStyle = '#f5f1e6'; x.fillRect(0, 0, c.width, c.height);
  c.dataset.drawn = '';
}
function usePresetSig() {
  const c = document.querySelector('canvas[data-sig]'); if (!c) return;
  const x = c.getContext('2d');
  x.fillStyle = '#f5f1e6'; x.fillRect(0, 0, c.width, c.height);
  x.strokeStyle = '#1a1712'; x.lineWidth = 3.5; x.lineCap = 'round';
  x.beginPath(); x.moveTo(80, 140);
  x.bezierCurveTo(160, 40, 220, 170, 300, 90);
  x.bezierCurveTo(360, 40, 420, 160, 520, 100);
  x.stroke();
  c.dataset.drawn = '1';
}

/* ── 결과 카드 + 공유 ───────────────────────────────────────── */
function showResult(job, s) {
  const h = job.helperId ? findHelper(job.helperId) : null;
  openModal('정산 완료', `
    <div class="result">
      <div class="r-icon">${findCat(job.cat).icon}</div>
      <div class="r-amount">${s.gross}c</div>
      <div class="dim">${h ? esc(h.name) + ' 헬퍼에게 지급' : '지급 완료'}</div>
      ${s.bonus ? `<div class="r-bonus">완료 보너스 +${s.bonus}c<div class="dim sm">확률 ${BONUS_ODDS_LABEL}</div></div>` : ''}
      <div class="dim sm mt8">후기는 양측이 모두 작성하거나 기한이 지나면 동시에 공개됩니다.</div>
      <button class="primary block" onclick="shareJob('${job.id}')">공유하기</button>
    </div>`);
}
function shareJob(jobId) {
  const job = findJob(jobId);
  if (!job) return;
  const cat = findCat(job.cat);
  const text = `${cat.icon} ${cat.name} 심부름 완료 — Errand에서 ${job.agreedCost || job.cost}c로 해결했어요.`;
  const url = location.href.split('?')[0] + '?ref=share';
  if (window.legionTrack) window.legionTrack('share', { cat: job.cat });
  if (navigator.share) {
    navigator.share({ title: 'Errand', text, url }).catch(() => {});
  } else if (navigator.clipboard) {
    navigator.clipboard.writeText(text + ' ' + url).then(() => toast('공유 문구를 복사했어요', 'ok'));
  } else {
    toast('이 브라우저는 공유를 지원하지 않아요');
  }
}

/* ── 사진 선택 (다운스케일 후 메모리 보관) ─────────────────── */
function pickPhoto(cb) {
  const inp = document.createElement('input');
  inp.type = 'file'; inp.accept = 'image/*';
  inp.onchange = () => {
    const f = inp.files && inp.files[0];
    if (!f) return;
    const fr = new FileReader();
    fr.onload = () => {
      const img = new Image();
      img.onload = () => {
        const max = 720;
        const s = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        cb(putBlob(c.toDataURL('image/jpeg', 0.75)));
      };
      img.src = fr.result;
    };
    fr.readAsDataURL(f);
  };
  inp.click();
}
function attachPhoto() { pickPhoto(key => { ui.draft.photoKey = key; render(); }); }

/* ── 음성 입력 ──────────────────────────────────────────────── */
function recordVoice() {
  const d = $('desc'); if (!d) return;
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (SR) {
    const r = new SR();
    r.lang = 'ko-KR'; r.interimResults = false;
    toast('말씀하세요…');
    r.onresult = e => {
      d.value = (d.value ? d.value + ' ' : '') + e.results[0][0].transcript;
      ui.draft.desc = d.value;
      toast('입력됐어요', 'ok');
    };
    r.onerror = () => toast('음성 인식을 사용할 수 없어요');
    r.start();
    return;
  }
  if (!navigator.mediaDevices) { toast('이 브라우저는 음성 입력을 지원하지 않아요'); return; }
  navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
    toast('녹음 중… 4초');
    const mr = new MediaRecorder(stream);
    mr.onstop = () => {
      stream.getTracks().forEach(t => t.stop());
      d.value = (d.value ? d.value + ' ' : '') + '(음성 메모 첨부됨)';
      ui.draft.desc = d.value;
      toast('음성 메모가 첨부됐어요', 'ok');
    };
    mr.start();
    setTimeout(() => mr.stop(), 4000);
  }).catch(() => toast('마이크 권한이 필요해요'));
}

/* ============================================================
   엔진 → 화면 연결
   ============================================================ */
function onEngineUpdate() {
  if (ui.modal === '채팅' && ui._chatJob) {
    const j = findJob(ui._chatJob);
    const b = $('chat-body');
    if (j && b) {
      const atBottom = b.scrollTop + b.clientHeight >= b.scrollHeight - 10;
      b.innerHTML = chatHtml(j);
      if (atBottom) b.scrollTop = b.scrollHeight;
    }
  }
  if (ui.modal) return;   // 모달이 열려 있으면 뒤 화면은 그대로 둔다
  if (document.activeElement && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) {
    // 입력 중에는 DOM을 다시 그리지 않고 지도만 갱신한다
    document.querySelectorAll('canvas[data-map]').forEach(c => {
      const j = findJob(c.getAttribute('data-map')); if (j) drawMap(c, j);
    });
    return;
  }
  if (['home', 'myjobs', 'queue'].indexOf(ui.view) >= 0) render();
}

function init() {
  /* 표시와 코드가 어긋나면 즉시 드러나도록 합계를 검증한다 */
  if (Math.abs(FEE_BUYS_SUM - 1) > 0.001) console.warn('FEE_BUYS 합계 이상:', FEE_BUYS_SUM);
  const probSum = BONUS_TABLE.reduce((s, t) => s + t.prob, 0);
  if (Math.abs(probSum - 1) > 0.001) console.warn('BONUS_TABLE 확률 합 이상:', probSum);

  initLocation();
  startEngine();
  render();
}
window.onload = init;

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});

/* LEGION_WAVE_88_wave_stamp */ /* ship wave 88 2026-07-21T07:44:13 */
