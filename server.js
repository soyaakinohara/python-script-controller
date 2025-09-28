const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const db = require('./database.js');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const CONFIG_FILE = path.join(__dirname, 'config.json');

// --- 設定管理 (変更なし) ---
let config = { port: 1919, scripts: [] };
function loadConfig() {
    if (fs.existsSync(CONFIG_FILE)) {
        try { config = JSON.parse(fs.readFileSync(CONFIG_FILE)); }
        catch (e) { saveConfig(); }
    } else {
        saveConfig();
    }
}
function saveConfig() { fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2)); }
loadConfig();


// --- Expressサーバー設定 (変更なし) ---
app.use(express.static('public'));
app.use(express.json());
app.get('/api/config', (req, res) => res.json(config));
app.post('/api/config', (req, res) => {
    const oldPort = config.port;
    config = req.body;
    saveConfig();
    let message = '設定を保存しました。';
    if (oldPort !== config.port) { message += ' ポート番号の変更を適用するには、アプリケーションを再起動してください。'; }
    res.json({ message });
});


// --- プロセス管理 ---
const runningProcesses = new Map();

function startScript(scriptId) {
    if (runningProcesses.has(scriptId)) {
        io.emit('log', { id: scriptId, message: '[INFO] スクリプトはすでに実行中です。\n' });
        return;
    }
    const scriptConfig = config.scripts.find(s => s.id === scriptId);
    if (!scriptConfig) {
        io.emit('log', { id: scriptId, message: `[ERROR] ID:${scriptId} の設定が見つかりません。\n` });
        return;
    }

    const { workingDirectory, scriptName, venvName } = scriptConfig;
    const venv = venvName || 'venv';
    const venvPython = path.join(workingDirectory, venv, 'bin/python');

    if (!fs.existsSync(venvPython)) {
        const errMsg = `[ERROR] 仮想環境が見つかりません: ${venvPython}\n`;
        db.addLog(scriptId, errMsg);
        io.emit('log', { id: scriptId, message: errMsg });
        return;
    }

    const process = spawn(venvPython, ['-u',scriptName], { cwd: workingDirectory });
    
    runningProcesses.set(scriptId, { process });

    const startMessage = `[INFO] スクリプトを開始しました (PID: ${process.pid})\n`;
    db.addLog(scriptId, startMessage);
    io.emit('log', { id: scriptId, message: startMessage });
    io.emit('status', { id: scriptId, status: 'running' });

    const logHandler = (data) => {
        const message = data.toString();
        db.addLog(scriptId, message);
        io.emit('log', { id: scriptId, message });
    };

    process.stdout.on('data', logHandler);
    process.stderr.on('data', (data) => logHandler(`[STDERR] ${data}`));

    process.on('close', (code) => {
        const endMessage = `[INFO] スクリプトが終了しました。終了コード: ${code}\n`;
        db.addLog(scriptId, endMessage);
        io.emit('log', { id: scriptId, message: endMessage });
        runningProcesses.delete(scriptId);
        io.emit('status', { id: scriptId, status: 'stopped' });
    });

    process.on('error', (err) => {
        const errorMessage = `[FATAL] プロセスの起動に失敗しました: ${err.message}\n`;
        db.addLog(scriptId, errorMessage);
        io.emit('log', { id: scriptId, message: errorMessage });
        runningProcesses.delete(scriptId);
        io.emit('status', { id: scriptId, status: 'stopped' });
    });
}

function stopScript(scriptId) {
    if (runningProcesses.has(scriptId)) {
        const stopMessage = '[INFO] スクリプトを停止しています...\n';
        db.addLog(scriptId, stopMessage);
        io.emit('log', { id: scriptId, message: stopMessage });
        runningProcesses.get(scriptId).process.kill('SIGINT');
    } else {
        // ★★★ 修正点 ★★★
        // 既に停止している場合にメッセージを返す
        io.emit('log', { id: scriptId, message: '[INFO] スクリプトはすでに停止しています。\n' });
    }
}

// --- Socket.IO通信 ---
io.on('connection', (socket) => {
    console.log('クライアントが接続しました');

    socket.on('request-log-history', async (scriptId) => {
        try {
            const history = await db.getLogHistory(scriptId);
            socket.emit('log-history', { id: scriptId, message: history });
        } catch (error) {
            console.error('ログ履歴の取得に失敗:', error);
        }
    });

    for (const id of runningProcesses.keys()) {
        socket.emit('status', { id, status: 'running' });
    }

    socket.on('start-script', ({ id }) => startScript(id));
    socket.on('stop-script', ({ id }) => stopScript(id));

    // ★★★ 修正点 ★★★
    // 空だった再起動の処理を正しく実装
    socket.on('restart-script', ({ id }) => {
        if (runningProcesses.has(id)) {
            const processInfo = runningProcesses.get(id);
            // 'close'イベントを一度だけリッスンする
            processInfo.process.once('close', () => {
                // プロセスが完全に停止してから、再度開始する
                startScript(id);
            });
            // 停止命令を出す
            stopScript(id);
        } else {
            // 実行中でなければ、単に開始する
            startScript(id);
        }
    });

    socket.on('disconnect', () => {
        console.log('クライアントが切断しました');
    });
});

// --- サーバー起動 ---
server.listen(config.port, () => {
    console.log(`サーバーが http://localhost:${config.port} で起動しました`);
});
