import Client, { CommitmentLevel, SubscribeRequest } from "@triton-one/yellowstone-grpc";
import "dotenv/config";
import bs58 from "bs58";

const RAYDIUM_PROGRAM_ID = "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8";
const SOL_MINT = "So11111111111111111111111111111111111111112";
const RAYDIUM_AUTHORITY = "5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1";

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
                accountInclude: [RAYDIUM_PROGRAM_ID],
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

            const transaction = data.transaction.transaction;
            if (!transaction) {
                return;
            }
            const signature = bs58.encode(transaction.signature);

            const preTokenBalances = transaction.meta.preTokenBalances;
            const postTokenBalances = transaction.meta.postTokenBalances;
            let targetToken = "", postPoolSOL = 0, postPoolToken = 0, prePoolSOL = 0, prePoolToken = 0, side = "";
            for (const account of preTokenBalances) {
                if (targetToken !== "" && prePoolSOL !== 0 && prePoolToken !== 0) break; // make sure we get the target token and pool sol balances and trader address only
                if (account.owner === RAYDIUM_AUTHORITY && account.mint !== SOL_MINT) targetToken = account.mint;
                if (account.owner === RAYDIUM_AUTHORITY && account.mint === SOL_MINT) {
                    prePoolSOL = account.uiTokenAmount.uiAmount;
                }
                if (account.owner === RAYDIUM_AUTHORITY && account.mint !== SOL_MINT) {
                    prePoolToken = account.uiTokenAmount.uiAmount;
                }
            }
            for (const account of postTokenBalances) {
                if (postPoolSOL !== 0 && postPoolToken !== 0) break; // make sure we get the target token and pool sol balances and trader address only
                if (account.owner === RAYDIUM_AUTHORITY && account.mint !== SOL_MINT) targetToken = account.mint;
                if (account.owner === RAYDIUM_AUTHORITY && account.mint === SOL_MINT) {
                    postPoolSOL = account.uiTokenAmount.uiAmount;
                }
                if (account.owner === RAYDIUM_AUTHORITY && account.mint !== SOL_MINT) {
                    postPoolToken = account.uiTokenAmount.uiAmount;
                }
            }
            if (targetToken === "") return;
            console.info(`${signature} : ${targetToken} : ${postPoolSOL / postPoolToken}`)

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