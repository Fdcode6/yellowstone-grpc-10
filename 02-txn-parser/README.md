# Solana 钱包分析工具

这是一个用于分析Solana区块链上钱包活动的工具，包括交易监控、钱包评分和数据可视化。

## 功能特点

- **实时交易监控**：监控Solana区块链上的交易，特别关注特定程序ID的交易
- **钱包数据收集**：收集并存储钱包地址及其交易数据
- **钱包评分系统**：通过API查询钱包评分数据
- **数据可视化**：通过Web界面展示钱包数据和评分

## 系统架构

系统由三个主要组件组成：

1. **数据收集器 (collector.ts)**：
   - 监控Solana区块链上的交易
   - 解析交易数据
   - 将数据存储到SQLite数据库

2. **评分查询器 (scorer.ts)**：
   - 从数据库中获取钱包地址
   - 通过API查询钱包评分
   - 更新数据库中的评分数据

3. **数据展示 (dashboard.ts)**：
   - 提供Web界面展示钱包数据
   - 显示钱包详情和评分
   - 提供搜索和筛选功能

## 项目结构

```
02-txn-parser/
├── src/                      # 源代码目录
│   ├── collector.ts          # 数据收集器
│   ├── scorer.ts             # 评分查询器
│   └── dashboard.ts          # Web界面
├── views/                    # EJS模板
│   ├── index.ejs             # 主页模板
│   └── wallet.ejs            # 钱包详情模板
├── public/                   # 静态资源
│   └── css/
│       └── style.css         # 样式文件
├── package.json              # 项目依赖
├── tsconfig.json             # TypeScript配置
└── README.md                 # 项目说明
```

## 安装

### 前提条件

- Node.js (v14+)
- npm 或 yarn
- TypeScript

### 安装步骤

1. 进入项目目录：
   ```
   cd 02-txn-parser
   ```

2. 安装依赖：
   ```
   npm install
   ```

## 使用方法

### 启动所有服务

启动所有服务：

```
npm start
```

这将同时启动数据收集器、评分查询器和Web界面。

### 单独启动各组件

也可以单独启动各个组件：

1. 启动数据收集器：
   ```
   npm run collector
   ```

2. 启动评分查询器：
   ```
   npm run scorer
   ```

3. 启动Web界面：
   ```
   npm run dashboard
   ```

### 访问Web界面

启动后，访问 http://localhost:3000 查看钱包数据和评分。

## 数据库结构

系统使用SQLite数据库存储数据，主要表结构如下：

1. **wallets**：存储钱包基本信息和评分
   - address (主键)
   - total_score
   - token_count
   - win_rate
   - transaction_count
   - avg_transaction_amount
   - max_transaction_amount
   - first_seen
   - last_seen
   - last_updated

2. **transactions**：存储交易记录
   - signature (主键)
   - wallet_address (外键)
   - type
   - token_address
   - sol_amount
   - timestamp

## 配置选项

在各组件源文件中可以修改以下配置：

- **collector.ts**：
  - MIN_SOL_AMOUNT：最小SOL交易金额阈值
  - PUMP_FUN_PROGRAM_ID：要监控的程序ID

- **scorer.ts**：
  - API_URL：钱包评分API地址
  - QUERY_INTERVAL：API查询间隔（毫秒）

- **dashboard.ts**：
  - PORT：Web服务器端口（默认3000）

## 贡献

欢迎提交问题和改进建议！

## 许可证

MIT