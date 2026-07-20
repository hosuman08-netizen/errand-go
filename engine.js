/* ============================================================
   Errand — 엔진 (경제 원장 · 매칭 · 생애주기 상태머신 · 분쟁 · 안전)
   UI를 전혀 모른다. 상태를 바꾸고 이벤트를 남기는 일만 한다.
   ============================================================ */

/* 체험 압축: 실제 1분을 1초로 재생한다. 표시 ETA는 항상 '실제 분'과 '체험 초'를 함께 쓴다. */
const TIME_COMPRESS = 60;
/* 헬퍼 배치 좌표 스케일 — 긴급도 반경(20/30km)이 실제로 후보를 갈라내도록 벌려 놓는다. */
const OFFSET_SCALE = 16;
/* 카테고리별 표준 수행 시간(분) — 세부유형(sub.wm)이 있으면 그 값이 우선한다. */
const WORK_MIN = { delivery: 15, move: 45, clean: 60, assemble: 40, pest: 10, pet: 30, wait: 35, etc: 25 };
function workMinFor(job) {
  const s = job.sub ? findSub(job.cat, job.sub) : null;
  return (s && s.wm) || WORK_MIN[job.cat] || 25;
}

/* ── 저장소 ───────────────────────────────────────────────── */
const LS = {
  jobs: 'p7v2_jobs', econ: 'p7v2_econ', reps: 'p7v2_reps',
  sanctions: 'p7v2_sanctions', history: 'p7v2_history', charges: 'p7v2_charges',
};
function load(key, fallback) {
  try { const v = JSON.parse(localStorage.getItem(key)); return v === null || v === undefined ? fallback : v; }
  catch (e) { return fallback; }
}
function save(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { /* 용량 초과 시 조용히 포기 */ }
}

/* 사진·서명은 용량이 크므로 브라우저 메모리에만 둔다(저장하지 않음).
   대신 제출 시각·좌표·무결성 해시는 영구 기록되어 분쟁 증거로 남는다. */
const BLOBS = Object.create(null);
function putBlob(dataUrl) {
  const key = 'b' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  BLOBS[key] = dataUrl;
  return key;
}
function getBlob(key) { return key ? BLOBS[key] || null : null; }
function hashOf(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(16).padStart(8, '0').toUpperCase();
}

/* ── 결정론적 난수 (심부름 id 기반) ─────────────────────────
   같은 공고는 항상 같은 전개를 보인다. 새로고침마다 값이 튀는 가짜를 만들지 않는다. */
function rngFor(id) {
  let s = 0; for (let i = 0; i < id.length; i++) { s ^= id.charCodeAt(i); s = Math.imul(s, 16777619) >>> 0; }
  return function () { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}

/* ── 경제 상태 ───────────────────────────────────────────────
   코인은 발행되지 않고 이동만 한다.
   지갑 → 에스크로 → (헬퍼 수익금 | 환불) → 인출 시 수수료 공제.          */
let econ = load(LS.econ, {
  coins: 42, escrow: 0, earnings: 0, cumWithdrawn: 0, ledger: [],
});
if (typeof econ.earnings !== 'number') econ.earnings = 0;
if (typeof econ.cumWithdrawn !== 'number') econ.cumWithdrawn = 0;
if (!Array.isArray(econ.ledger)) econ.ledger = [];

function saveEcon() { econ.ledger = econ.ledger.slice(0, 80); save(LS.econ, econ); }

function postLedger(kind, delta, note) {
  econ.ledger.unshift({
    kind, delta, note: note || '',
    coins: econ.coins, escrow: econ.escrow, earnings: econ.earnings,
    time: Date.now(),
  });
  saveEcon();
}

/* 코인 이동 원자 연산 — 모든 자금 흐름은 이 세 함수만 통과한다. */
function moveToEscrow(amount, note) {
  if (amount > econ.coins) return false;
  econ.coins -= amount; econ.escrow += amount;
  postLedger('escrow', -amount, note);
  return true;
}
function refundFromEscrow(amount, note) {
  const a = Math.min(amount, econ.escrow);
  econ.escrow -= a; econ.coins += a;
  postLedger('refund', +a, note);
  return a;
}
function releaseFromEscrow(amount, note) {  // 에스크로 → 헬퍼 수익금 (내가 헬퍼일 땐 내 수익금)
  const a = Math.min(amount, econ.escrow);
  econ.escrow -= a;
  postLedger('release', -a, note);
  return a;
}
function creditEarnings(amount, note) {
  econ.earnings += amount;
  postLedger('earn', +amount, note);
}

/* ── 평판 (내 별점이 실제 평점·수행건수를 움직인다) ────────── */
let helperReps = load(LS.reps, {});
function applyReps() {
  HELPERS.forEach(h => {
    if (h._baseRating === undefined) { h._baseRating = h.rating; h._baseJobs = h.jobs; }
    const r = helperReps[h.id];
    if (r && r.count > 0) {
      const baseW = 20; // 초기 평점을 20건 표본으로 두고 내 별점을 누적 → 급변 없이 실제 이동
      h.rating = +(((h._baseRating * baseW) + r.sumStars) / (baseW + r.count)).toFixed(2);
      h.jobs = h._baseJobs + r.count;
    } else {
      h.rating = h._baseRating; h.jobs = h._baseJobs;
    }
    h.disputes = (r && r.disputes) || 0;
    h.completed = (r && r.completed) || 0;
  });
}
applyReps();

function recordRating(helperId, stars, tags) {
  const r = helperReps[helperId] || { sumStars: 0, count: 0, disputes: 0, completed: 0 };
  r.sumStars += stars; r.count += 1;
  if (Array.isArray(tags) && tags.length) {
    r.tags = r.tags || {};
    tags.forEach(t => { r.tags[t] = (r.tags[t] || 0) + 1; });
  }
  helperReps[helperId] = r; save(LS.reps, helperReps); applyReps();
  return findHelper(helperId);
}
/* 헬퍼의 누적 평판 칭찬 시드 — 수행건수를 상위 3개 태그에 결정적으로 분배한다.
   (실제 서비스의 '지난 후기 요약'에 해당. id 기반이라 새로고침해도 불변) */
function tagSeedFor(helperId) {
  const h = findHelper(helperId); if (!h) return {};
  const ids = REVIEW_TAGS.map(t => t.id);
  const rnd = rngFor(helperId + 'tags');
  const picks = [];
  const pool = ids.slice();
  for (let i = 0; i < 3 && pool.length; i++) picks.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0]);
  const seed = {};
  const base = Math.round((h._baseJobs || h.jobs) * 0.55); // 절반 남짓이 태그를 남겼다고 가정
  const weights = [0.5, 0.32, 0.18];
  picks.forEach((id, i) => { seed[id] = Math.max(1, Math.round(base * weights[i])); });
  return seed;
}
/* 헬퍼가 받은 칭찬 태그를 많은 순으로 반환 → 프로필의 '최근 받은 칭찬'
   = 누적 평판 시드 + 내가 직접 남긴 태그(강조 표시). */
function helperTagCloud(helperId) {
  const seed = tagSeedFor(helperId);
  const mine = (helperReps[helperId] && helperReps[helperId].tags) || {};
  const merged = {};
  Object.keys(seed).forEach(id => { merged[id] = seed[id]; });
  Object.keys(mine).forEach(id => { merged[id] = (merged[id] || 0) + mine[id]; });
  return Object.keys(merged)
    .map(id => ({ tag: findReviewTag(id), count: merged[id], mine: (mine[id] || 0) > 0 }))
    .filter(x => x.tag)
    .sort((a, b) => b.count - a.count);
}
function recordCompletion(helperId) {
  const r = helperReps[helperId] || { sumStars: 0, count: 0, disputes: 0, completed: 0 };
  r.completed = (r.completed || 0) + 1;
  helperReps[helperId] = r; save(LS.reps, helperReps); applyReps();
}
function recordDispute(helperId) {
  const r = helperReps[helperId] || { sumStars: 0, count: 0, disputes: 0, completed: 0 };
  r.disputes = (r.disputes || 0) + 1;
  helperReps[helperId] = r; save(LS.reps, helperReps); applyReps();
  checkAutoSuspend(helperId);
}
function disputeRate(helperId) {
  const h = findHelper(helperId); if (!h) return 0;
  const r = helperReps[helperId] || { disputes: 0, completed: 0 };
  const total = (r.completed || 0);
  if (total === 0) return 0;
  return (r.disputes || 0) / total;
}

/* ── 제재 원장 ───────────────────────────────────────────────
   신고 → 안전팀 심사 → 등급별 제재. 정지된 헬퍼는 매칭 풀에서 즉시 빠진다. */
let sanctions = load(LS.sanctions, {});   // helperId -> { warns, until, permanent, log:[] }
function sanctionOf(id) { return sanctions[id] || { warns: 0, until: 0, permanent: false, log: [] }; }
function isSuspended(id) {
  const s = sanctionOf(id);
  return s.permanent || (s.until && s.until > Date.now());
}
function applySanction(helperId, kind, why) {
  const s = sanctionOf(helperId);
  if (kind === 'warn') {
    s.warns = (s.warns || 0) + 1;
    if (s.warns >= 3) { s.until = Date.now() + 30 * 86400000; s.warns = 0; kind = 'suspend30'; }
  } else if (kind === 'suspend30') {
    s.until = Date.now() + 30 * 86400000;
  } else if (kind === 'permanent') {
    s.permanent = true;
  }
  s.log = (s.log || []).concat([{ kind, why, at: Date.now() }]).slice(-8);
  sanctions[helperId] = s; save(LS.sanctions, sanctions);
  return { kind, sanction: SANCTIONS[kind] };
}
function checkAutoSuspend(helperId) {
  const r = helperReps[helperId] || { completed: 0, disputes: 0 };
  if ((r.completed || 0) >= DISPUTE_AUTO_SUSPEND.minJobs &&
      disputeRate(helperId) > DISPUTE_AUTO_SUSPEND.rate &&
      !isSuspended(helperId)) {
    applySanction(helperId, 'suspend30', `분쟁률 ${(disputeRate(helperId) * 100).toFixed(0)}% — 임계치 ${(DISPUTE_AUTO_SUSPEND.rate * 100)}% 초과 자동 정지`);
    return true;
  }
  return false;
}

/* ── 심부름 저장소 ──────────────────────────────────────────── */
let jobs = load(LS.jobs, []);
let history = load(LS.history, []);
function saveJobs() {
  // 함수·타이머·큰 blob은 저장하지 않는다(_로 시작하는 필드 제외)
  save(LS.jobs, jobs.map(j => {
    const o = {};
    for (const k in j) if (k.charAt(0) !== '_') o[k] = j[k];
    return o;
  }));
}
function saveHistory() { history = history.slice(0, 40); save(LS.history, history); }
function findJob(id) { return jobs.find(j => j.id === id) || null; }
function activeJobs() { return jobs.filter(j => !isTerminal(j.status)); }
function isTerminal(s) { return s === 'settled' || s === 'resolved' || s === 'expired' || s === 'cancelled'; }

/* ── 거리 계산 ───────────────────────────────────────────────── */
function distanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
function helperPos(h, job) {
  return { lat: job.lat + h.latOff * OFFSET_SCALE, lng: job.lng + h.lngOff * OFFSET_SCALE };
}
/* 반경·카테고리·제재를 모두 통과한 후보만 반환. ETA 오름차순. */
function eligibleHelpers(job) {
  const mode = URGENCY_MODES[job.urgency];
  return HELPERS
    .filter(h => !isSuspended(h.id))
    .map(h => {
      const p = helperPos(h, job);
      const distKm = distanceKm(p.lat, p.lng, job.lat, job.lng);
      const etaMin = Math.max(1, Math.round((distKm / h.speedKmH) * 60));
      const skilled = h.cats.indexOf(job.cat) >= 0;
      return { h, pos: p, distKm, etaMin, skilled };
    })
    .filter(c => c.distKm <= mode.radiusKm)
    .sort((a, b) => (b.skilled - a.skilled) || (a.etaMin - b.etaMin));
}

/* ── 심부름 생성 ─────────────────────────────────────────────── */
function createJob(input) {
  const id = 'j' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const mode = URGENCY_MODES[input.urgency] || URGENCY_MODES.normal;
  const job = {
    id, side: 'requester', cat: input.cat, sub: input.sub || null, desc: input.desc,
    photoKey: input.photoKey || null, photoHash: input.photoKey ? hashOf(getBlob(input.photoKey) || id) : null,
    cost: input.cost, priceMode: input.priceMode, urgency: input.urgency,
    lat: input.lat, lng: input.lng,
    createdAt: Date.now(), status: 'screening', statusAt: Date.now(),
    applicants: [], helperId: null, agreedCost: null,
    chat: [], reports: [], events: [],
    radiusKm: mode.radiusKm, matchMode: mode.mode, cap: mode.cap,
  };
  pushEvent(job, `공고 접수 · 자동 심사 시작 (${SIM.screenRealLabel} 소요, ${simNote(SIM.screenRealLabel, SIM.screenSec)})`);
  jobs.unshift(job);
  saveJobs();
  return job;
}
function pushEvent(job, text) {
  job.events = (job.events || []).concat([{ text, at: Date.now() }]).slice(-30);
}
function setStatus(job, status, note) {
  job.status = status; job.statusAt = Date.now();
  pushEvent(job, note || STATES[status].label);
  saveJobs();
}

/* ── 채팅 (번호 비노출 마스킹 + 우회결제 차단) ────────────────
   연락처·계좌를 쓰면 마스킹하고 경고를 남긴다. 채팅 로그는 분쟁의 1차 증거다. */
const PHONE_RE = /(01[016-9])[-\s.]?(\d{3,4})[-\s.]?(\d{4})/g;
const ACCOUNT_RE = /(\d{2,3}[-\s]\d{2,6}[-\s]\d{2,6})/g;
const BYPASS_RE = /(계좌|현금|직거래|송금|만나서\s*드릴|따로\s*드릴|카톡|텔레그램)/;
function sanitizeMessage(text) {
  let masked = String(text).replace(PHONE_RE, '010-****-****').replace(ACCOUNT_RE, '***-****-****');
  const warn = masked !== String(text) || BYPASS_RE.test(text);
  return { text: masked, warn };
}
function sendChat(job, from, text) {
  const clean = sanitizeMessage(text);
  job.chat.push({ from, text: clean.text, at: Date.now() });
  if (clean.warn) {
    job.chat.push({ from: 'system', at: Date.now(),
      text: '연락처·계좌 정보는 자동으로 가려집니다. ' + POLICY.bypassBan });
  }
  job.chat = job.chat.slice(-60);
  saveJobs();
  return clean.warn;
}
/* 헬퍼 자동 응답 — 상태에 근거한 답만 한다(무작위 잡담 아님) */
function helperReply(job) {
  const h = findHelper(job.helperId); if (!h) return;
  const byState = {
    assigned: '네 확인했습니다. 지금 출발할게요.',
    enroute: `이동 중입니다. ${remainMin(job)}분 정도 걸려요.`,
    arrived: '현장 도착했습니다. 어디로 가면 될까요?',
    working: '진행 중입니다. 끝나면 사진으로 알려드릴게요.',
    pod: '완료 증빙 올렸습니다. 확인 부탁드려요.',
    hold: '완료 증빙 올렸습니다. 확인 부탁드려요.',
  };
  const msg = byState[job.status] || '확인했습니다.';
  setTimeout(() => {
    job.chat.push({ from: 'helper', text: msg, at: Date.now() });
    saveJobs();
    if (typeof onEngineUpdate === 'function') onEngineUpdate(job);
  }, 900);
}
function remainMin(job) {
  if (!job.track) return 0;
  return Math.max(1, Math.ceil((job.track.totalSec - elapsedSec(job.track.startedAt)) / 60 * TIME_COMPRESS / 60));
}
function elapsedSec(from) { return (Date.now() - from) / 1000; }

/* ── 매칭: 지원자 접수 (예약형 / 역경매) ───────────────────── */
function addApplicant(job, cand) {
  if (job.applicants.length >= job.cap) return false;
  if (job.applicants.some(a => a.helperId === cand.h.id)) return false;
  /* 역경매 입찰가: 헬퍼별 고정 계수 × 거리 가산. 무작위가 아니라 헬퍼의 성향과 거리에서 나온다. */
  let bid = job.cost;
  if (job.priceMode === 'auction') {
    const distFactor = 1 + Math.min(0.25, cand.distKm / 100);
    bid = Math.max(3, Math.round(job.cost * cand.h.bidFactor * distFactor));
  }
  job.applicants.push({
    helperId: cand.h.id, bid, etaMin: cand.etaMin, distKm: +cand.distKm.toFixed(1),
    skilled: cand.skilled, at: Date.now(),
  });
  pushEvent(job, `${cand.h.name} 지원 (${job.priceMode === 'auction' ? bid + 'c 입찰' : '수락 의사'} · ${cand.etaMin}분)`);
  saveJobs();
  return true;
}

/* ── 배정 ──────────────────────────────────────────────────── */
function assignHelper(job, helperId, agreedCost) {
  const h = findHelper(helperId); if (!h) return false;
  const pos = helperPos(h, job);
  const distKm = distanceKm(pos.lat, pos.lng, job.lat, job.lng);
  const travelMin = Math.max(1, Math.round((distKm / h.speedKmH) * 60));

  /* 역경매 낙찰가가 최초 제시가와 다르면 에스크로 차액을 정산한다(자금과 표시 일치) */
  const finalCost = agreedCost || job.cost;
  if (finalCost > job.cost) {
    const extra = finalCost - job.cost;
    if (econ.coins < extra) return 'insufficient';
    moveToEscrow(extra, `낙찰가 차액 추가 예치 (${job.cost}c → ${finalCost}c)`);
  } else if (finalCost < job.cost) {
    refundFromEscrow(job.cost - finalCost, `낙찰가 차액 환불 (${job.cost}c → ${finalCost}c)`);
  }
  job.agreedCost = finalCost;
  job.helperId = helperId;
  job.applicants = job.applicants.filter(a => a.helperId === helperId);
  job.track = {
    startedAt: Date.now(),
    totalSec: (travelMin * 60) / TIME_COMPRESS,
    travelMin, startDist: distKm,
    origin: pos, raw: { lat: pos.lat, lng: pos.lng }, sm: { lat: pos.lat, lng: pos.lng },
    lastFixAt: Date.now(), path: [{ lat: pos.lat, lng: pos.lng }], stale: false, missCount: 0,
  };
  setStatus(job, 'assigned', `${h.name} 배정 · ${distKm.toFixed(1)}km · 예상 ${travelMin}분`);
  job.chat.push({ from: 'system', at: Date.now(),
    text: `${h.name} 헬퍼와 연결되었습니다. 전화번호는 양쪽 모두에게 공개되지 않습니다.` });
  helperReply(job);
  return true;
}

/* ── 위치 갱신: 시간·거리·이벤트 하이브리드 + 지터 보정 + 미보고 감지 ──
   원시 측위에 노이즈를 섞고 EMA로 편다. 가끔 측위를 건너뛰어 '신호 지연'을 만들되,
   핀은 마지막 위치에 머문다(핀이 튀면 사용자는 즉시 조작을 의심한다).           */
function updateTrack(job) {
  const t = job.track; if (!t) return;
  const prog = Math.min(1, elapsedSec(t.startedAt) / t.totalSec);
  const rnd = job._rng || (job._rng = rngFor(job.id));

  /* 기기 미보고 시뮬: 주기적으로 측위 1회 누락 */
  t.missCount = (t.missCount || 0) + 1;
  const missed = (t.missCount % 17 === 0) && prog < 0.95;
  if (missed) {
    t.stale = elapsedSec(t.lastFixAt) > GPS.staleAfterSec;
    return;
  }

  /* 진짜 위치: 출발점 → 목적지 선형 보간 */
  const trueLat = t.origin.lat + (job.lat - t.origin.lat) * prog;
  const trueLng = t.origin.lng + (job.lng - t.origin.lng) * prog;
  /* 지터: GPS.jitterM 크기의 노이즈 */
  const jLat = (rnd() - 0.5) * (GPS.jitterM / 111000) * 2;
  const jLng = (rnd() - 0.5) * (GPS.jitterM / 88800) * 2;
  t.raw = { lat: trueLat + jLat, lng: trueLng + jLng };
  /* 보정: 지수이동평균 */
  t.sm = {
    lat: t.sm.lat + (t.raw.lat - t.sm.lat) * GPS.smoothAlpha,
    lng: t.sm.lng + (t.raw.lng - t.sm.lng) * GPS.smoothAlpha,
  };
  t.lastFixAt = Date.now();
  t.stale = false;

  /* 거리 기반 기록: minMoveM 이상 움직였을 때만 경로점 추가 */
  const last = t.path[t.path.length - 1];
  const movedM = distanceKm(last.lat, last.lng, t.sm.lat, t.sm.lng) * 1000;
  if (movedM >= GPS.minMoveM) { t.path.push({ lat: t.sm.lat, lng: t.sm.lng }); t.path = t.path.slice(-80); }
  t.curDist = distanceKm(t.sm.lat, t.sm.lng, job.lat, job.lng);
  t.remainSec = Math.max(0, t.totalSec - elapsedSec(t.startedAt));
  t.progress = prog;
}

/* ── 완료 증빙(POD) ───────────────────────────────────────────
   사진 + 전자서명 + 타임스탬프 + GPS 좌표 + 무결성 해시.
   에스크로 해제 트리거는 '완료 버튼'이 아니라 'POD 제출'이다 —
   자금 흐름이 증거와 묶여야 에스크로가 라벨이 아닌 장치가 된다.            */
function submitPOD(job, pod) {
  const blobStr = (getBlob(pod.photoKey) || '') + (getBlob(pod.sigKey) || '');
  job.pod = {
    photoKey: pod.photoKey || null,
    sigKey: pod.sigKey || null,
    note: pod.note || '',
    at: Date.now(),
    lat: job.lat, lng: job.lng,
    hash: hashOf(blobStr + job.id + Date.now()),
    complete: !!(pod.photoKey && pod.sigKey),
  };
  setStatus(job, 'pod', '완료 증빙 제출 (사진·서명·시각·좌표 기록)');
  job.hold = { until: Date.now() + SIM.holdSec * 1000, realH: SIM.holdRealH };
  setStatus(job, 'hold', `지급 보류 시작 — 실제 ${SIM.holdRealH}시간 (${simNote(SIM.holdRealH + '시간', SIM.holdSec)})`);
  saveJobs();
}

/* ── 정산 ─────────────────────────────────────────────────────
   보류기간이 이의제기 없이 끝나면 에스크로가 헬퍼 수익금으로 넘어간다.
   수수료는 여기서 떼지 않는다 — 헬퍼가 인출할 때 누진 요율로 공제된다.     */
function settleJob(job, ratio) {
  const r = ratio === undefined ? 1 : ratio;
  const gross = Math.round((job.agreedCost || job.cost) * r);
  const refund = (job.agreedCost || job.cost) - gross;

  if (job.side === 'requester') {
    releaseFromEscrow(gross, `${labelOf(job)} 헬퍼 지급`);
    if (refund > 0) refundFromEscrow(refund, `${labelOf(job)} 부분 환불 (미이행분)`);
  } else {
    // 내가 헬퍼로 수행한 건: 요청자의 에스크로에서 내 수익금으로 적립
    creditEarnings(gross, `${labelOf(job)} 수행 수익 적립`);
  }

  /* 완료 보너스: 공개된 확률표 그대로 (표시 = 코드 100% 일치) */
  let bonus = 0;
  if (r >= 1) {
    const rnd = job._rng || (job._rng = rngFor(job.id));
    let x = rnd();
    for (const t of BONUS_TABLE) { if (x < t.prob) { bonus = t.coins; break; } x -= t.prob; }
    if (bonus > 0) { econ.coins += bonus; postLedger('bonus', +bonus, `완료 보너스 (${BONUS_ODDS_LABEL})`); }
  }

  job.settle = { gross, refund, bonus, ratio: r, at: Date.now() };
  if (job.helperId) recordCompletion(job.helperId);

  /* 이중맹검 리뷰 창 개시 */
  job.review = {
    mine: null, theirs: null, revealed: false,
    windowEnds: Date.now() + SIM.reviewSec * 1000,
    realDays: SIM.reviewRealDays,
    theirsDueAt: Date.now() + 20000,   // 상대는 잠시 뒤 제출(양측 제출 전까지 비공개)
  };
  setStatus(job, r >= 1 ? 'settled' : 'resolved', r >= 1 ? '정산 완료' : `부분 지급 ${Math.round(r * 100)}% 반영`);
  archiveJob(job);
  saveEcon();
  return job.settle;
}
function labelOf(job) { return findCat(job.cat).name; }

function archiveJob(job) {
  history.unshift({
    id: job.id, cat: job.cat, desc: job.desc, side: job.side,
    cost: job.agreedCost || job.cost, status: job.status,
    helperId: job.helperId, settle: job.settle || null,
    at: Date.now(),
  });
  saveHistory();
}

/* ── 취소 / 만료 ─────────────────────────────────────────────── */
function cancelJob(job, byWhom) {
  if (isTerminal(job.status)) return null;
  const assigned = !!job.helperId;
  let refunded = 0, fee = 0;
  if (job.side === 'requester') {
    if (assigned && byWhom === 'requester') {
      fee = Math.min(CANCEL_AFTER_ASSIGN_FEE, job.agreedCost || job.cost);
      releaseFromEscrow(fee, '배정 후 취소 — 헬퍼 이동 보상');
      refunded = refundFromEscrow((job.agreedCost || job.cost) - fee, '배정 후 취소 환불');
    } else {
      refunded = refundFromEscrow(job.agreedCost || job.cost, assigned ? '헬퍼 취소 — 전액 환불' : '배정 전 취소 — 전액 환불');
    }
  }
  setStatus(job, 'cancelled', byWhom === 'helper' ? '헬퍼가 수락 후 취소 — 전액 환불' : '요청자 취소');
  job.cancelInfo = { byWhom, refunded, fee };
  archiveJob(job);
  saveEcon();
  return { refunded, fee };
}
function expireJob(job) {
  const refunded = job.side === 'requester'
    ? refundFromEscrow(job.cost, '매칭 실패 — 전액 환불')
    : 0;
  setStatus(job, 'expired', `제한시간 내 지원 0명 — 매칭 실패, ${refunded}c 전액 환불`);
  job.cancelInfo = { byWhom: 'system', refunded, fee: 0 };
  archiveJob(job);
  saveEcon();
  return refunded;
}

/* ── 분쟁 ─────────────────────────────────────────────────────
   ① 채팅 내 자체 해결 → ② 이의제기 시 자금 동결 → ③ 양측 증거 제출
   → ④ 운영팀이 증거·약관 대조 심사 → ⑤ 환불 / 지급 / 부분지급.          */
function openDispute(job, reason, claim, doneItems, totalItems) {
  if (job.status !== 'hold' && job.status !== 'pod') return false;
  if (job._holdTimer) clearTimeout(job._holdTimer);
  job.dispute = {
    openedAt: Date.now(), reason, claim: claim || '',
    doneItems: doneItems, totalItems: totalItems,
    evidencePhotoKey: null, verdict: null, decidedAt: null,
  };
  setStatus(job, 'disputed', '이의제기 접수 — 자금 동결, 증거 접수 시작');
  job.chat.push({ from: 'system', at: Date.now(),
    text: '이의제기가 접수되어 지급이 보류되었습니다. 양측 증거가 모이면 운영팀이 심사합니다.' });
  if (job.helperId) recordDispute(job.helperId);
  saveJobs();
  return true;
}
function attachDisputeEvidence(job, photoKey) {
  if (!job.dispute) return;
  job.dispute.evidencePhotoKey = photoKey;
  job.dispute.evidenceHash = hashOf((getBlob(photoKey) || '') + job.id);
  pushEvent(job, '요청자 증거 제출');
  saveJobs();
}
/* 운영 심사: 증거 완결성으로 판정한다(임의 판정 아님).
   - 헬퍼 증거(POD)가 불완전 → 전액 환불
   - 요청자가 미이행 항목을 특정 → 이행 비율만큼 부분지급
   - 그 외 → 헬퍼 전액 지급                                            */
function adjudicate(job) {
  const d = job.dispute; if (!d) return null;
  setStatus(job, 'review', '운영팀 심사 진행 — 증거와 약관 대조');
  const podComplete = job.pod && job.pod.complete;
  let ratio, why;
  if (!podComplete) {
    ratio = 0;
    why = '헬퍼 완료 증빙이 불완전(사진 또는 서명 누락) — 요청자에게 전액 환불';
  } else if (d.totalItems > 0 && d.doneItems < d.totalItems) {
    ratio = d.doneItems / d.totalItems;
    why = `증빙과 이의 내용 대조 결과 ${d.totalItems}개 중 ${d.doneItems}개 이행 확인 — 이행분만 지급`;
  } else {
    ratio = 1;
    why = '완료 증빙(사진·서명·시각·좌표)이 요건을 충족하고 미이행 근거가 확인되지 않음 — 헬퍼에게 전액 지급';
  }
  d.verdict = { ratio, why }; d.decidedAt = Date.now();
  const res = settleJob(job, ratio);
  pushEvent(job, `심사 종결: ${why}`);
  saveJobs();
  return { ratio, why, res };
}

/* ── 신고 (진행 중 언제든) ──────────────────────────────────── */
function reportHelper(job, reasonId, memo) {
  const reason = REPORT_REASONS.find(r => r.id === reasonId); if (!reason) return null;
  const rec = { reasonId, label: reason.label, memo: memo || '', at: Date.now(), status: 'received' };
  job.reports.push(rec);
  pushEvent(job, `신고 접수: ${reason.label} — 안전팀 확인 중`);
  saveJobs();
  /* 안전팀 확인 → 등급별 제재 집행 */
  const result = job.helperId ? applySanction(job.helperId, reason.sanction, reason.label) : null;
  rec.status = 'sanctioned';
  rec.result = result ? result.kind : null;
  saveJobs();
  return { reason, result };
}

/* ── 이중맹검 리뷰 ────────────────────────────────────────────
   양측이 모두 제출하거나 기한이 만료될 때까지 상대 리뷰를 비공개로 둔다.
   보복성 리뷰를 막고 별점 인플레를 낮추는 표준 설계.                    */
function submitReview(job, stars, text, tags) {
  if (!job.review || job.review.mine) return false;
  const clean = Array.isArray(tags) ? tags.filter(t => findReviewTag(t)) : [];
  job.review.mine = { stars, text: text || '', tags: clean, at: Date.now() };
  if (job.helperId) recordRating(job.helperId, stars, clean);
  maybeReveal(job);
  saveJobs();
  return true;
}
function maybeReveal(job) {
  const r = job.review; if (!r || r.revealed) return false;
  const expired = Date.now() >= r.windowEnds;
  if ((r.mine && r.theirs) || expired) { r.revealed = true; saveJobs(); return true; }
  return false;
}
/* 상대(헬퍼)의 리뷰는 예정 시각에 도착한다 — 내 리뷰 내용을 보지 않고 작성된다 */
const HELPER_REVIEW_TEXTS = [
  '요청 내용이 명확해서 수월했습니다. 감사합니다.',
  '위치 안내가 정확했어요. 다음에도 뵙겠습니다.',
  '소통이 빨라서 좋았습니다.',
];
function tickReview(job) {
  const r = job.review; if (!r || r.theirs) { if (r) maybeReveal(job); return; }
  if (Date.now() >= r.theirsDueAt) {
    const rnd = job._rng || (job._rng = rngFor(job.id));
    /* 헬퍼가 요청자에게 남기는 칭찬 태그 — 요청자 성향에 맞는 태그에서 결정적으로 1~2개 */
    const pool = ['comm', 'kind', 'ontime'];
    const theirTags = pool.filter((_, i) => rnd() < (i === 0 ? 0.8 : 0.5));
    r.theirs = {
      stars: 5,
      text: HELPER_REVIEW_TEXTS[Math.floor(rnd() * HELPER_REVIEW_TEXTS.length)],
      tags: theirTags.length ? theirTags : ['comm'], at: Date.now(),
    };
    maybeReveal(job);
    saveJobs();
  } else { maybeReveal(job); }
}

/* ── 인출 (누진 할인 요율) ──────────────────────────────────── */
function withdraw(amount) {
  if (amount <= 0 || amount > econ.earnings) return null;
  const rate = feeRateFor(econ.cumWithdrawn);
  const fee = Math.round(amount * rate);
  const net = amount - fee;
  econ.earnings -= amount;
  econ.coins += net;
  econ.cumWithdrawn += amount;
  postLedger('withdraw', +net, `수익금 인출 ${amount}c · 수수료 ${(rate * 100).toFixed(1)}% (${fee}c)`);
  saveEcon();
  return { amount, fee, net, rate };
}

/* ── 충전 ───────────────────────────────────────────────────── */
function chargesLeftToday() {
  const today = new Date().toDateString();
  const charges = load(LS.charges, {});
  return Math.max(0, DAILY_CHARGE_LIMIT - (charges[today] || 0));
}
function chargeCoins() {
  const today = new Date().toDateString();
  const charges = load(LS.charges, {});
  if ((charges[today] || 0) >= DAILY_CHARGE_LIMIT) return null;
  charges[today] = (charges[today] || 0) + 1;
  save(LS.charges, charges);
  econ.coins += CHARGE_COINS;
  postLedger('charge', +CHARGE_COINS, '코인 충전 (가상 크레딧)');
  saveEcon();
  return CHARGE_COINS;
}

/* ── 메인 틱: 요청자측 심부름을 시간에 따라 전진시킨다 ────────
   헬퍼측(내가 수행하는) 심부름은 타이머가 아니라 내 행동으로 전진한다.   */
let tickTimer = null;
function startEngine() {
  if (tickTimer) return;
  jobs.forEach(j => { j._rng = rngFor(j.id); });
  tickTimer = setInterval(tick, GPS.tickSec * 1000);
}
function tick() {
  let changed = false;
  jobs.forEach(job => {
    if (isTerminal(job.status)) { if (job.review) { tickReview(job); changed = true; } return; }
    if (job.side === 'helper') return;   // 공급측은 사용자가 직접 전진시킨다
    const age = elapsedSec(job.statusAt);

    switch (job.status) {
      case 'screening': {
        if (age >= SIM.screenSec) {
          const bad = screenText(job.desc);
          if (bad) {
            pushEvent(job, `자동 심사 반려: ${bad}`);
            refundFromEscrow(job.cost, `심사 반려 환불 (${bad})`);
            setStatus(job, 'cancelled', `심사 반려 — ${bad} · 전액 환불`);
            job.cancelInfo = { byWhom: 'system', refunded: job.cost, fee: 0, why: bad };
            archiveJob(job);
          } else {
            const mode = URGENCY_MODES[job.urgency];
            const n = eligibleHelpers(job).length;
            job.window = { endsAt: Date.now() + mode.windowSec * 1000, sec: mode.windowSec };
            setStatus(job, 'open', `심사 통과 · 반경 ${mode.radiusKm}km 헬퍼 ${n}명에게 알림 발송`);
          }
          changed = true;
        }
        break;
      }
      case 'open': {
        const cands = eligibleHelpers(job);
        if (job.matchMode === 'broadcast') {
          /* 즉시형: 가장 먼저 수락한 1명 자동 배정 (선착순) */
          const first = cands.slice().sort((a, b) => a.h.respondSec - b.h.respondSec)[0];
          if (first && age >= first.h.respondSec) {
            pushEvent(job, `${first.h.name} 이(가) 가장 먼저 수락 — 선착순 자동 배정`);
            assignHelper(job, first.h.id, job.cost);
            changed = true;
          } else if (!first || Date.now() >= job.window.endsAt) {
            expireJob(job); changed = true;
          }
        } else {
          /* 예약형: 최대 cap명까지 지원 접수 → 요청자 선택 대기 */
          cands.forEach(c => {
            if (age >= c.h.respondSec && job.applicants.length < job.cap) {
              if (addApplicant(job, c)) changed = true;
            }
          });
          if (Date.now() >= job.window.endsAt) {
            if (job.applicants.length === 0) { expireJob(job); changed = true; }
            /* 지원자가 있으면 만료시키지 않는다 — 선택은 요청자 몫 */
          }
        }
        break;
      }
      case 'assigned': {
        if (age >= 3) { setStatus(job, 'enroute', '헬퍼 출발 — 실시간 위치 공유 시작'); changed = true; }
        break;
      }
      case 'enroute': {
        updateTrack(job);
        if (job.track && job.track.progress >= 1) {
          setStatus(job, 'arrived', '현장 도착');
          job.chat.push({ from: 'helper', at: Date.now(), text: '도착했습니다.' });
        }
        changed = true;
        break;
      }
      case 'arrived': {
        if (age >= 4) {
          const wmin = workMinFor(job);
          job.work = { startedAt: Date.now(), totalSec: wmin * 60 / TIME_COMPRESS, min: wmin };
          setStatus(job, 'working', `수행 시작 — 표준 소요 ${job.work.min}분`);
          changed = true;
        }
        break;
      }
      case 'working': {
        if (job.work && elapsedSec(job.work.startedAt) >= job.work.totalSec) {
          /* 헬퍼가 완료 증빙을 제출한다(시뮬 이미지는 생성 시 '시뮬' 표기가 새겨진다) */
          const photoKey = putBlob(makeSimProofImage(job));
          const sigKey = putBlob(makeSimSignature(job));
          submitPOD(job, { photoKey, sigKey, note: '요청하신 내용 완료했습니다.' });
          job.chat.push({ from: 'helper', at: Date.now(), text: '완료했습니다. 증빙 올렸어요.' });
          changed = true;
        }
        break;
      }
      case 'hold': {
        if (Date.now() >= job.hold.until) { settleJob(job, 1); changed = true; }
        break;
      }
      case 'disputed': {
        /* 증거 접수 후 심사 — 요청자 증거 제출을 3초 기다린 뒤 진행 */
        if (age >= 6) { adjudicate(job); changed = true; }
        break;
      }
      default: break;
    }
  });
  if (changed) saveJobs();
  if (typeof onEngineUpdate === 'function') onEngineUpdate(null);
}

/* ── 시뮬 증빙 이미지 생성 ────────────────────────────────────
   실제 사진이 아니라는 사실을 이미지 자체에 새긴다. 동시에 POD의 필수 요소
   (시각·좌표·해시)를 이미지에 각인해 증빙 형식을 그대로 보여준다.        */
function makeSimProofImage(job) {
  const c = document.createElement('canvas');
  c.width = 480; c.height = 320;
  const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, 320);
  g.addColorStop(0, '#1c1912'); g.addColorStop(1, '#0d0b08');
  x.fillStyle = g; x.fillRect(0, 0, 480, 320);
  x.strokeStyle = '#2e2820'; x.lineWidth = 1;
  for (let i = 0; i < 480; i += 24) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, 320); x.stroke(); }
  for (let i = 0; i < 320; i += 24) { x.beginPath(); x.moveTo(0, i); x.lineTo(480, i); x.stroke(); }
  x.font = '64px system-ui'; x.textAlign = 'center';
  x.fillText(findCat(job.cat).icon, 240, 140);
  x.fillStyle = '#c5a46e'; x.font = 'bold 15px system-ui';
  x.fillText('완료 증빙 (시뮬레이션 이미지)', 240, 178);
  x.fillStyle = '#8b6f47'; x.font = '12px system-ui';
  const d = new Date();
  x.fillText(d.toLocaleString('ko-KR'), 240, 200);
  x.fillText(`GPS ${job.lat.toFixed(5)}, ${job.lng.toFixed(5)}`, 240, 218);
  x.fillStyle = 'rgba(229,113,79,0.85)'; x.font = 'bold 11px system-ui';
  x.fillText('실제 촬영 사진 아님 · 프로그램 생성', 240, 246);
  return c.toDataURL('image/jpeg', 0.7);
}
function makeSimSignature(job) {
  const c = document.createElement('canvas');
  c.width = 360; c.height = 120;
  const x = c.getContext('2d');
  x.fillStyle = '#f5f1e6'; x.fillRect(0, 0, 360, 120);
  x.strokeStyle = '#1a1712'; x.lineWidth = 2.2; x.lineCap = 'round';
  const rnd = job._rng || (job._rng = rngFor(job.id));
  x.beginPath(); x.moveTo(40, 80);
  for (let i = 0; i < 7; i++) {
    x.quadraticCurveTo(60 + i * 40, 30 + rnd() * 60, 80 + i * 40, 60 + rnd() * 25);
  }
  x.stroke();
  x.fillStyle = '#8b6f47'; x.font = '10px system-ui';
  x.fillText('전자서명 (시뮬)', 8, 112);
  return c.toDataURL('image/png');
}
