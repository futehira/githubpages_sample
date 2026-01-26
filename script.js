let allSets = [];
let currentSet = null;
let timerInterval;
let startTime;
let solvedIds = JSON.parse(localStorage.getItem('solved_v4') || "[]");
let attemptedIds = JSON.parse(localStorage.getItem('attempted_v4') || "[]");
let userSelections = {};
let activeCategory = "すべて";

// 初期化：目次(index.json)を読み込む
async function init() {
    try {
        const res = await fetch('index.json');
        if (!res.ok) throw new Error("Index fetch failed");
        allSets = await res.json();
        
        window.onpopstate = (event) => {
            if (!(event.state && event.state.view === 'solve')) {
                showDashboard(false);
            }
        };

        renderCategoryTabs();
        renderDashboard();
    } catch (e) { 
        document.getElementById('set-list').innerText = "データの読み込みに失敗しました。"; 
    }
}

// 学習開始：クリック時に詳細JSONをfetchする
async function startSet(setId) {
    try {
        // 1. 詳細データの取得
        const res = await fetch(`data/${setId}.json`);
        if (!res.ok) throw new Error("詳細データの取得失敗");
        currentSet = await res.json();

        // 2. 初期化
        userSelections = {};
        renderSolveUI(); // 描画専用関数を呼び出す

        document.getElementById('target-label').innerText = `目標: ${currentSet.target_time_sec}秒`;
        
        switchView('view-solve');
        history.pushState({view: 'solve', id: setId}, '');
        
        // 3. タイマー開始
        startTime = Date.now();
        clearInterval(timerInterval);
        timerInterval = setInterval(updateTimer, 100);

    } catch (e) {
        console.error(e);
        alert("問題の読み込みに失敗しました。ファイルが data/ フォルダにあるか確認してください。");
    }
}

// 描画ロジック（currentSetの内容を表示する）
function renderSolveUI() {
    if (!currentSet) return;
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
            if (p.header) tableHtml += `<thead><tr>${p.header.map(h => `<th>${h}</th>`).join('')}</tr></thead>`;
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
    
    const gradeBtn = document.getElementById('grade-btn');
    if (gradeBtn) gradeBtn.disabled = false;
}

// 状態判定の修正（index.jsonにquestionsがない場合を考慮）
function getSetStatus(set) {
    // index.json から取得した設問IDリストを参照。
    // 万が一存在しない場合は [set.id] を代用。
    const ids = set.questionIds || [set.id];
    
    // 1. 全ての設問IDが solvedIds に含まれているかチェック
    const isAllCorrect = ids.every(id => solvedIds.includes(id));
    if (isAllCorrect) return 'solved';

    // 2. いずれかの設問IDが attemptedIds に含まれているかチェック
    const isAnyAttempted = ids.some(id => attemptedIds.includes(id));
    if (isAnyAttempted) return 'attempted';

    return 'unsolved';
}

// --- 他の関数（renderDashboard, selectOption, updateTimer, gradeCurrentSet 等）は既存のままでOK ---

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
    const timerEl = document.getElementById('timer');
    if (timerEl) {
        timerEl.innerText = `${String(min).padStart(2,'0')}:${String(displaySec).padStart(2,'0')}`;
    }
}

function gradeCurrentSet() {
    if (!currentSet) return;
    clearInterval(timerInterval);
    
    const finalTime = Math.floor((Date.now() - startTime) / 1000);
    const qs = currentSet.questions || [currentSet];
    
    qs.forEach(q => {
        const selected = userSelections[q.id];
        if (selected !== undefined && !attemptedIds.includes(q.id)) {
            attemptedIds.push(q.id);
        }
        const correctBtn = document.getElementById(`btn-${q.id}-${q.answer}`);
        if (correctBtn) correctBtn.classList.add('correct');
        if (selected !== undefined && selected !== q.answer) {
            const wrongBtn = document.getElementById(`btn-${q.id}-${selected}`);
            if (wrongBtn) wrongBtn.classList.add('wrong');
        }
        if (selected === q.answer && !solvedIds.includes(q.id)) {
            solvedIds.push(q.id);
        }
        const exp = document.getElementById(`exp-${q.id}`);
        if (exp) exp.style.display = 'block';
    });

    localStorage.setItem('solved_v4', JSON.stringify(solvedIds));
    localStorage.setItem('attempted_v4', JSON.stringify(attemptedIds));
    
    const gradeBtn = document.getElementById('grade-btn');
    if (gradeBtn) gradeBtn.disabled = true;

    setTimeout(() => {
        const status = finalTime <= currentSet.target_time_sec ? "目標達成！" : "時間超過";
        alert(`タイム: ${document.getElementById('timer').innerText}\n${status}`);
    }, 100);
}

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

function renderDashboard() {
    const list = document.getElementById('set-list');
    if (!list) return;

    const filteredSets = activeCategory === "すべて" 
        ? allSets 
        : allSets.filter(s => s.category === activeCategory);

    list.innerHTML = filteredSets.map(set => {
        const status = getSetStatus(set);
        const qCount = set.qCount || (set.questions ? set.questions.length : 1);
        
        let statusLabel = '未着手', statusClass = 'status-unsolved';
        if (status === 'solved') { statusLabel = '完了'; statusClass = 'status-solved'; }
        else if (status === 'attempted') { statusLabel = '実施済み'; statusClass = 'status-attempted'; }

        return `
            <div class="set-card" onclick="startSet('${set.id}')">
                <div class="set-info">
                    <div style="font-size:0.7rem; color:var(--primary); font-weight:bold;">${set.category}</div>
                    <h3>${set.title}</h3>
                    <span>設問数: ${qCount} | 目標: ${Math.floor(set.target_time_sec/60)}分${set.target_time_sec%60}秒</span>
                </div>
                <div class="status-badge ${statusClass}">${statusLabel}</div>
            </div>
        `;
    }).join('');
    
    const solvedCount = allSets.filter(s => getSetStatus(s) === 'solved').length;
    document.getElementById('overall-stats').innerText = `完了: ${solvedCount} / ${allSets.length}`;
    switchView('view-dashboard');
}

function showDashboard(pushHistory = true) {
    clearInterval(timerInterval);
    currentSet = null;
    if (pushHistory) history.pushState({view: 'dashboard'}, '');
    renderDashboard();
}

function switchView(viewId) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById(viewId).classList.add('active');
    window.scrollTo(0,0);
}

init();