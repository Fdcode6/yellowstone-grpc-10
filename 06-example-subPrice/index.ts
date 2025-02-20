import Client, { CommitmentLevel, SubscribeRequest } from "@triton-one/yellowstone-grpc";
import BN from 'bn.js';

async function main() {

    // 创建client
    // @ts-ignore
    const client = new Client.default(
        "https://solana-yellowstone-grpc.publicnode.com",
        undefined,
        {
            "grpc.max_receive_message_length": 128 * 1024 * 1024, // 128MB
        }
    );
    console.log("Subscribing to event stream...");

    // 创建订阅数据流
    const stream = await client.subscribe();

    // 创建订阅请求
    // const request: SubscribeRequest = {
    //     accounts: {
    //         account: {
    //             account: ["8sLbNZoA1cfnvMJLPfp98ZLAnFSYCFApfJKMbiXNLwxj"],
    //             owner: ["CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK"],
    //             filters: [],
    //             nonemptyTxnSignature: true,
    //         }
    //     },
    //     slots: {},
    //     transactions: {},
    //     transactionsStatus: {},
    //     blocks: {},
    //     blocksMeta: {},
    //     entry: {},
    //     accountsDataSlice: [],
    //     commitment: CommitmentLevel.PROCESSED,
    //     ping: undefined,
    // };

    const request: SubscribeRequest = {
        accounts: {
            txn: {
                account: ["675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8"],
                owner: ["CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK"],
                filters: [],
                nonemptyTxnSignature: true,
            }
        },
        slots: {},
        transactions: {},
        transactionsStatus: {},
        blocks: {},
        blocksMeta: {},
        entry: {},
        accountsDataSlice: [ { offset: "253", length: "16" } ],
        commitment: CommitmentLevel.PROCESSED,
        ping: undefined,
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
        if (data.account) {

            // console.log(data.account.account.data);

            const sqrtPriceX64Value = new BN(data.account.account.data, 'le'); // 使用小端字节序创建BN实例
            console.log(`sqrtPriceX64Value`, sqrtPriceX64Value.toString());
            // 计算价格
            const sqrtPriceX64BigInt = BigInt(sqrtPriceX64Value.toString());
            const sqrtPriceX64Float = Number(sqrtPriceX64BigInt) / (2 ** 64);
            const price = sqrtPriceX64Float ** 2 * 1e9 / 1e6;
            console.log(`WSOL价格:`, price.toString())
            console.log('---\n')

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
