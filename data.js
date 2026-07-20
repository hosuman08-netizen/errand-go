/* ============================================================
   Errand — 도메인 설정 (단일 진실원천)
   화면에 표시되는 모든 숫자·문구는 이 파일의 값에서 생성된다.
   손으로 쓴 숫자와 코드가 어긋나는 것을 구조적으로 불가능하게 만든다.
   ============================================================ */

/* ── 시뮬 가속 계수 ───────────────────────────────────────────
   실제 서비스의 시간창(입찰 20분·보류 24시간·리뷰 14일)을 체험 길이로 압축한다.
   압축했다는 사실과 원래 값을 화면에 항상 같이 표기한다(정직).            */
const SIM = {
  screenRealLabel: '1~2일', screenSec: 4,      // 공고 심사 큐
  bidRealMin: 20,           bidSec: 40,        // 역경매 입찰창 (애니맨 20분)
  applyRealMin: 30,         applySec: 45,      // 예약형 지원 접수창
  holdRealH: 24,            holdSec: 45,       // 완료 후 자동지급 보류기간
  reviewRealDays: 14,       reviewSec: 150,    // 이중맹검 리뷰 창 (Airbnb 14일)
};
function simNote(real, sec) { return `실제 ${real} → 체험 ${sec}초로 압축`; }

/* ── 카테고리 택소노미 + 카테고리별 시세 ──────────────────────
   매칭 알고리즘의 1차 입력값. 헬퍼 스킬 매칭·목록 필터·권장가가 전부 여기서 나온다.
   lo/hi = 최근 성사가 범위(코인), mid = 권장가.                        */
/* 세부유형(subs): pm = 권장가 배수(카테고리 mid에 곱함 → lo/hi로 클램프),
   wm = 표준 수행시간(분). 매칭·권장가·ETA가 전부 이 값에서 결정된다(무작위 아님). */
const CATEGORIES = [
  { id: 'delivery', name: '배달·퀵',   icon: '🛵', lo: 6,  mid: 10, hi: 16, hint: '편의점·약국 대신 사다주기, 서류 전달',
    subs: [
      { id: 'store',  name: '편의점·마트 대행', pm: 1.0, wm: 15 },
      { id: 'pharm',  name: '약국·처방약',      pm: 1.1, wm: 20 },
      { id: 'doc',    name: '서류·물품 전달',   pm: 0.9, wm: 12 },
      { id: 'food',   name: '음식 포장 픽업',   pm: 1.0, wm: 18 },
    ] },
  { id: 'move',     name: '이사·운반', icon: '📦', lo: 14, mid: 22, hi: 40, hint: '가구·가전 옮기기, 짐 나르기', twoPerson: true,
    subs: [
      { id: 'furni',  name: '가구·가전 운반', pm: 1.3, wm: 50 },
      { id: 'moving', name: '이사 짐 나르기', pm: 1.5, wm: 60 },
      { id: 'small',  name: '소형 물품 운반', pm: 0.8, wm: 25 },
    ] },
  { id: 'clean',    name: '청소·정리', icon: '🧹', lo: 12, mid: 18, hi: 32, hint: '집 청소, 정리수납, 분리수거',
    subs: [
      { id: 'house',  name: '집 청소',       pm: 1.1, wm: 60 },
      { id: 'organize', name: '정리·수납',   pm: 1.0, wm: 50 },
      { id: 'waste',  name: '분리수거·폐기',  pm: 0.7, wm: 25 },
    ] },
  { id: 'assemble', name: '조립·설치', icon: '🔧', lo: 10, mid: 16, hi: 28, hint: '가구 조립, 선반·커튼 설치',
    subs: [
      { id: 'furni',   name: '가구 조립',      pm: 1.1, wm: 40 },
      { id: 'mount',   name: '선반·커튼 설치', pm: 1.0, wm: 35 },
      { id: 'applianc', name: '가전 설치',     pm: 1.2, wm: 45 },
    ] },
  { id: 'pest',     name: '벌레·해충', icon: '🪳', lo: 5,  mid: 8,  hi: 14, hint: '벌레 잡기, 방충 처리',
    subs: [
      { id: 'catch',   name: '벌레 잡기',    pm: 1.0, wm: 10 },
      { id: 'seal',    name: '방충·틈막이',  pm: 1.4, wm: 25 },
    ] },
  { id: 'pet',      name: '펫·산책',   icon: '🐕', lo: 8,  mid: 12, hi: 20, hint: '산책, 사료 급여, 병원 동행',
    subs: [
      { id: 'walk',    name: '산책',         pm: 1.0, wm: 30 },
      { id: 'feed',    name: '사료·급식 방문', pm: 0.8, wm: 15 },
      { id: 'vet',     name: '병원 동행',     pm: 1.6, wm: 60 },
    ] },
  { id: 'wait',     name: '줄서기·대기', icon: '⏳', lo: 8, mid: 14, hi: 24, hint: '오픈런 대기, 접수 대행',
    subs: [
      { id: 'queue',   name: '오픈런·대기',   pm: 1.2, wm: 45 },
      { id: 'agent',   name: '접수·서류 대행', pm: 1.0, wm: 30 },
    ] },
  { id: 'etc',      name: '기타',      icon: '✨', lo: 5,  mid: 12, hi: 30, hint: '위 항목에 없는 생활 심부름',
    subs: [
      { id: 'misc',    name: '생활 심부름',   pm: 1.0, wm: 25 },
    ] },
];
function findCat(id) { return CATEGORIES.find(c => c.id === id) || CATEGORIES[CATEGORIES.length - 1]; }
function findSub(catId, subId) {
  const c = findCat(catId);
  return (c.subs || []).find(s => s.id === subId) || null;
}
/* 세부유형 기준 권장가 — 카테고리 mid × 배수, lo/hi 밴드로 클램프(결정적). */
function subRecommend(catId, subId) {
  const c = findCat(catId);
  const s = findSub(catId, subId);
  if (!s) return c.mid;
  return Math.max(c.lo, Math.min(c.hi, Math.round(c.mid * s.pm)));
}

/* ── 긴급도 = 매칭 알고리즘 스위치 ────────────────────────────
   긴급도는 UI 라벨이 아니라 (반경 · 수락방식 · 지원자 수) 세 값을 바꾸는 스위치다.
   업계 표준: 즉시형 = 반경 20km 전원 알림 후 선착순 1명 자동배정,
              예약형 = 반경 30km 알림 후 최대 5명 지원 → 요청자 선택.        */
const URGENCY_MODES = {
  asap: {
    id: 'asap', label: '지금 즉시', radiusKm: 20, mode: 'broadcast', cap: 1,
    windowSec: 30, color: '#e5714f',
    rule: '반경 20km 헬퍼 전원에게 알림 → 가장 먼저 수락한 1명 자동 배정 (선착순)',
    short: '선착순 자동배정',
  },
  today: {
    id: 'today', label: '오늘 내', radiusKm: 30, mode: 'apply', cap: 5,
    windowSec: SIM.applySec, color: '#d9b451',
    rule: '반경 30km 헬퍼에게 알림 → 최대 5명까지 지원 → 요청자가 1명 선택',
    short: '최대 5명 지원 → 내가 선택',
  },
  normal: {
    id: 'normal', label: '일정 예약', radiusKm: 30, mode: 'apply', cap: 5,
    windowSec: SIM.applySec, color: '#8b6f47',
    rule: '반경 30km 헬퍼에게 알림 → 최대 5명까지 지원 → 요청자가 1명 선택',
    short: '최대 5명 지원 → 내가 선택',
  },
};
const URGENCY_ORDER = ['asap', 'today', 'normal'];

/* ── 가격 결정 방식 ───────────────────────────────────────────
   고정가 = 요청자 제시가. 역경매 = 헬퍼가 각자 입찰(제한시간), 요청자가 입찰가+평점 보고 선택. */
const PRICE_MODES = {
  fixed:   { id: 'fixed',   label: '고정가',       desc: '내가 정한 금액 그대로. 지원자는 수락 여부만 결정.' },
  auction: { id: 'auction', label: '역경매(입찰)', desc: `헬퍼가 각자 금액을 제시. ${SIM.bidRealMin}분 입찰 후 입찰가와 평점을 함께 보고 선택.` },
};

/* ── 수수료: '중개료'가 아니라 '보호비용' ─────────────────────
   완료 즉시 심부름비 전액이 헬퍼 수익금에 적립되고,
   수수료는 헬퍼가 '인출할 때' 누적 인출액 구간에 따라 누진 할인 요율로 공제된다.
   (해주세요 11.9%→9.9% 구조 차용: 인출 구간이 곧 리텐션 장치)              */
const FEE_TIERS = [
  { minCum: 0,    rate: 0.150 },
  { minCum: 300,  rate: 0.140 },
  { minCum: 1000, rate: 0.130 },
  { minCum: 3000, rate: 0.120 },
  { minCum: 6000, rate: 0.110 },
];
function feeRateFor(cumWithdrawn) {
  let r = FEE_TIERS[0].rate;
  for (const t of FEE_TIERS) if (cumWithdrawn >= t.minCum) r = t.rate;
  return r;
}
function nextFeeTier(cumWithdrawn) {
  return FEE_TIERS.find(t => cumWithdrawn < t.minCum) || null;
}

/* 수수료가 무엇을 사는지 — share 합은 반드시 1.00 (코드가 검증) */
const FEE_BUYS = [
  { k: '에스크로 예치·보증',      share: 0.40, note: '매칭 실패·미완 시 전액 환불 보장' },
  { k: '신원확인·백그라운드 체크', share: 0.25, note: '전 헬퍼 신분증·활동이력 검증 후 승인' },
  { k: '분쟁 심사·안전팀',        share: 0.23, note: '증거 기반 심사와 제재 집행' },
  { k: '결제·인프라',            share: 0.12, note: '거래 원장·위치 추적·알림' },
];
const FEE_BUYS_SUM = FEE_BUYS.reduce((s, f) => s + f.share, 0); // 표시 전 검증용

/* 보증 한도 (TaskRabbit Happiness Pledge 대응 — 가상 크레딧 기준) */
const GUARANTEE_COINS = 1000;

/* ── 심부름 생애주기 상태머신 ────────────────────────────────
   배달 업계 표준(준비→배차→이동중→완료)을 심부름 도메인으로 확장.
   각 상태는 색·다음 액션·타임라인 표기를 모두 스스로 들고 있다.          */
const STATES = {
  screening: { label: '심사 중',   color: '#8b6f47', step: 0, desc: '금지 항목 자동 검수' },
  open:      { label: '모집 중',   color: '#c5a46e', step: 1, desc: '주변 헬퍼에게 알림 발송' },
  assigned:  { label: '배정됨',    color: '#c5a46e', step: 2, desc: '헬퍼 확정, 출발 준비' },
  enroute:   { label: '이동 중',   color: '#d9b451', step: 3, desc: '헬퍼가 현장으로 이동' },
  arrived:   { label: '현장 도착', color: '#6ea8c9', step: 4, desc: '현장 확인' },
  working:   { label: '수행 중',   color: '#6ea8c9', step: 5, desc: '심부름 진행' },
  pod:       { label: '증빙 제출', color: '#7fb98a', step: 6, desc: '사진·서명·위치 기록 제출' },
  hold:      { label: '지급 보류', color: '#7fb98a', step: 6, desc: '이의제기 가능 기간' },
  settled:   { label: '정산 완료', color: '#7fb98a', step: 7, desc: '헬퍼 수익금 적립 완료' },
  disputed:  { label: '이의제기',  color: '#e5714f', step: 6, desc: '자금 동결, 증거 접수 중' },
  review:    { label: '운영 심사', color: '#e5714f', step: 6, desc: '증거 대조 심사 진행' },
  resolved:  { label: '심사 종결', color: '#8b6f47', step: 7, desc: '심사 결과 반영 완료' },
  expired:   { label: '매칭 실패', color: '#8b6f47', step: 7, desc: '전액 환불 완료' },
  cancelled: { label: '취소됨',    color: '#8b6f47', step: 7, desc: '취소 정책에 따라 처리' },
};
const TIMELINE_STEPS = ['모집', '배정', '이동', '도착', '수행', '증빙', '정산'];

/* ── 헬퍼 풀 (공급측 실체) ───────────────────────────────────
   요청자에게 사전 공개되는 항목: 이름·성별·나이·얼굴·평점·수행건수·신원검증·자격테스트.
   '모르는 사람이 우리 집 앞에 온다'는 공포가 이 카테고리의 1차 진입장벽이므로
   프로필 카드는 매칭 화면의 필수 구성요소다.                              */
const HELPERS = [
  { id: 'h1', name: '민준', avatar: '🧑🏻', gender: '남', age: 31, rating: 4.9, jobs: 214,
    speedKmH: 18, vehicle: '🛵 오토바이', cats: ['delivery', 'wait', 'etc'],
    idVerified: true, bgCheck: '2026-05-12 통과', quiz: 96, joined: '2024-08',
    latOff: 0.006, lngOff: -0.004, bidFactor: 0.95, respondSec: 6,
    intro: '3년째 퀵 배송. 무거운 것도 편하게 맡기세요.' },
  { id: 'h2', name: '서연', avatar: '👩🏻', gender: '여', age: 27, rating: 4.8, jobs: 156,
    speedKmH: 5, vehicle: '🚶 도보', cats: ['clean', 'pet', 'wait'],
    idVerified: true, bgCheck: '2026-04-02 통과', quiz: 92, joined: '2025-01',
    latOff: -0.003, lngOff: 0.005, bidFactor: 1.05, respondSec: 9,
    intro: '정리수납 자격증 보유. 꼼꼼하게 합니다.' },
  { id: 'h3', name: '지호', avatar: '🧑🏻‍🦱', gender: '남', age: 24, rating: 5.0, jobs: 89,
    speedKmH: 22, vehicle: '🚲 자전거', cats: ['delivery', 'pest', 'etc'],
    idVerified: true, bgCheck: '2026-06-20 통과', quiz: 88, joined: '2025-09',
    latOff: 0.009, lngOff: 0.007, bidFactor: 0.88, respondSec: 4,
    intro: '신규지만 빠릅니다. 벌레 무서워하지 않아요.' },
  { id: 'h4', name: '하은', avatar: '👩🏻‍🦰', gender: '여', age: 35, rating: 4.7, jobs: 312,
    speedKmH: 30, vehicle: '🚗 승용차', cats: ['move', 'clean', 'assemble'],
    idVerified: true, bgCheck: '2026-03-18 통과', quiz: 99, joined: '2023-11',
    latOff: -0.008, lngOff: -0.006, bidFactor: 1.12, respondSec: 12,
    intro: '차량 보유. 이사·운반 300건 이상 수행.' },
  { id: 'h5', name: '도윤', avatar: '🧔🏻', gender: '남', age: 42, rating: 4.95, jobs: 47,
    speedKmH: 6, vehicle: '🚶 도보', cats: ['assemble', 'pest', 'move'],
    idVerified: true, bgCheck: '2026-07-01 통과', quiz: 94, joined: '2026-05',
    latOff: 0.004, lngOff: 0.003, bidFactor: 1.0, respondSec: 15,
    intro: '가구 조립 전문. 공구 직접 지참합니다.' },
  { id: 'h6', name: '수아', avatar: '👩🏻‍🦱', gender: '여', age: 29, rating: 4.6, jobs: 128,
    speedKmH: 16, vehicle: '🛵 오토바이', cats: ['delivery', 'pet', 'clean'],
    idVerified: true, bgCheck: '2026-05-30 통과', quiz: 90, joined: '2025-03',
    latOff: -0.011, lngOff: 0.009, bidFactor: 0.92, respondSec: 8,
    intro: '반려견 2마리 키웁니다. 펫 심부름 자신 있어요.' },
  { id: 'h7', name: '준서', avatar: '🧑🏻‍🦲', gender: '남', age: 38, rating: 4.4, jobs: 73,
    speedKmH: 25, vehicle: '🚗 승용차', cats: ['move', 'wait', 'etc'],
    idVerified: true, bgCheck: '2026-02-11 통과', quiz: 85, joined: '2025-06',
    latOff: 0.013, lngOff: -0.010, bidFactor: 1.18, respondSec: 18,
    intro: '대형 차량 운행. 큰 짐 문의 주세요.' },
  { id: 'h8', name: '예린', avatar: '👩🏻', gender: '여', age: 23, rating: 4.85, jobs: 31,
    speedKmH: 5, vehicle: '🚶 도보', cats: ['wait', 'clean', 'pet'],
    idVerified: true, bgCheck: '2026-07-08 통과', quiz: 91, joined: '2026-06',
    latOff: -0.005, lngOff: -0.012, bidFactor: 0.85, respondSec: 5,
    intro: '신규 헬퍼입니다. 성실하게 하겠습니다.' },
];
function findHelper(id) { return HELPERS.find(h => h.id === id) || null; }

/* 신규 헬퍼 콜드스타트: 후보 목록에 고참과 신규를 섞어 노출한다(TaskRabbit 방식).
   신규(수행 50건 미만)를 최소 1명 보장해 공급측 진입로를 막지 않는다. */
const NEW_HELPER_JOBS_THRESHOLD = 50;

/* ── 안전·제재 ───────────────────────────────────────────────
   신고 → 안전팀 심사 → 제재 등급. 제재 경로가 없으면 평판은 무력하다.       */
const REPORT_REASONS = [
  { id: 'late',      label: '약속 시간 미준수',        severity: 1, sanction: 'warn' },
  { id: 'rude',      label: '불친절·부적절한 언행',    severity: 2, sanction: 'warn' },
  { id: 'damage',    label: '물품 파손·분실',          severity: 3, sanction: 'suspend30' },
  { id: 'bypass',    label: '앱 외부 직접 결제 요구',  severity: 3, sanction: 'suspend30' },
  { id: 'noshow',    label: '수락 후 무단 미이행',     severity: 3, sanction: 'suspend30' },
  { id: 'threat',    label: '안전 위협·성적 언행',     severity: 4, sanction: 'permanent' },
];
const SANCTIONS = {
  warn:       { label: '경고 1회',    days: 0,   desc: '누적 3회 시 30일 활동정지' },
  suspend30:  { label: '30일 활동정지', days: 30, desc: '기간 중 매칭 풀에서 제외' },
  permanent:  { label: '영구 활동정지', days: -1, desc: '재가입 불가, 매칭 풀 영구 제외' },
};
/* 분쟁률 임계치: 최소 표본 이상에서 초과 시 자동 정지 */
const DISPUTE_AUTO_SUSPEND = { minJobs: 5, rate: 0.20 };

/* ── 공고 자동 심사 필터 ─────────────────────────────────────
   즉시성이 핵심 가치이므로 사람 심사 큐 대신 자동 필터 + 사후 신고 조합.   */
const BANNED_PATTERNS = [
  { re: /(대리|대신).*(시험|수능|응시)/, why: '시험 대리 응시' },
  { re: /(마약|필로폰|대마|떨)/,        why: '불법 약물' },
  { re: /(총기|사제총|폭발물|화약)/,     why: '무기·폭발물' },
  { re: /(미성년|청소년|중학생|고등학생).{0,6}(술|담배|주류)/, why: '미성년자 주류·담배 구매' },
  { re: /(처방전|향정신).{0,6}(대리|구매)/, why: '전문의약품 대리 구매' },
  { re: /(대리|대신).{0,4}(서명|사인|계약)/, why: '법률행위 대리' },
  { re: /(스토킹|미행|따라가)/,          why: '타인 추적 행위' },
];
function screenText(text) {
  for (const b of BANNED_PATTERNS) if (b.re.test(text)) return b.why;
  return null;
}

/* ── 취소·노쇼·매칭실패 정책 (선결제 에스크로의 전제) ────────── */
const POLICY = {
  matchFailRefund: '제한시간 내 수락·지원이 0명이면 매칭 실패로 처리되고 심부름비 전액이 즉시 환불됩니다.',
  cancelBeforeAssign: '배정 전 취소: 전액 환불, 페널티 없음.',
  cancelAfterAssign: '배정 후 요청자 취소: 헬퍼 이동 보상 2c 공제 후 환불.',
  helperCancel: '헬퍼가 수락 후 취소하면 전액 환불되고 해당 헬퍼에게 노쇼 기록이 남습니다.',
  autoExpire: '모집 시작 후 제한시간이 지나면 공고는 자동 만료되고 환불됩니다.',
  holdPeriod: `증빙 제출 후 ${SIM.holdRealH}시간의 지급 보류기간이 있으며, 이 기간에만 이의제기가 가능합니다.`,
  bypassBan: '심부름비는 반드시 앱을 통해 지급됩니다. 헬퍼에게 직접 현금을 주지 마세요 — 앱 외부 거래는 에스크로·보증·분쟁 심사 대상에서 제외됩니다.',
};
const CANCEL_AFTER_ASSIGN_FEE = 2; // 코인

/* ── 법적 지위 고지 ───────────────────────────────────────────
   통신판매중개자는 자신이 통신판매의 당사자가 아님을 사전 고지해야 하고,
   현금 결제에는 결제대금예치(에스크로)를 제공해야 한다.
   (본 앱은 가상 크레딧 체험판이므로 실제 결제·에스크로는 발생하지 않는다) */
const LEGAL = {
  intermediary: 'Errand는 요청자와 헬퍼를 연결하는 통신판매중개자이며, 통신판매의 당사자가 아닙니다. 심부름의 이행 및 그 결과에 대한 책임은 거래 당사자에게 있습니다.',
  escrowProvider: '결제대금예치(에스크로)는 플랫폼이 직접 보관하며, 완료 증빙 제출과 보류기간 경과 후에만 헬퍼에게 지급됩니다.',
  simulation: '본 화면은 체험용 시뮬레이션입니다. 실제 금전 거래·실제 헬퍼 방문·실제 위치 전송은 발생하지 않으며, 모든 헬퍼와 이동 경로는 프로그램이 생성한 가상 데이터입니다.',
};

/* ── 리뷰 칭찬 태그 ───────────────────────────────────────────
   별점 하나로는 '무엇이 좋았는지'가 남지 않는다. 태그는 헬퍼 프로필에
   '최근 받은 칭찬'으로 누적되어 다음 요청자의 선택 근거가 된다(평판의 실체화). */
const REVIEW_TAGS = [
  { id: 'ontime',  label: '시간 약속 정확', icon: '⏱' },
  { id: 'kind',    label: '친절·매너 좋음', icon: '😊' },
  { id: 'careful', label: '꼼꼼·깔끔함',    icon: '✨' },
  { id: 'comm',    label: '소통이 빠름',    icon: '💬' },
  { id: 'gentle',  label: '물건 소중히',    icon: '🧤' },
  { id: 'pro',     label: '전문성 느껴짐',  icon: '🎯' },
];
function findReviewTag(id) { return REVIEW_TAGS.find(t => t.id === id) || null; }

/* ── 완료 보너스 확률표 (표시 = 실제 롤 확률 100% 일치) ────── */
const BONUS_TABLE = [
  { coins: 0,  prob: 0.50 },
  { coins: 2,  prob: 0.30 },
  { coins: 5,  prob: 0.15 },
  { coins: 10, prob: 0.05 },
];
const BONUS_ODDS_LABEL = BONUS_TABLE.map(t => `+${t.coins} ${(t.prob * 100).toFixed(0)}%`).join(' · ');

/* ── 위치 데이터 품질 ────────────────────────────────────────
   시간(N초)·거리(N미터)·이벤트(도착) 하이브리드 갱신 + 지터 보정 + 미보고 감지.
   지도 핀이 튀면 즉시 가짜로 읽히고, 실제 서비스에서는 사기 탐지 실패로 이어진다. */
const GPS = {
  tickSec: 1,          // 시간 기반 갱신 주기
  minMoveM: 12,        // 거리 기반: 12m 이상 움직여야 경로점 기록
  smoothAlpha: 0.35,   // 지터 보정 EMA 계수 (낮을수록 부드럽고 늦음)
  staleAfterSec: 4,    // 이 시간 이상 새 측위 없으면 '신호 지연' 표시
  jitterM: 18,         // 원시 측위에 섞이는 노이즈 크기
};

/* 하루 충전 상한 */
const DAILY_CHARGE_LIMIT = 5;
const CHARGE_COINS = 50;
