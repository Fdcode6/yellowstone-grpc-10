import axios from 'axios';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';

// 配置参数
const API_URL = 'http://localhost:8080/api/wallet_score?wallet='; // 钱包评分API地址
const DB_PATH = path.join(__dirname, '../wallet_data.db'); // 数据库路径
const QUERY_INTERVAL = 5000; // 查询间隔（毫秒）
const RECHECK_INTERVAL = 60000; // 重新检查数据库间隔（毫秒）
const UPDATE_THRESHOLD = 86400000; // 更新阈值（毫秒），24小时

// 数据库连接
let db: any;

// 初始化数据库
async function initDb() {
    console.log('初始化数据库连接...');
    db = await open({
        filename: DB_PATH,
        driver: sqlite3.Database
    });
    
    console.log('检查数据库表是否存在...');
    
    // 确保wallets表存在
    await db.exec(`
        CREATE TABLE IF NOT EXISTS wallets (
            address TEXT PRIMARY KEY,
            first_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            last_query TIMESTAMP,
            total_score REAL,
            token_count INTEGER,
            win_rate REAL,
            profit_7d REAL,
            profit_30d REAL,
            high_profit_tokens_count INTEGER,
            scam_tokens_count INTEGER,
            trade_count_7d INTEGER,
            trade_count_30d INTEGER,
            avg_holding_time REAL,
            buy_sell_ratio REAL,
            honeypot_ratio REAL,
            fast_tx_ratio REAL,
            no_buy_hold_ratio REAL,
            last_updated INTEGER
        )
    `);
    
    console.log('数据库初始化完成');
}

// 查询钱包评分
async function queryWalletScore(walletAddress: string): Promise<any> {
    try {
        console.log(`查询钱包 ${walletAddress} 的评分数据...`);
        const response = await axios.get(`${API_URL}${walletAddress}`);
        
        if (response.status === 200 && response.data && response.data.success) {
            console.log(`成功获取钱包 ${walletAddress} 的评分数据`);
            return response.data;
        } else {
            console.log(`获取钱包 ${walletAddress} 的评分数据失败: ${response.data?.message || response.statusText}`);
            return null;
        }
    } catch (error) {
        console.error(`查询钱包 ${walletAddress} 评分时出错:`, error);
        return null;
    }
}

// 更新钱包数据
async function updateWalletData(walletAddress: string, scoreData: any) {
    try {
        console.log(`更新钱包 ${walletAddress} 的数据...`);
        
        const now = Date.now();
        
        // 检查钱包是否已存在
        const existingWallet = await db.get('SELECT * FROM wallets WHERE address = ?', walletAddress);
        
        // 从API响应中提取数据
        const data = scoreData.data || {};
        const total_score = data.total_score || 0;
        const token_count = data.token_count || 0;
        
        // 提取交易能力数据
        const trading_ability = data.trading_ability || {};
        const win_rate = trading_ability.win_rate || 0;
        const profit_7d = trading_ability.profit_7d || 0;
        const profit_30d = trading_ability.profit_30d || 0;
        const high_profit_tokens_count = trading_ability.high_profit_tokens_count || 0;
        const scam_tokens_count = trading_ability.scam_tokens_count || 0;
        
        // 提取交易风格数据
        const trading_style = data.trading_style || {};
        const trade_count_7d = trading_style.trade_count_7d || 0;
        const trade_count_30d = trading_style.trade_count_30d || 0;
        const avg_holding_time = trading_style.avg_holding_time || 0;
        const buy_sell_ratio = trading_style.buy_sell_ratio || 0;
        
        // 提取风险控制数据
        const risk_control = data.risk_control || {};
        const honeypot_ratio = risk_control.honeypot_ratio || 0;
        const fast_tx_ratio = risk_control.fast_tx_ratio || 0;
        const no_buy_hold_ratio = risk_control.no_buy_hold_ratio || 0;
        
        if (existingWallet) {
            // 更新现有钱包数据
            await db.run(`
                UPDATE wallets SET
                    total_score = ?,
                    token_count = ?,
                    win_rate = ?,
                    profit_7d = ?,
                    profit_30d = ?,
                    high_profit_tokens_count = ?,
                    scam_tokens_count = ?,
                    trade_count_7d = ?,
                    trade_count_30d = ?,
                    avg_holding_time = ?,
                    buy_sell_ratio = ?,
                    honeypot_ratio = ?,
                    fast_tx_ratio = ?,
                    no_buy_hold_ratio = ?,
                    last_updated = ?
                WHERE address = ?
            `, [
                total_score,
                token_count,
                win_rate,
                profit_7d,
                profit_30d,
                high_profit_tokens_count,
                scam_tokens_count,
                trade_count_7d,
                trade_count_30d,
                avg_holding_time,
                buy_sell_ratio,
                honeypot_ratio,
                fast_tx_ratio,
                no_buy_hold_ratio,
                now,
                walletAddress
            ]);
            
            console.log(`钱包 ${walletAddress} 数据已更新`);
        } else {
            // 插入新钱包数据
            await db.run(`
                INSERT INTO wallets (
                    address,
                    total_score,
                    token_count,
                    win_rate,
                    profit_7d,
                    profit_30d,
                    high_profit_tokens_count,
                    scam_tokens_count,
                    trade_count_7d,
                    trade_count_30d,
                    avg_holding_time,
                    buy_sell_ratio,
                    honeypot_ratio,
                    fast_tx_ratio,
                    no_buy_hold_ratio,
                    last_updated
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                walletAddress,
                total_score,
                token_count,
                win_rate,
                profit_7d,
                profit_30d,
                high_profit_tokens_count,
                scam_tokens_count,
                trade_count_7d,
                trade_count_30d,
                avg_holding_time,
                buy_sell_ratio,
                honeypot_ratio,
                fast_tx_ratio,
                no_buy_hold_ratio,
                now
            ]);
            
            console.log(`钱包 ${walletAddress} 数据已添加`);
        }
    } catch (error) {
        console.error(`更新钱包 ${walletAddress} 数据时出错:`, error);
    }
}

// 主函数
async function main() {
    try {
        // 获取需要更新的钱包地址
        const wallets = await db.all(`
            SELECT address FROM wallets
            WHERE last_updated IS NULL OR (strftime('%s', 'now') * 1000 - last_updated) > ${UPDATE_THRESHOLD}
            LIMIT 10
        `);
        
        if (wallets.length === 0) {
            console.log('没有需要更新的钱包，将在1分钟后重新检查');
            return;
        }
        
        console.log(`找到 ${wallets.length} 个需要更新的钱包（更新时间为空或超过24小时未更新）`);
        
        // 依次查询每个钱包的评分
        for (const wallet of wallets) {
            const scoreData = await queryWalletScore(wallet.address);
            
            if (scoreData) {
                await updateWalletData(wallet.address, scoreData);
            }
            
            // 延迟一段时间，避免API请求过于频繁
            await new Promise(resolve => setTimeout(resolve, QUERY_INTERVAL));
        }
        
        console.log('钱包评分更新完成，将在1分钟后检查新的钱包');
    } catch (error) {
        console.error('执行主函数时出错:', error);
    }
}

// 初始化并启动
(async () => {
    try {
        await initDb();
        
        // 立即执行一次
        await main();
        
        // 每分钟执行一次，而不是每小时
        setInterval(main, RECHECK_INTERVAL);
        
        console.log('钱包评分查询器已启动，将每分钟检查需要更新的钱包');
    } catch (error) {
        console.error('启动钱包评分查询器时出错:', error);
    }
})(); 