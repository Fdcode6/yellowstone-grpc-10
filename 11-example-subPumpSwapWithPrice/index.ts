import Client, { CommitmentLevel, SubscribeRequest } from "@triton-one/yellowstone-grpc";
import bs58 from "bs58";
import BN from "bn.js";

const PUMP_FUN_PROGRAM_ID = '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P';
const GRPC_URL = "https://solana-yellowstone-grpc.publicnode.com";

type PumpPriceInfo = {
    // 交易签名
    signature: string;
    // 交易类型
    type: 'buy' | 'sell' | 'launch';
    // bondingCurve
    bondingCurve: string;
    // launch进度(0-1)
    progress: number;
    // 价格
    price: number;
    // 美元价格
    usdPrice: number;
    // 交易sol金额(买入为正数，卖出为负数)
    swapSolAmount: number;
}

class SolPriceSubscriber {
    private callback: (solPrice: number) => void;
    private client: any;
    private stream: any;

    constructor(callback: (solPrice: number) => void) {
        this.callback = callback;
    }

    async listen() {
        this.client = new Client.default(
            GRPC_URL,
            undefined,
            {
                "grpc.max_receive_message_length": 128 * 1024 * 1024, // 128MB
            }
        );
        console.log("Subscribing to SOL price stream...");

        this.stream = await this.client.subscribe();

        const request: SubscribeRequest = {
            accounts: {
                txn: {
                    account: ["8sLbNZoA1cfnvMJLPfp98ZLAnFSYCFApfJKMbiXNLwxj"],
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

        await new Promise<void>((resolve, reject) => {
            this.stream.write(request, (err) => {
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

        this.stream.on("data", async (data) => {
            if (data.account) {
                const sqrtPriceX64Value = new BN(data.account.account.data, 'le');
                console.log(`sqrtPriceX64Value`, sqrtPriceX64Value.toString());
                const sqrtPriceX64BigInt = BigInt(sqrtPriceX64Value.toString());
                const sqrtPriceX64Float = Number(sqrtPriceX64BigInt) / (2 ** 64);
                const price = sqrtPriceX64Float ** 2 * 1e9 / 1e6;
                console.log(`WSOL价格:`, price.toString());
                console.log('---\n');
                this.callback(price);
            }
        });

        this.startPing();
    }

    private startPing() {
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

        setInterval(async () => {
            await new Promise<void>((resolve, reject) => {
                this.stream.write(pingRequest, (err) => {
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
}

class PumpSwapSubscriber {
    private bondingCurveSet: Set<string>;
    private callback: (data: PumpPriceInfo) => void;
    private currentSolPrice: number = 0;

    constructor(bondingCurveArr: Array<string>, callback: (data: PumpPriceInfo) => void) {
        this.bondingCurveSet = new Set(bondingCurveArr);
        this.callback = callback;
    }

    updateSolPrice(price: number) {
        this.currentSolPrice = price;
    }

    async listen() {
        const client = new Client.default(
            GRPC_URL,
            undefined,
            {
                "grpc.max_receive_message_length": 128 * 1024 * 1024, // 128MB
            }
        );
        console.log("Subscribing to pump swap stream...");

        const stream = await client.subscribe();

        const request: SubscribeRequest = {
            commitment: CommitmentLevel.PROCESSED,
            accountsDataSlice: [],
            ping: undefined,
            transactions: {
                client: {
                    vote: false,
                    failed: false,
                    accountInclude: Array.from(this.bondingCurveSet),
                    accountRequired: [],
                    accountExclude: [],
                },
            },
            accounts: {},
            slots: {},
            transactionsStatus: {},
            entry: {},
            blocks: {},
            blocksMeta: {},
        };

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

        stream.on("data", async (data) => {
            if (data?.transaction) {
                this.checkPrice(data.transaction);
            }
        });

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

    checkPrice(txn: any) {
        const transaction = txn?.transaction;
        if (!transaction) {
            return;
        }
        const accountKeys = transaction?.transaction?.message?.accountKeys?.map(o=>bs58.encode(o));
        if (!accountKeys) {
            return;
        }
        transaction.transaction.message.accountKeys = accountKeys;
        const signature = bs58.encode(txn.transaction.signature);
        const pumpProgramIdx = accountKeys.indexOf(PUMP_FUN_PROGRAM_ID);
        const txBondingCurves = accountKeys.filter(item=>this.bondingCurveSet.has(item))

        const isLaunch = txn?.transaction?.transaction?.message?.instructions
            .some(item=>item.programIdIndex===pumpProgramIdx && item.data[0] === 183) ?? false;
        if (isLaunch) {
            const priceInfo = this.getPumpSwapInfo(txn, txBondingCurves[0], "pre");
            this.callback({
                signature: signature,
                type: "launch",
                bondingCurve: txBondingCurves[0],
                progress: 1,
                price: priceInfo?.price ?? 0,
                usdPrice: (priceInfo?.price ?? 0) * this.currentSolPrice,
                swapSolAmount: 0,
            })
            return;
        }

        for (let bondingCurveItem of txBondingCurves) {
            const pumpPriceInfo = this.getPumpSwapInfo(txn, bondingCurveItem, "post");
            if (!pumpPriceInfo) {
                console.log('balance not found:', signature);
                continue;
            }
            this.callback({
                signature: signature,
                type: pumpPriceInfo.swapSolAmount > 0 ? 'buy' : 'sell',
                bondingCurve: bondingCurveItem,
                progress: pumpPriceInfo.progress,
                price: pumpPriceInfo.price,
                usdPrice: pumpPriceInfo.price * this.currentSolPrice,
                swapSolAmount: pumpPriceInfo.swapSolAmount
            })
        }
    }

    getPumpSwapInfo(txn: any, bondingCurve: string, type: "pre" | "post") {
        const tokenBalance = txn?.transaction?.meta?.[type + 'TokenBalances']?.find(o=>o.owner===bondingCurve);
        if (!tokenBalance) {
            return null;
        }
        const bondingCurveIdx = txn.transaction.transaction.message.accountKeys.indexOf(bondingCurve);
        let preSolBalance = txn.transaction.meta?.preBalances?.[bondingCurveIdx];
        let postSolBalance = txn.transaction.meta?.postBalances?.[bondingCurveIdx];
        const targetSolBalance = txn.transaction.meta?.[type + "Balances"]?.[bondingCurveIdx];
        if (postSolBalance===undefined || preSolBalance === undefined) {
            return null;
        }
        const price = ((Number(targetSolBalance) / (10 ** 9)) + 30 - 0.00123192) / (tokenBalance.uiTokenAmount.uiAmount + 73000000);
        const swapSolAmount = (Number(postSolBalance) - Number(preSolBalance)) / (10 ** 9);
        const progress = Number(postSolBalance) / (10 ** 9) / 85;
        return {price, swapSolAmount, progress};
    }
}

async function main() {
    const pumpSwapSubscriber = new PumpSwapSubscriber(
        ['2Ao4rrHxMn1Raex9S87xDtY2ngSqcoFoFcZcK64bGf2y'],
        o => {
            const now = new Date();
            console.log(`[${now.toISOString()}]`, o);
        }
    );

    const solPriceSubscriber = new SolPriceSubscriber((solPrice) => {
        console.log(`[${new Date().toISOString()}] SOL Price: $${solPrice}`);
        pumpSwapSubscriber.updateSolPrice(solPrice);
    });

    await Promise.all([
        solPriceSubscriber.listen(),
        pumpSwapSubscriber.listen()
    ]);
}

main();