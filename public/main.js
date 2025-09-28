document.addEventListener('DOMContentLoaded', () => {
    const socket = io();
    let config = {};

    // --- DOM要素 ---
    const scriptsContainer = document.getElementById('scripts-container');
    const settingsBtn = document.getElementById('settings-btn');
    const settingsModal = document.getElementById('settings-modal');
    const closeModalBtn = document.getElementById('close-modal-btn');
    const saveSettingsBtn = document.getElementById('save-settings-btn');
    const portInput = document.getElementById('port');
    const scriptList = document.getElementById('script-list');
    const addScriptBtn = document.getElementById('add-script-btn');
    const editScriptModal = document.getElementById('edit-script-modal');
    const editScriptForm = document.getElementById('edit-script-form');
    const cancelEditBtn = document.getElementById('cancel-edit-btn');
    const editModalTitle = document.getElementById('edit-modal-title');
    const editScriptId = document.getElementById('edit-script-id');

    // --- UI生成 ---
    function createScriptCard(script) {
        return `
            <div class="script-card" id="script-${script.id}">
                <div class="card-header">
                    <h3>${script.name}</h3>
                    <div class="status-indicator stopped" id="status-${script.id}"></div>
                </div>
                <div class="card-controls">
                    <button data-action="start" data-id="${script.id}">開始</button>
                    <button data-action="stop" data-id="${script.id}">停止</button>
                    <button data-action="restart" data-id="${script.id}">再起動</button>
                </div>
                <div class="terminal" id="logs-${script.id}"><pre></pre></div>
                <div class="card-footer">
                    <button data-action="toggle-logs" data-id="${script.id}">ログ表示/非表示</button>
                </div>
            </div>
        `;
    }

    function renderAllCards() {
        scriptsContainer.innerHTML = config.scripts.map(createScriptCard).join('');
        config.scripts.forEach(script => {
            socket.emit('request-log-history', script.id);
        });
    }
    
    // --- 設定画面ロジック ---
    function openSettingsModal() {
        portInput.value = config.port;
        renderScriptList();
        settingsModal.style.display = 'flex';
    }

    function closeSettingsModal() {
        settingsModal.style.display = 'none';
    }

    function renderScriptList() {
        scriptList.innerHTML = config.scripts.map(script => `
            <li>
                <span>${script.name}</span>
                <div class="script-list-actions">
                    <button data-action="edit-script" data-id="${script.id}">編集</button>
                    <button data-action="delete-script" data-id="${script.id}">削除</button>
                </div>
            </li>
        `).join('');
    }

    function openEditModal(scriptId = null) {
        editScriptForm.reset();
        if (scriptId) {
            const script = config.scripts.find(s => s.id === scriptId);
            editModalTitle.textContent = 'スクリプトを編集';
            editScriptId.value = script.id;
            document.getElementById('edit-name').value = script.name;
            document.getElementById('edit-workingDirectory').value = script.workingDirectory;
            document.getElementById('edit-scriptName').value = script.scriptName;
            document.getElementById('edit-venvName').value = script.venvName || '';
        } else {
            editModalTitle.textContent = '新しいスクリプトを追加';
            editScriptId.value = '';
        }
        editScriptModal.style.display = 'flex';
    }

    function closeEditModal() {
        editScriptModal.style.display = 'none';
    }

    async function saveConfig() {
        try {
            const response = await fetch('/api/config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(config),
            });
            const result = await response.json();
            alert(result.message);
            closeSettingsModal();
            location.reload();
        } catch (error) {
            alert('設定の保存に失敗しました。');
            console.error('設定保存エラー:', error);
        }
    }
    
    // --- 初期化 ---
    async function initialize() {
        try {
            const response = await fetch('/api/config');
            config = await response.json();
            renderAllCards();
        } catch (error) {
            console.error('設定の読み込みに失敗:', error);
        }
    }
    
    // --- イベントリスナー ---
    scriptsContainer.addEventListener('click', (e) => {
        const { action, id } = e.target.dataset;
        if (!action || !id) return;

        if (action === 'toggle-logs') {
            const terminal = document.getElementById(`logs-${id}`);
            terminal.classList.toggle('expanded');

            // ★★★ 修正点 ★★★
            // もしログエリアが表示状態になったなら、一番下までスクロールする
            if (terminal.classList.contains('expanded')) {
                terminal.scrollTop = terminal.scrollHeight;
            }

        } else {
            socket.emit(`${action}-script`, { id });
        }
    });
    settingsBtn.addEventListener('click', openSettingsModal);
    closeModalBtn.addEventListener('click', closeSettingsModal);
    saveSettingsBtn.addEventListener('click', () => {
        config.port = parseInt(portInput.value, 10);
        saveConfig();
    });
    addScriptBtn.addEventListener('click', () => openEditModal());
    scriptList.addEventListener('click', (e) => {
        const { action, id } = e.target.dataset;
        if (!action || !id) return;
        if (action === 'edit-script') {
            openEditModal(id);
        } else if (action === 'delete-script') {
            if (confirm('本当にこのスクリプトを削除しますか？')) {
                config.scripts = config.scripts.filter(s => s.id !== id);
                renderScriptList();
            }
        }
    });
    cancelEditBtn.addEventListener('click', closeEditModal);
    editScriptForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const scriptData = {
            id: editScriptId.value || Date.now().toString(),
            name: document.getElementById('edit-name').value,
            workingDirectory: document.getElementById('edit-workingDirectory').value,
            scriptName: document.getElementById('edit-scriptName').value,
            venvName: document.getElementById('edit-venvName').value
        };
        if (editScriptId.value) {
            const index = config.scripts.findIndex(s => s.id === scriptData.id);
            config.scripts[index] = scriptData;
        } else {
            config.scripts.push(scriptData);
        }
        renderScriptList();
        closeEditModal();
    });

    // --- Socket.IO イベント ---
    socket.on('log', ({ id, message }) => {
        const logContainer = document.querySelector(`#logs-${id} pre`);
        if (logContainer) {
            logContainer.textContent += message;
            logContainer.parentElement.scrollTop = logContainer.parentElement.scrollHeight;
        }
    });

    socket.on('log-history', ({ id, message }) => {
        const logContainer = document.querySelector(`#logs-${id} pre`);
        if (logContainer) {
            logContainer.textContent = message;
            logContainer.parentElement.scrollTop = logContainer.parentElement.scrollHeight;
        }
    });

    socket.on('status', ({ id, status }) => {
        const statusIndicator = document.getElementById(`status-${id}`);
        if (statusIndicator) {
            statusIndicator.className = `status-indicator ${status}`;
        }
    });

    // 初期化処理を実行
    initialize();
});
