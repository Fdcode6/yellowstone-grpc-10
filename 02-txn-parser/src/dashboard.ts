import express from 'express';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';
import fs from 'fs';

// 配置参数
const PORT = 3000;
const DB_PATH = path.join(__dirname, '../wallet_data.db');
const VIEWS_PATH = path.join(__dirname, '../views');
const PUBLIC_PATH = path.join(__dirname, '../public');

// 创建Express应用
const app = express();

// 设置视图引擎
app.set('view engine', 'ejs');
app.set('views', VIEWS_PATH);

// 静态文件
app.use(express.static(PUBLIC_PATH));

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
    
    // 确保transactions表存在
    await db.exec(`
        CREATE TABLE IF NOT EXISTS transactions (
            signature TEXT PRIMARY KEY,
            wallet_address TEXT,
            type TEXT,
            token_address TEXT,
            sol_amount REAL,
            timestamp INTEGER,
            FOREIGN KEY (wallet_address) REFERENCES wallets(address)
        )
    `);
    
    console.log('数据库初始化完成');
}

// 路由：首页
app.get('/', async (req, res) => {
    try {
        const page = parseInt(req.query.page as string) || 1;
        const limit = 20;
        const offset = (page - 1) * limit;
        const search = req.query.search as string || '';
        
        let wallets;
        let totalWallets;
        
        if (search) {
            wallets = await db.all(`
                SELECT 
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
                    fast_tx_ratio, 
                    no_buy_hold_ratio,
                    last_updated
                FROM wallets 
                WHERE address LIKE ? 
                ORDER BY total_score DESC 
                LIMIT ? OFFSET ?
            `, [`%${search}%`, limit, offset]);
            
            totalWallets = await db.get(`
                SELECT COUNT(*) as count FROM wallets 
                WHERE address LIKE ?
            `, [`%${search}%`]);
        } else {
            wallets = await db.all(`
                SELECT 
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
                    fast_tx_ratio, 
                    no_buy_hold_ratio,
                    last_updated
                FROM wallets 
                ORDER BY total_score DESC 
                LIMIT ? OFFSET ?
            `, [limit, offset]);
            
            totalWallets = await db.get(`
                SELECT COUNT(*) as count FROM wallets
            `);
        }
        
        // 获取统计数据
        const stats = await db.get(`
            SELECT 
                COUNT(*) as total_wallets,
                AVG(total_score) as average_score,
                AVG(token_count) as average_token_count
            FROM wallets
        `);
        
        const totalPages = Math.ceil(totalWallets.count / limit);
        
        // 定义表头
        const tableHeaders = [
            { id: 'address', label: '钱包地址' },
            { id: 'total_score', label: '总评分' },
            { id: 'token_count', label: '代币数量' },
            { id: 'win_rate', label: '胜率(%)' },
            { id: 'profit_7d', label: '7天盈利($)' },
            { id: 'profit_30d', label: '30天盈利($)' },
            { id: 'high_profit_tokens_count', label: '高盈利代币' },
            { id: 'scam_tokens_count', label: '诈骗代币' },
            { id: 'trade_count_7d', label: '7天交易数' },
            { id: 'trade_count_30d', label: '30天交易数' },
            { id: 'avg_holding_time', label: '平均持仓时间(h)' },
            { id: 'fast_tx_ratio', label: '快速交易风险(%)' },
            { id: 'no_buy_hold_ratio', label: '无买入持仓风险(%)' },
            { id: 'last_updated', label: '最后更新' }
        ];
        
        res.render('index', {
            wallets,
            tableHeaders,
            page,
            totalPages,
            search: search || '',
            totalWallets: stats.total_wallets || 0,
            averageScore: stats.average_score || 0,
            averageTokenCount: stats.average_token_count || 0
        });
    } catch (error) {
        console.error('获取钱包列表出错:', error);
        res.status(500).send('服务器错误');
    }
});

// 路由：钱包详情
app.get('/wallet/:address', async (req, res) => {
    try {
        const address = req.params.address;
        
        // 获取钱包信息
        const wallet = await db.get(`
            SELECT * FROM wallets 
            WHERE address = ?
        `, [address]);
        
        if (!wallet) {
            return res.status(404).send('钱包未找到');
        }
        
        // 获取钱包的交易记录
        const transactions = await db.all(`
            SELECT * FROM transactions 
            WHERE wallet_address = ? 
            ORDER BY timestamp DESC 
            LIMIT 50
        `, [address]);
        
        res.render('wallet', {
            wallet,
            transactions
        });
    } catch (error) {
        console.error('获取钱包详情出错:', error);
        res.status(500).send('服务器错误');
    }
});

// 路由：导出所有钱包数据
app.get('/export-all', async (req, res) => {
    try {
        // 获取所有钱包数据
        const allWallets = await db.all(`
            SELECT 
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
                fast_tx_ratio, 
                no_buy_hold_ratio,
                last_updated
            FROM wallets 
            ORDER BY total_score DESC
        `);
        
        // 设置响应头
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=all_solana_wallets.csv');
        
        // 创建CSV表头
        const headers = [
            '钱包地址',
            '总评分',
            '代币数量',
            '胜率(%)',
            '7天盈利($)',
            '30天盈利($)',
            '高盈利代币',
            '诈骗代币',
            '7天交易数',
            '30天交易数',
            '平均持仓时间(h)',
            '快速交易风险(%)',
            '无买入持仓风险(%)',
            '最后更新'
        ];
        
        // 写入表头
        res.write(headers.join(',') + '\n');
        
        // 写入数据行
        allWallets.forEach((wallet: any) => {
            const row = [
                wallet.address,
                wallet.total_score ? wallet.total_score.toFixed(2) : 'N/A',
                wallet.token_count || 'N/A',
                wallet.win_rate ? wallet.win_rate.toFixed(1) : 'N/A',
                wallet.profit_7d ? wallet.profit_7d.toLocaleString() : 'N/A',
                wallet.profit_30d ? wallet.profit_30d.toLocaleString() : 'N/A',
                wallet.last_updated ? (wallet.high_profit_tokens_count || 0) : 'N/A',
                wallet.last_updated ? (wallet.scam_tokens_count || 0) : 'N/A',
                wallet.trade_count_7d || 'N/A',
                wallet.trade_count_30d || 'N/A',
                wallet.avg_holding_time ? wallet.avg_holding_time.toFixed(1) : 'N/A',
                wallet.fast_tx_ratio ? wallet.fast_tx_ratio.toFixed(1) : 'N/A',
                wallet.no_buy_hold_ratio ? wallet.no_buy_hold_ratio.toFixed(1) : 'N/A',
                wallet.last_updated ? new Date(wallet.last_updated).toLocaleString() : 'N/A'
            ];
            
            // 处理包含逗号的值
            const formattedRow = row.map(value => {
                if (typeof value === 'string' && value.includes(',')) {
                    return `"${value}"`;
                }
                return value;
            });
            
            res.write(formattedRow.join(',') + '\n');
        });
        
        res.end();
    } catch (error) {
        console.error('导出所有钱包数据出错:', error);
        res.status(500).send('服务器错误');
    }
});

// 路由：清空数据库
app.post('/clear-database', async (req, res) => {
    try {
        // 清空钱包表
        await db.exec(`DELETE FROM wallets`);
        
        // 清空交易表
        await db.exec(`DELETE FROM transactions`);
        
        console.log('数据库已清空');
        
        // 重定向回首页
        res.redirect('/?cleared=true');
    } catch (error) {
        console.error('清空数据库出错:', error);
        res.status(500).send('服务器错误');
    }
});

// 处理直接访问清空数据库URL的情况
app.get('/clear-database', (req, res) => {
    res.redirect('/');
});

// API 路由：获取钱包评分数据
app.get('/api/wallet/:address', async (req, res) => {
    try {
        const address = req.params.address;
        
        // 获取钱包信息
        const wallet = await db.get(`
            SELECT * FROM wallets 
            WHERE address = ?
        `, [address]);
        
        if (!wallet) {
            // 如果钱包不存在，返回默认数据
            return res.json({
                address: address,
                data: {
                    total_score: 0,
                    token_count: 0,
                    trading_ability: {
                        win_rate: 0,
                        profit_7d: 0,
                        profit_30d: 0,
                        high_profit_tokens_count: 0,
                        scam_tokens_count: 0,
                        score: 0
                    },
                    trading_style: {
                        trade_count_7d: 0,
                        trade_count_30d: 0,
                        avg_holding_time: 0,
                        buy_sell_ratio: 0,
                        score: 0
                    },
                    risk_control: {
                        honeypot_ratio: 0,
                        fast_tx_ratio: 0,
                        no_buy_hold_ratio: 0,
                        score: 0
                    }
                },
                success: true
            });
        }
        
        // 构建钱包评分数据
        const scoreData = {
            address: wallet.address,
            data: {
                total_score: wallet.total_score || 0,
                token_count: wallet.token_count || 0,
                trading_ability: {
                    win_rate: wallet.win_rate || 0,
                    profit_7d: wallet.profit_7d || 0,
                    profit_30d: wallet.profit_30d || 0,
                    high_profit_tokens_count: wallet.high_profit_tokens_count || 0,
                    scam_tokens_count: wallet.scam_tokens_count || 0,
                    score: 0.8 // 示例值
                },
                trading_style: {
                    trade_count_7d: wallet.trade_count_7d || 0,
                    trade_count_30d: wallet.trade_count_30d || 0,
                    avg_holding_time: wallet.avg_holding_time || 0,
                    buy_sell_ratio: wallet.buy_sell_ratio || 0,
                    score: 0.7 // 示例值
                },
                risk_control: {
                    honeypot_ratio: wallet.honeypot_ratio || 0,
                    fast_tx_ratio: wallet.fast_tx_ratio || 0,
                    no_buy_hold_ratio: wallet.no_buy_hold_ratio || 0,
                    score: 0.9 // 示例值
                }
            },
            success: true
        };
        
        res.json(scoreData);
    } catch (error) {
        console.error('获取钱包评分数据出错:', error);
        res.status(500).json({ error: '服务器错误', success: false });
    }
});

// 创建模板文件
async function createTemplates() {
    // 确保目录存在
    if (!fs.existsSync(VIEWS_PATH)) {
        fs.mkdirSync(VIEWS_PATH, { recursive: true });
    }
    
    if (!fs.existsSync(path.join(PUBLIC_PATH, 'css'))) {
        fs.mkdirSync(path.join(PUBLIC_PATH, 'css'), { recursive: true });
    }
}

// 启动服务器
async function startServer() {
    try {
        // 初始化数据库
        await initDb();
        
        // 创建模板文件
        await createTemplates();
        
        // 启动服务器
        app.listen(PORT, () => {
            console.log(`服务器已启动，访问 http://localhost:${PORT}`);
        });
    } catch (error) {
        console.error('启动服务器出错:', error);
    }
}

// 启动应用
startServer(); 