let allSets = [];
let currentSet = null;
let timerInterval;
let startTime;
let solvedIds = JSON.parse(localStorage.getItem('solved_v4') || "[]");
let userSelections = {};
let activeCategory = "すべて";

async function init() {
    try {
        const res = await fetch('questions.json');
        allSets = await res.json();
        renderCategoryTabs();
        renderDashboard();
    } catch (e) { 
        document.getElementById('set-list').innerText = "データ読み込み失敗"; 
    }
}

function renderCategoryTabs() {
    const tabsContainer = document.getElementById('category-tabs');
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
    const filteredSets = activeCategory === "すべて" 
        ? allSets 
        : allSets.filter(s => s.category === activeCategory);

    const sortedSets = [...filteredSets].sort((a, b) => {
        const aDone = isSetSolved(a);
        const bDone = isSetSolved(b);
        return aDone === bDone ? 0 : aDone ? 1 : -1;
    });

    list.innerHTML = sortedSets.map(set => {
        const done = isSetSolved(set);
        const qCount = set.questions ? set.questions.length : 1;
        const type = set.passages ? 'トリプル' : (set.passage ? '長文' : '単発');

        return `
            <div class="set-card" onclick="startSet('${set.id}')">
                <div class="set-info">
                    <div style="font-size:0.7rem; color:var(--primary); font-weight:bold;">${set.category} [${type}]</div>
                    <h3>${set.title}</h3>
                    <span>設問数: ${qCount} | 目標: ${Math.floor(set.target_time_sec/60)}分${set.target_time_sec%60}秒</span>
                </div>
                <div class="status-badge ${done ? 'status-solved' : 'status-unsolved'}">
                    ${done ? '完了' : '未着手'}
                </div>
            </div>
        `;
    }).join('');
    
    document.getElementById('overall-stats').innerText = `完了: ${allSets.filter(isSetSolved).length} / ${allSets.length}`;
    switchView('view-dashboard');
}

function isSetSolved(set) {
    const qs = set.questions || [set];
    return qs.every(q => solvedIds.includes(q.id));
}

function startSet(setId) {
    currentSet = allSets.find(s => s.id === setId);
    userSelections = {};
    const content = document.getElementById('solve-content');
    
    let passageHtml = '';
    const ps = currentSet.passages || (currentSet.passage ? [{type: 'text', content: currentSet.passage}] : []);

    ps.forEach((p, i) => {
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
    switchView('view-solve');
    
    startTime = Date.now();
    clearInterval(timerInterval);
    timerInterval = setInterval(updateTimer, 100);
}

function selectOption(qId, oIdx) {
    userSelections[qId] = oIdx;
    const container = document.getElementById(`opts-${qId}`);
    container.querySelectorAll('.opt-btn').forEach(b => b.classList.remove('selected'));
    document.getElementById(`btn-${qId}-${oIdx}`).classList.add('selected');
}

function updateTimer() {
    const sec = Math.floor((Date.now() - startTime) / 1000);
    document.getElementById('timer').innerText = 
        `${String(Math.floor(sec/60)).padStart(2,'0')}:${String(sec%60).padStart(2,'0')}`;
}

function gradeCurrentSet() {
    clearInterval(timerInterval);
    const finalTime = Math.floor((Date.now() - startTime) / 1000);
    const qs = currentSet.questions || [currentSet];
    
    qs.forEach(q => {
        const selected = userSelections[q.id];
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
    const status = finalTime <= currentSet.target_time_sec ? "目標達成！" : "時間超過";
    alert(`タイム: ${document.getElementById('timer').innerText}\n${status}`);
}

function showDashboard() {
    clearInterval(timerInterval);
    renderDashboard();
}

function switchView(viewId) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    const target = document.getElementById(viewId);
    if (target) target.classList.add('active');
    window.scrollTo(0,0);
}

// 最後に初期化関数を実行
init();