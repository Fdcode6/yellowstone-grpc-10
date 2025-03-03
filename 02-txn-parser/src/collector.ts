import Client, { CommitmentLevel, SubscribeRequest } from "@triton-one/yellowstone-grpc";
import bs58 from "bs58";
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';

// 定义常量
const PUMP_FUN_PROGRAM_ID = '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P';
const SOL_DECIMALS = 9; // SOL的小数位数

// 配置参数
const MIN_SOL_AMOUNT = 0.3; // 最小SOL交易金额阈值，只有超过这个金额的交易才会被打印
const DB_PATH = path.join(__dirname, '../wallet_data.db'); // 数据库路径

// 统计数据
const uniqueWallets = new Set<string>(); // 用于存储唯一的钱包地址
let walletCounter = 0; // 用于计数唯一钱包数量
let db: any; // 数据库连接

// 定义交易信息类型
type TransactionInfo = {
    // 交易签名
    signature: string;
    // 交易类型
    type: 'buy' | 'sell' | 'unknown';
    // 交易涉及的账户
    accounts: string[];
    // 交易代币地址
    tokenAddress?: string;
    // 交易数量
    amount?: number;
    // 交易SOL金额
    solAmount?: number;
    // 交易指令
    instructions: any[];
    // 日志信息
    logs: string[];
}

// 简化的交易信息类型，用于输出
type SimplifiedTransactionInfo = {
    signature: string;
    type: 'buy' | 'sell' | 'unknown';
    tokenAddress?: string;
    amount?: number;
    solAmount?: number;
}

// 初始化数据库
async function initDatabase() {
    console.log("初始化数据库...");
    db = await open({
        filename: DB_PATH,
        driver: sqlite3.Database
    });
    
    // 创建钱包表
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
    
    // 从数据库中获取已有的钱包地址数量
    const result = await db.get('SELECT COUNT(*) as count FROM wallets');
    walletCounter = result.count;
    
    // 从数据库中加载所有钱包地址到 uniqueWallets 集合
    const wallets = await db.all('SELECT address FROM wallets');
    wallets.forEach((wallet: any) => {
        uniqueWallets.add(wallet.address);
    });
    
    console.log(`数据库初始化完成，已加载 ${walletCounter} 个钱包地址`);
    return db;
}

async function main() {
    // 初始化数据库
    await initDatabase();

    // 创建client
    const client = new Client(
        "https://solana-yellowstone-grpc.publicnode.com",
        "",
        {
            "grpc.max_receive_message_length": 128 * 1024 * 1024, // 128MB
        }
    );
    console.log("Subscribing to event stream...");
    console.log(`最小SOL交易金额阈值: ${MIN_SOL_AMOUNT} SOL`);

    // 创建订阅数据流
    const stream = await client.subscribe();

    // 创建订阅请求
    const request: SubscribeRequest = {
        accounts: {},
        slots: {},
        transactions: {
            txn: {
                vote: false,
                failed: false,
                signature: undefined,
                accountInclude: ["6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P"],
                accountExclude: [],
                accountRequired: [],
            }
        },
        transactionsStatus: {},
        blocks: {},
        blocksMeta: {},
        entry: {},
        accountsDataSlice: [],
        commitment: CommitmentLevel.PROCESSED, // 指定级别为processed
        ping: undefined,
    };

    // 发送订阅请求
    await new Promise<void>((resolve, reject) => {
        stream.write(request, (err: any) => {
            if (err === null || err === undefined) {
                resolve();
            } else {
                reject(err);
            }
        });
    }).catch((reason) => {
        console.error(reason);
        throw reason;
    });

    // 获取订阅数据
    stream.on("data", async (data: any) => {
        if (data.transaction) {
            try {
                // 解析交易信息
                const txInfo = parseTransaction(data.transaction);
                
                // 只输出买卖类型的交易，且SOL金额超过阈值
                if ((txInfo.type === 'buy' || txInfo.type === 'sell') && 
                    txInfo.solAmount && txInfo.solAmount >= MIN_SOL_AMOUNT) {
                    
                    // 更新唯一钱包地址统计
                    await updateWalletStats(txInfo);
                    
                    // 使用人类可读的格式输出
                    const now = new Date();
                    const timeStr = now.toLocaleTimeString();
                    
                    console.log(`\n[${timeStr}] 交易详情 ----------------------`);
                    console.log(`签名: ${txInfo.signature}`);
                    console.log(`类型: ${txInfo.type === 'buy' ? '买入 ⬆️' : '卖出 ⬇️'}`);
                    
                    // 打印发起者钱包地址
                    if (txInfo.accounts.length > 0) {
                        console.log(`发起者钱包: ${txInfo.accounts[0]}`);
                    }
                    
                    if (txInfo.tokenAddress) {
                        console.log(`代币: ${txInfo.tokenAddress}`);
                    }
                    
                    if (txInfo.amount) {
                        console.log(`数量: ${txInfo.amount.toLocaleString()} 代币`);
                    }
                    
                    if (txInfo.solAmount) {
                        console.log(`金额: ${txInfo.solAmount.toLocaleString()} SOL`);
                    }
                    
                    // 打印统计信息
                    console.log(`唯一钱包数量: ${walletCounter}`);
                    console.log('----------------------------------------');
                }
            } catch (error) {
                console.error('处理交易数据出错:', error);
            }
        }
    });

    // 为保证连接稳定，需要定期向服务端发送ping请求以维持连接
    const pingRequest: SubscribeRequest = {
        accounts: {},
        slots: {},
        transactions: {},
        transactionsStatus: {},
        blocks: {},
        blocksMeta: {},
        entry: {},
        accountsDataSlice: [],
        commitment: undefined,
        ping: { id: 1 },
    };
    // 每5秒发送一次ping请求
    setInterval(async () => {
        await new Promise<void>((resolve, reject) => {
            stream.write(pingRequest, (err: any) => {
                if (err === null || err === undefined) {
                    resolve();
                } else {
                    reject(err);
                }
            });
        }).catch((reason) => {
            console.error(reason);
            throw reason;
        });
    }, 5000); 
}

/**
 * 更新钱包统计信息
 * @param txInfo 交易信息
 */
async function updateWalletStats(txInfo: TransactionInfo) {
    // 只有当交易金额大于等于阈值时才统计钱包
    if (txInfo.solAmount && txInfo.solAmount >= MIN_SOL_AMOUNT && txInfo.accounts.length > 0) {
        // 只统计交易的发起者账户（通常是第一个账户）
        const senderAccount = txInfo.accounts[0];
        
        // 如果这个钱包地址之前没有被统计过，则计数加1
        if (!uniqueWallets.has(senderAccount)) {
            uniqueWallets.add(senderAccount);
            walletCounter++;
            
            // 将新钱包地址保存到数据库
            try {
                await db.run(
                    'INSERT OR IGNORE INTO wallets (address) VALUES (?)',
                    [senderAccount]
                );
                console.log(`新钱包地址已保存到数据库: ${senderAccount}`);
            } catch (error) {
                console.error('保存钱包地址到数据库出错:', error);
            }
        }
    }
}

/**
 * 解析交易信息
 * @param txn 交易数据
 * @returns 解析后的交易信息
 */
function parseTransaction(txn: any): TransactionInfo {
    try {
        // 安全获取交易数据
        const transaction = txn?.transaction?.transaction;
        if (!transaction) {
            throw new Error('交易数据不完整');
        }

        // 解析交易签名
        const txnSignature = bs58.encode(transaction.signatures[0]);
        
        // 解析交易涉及的账户
        const accountKeys = transaction.message.accountKeys.map((ak: any) => bs58.encode(ak));
        
        // 解析交易指令
        const instructions = transaction.message.instructions;
        
        // 安全获取日志
        const meta = txn?.transaction?.meta;
        const logs = meta?.logMessages || [];

        // 初始化交易信息
        const txInfo: TransactionInfo = {
            signature: txnSignature,
            type: 'unknown',
            accounts: accountKeys,
            instructions: instructions,
            logs: logs
        };

        // 尝试解析交易类型和代币信息
        // 查找PUMP程序索引
        const pumpProgramIdx = accountKeys.indexOf(PUMP_FUN_PROGRAM_ID);
        
        if (pumpProgramIdx !== -1) {
            // 解析代币地址和交易方向
            parsePumpTransaction(txn, txInfo, pumpProgramIdx);
        } else {
            // 尝试从日志中解析交易信息
            parseFromLogs(txInfo);
        }

        return txInfo;
    } catch (error) {
        console.error('解析交易信息出错:', error);
        // 返回一个基本的交易信息对象，避免未定义错误
        return {
            signature: '未知',
            type: 'unknown',
            accounts: [],
            instructions: [],
            logs: []
        };
    }
}

/**
 * 解析PUMP交易
 * @param txn 交易数据
 * @param txInfo 交易信息对象
 * @param pumpProgramIdx PUMP程序索引
 */
function parsePumpTransaction(txn: any, txInfo: TransactionInfo, pumpProgramIdx: number) {
    try {
        const transaction = txn?.transaction?.transaction;
        const meta = txn?.transaction?.meta;
        if (!transaction || !meta) {
            return;
        }

        const accountKeys = txInfo.accounts;
        
        // 检查是否为launch交易
        const isLaunch = transaction.message.instructions
            .some((item: any) => item.programIdIndex === pumpProgramIdx && item.data && item.data[0] === 183);
        
        if (isLaunch) {
            txInfo.type = 'unknown'; // launch交易特殊处理
            return;
        }

        // 获取交易前后的余额变化
        const preBalances = meta.preBalances || [];
        const postBalances = meta.postBalances || [];
        
        // 获取代币余额变化
        const preTokenBalances = meta.preTokenBalances || [];
        const postTokenBalances = meta.postTokenBalances || [];

        // 分析SOL余额变化
        for (let i = 0; i < accountKeys.length && i < preBalances.length && i < postBalances.length; i++) {
            if (preBalances[i] !== undefined && postBalances[i] !== undefined) {
                const solChange = (postBalances[i] - preBalances[i]) / Math.pow(10, SOL_DECIMALS);
                
                if (Math.abs(solChange) > 0.001) { // 忽略微小变化
                    if (solChange > 0) {
                        // 卖出代币，获得SOL
                        txInfo.type = 'sell';
                        txInfo.solAmount = solChange;
                    } else if (solChange < 0) {
                        // 买入代币，支付SOL
                        txInfo.type = 'buy';
                        txInfo.solAmount = Math.abs(solChange);
                    }
                }
            }
        }

        // 分析代币余额变化
        for (const postToken of postTokenBalances) {
            if (!postToken || !postToken.uiTokenAmount) continue;
            
            const preToken = preTokenBalances.find((t: any) => 
                t && t.accountIndex === postToken.accountIndex && t.mint === postToken.mint
            );
            
            if (preToken && preToken.uiTokenAmount) {
                const postAmount = postToken.uiTokenAmount.uiAmount || 0;
                const preAmount = preToken.uiTokenAmount.uiAmount || 0;
                const tokenChange = postAmount - preAmount;
                
                if (Math.abs(tokenChange) > 0) {
                    txInfo.tokenAddress = postToken.mint;
                    txInfo.amount = Math.abs(tokenChange);
                }
            }
        }
    } catch (error) {
        console.error('解析PUMP交易出错:', error);
    }
}

/**
 * 从日志中解析交易信息
 * @param txInfo 交易信息对象
 */
function parseFromLogs(txInfo: TransactionInfo) {
    try {
        // 从日志中查找交易相关信息
        for (const log of txInfo.logs) {
            if (!log) continue;
            
            // 检查是否包含转账信息
            if (log.includes('Transfer') && log.includes('amount')) {
                // 尝试提取转账金额
                const amountMatch = log.match(/amount (\d+(\.\d+)?)/);
                if (amountMatch && amountMatch[1]) {
                    txInfo.amount = parseFloat(amountMatch[1]);
                }
                
                // 尝试确定交易类型
                if (log.toLowerCase().includes('buy')) {
                    txInfo.type = 'buy';
                } else if (log.toLowerCase().includes('sell')) {
                    txInfo.type = 'sell';
                }
            }
            
            // 检查是否包含代币地址
            const tokenAddressMatch = log.match(/token (\w+)/i);
            if (tokenAddressMatch && tokenAddressMatch[1]) {
                txInfo.tokenAddress = tokenAddressMatch[1];
            }
        }
    } catch (error) {
        console.error('从日志解析交易信息出错:', error);
    }
}

main();