const sqlite3 = require('sqlite3').verbose();
const DB_FILE = './logs.db';

// データベースに接続（ファイルがなければ自動作成）
const db = new sqlite3.Database(DB_FILE, (err) => {
    if (err) {
        console.error('データベース接続エラー:', err.message);
    } else {
        console.log('SQLiteデータベースに接続しました。');
        // ログを保存するテーブルを作成
        db.run(`CREATE TABLE IF NOT EXISTS logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            script_id TEXT NOT NULL,
            message TEXT NOT NULL,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);
    }
});

/**
 * ログをデータベースに追加する
 * @param {string} scriptId 
 * @param {string} message 
 */
function addLog(scriptId, message) {
    const sql = `INSERT INTO logs (script_id, message) VALUES (?, ?)`;
    db.run(sql, [scriptId, message], (err) => {
        if (err) {
            console.error('ログの書き込みエラー:', err.message);
        }
    });
}

/**
 * 指定されたスクリプトのログ履歴を取得する
 * @param {string} scriptId 
 * @param {number} limit 取得する最大行数
 * @returns {Promise<string>}
 */
function getLogHistory(scriptId, limit = 200) {
    return new Promise((resolve, reject) => {
        const sql = `SELECT message FROM logs WHERE script_id = ? ORDER BY timestamp DESC LIMIT ?`;
        db.all(sql, [scriptId, limit], (err, rows) => {
            if (err) {
                reject(err);
            } else {
                // 取得したログは新しい順なので、逆順にして古い順に直す
                const messages = rows.reverse().map(row => row.message).join('');
                resolve(messages);
            }
        });
    });
}

module.exports = { addLog, getLogHistory };
