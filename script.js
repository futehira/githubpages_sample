let allSets = [];
let currentSet = null;
let timerInterval;
let startTime;
let solvedIds = JSON.parse(localStorage.getItem('solved_v4') || "[]");
let attemptedIds = JSON.parse(localStorage.getItem('attempted_v4') || "[]");
let userSelections = {};
let activeCategory = "すべて";

// 初期化
async function init() {
    try {
        const res = await fetch('questions.json');
        if (!res.ok) throw new Error("Fetch failed");
        allSets = await res.json();
        
        // ブラウザの戻るボタンに対応するためのイベント
        window.onpopstate = (event) => {
            if (event.state && event.state.view === 'solve') {
                // startSet自体がpushStateするので、ここでは何もしないか、整合性を保つ
            } else {
                showDashboard(false); // 履歴を積まずにダッシュボードへ
            }
        };

        renderCategoryTabs();
        renderDashboard();
    } catch (e) { 
        document.getElementById('set-list').innerText = "データの読み込みに失敗しました。questions.jsonを確認してください。"; 
    }
}

// カテゴリータブの描画
function renderCategoryTabs() {
    const tabsContainer = document.getElementById('category-tabs');
    if (!tabsContainer) return;
    const categories = ["すべて", ...new Set(allSets.map(s => s.category))];
    
    tabsContainer.innerHTML = categories.map(cat => `
        <div class="tab ${activeCategory === cat ? 'active' : ''}" onclick="filterByCategory('${cat}')">
            ${cat}
        </div>
    `).join('');
}

function filterByCategory(category) {
    activeCategory = category;
    renderCategoryTabs();
    renderDashboard();
}

// 状態判定
function getSetStatus(set) {
    const qs = set.questions || [set];
    const isAllCorrect = qs.every(q => solvedIds.includes(q.id));
    if (isAllCorrect) return 'solved';

    const isAnyAttempted = qs.some(q => attemptedIds.includes(q.id));
    if (isAnyAttempted) return 'attempted';

    return 'unsolved';
}

// ダッシュボード表示
function renderDashboard() {
    const list = document.getElementById('set-list');
    if (!list) return;

    const filteredSets = activeCategory === "すべて" 
        ? allSets 
        : allSets.filter(s => s.category === activeCategory);

    const sortedSets = [...filteredSets].sort((a, b) => {
        const statusOrder = { 'unsolved': 0, 'attempted': 1, 'solved': 2 };
        return statusOrder[getSetStatus(a)] - statusOrder[getSetStatus(b)];
    });

    list.innerHTML = sortedSets.map(set => {
        const status = getSetStatus(set);
        const qCount = set.questions ? set.questions.length : 1;
        const type = set.passages ? 'トリプル' : (set.passage ? '長文' : '単発');

        let statusLabel = '未着手';
        let statusClass = 'status-unsolved';
        if (status === 'solved') {
            statusLabel = '完了';
            statusClass = 'status-solved';
        } else if (status === 'attempted') {
            statusLabel = '実施済み';
            statusClass = 'status-attempted';
        }

        return `
            <div class="set-card" onclick="startSet('${set.id}')">
                <div class="set-info">
                    <div style="font-size:0.7rem; color:var(--primary); font-weight:bold;">${set.category} [${type}]</div>
                    <h3>${set.title}</h3>
                    <span>設問数: ${qCount} | 目標: ${Math.floor(set.target_time_sec/60)}分${set.target_time_sec%60}秒</span>
                </div>
                <div class="status-badge ${statusClass}">
                    ${statusLabel}
                </div>
            </div>
        `;
    }).join('');
    
    const solvedCount = allSets.filter(s => getSetStatus(s) === 'solved').length;
    const statsEl = document.getElementById('overall-stats');
    if (statsEl) statsEl.innerText = `完了: ${solvedCount} / ${allSets.length}`;
    
    switchView('view-dashboard');
}

// 学習開始
function startSet(setId) {
    currentSet = allSets.find(s => s.id === setId);
    if (!currentSet) return;

    userSelections = {};
    const content = document.getElementById('solve-content');
    
    // パッセージ（本文）の構築
    let passageHtml = '';
    const ps = currentSet.passages || (currentSet.passage ? [{type: 'text', content: currentSet.passage}] : []);

    ps.forEach((p) => {
        if (typeof p === 'string') {
            passageHtml += `<div class="passage">${p}</div>`;
        } else if (p.type === 'text') {
            passageHtml += `<div class="passage">${p.content}</div>`;
        } else if (p.type === 'table') {
            let tableHtml = `<div class="passage-table-wrapper">`;
            if (p.title) tableHtml += `<div style="font-weight:bold; margin-bottom:5px;">${p.title}</div>`;
            tableHtml += `<table class="passage-table">`;
            if (p.header) {
                tableHtml += `<thead><tr>${p.header.map(h => `<th>${h}</th>`).join('')}</tr></thead>`;
            }
            tableHtml += `<tbody>${p.rows.map(row => `<tr>${row.map(cell => `<td>${cell}</td>`).join('')}</tr>`).join('')}</tbody>`;
            tableHtml += `</table>`;
            if (p.footer) tableHtml += `<div class="passage-table-footer">${p.footer}</div>`;
            tableHtml += `</div>`;
            passageHtml += tableHtml;
        }
    });

    // 設問の構築
    const qs = currentSet.questions || [currentSet];
    content.innerHTML = passageHtml + qs.map((q, i) => `
        <div class="q-card">
            <div class="q-text" style="font-weight:bold; margin-bottom:10px;">
                Q${i + 1}. ${q.q || "問題文がありません"}
            </div>
            <div class="options" id="opts-${q.id}">
                ${(q.options || []).map((opt, optIdx) => `
                    <button class="opt-btn" id="btn-${q.id}-${optIdx}" onclick="selectOption('${q.id}', ${optIdx})">
                        (${String.fromCharCode(65 + optIdx)}) ${opt}
                    </button>
                `).join('')}
            </div>
            <div id="exp-${q.id}" style="display:none; margin-top:10px; font-size:0.9rem; background:#fefce8; padding:10px; border-radius:5px;">
                <strong>解説:</strong> ${q.explanation || "解説はありません"}
            </div>
        </div>
    `).join('');

    document.getElementById('target-label').innerText = `目標: ${currentSet.target_time_sec}秒`;
    
    // 画面切り替えと履歴の保存
    switchView('view-solve');
    history.pushState({view: 'solve', id: setId}, '');
    
    // タイマー開始
    startTime = Date.now();
    clearInterval(timerInterval);
    timerInterval = setInterval(updateTimer, 100);
}

function selectOption(qId, oIdx) {
    userSelections[qId] = oIdx;
    const container = document.getElementById(`opts-${qId}`);
    if (!container) return;
    container.querySelectorAll('.opt-btn').forEach(b => b.classList.remove('selected'));
    const btn = document.getElementById(`btn-${qId}-${oIdx}`);
    if (btn) btn.classList.add('selected');
}

function updateTimer() {
    const sec = Math.floor((Date.now() - startTime) / 1000);
    const min = Math.floor(sec / 60);
    const displaySec = sec % 60;
    document.getElementById('timer').innerText = 
        `${String(min).padStart(2,'0')}:${String(displaySec).padStart(2,'0')}`;
}

// 採点
function gradeCurrentSet() {
    if (!currentSet) return;
    clearInterval(timerInterval);
    
    const finalTime = Math.floor((Date.now() - startTime) / 1000);
    const qs = currentSet.questions || [currentSet];
    
    qs.forEach(q => {
        const selected = userSelections[q.id];
        
        // 実施済みリストへの追加（一度でも回答したら）
        if (selected !== undefined && !attemptedIds.includes(q.id)) {
            attemptedIds.push(q.id);
        }

        // 正解・不正解の表示
        const correctBtn = document.getElementById(`btn-${q.id}-${q.answer}`);
        if (correctBtn) correctBtn.classList.add('correct');
        
        if (selected !== undefined && selected !== q.answer) {
            const wrongBtn = document.getElementById(`btn-${q.id}-${selected}`);
            if (wrongBtn) wrongBtn.classList.add('wrong');
        }

        // 正解なら「完了」リストに追加
        if (selected === q.answer && !solvedIds.includes(q.id)) {
            solvedIds.push(q.id);
        }
        
        const exp = document.getElementById(`exp-${q.id}`);
        if (exp) exp.style.display = 'block';
    });

    localStorage.setItem('solved_v4', JSON.stringify(solvedIds));
    localStorage.setItem('attempted_v4', JSON.stringify(attemptedIds));

    const status = finalTime <= currentSet.target_time_sec ? "目標達成！" : "時間超過";
    
    // 採点ボタンを無効化して重複を避ける
    const gradeBtn = document.getElementById('grade-btn');
    if (gradeBtn) gradeBtn.disabled = true;

    // わずかに遅延させてアラートを出し、画面を更新
    setTimeout(() => {
        alert(`タイム: ${document.getElementById('timer').innerText}\n${status}`);
    }, 100);
}

// ダッシュボードに戻る
function showDashboard(pushHistory = true) {
    clearInterval(timerInterval);
    currentSet = null;
    const gradeBtn = document.getElementById('grade-btn');
    if (gradeBtn) gradeBtn.disabled = false;

    if (pushHistory) {
        history.pushState({view: 'dashboard'}, '');
    }
    renderDashboard();
}

// 画面表示の切り替え
function switchView(viewId) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    const target = document.getElementById(viewId);
    if (target) {
        target.classList.add('active');
        window.scrollTo(0,0);
    }
}

init();