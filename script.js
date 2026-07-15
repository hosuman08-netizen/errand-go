// p7 Errand — Legion prototype with p6 Lung Surprise Eye + Da Vinci
let userLocation = null;
let tasks = JSON.parse(localStorage.getItem('p7_tasks') || '[]');
let coins = parseInt(localStorage.getItem('p7_coins') || '42');
let notebook = JSON.parse(localStorage.getItem('p7_notebook') || '[]');

function updateCoinsUI() {
  const el = document.getElementById('coin-balance');
  if (el) el.textContent = coins;
  localStorage.setItem('p7_coins', coins);
}

function updateStatus(msg) {
  const s = document.getElementById('status');
  if (s) s.textContent = msg;
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
    renderTasks();
  }, () => {
    userLocation = { lat: 37.5665, lng: 126.9780 };
    updateStatus('위치 기본값 (서울)');
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
  const container = document.getElementById('task-list');
  if (!container) return;
  container.innerHTML = '';
  
  const now = Date.now();
  const nearby = tasks.filter(t => {
    if (!userLocation || !t.lat) return true;
    const d = parseFloat(distanceKm(userLocation.lat, userLocation.lng, t.lat, t.lng));
    // Birth 1: Ache-Breath Radius FOMO — radius shrinks with ache + age (near-miss)
    const ageH = (now - (t.time || now)) / 3600000;
    const currentRadius = (t.breathRadius || 8) - (t.ache || 0.4) * ageH * 1.8;
    t._currentRadius = Math.max(1.2, currentRadius);
    return d < (t._currentRadius + 1.5);
  }).slice(0, 6);

  if (nearby.length === 0) {
    container.innerHTML = '<div class="task-card">근처 심부름 숨 쉬는 중... (Ache-Breath 반경 축소됨)</div>';
    return;
  }

  nearby.forEach((task) => {
    const d = userLocation && task.lat ? parseFloat(distanceKm(userLocation.lat, userLocation.lng, task.lat, task.lng)) : 0;
    const rad = task._currentRadius || 8;
    const inBreath = d <= rad;
    const earnMul = inBreath ? 1 : 0.6;
    const el = document.createElement('div');
    el.className = `task-card ${task.surprise > 0.5 ? 'sfu' : ''} ${inBreath ? '' : 'fading'}`;
    el.innerHTML = `
      <div class="loc">📍 ${d.toFixed(1)}km / breath ${rad.toFixed(1)}km • ${task.urgency || ''}</div>
      <div>${task.desc}</div>
      <div class="cost">💰 ${task.cost} coins ${task.scoutEcho ? '· scout+' : ''}</div>
      ${task.surprise ? `<div class="surprise-eye">👁 ${task.surprise.toFixed(2)} ${task.ache ? 'ache' + task.ache.toFixed(1) : ''}</div>` : ''}
      <button onclick="acceptTask(${tasks.indexOf(task)})" ${inBreath ? '' : 'style="opacity:0.6"'}>${inBreath ? '수행하기 (코인 획득)' : '반경 밖 — FOMO (earn ↓)'}</button>
      ${!task.scoutEcho ? `<button onclick="dispatchScout(${tasks.indexOf(task)})" style="font-size:10px;margin-top:4px">🧿 p3 Scout Echo 보내기 (-3c)</button>` : ''}
    `;
    container.appendChild(el);
  });
}

function showPost() {
  hideAll();
  document.getElementById('post').classList.remove('hidden');
  if (!userLocation) getLocation();
}

function hideAll() {
  document.querySelectorAll('.section').forEach(s => s.classList.add('hidden'));
}

function recordVoiceForTask() {
  updateStatus('p6 Aether voice recording... (Lung Surprise Eye + Ache-Breath 활성)');
  const desc = document.getElementById('task-desc');
  const recStart = Date.now();
  
  navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
    const mediaRecorder = new MediaRecorder(stream);
    let chunks = [];
    mediaRecorder.ondataavailable = e => chunks.push(e.data);
    mediaRecorder.onstop = () => {
      const blob = new Blob(chunks, { type: 'audio/webm' });
      const url = URL.createObjectURL(blob);
      const dur = (Date.now() - recStart) / 1000;
      
      // p6 Lung Surprise Eye integration + 창발 pain proxy (longer strained record = higher ache)
      let surprise = (window.getP6LungSurprise ? window.getP6LungSurprise() : Math.random() * 0.5 + 0.25);
      const ache = Math.min(0.95, (dur / 6) + (Math.random() * 0.25)); // ache from breath effort
      surprise = Math.min(1, surprise * 0.7 + ache * 0.5);
      
      desc.value = (desc.value || '') + ` [p6 Voice: s${surprise.toFixed(2)} ache${ache.toFixed(2)}]`;
      desc.dataset.ache = ache;
      desc.dataset.surprise = surprise;
      
      // plant to p6 cross + legion lung
      try {
        localStorage.setItem('p6_lungSurpriseCross', JSON.stringify({surprise, ache, ts: Date.now(), source:'p7'}));
      } catch(e){}
      
      updateStatus(`Voice captured • surprise ${surprise.toFixed(2)} ache ${ache.toFixed(2)} → Lung fed + FOMO radius ready`);
      stream.getTracks().forEach(t => t.stop());
    };
    mediaRecorder.start();
    setTimeout(() => mediaRecorder.stop(), 4500);
  }).catch(() => {
    desc.value = (desc.value || '') + ' (음성: 냉장고 무거워요. 지금)';
    desc.dataset.ache = '0.65';
    desc.dataset.surprise = '0.55';
    updateStatus('Voice fallback (ache seeded)');
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
  
  const surprise = parseFloat(descEl.dataset.surprise) || (window.getP6LungSurprise ? window.getP6LungSurprise() : Math.random()*0.45 + 0.25);
  const ache = parseFloat(descEl.dataset.ache) || 0.4;
  
  const newTask = {
    desc,
    cost,
    urgency,
    lat: userLocation ? userLocation.lat : 37.5665,
    lng: userLocation ? userLocation.lng : 126.9780,
    time: Date.now(),
    surprise,
    ache,
    scoutEcho: null, // Birth 2 seed
    breathRadius: 9.5 - (ache * 5.5) // Birth 1: initial Ache-Breath radius (km)
  };
  
  coins -= cost;
  updateCoinsUI();
  tasks.unshift(newTask);
  localStorage.setItem('p7_tasks', JSON.stringify(tasks));
  
  if (urgency === 'asap') updateStatus('🔥 ASAP • Breath collapsing');
  else updateStatus('공고 등록 • Ache-Breath FOMO 활성');
  
  descEl.value = '';
  descEl.dataset.ache = '';
  descEl.dataset.surprise = '';
  hideAll();
  document.getElementById('browse').classList.remove('hidden');
  renderTasks();
}

function acceptTask(idx) {
  const task = tasks[idx];
  if (!task) return;
  
  let earn = Math.floor(task.cost * 0.7) + 3;
  // Birth 2: p1 gacha luck on completion (full-cheat variable from p6 surprise + scout)
  const gachaBase = (task.surprise || 0.3) + (task.scoutEcho || 0);
  const gachaRoll = Math.random() * (1.6 + gachaBase * 1.1); // near-miss variance
  const luck = Math.floor(gachaRoll * 4);
  earn += luck;
  
  coins += earn;
  updateCoinsUI();
  
  const review = prompt(`Task 완료! p1 Gacha ${luck > 0 ? '+'+luck+' luck' : ''}\n"${task.desc}"\n배운 점?`, '무거웠지만 끝. 다음 voice 더 정확히.');
  if (review) {
    notebook.unshift({
      task: task.desc,
      earn,
      review,
      surprise: task.surprise || 0,
      ache: task.ache || 0,
      scout: task.scoutEcho,
      gacha: luck,
      time: Date.now()
    });
    localStorage.setItem('p7_notebook', JSON.stringify(notebook));
    // plant to legion lung cross
    try { localStorage.setItem('legion_distributed_notebook', JSON.stringify({surprise: task.surprise, ache: task.ache, ts: Date.now()})); } catch(e){}
  }
  
  tasks.splice(idx, 1);
  localStorage.setItem('p7_tasks', JSON.stringify(tasks));
  renderTasks();
  updateStatus(`+${earn} coins (gacha ${luck}) • Notebook + Lung spore`);
}

function dispatchScout(idx) {
  const task = tasks[idx];
  if (!task || coins < 3) { alert('코인 3 부족'); return; }
  coins -= 3; updateCoinsUI();
  
  // Birth 2: p3 companions as AI errand scouts (cross p3 persona echo)
  const scoutSurprise = (window.p6AcheGazeMirror ? window.p6AcheGazeMirror(task.ache) : (task.surprise || 0.4) * (0.8 + Math.random()*0.7));
  task.scoutEcho = scoutSurprise;
  
  // simulate p3 cross plant
  try {
    localStorage.setItem('p6LungCompanion', JSON.stringify({voiceAcheFeed: task.ache, surpriseIntimacy: scoutSurprise, source:'p7-errand'}));
  } catch(e){}
  
  localStorage.setItem('p7_tasks', JSON.stringify(tasks));
  renderTasks();
  updateStatus(`p3 Scout Echo dispatched • surprise ${scoutSurprise.toFixed(2)} • completion gacha boosted`);
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
}

function chargeCoins() {
  // FOMO charge
  const today = new Date().toDateString();
  let charges = JSON.parse(localStorage.getItem('p7_charges') || '{}');
  if (charges[today] >= 5) {
    alert('오늘 충전 한도 초과 (FOMO)');
    return;
  }
  coins += 50;
  charges[today] = (charges[today] || 0) + 1;
  localStorage.setItem('p7_charges', JSON.stringify(charges));
  updateCoinsUI();
  updateStatus('50 coins 충전 완료 • virtual credit');
}

function showNotebook() {
  hideAll();
  const sec = document.getElementById('notebook');
  sec.classList.remove('hidden');
  const list = document.getElementById('notebook-list');
  list.innerHTML = '';
  
  // Birth 3: Sfumato Embodiment Memory Glow (p6 lung visual cross — real-world map spore)
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
    el.innerHTML = `<small>${new Date(n.time).toLocaleDateString()} • +${n.earn}c gacha${n.gacha||0} • s${(n.surprise||0).toFixed(2)} ache${(n.ache||0).toFixed(1)}</small><br>${n.task}<br><i>${n.review}</i>`;
    list.appendChild(el);
  });
}

function drawMemoryGlow(c, entries) {
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#0a0806'; ctx.fillRect(0,0,c.width,c.height);
  // Sfumato soft golden breath spots (embodiment map — past ache locations glow)
  entries.slice(0,12).forEach((n,i) => {
    const x = 30 + (i % 5) * 55 + (n.surprise || 0.3)*12;
    const y = 25 + Math.floor(i/5)*32 + ((n.ache||0)-0.4)*18;
    const r = 9 + (n.surprise||0.3)*18;
    const a = 0.08 + (n.surprise||0.3)*0.22;
    ctx.shadowBlur = 14; ctx.shadowColor = '#c5a46e';
    ctx.fillStyle = `hsla(42,58%,72%,${a})`;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI*2); ctx.fill();
    ctx.shadowBlur = 0;
  });
}

function initP7() {
  // Seed some demo tasks
  if (tasks.length === 0) {
    tasks = [
      {desc: '냉장고 2층→1층 옮겨주세요 (무거움)', cost: 18, urgency:'today', lat:37.57, lng:126.98, time:Date.now()-3600000, surprise:0.41},
      {desc: '바퀴벌레 잡아주세요. 화장실', cost: 8, urgency:'asap', lat:37.56, lng:126.97, time:Date.now()-7200000, surprise:0.67},
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
  
  // p6 cross ready
  if (window.getP6LungSurprise) {
    updateStatus('p6 Lung Surprise Eye 연결됨 • voice로 ache 감지');
  }
}

window.onload = initP7;

// p6 Lung polyfill (if cross script not loaded) — ensures births always fire
if (!window.getP6LungSurprise) {
  window.getP6LungSurprise = () => 0.38 + Math.random()*0.22;
}
if (!window.p6AcheGazeMirror) {
  window.p6AcheGazeMirror = (a) => Math.min(0.96, (a||0.4)*1.4 + Math.random()*0.25);
}

// PWA install hint
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(()=>{});
}
