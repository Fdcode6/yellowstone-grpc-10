import Client, { CommitmentLevel, SubscribeRequest } from "@triton-one/yellowstone-grpc";
import { PublicKey, Connection } from "@solana/web3.js";
import { ApiPoolInfoV4, Market, MARKET_STATE_LAYOUT_V3, SPL_MINT_LAYOUT } from "@raydium-io/raydium-sdk";
import "dotenv/config";
import bs58 from "bs58";

const RAYDIUM_PROGRAM_ID = '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8';
const RAYDIUM_POOL_FEE_ID = '7YttLkHDoNj9wyDur5pM1ejNaAvT9X4eqaYcHQqtj2G5';
const connection = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');

async function main() {

    // 创建订阅客户端
    // const client = new Client(
    // 如遇到TypeError: Client is not a constructor错误
    // 请使用以下方式创建
    // 见 https://github.com/rpcpool/yellowstone-grpc/issues/428
    // @ts-ignore
    const client = new Client.default(
        "https://test-grpc.chainbuff.com",
        undefined,
        {
            "grpc.max_receive_message_length": 16 * 1024 * 1024, // 16MB
        }
    );

    // 创建订阅数据流
    const stream = await client.subscribe();

    // 创建订阅请求
    const request: SubscribeRequest = {
        slots: {},
        accounts: {},
        transactions: {
            transactionsSubKey: {
                accountInclude: [RAYDIUM_POOL_FEE_ID],
                accountExclude: [],
                accountRequired: []
            }
        },
        transactionsStatus: {},
        blocks: {},
        blocksMeta: {},
        accountsDataSlice: [],
        entry: {},
        commitment: CommitmentLevel.CONFIRMED
    };

    // 发送订阅请求
    await new Promise<void>((resolve, reject) => {
        stream.write(request, (err) => {
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
    stream.on("data", async (data) => {
        if (data?.transaction) {
            if (!data.filters.includes('transactionsSubKey')) return undefined

            const info = data.transaction
            if (info.transaction.meta.err !== undefined) return undefined

            const formatData: {
                updateTime: number, slot: number, txid: string, poolInfos: ApiPoolInfoV4[]
            } = {
                updateTime: new Date().getTime(),
                slot: info.slot,
                txid: bs58.encode(info.transaction.signature),
                poolInfos: []
            }

            const accounts = info.transaction.transaction.message.accountKeys.map((i: Buffer) => bs58.encode(i))
            for (const item of [...info.transaction.transaction.message.instructions, ...info.transaction.meta.innerInstructions.map((i: any) => i.instructions).flat()]) {
                if (accounts[item.programIdIndex] !== RAYDIUM_PROGRAM_ID) continue

                //if ([...(item.data as Buffer).values()][0] != 1) continue
                if (Array.from(item.data as Buffer)[0] !== 1) continue;

                //const keyIndex = [...(item.accounts as Buffer).values()]
                const keyIndex = Buffer.from(item.accounts as Buffer);

                const startTime = new Date().getTime()
                console.info(new Date().toJSON(), 'new pool Id: ', accounts[keyIndex[4]]);

                const [baseMintAccount, quoteMintAccount, marketAccount] = await connection.getMultipleAccountsInfo([
                    new PublicKey(accounts[keyIndex[8]]),
                    new PublicKey(accounts[keyIndex[9]]),
                    new PublicKey(accounts[keyIndex[16]]),
                ])

                if (baseMintAccount === null || quoteMintAccount === null || marketAccount === null) throw Error('get account info error')

                const baseMintInfo = SPL_MINT_LAYOUT.decode(baseMintAccount.data)
                const quoteMintInfo = SPL_MINT_LAYOUT.decode(quoteMintAccount.data)
                const marketInfo = MARKET_STATE_LAYOUT_V3.decode(marketAccount.data)

                formatData.poolInfos.push({
                    id: accounts[keyIndex[4]],
                    baseMint: accounts[keyIndex[8]],
                    quoteMint: accounts[keyIndex[9]],
                    lpMint: accounts[keyIndex[7]],
                    baseDecimals: baseMintInfo.decimals,
                    quoteDecimals: quoteMintInfo.decimals,
                    lpDecimals: baseMintInfo.decimals,
                    version: 4,
                    programId: RAYDIUM_PROGRAM_ID,
                    authority: accounts[keyIndex[5]],
                    openOrders: accounts[keyIndex[6]],
                    targetOrders: accounts[keyIndex[12]],
                    baseVault: accounts[keyIndex[10]],
                    quoteVault: accounts[keyIndex[11]],
                    withdrawQueue: PublicKey.default.toString(),
                    lpVault: PublicKey.default.toString(),
                    marketVersion: 3,
                    marketProgramId: marketAccount.owner.toString(),
                    marketId: accounts[keyIndex[16]],
                    marketAuthority: Market.getAssociatedAuthority({ programId: marketAccount.owner, marketId: new PublicKey(accounts[keyIndex[16]]) }).publicKey.toString(),
                    marketBaseVault: marketInfo.baseVault.toString(),
                    marketQuoteVault: marketInfo.quoteVault.toString(),
                    marketBids: marketInfo.bids.toString(),
                    marketAsks: marketInfo.asks.toString(),
                    marketEventQueue: marketInfo.eventQueue.toString(),
                    lookupTableAccount: PublicKey.default.toString()
                })
            }



            const poolInfo = formatData.poolInfos[0];

            console.info(poolInfo)
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
            stream.write(pingRequest, (err) => {
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



main();