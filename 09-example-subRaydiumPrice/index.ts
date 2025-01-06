import Client, { CommitmentLevel, SubscribeRequest } from "@triton-one/yellowstone-grpc";
import bs58 from "bs58";
import net from 'net';
import {Connection, PublicKey, Transaction, SystemProgram} from "@solana/web3.js";
import logger from "./utils/logger";


 // Constants
const RAYDIUM_PROGRAM_ID = new PublicKey("675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8");
const SOL_MINT = "So11111111111111111111111111111111111111112";
const SERUM_PROGRAM_ID = "srmqPvymJeFKQ4zGQed1GFppgkRHL9kaELCbyksJtPX";
const RETRY_DELAY = 1000;
const RAYDIUM_AUTHORITY = "5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1";

const GRPC_URL = "https://grpc.chainbuff.com";
const TELNET_PORT = 8888;


class RaydiumSwapSubscriber {
    private bondingCurveSet: Set<string>;
    private stream: any;
    private client: Client | null = null;
    private server: net.Server;
    private pingInterval: NodeJS.Timeout | null = null;
    private isCleaningUp = false;  
    private isReconnecting = false; 



    constructor() {
    }


    private async reconnect() {
        await this.cleanup();
        await this.listen();
    }

    public async cleanup() {
        if (this.isCleaningUp) return;
        try {
            this.isCleaningUp = true;
            logger.info('Starting cleanup process...');
            
            if (this.pingInterval) {
                clearInterval(this.pingInterval);
                this.pingInterval = null;
                logger.info('Ping interval cleared');
            }

            if (this.stream) {
                try {
                    this.stream.on('error', (error) => {
                        if (error.code === 1 && error.details === 'Cancelled on client') {
                            logger.info('Expected cancellation error, safely ignored');
                        } else {
                            logger.error('Stream error during cleanup:', error);
                        }
                    });

                    this.stream.removeAllListeners('data');
                    this.stream.removeAllListeners('end');
                    this.stream.removeAllListeners('close');
                    logger.info('Stream listeners removed');

                    this.stream.cancel();
                    await new Promise(resolve => setTimeout(resolve, 1000));
                } catch (error) {
                    logger.error('Error during stream cleanup:', error);
                } finally {
                    this.stream = null;
                    logger.info('Stream cancelled and cleared');
                }
            }

            if (this.client) {
                this.client = null;
                logger.info('Client reference cleared');
            }

            logger.info('Cleanup completed successfully');
        } finally {
            this.isCleaningUp = false;
        }
    }

    async listen() {
        try {
            if (this.bondingCurveSet) {
                const curveset = Array.from(this.bondingCurveSet);
            }
            logger.info("Subscribing to event stream with bonding curves:");
            
            this.client = new Client(GRPC_URL, undefined, {
                "grpc.max_receive_message_length": 10 * 1024 * 1024, // 10MiB
            });
            
            this.stream = await this.client.subscribe();
            
            this.setupStreamListeners();

            const request: SubscribeRequest = {
                accounts: {},
                slots: {},
                transactions: {
                    raydiumLiquidityPoolv4: {
                    vote: false,
                    failed: false,
                    signature: undefined,
                    accountInclude: [RAYDIUM_PROGRAM_ID.toBase58()],
                    accountRequired: [],
                    accountExclude: []
                    },
                },
                transactionsStatus: {},
                entry: {},
                blocks: {},
                blocksMeta: {},
                accountsDataSlice: [],
                ping: undefined,
                commitment: CommitmentLevel.CONFIRMED,
            };

            await new Promise<void>((resolve, reject) => {
                this.stream.write(request, (err) => {
                    if (err === null || err === undefined) {
                        resolve();
                    } else {
                        reject(err);
                    }
                });
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

            this.pingInterval = setInterval(async () => {
                try {
                    if (this.stream) {
                        await new Promise<void>((resolve, reject) => {
                            this.stream.write(pingRequest, (err) => {
                                if (err === null || err === undefined) {
                                    resolve();
                                } else {
                                    reject(err);
                                }
                            });
                        });
                    }
                } catch (error) {
                    logger.error('Ping error:', error);
                    this.handleStreamError();
                }
            }, 5000);

        } catch (error) {
            logger.error('Error in listen:', error);
            throw error;
        }
    }

    private setupStreamListeners() {
        if (!this.stream) return;

        this.stream.on('error', (error) => {
            logger.error('Stream error:', error);
            this.handleStreamError();
        });

        this.stream.on('end', () => {
            logger.info('Stream ended');
            this.handleStreamEnd();
        });

        this.stream.on('close', () => {
            logger.info('Stream closed');
            this.handleStreamClose();
        });

        this.stream.on("data", async (data) => {
            if (data?.transaction) {
                this.checkPoolPrice(data.transaction);
            }
        });
    }

    private async handleStreamError() {
        if (this.isCleaningUp || this.isReconnecting) return;
        
        try {
            this.isReconnecting = true;
            logger.info('Attempting to reconnect due to stream error...');
            await this.cleanup();
            
            setTimeout(async () => {
                try {
                    await this.listen();
                    logger.info('Successfully reconnected');
                } catch (error) {
                    logger.error('Failed to reconnect:', error);
                    // 重置状态并重试
                    this.isReconnecting = false;
                    this.handleStreamError();
                }
            }, 5000);
        } finally {
            this.isReconnecting = false;
        }
    }

    private async handleStreamEnd() {
        if (this.isCleaningUp || this.isReconnecting) return;
        logger.info('Stream ended, checking if reconnection needed...');
        
        if (this.client) {
            await this.handleStreamError();
        }
    }

    private async handleStreamClose() {
        if (this.isCleaningUp || this.isReconnecting) return;
        logger.info('Stream closed');
        
        if (this.client) {
            this.client = null;
        }
    }
    
    checkPoolPrice(txn: any) {
        
        const transaction = txn?.transaction;
        if (!transaction) {
            return;
        }
        const signature = bs58.encode(transaction.signature);

        const preTokenBalances = transaction.meta.preTokenBalances;
        const postTokenBalances = transaction.meta.postTokenBalances;
        let targetToken = "", postPoolSOL=0, postPoolToken=0, prePoolSOL=0, prePoolToken=0, side = "";
        for (const account of preTokenBalances) {
          if (targetToken !== "" && prePoolSOL !== 0 && prePoolToken!==0) break; // make sure we get the target token and pool sol balances and trader address only
          if (account.owner === RAYDIUM_AUTHORITY && account.mint !== SOL_MINT) targetToken = account.mint;
          if (account.owner === RAYDIUM_AUTHORITY && account.mint === SOL_MINT) {
            prePoolSOL = account.uiTokenAmount.uiAmount;
          }
          if (account.owner === RAYDIUM_AUTHORITY && account.mint !== SOL_MINT) {
            prePoolToken = account.uiTokenAmount.uiAmount;
          }
        }
       for (const account of postTokenBalances) {
          if (postPoolSOL !== 0 && postPoolToken!==0) break; // make sure we get the target token and pool sol balances and trader address only
          if (account.owner === RAYDIUM_AUTHORITY && account.mint !== SOL_MINT ) targetToken = account.mint;
          if (account.owner === RAYDIUM_AUTHORITY && account.mint === SOL_MINT) {
            postPoolSOL = account.uiTokenAmount.uiAmount;
          }
          if (account.owner === RAYDIUM_AUTHORITY && account.mint !== SOL_MINT) {
            postPoolToken = account.uiTokenAmount.uiAmount;
          }
        }
        if (targetToken === "") return;
        logger.info(`${signature} : ${targetToken} : ${postPoolSOL/postPoolToken}`)
      
      
      }
    
}

async function main() {
    const subscriber = new RaydiumSwapSubscriber();
    
    process.on('SIGINT', async () => {
        logger.info('Received SIGINT. Cleaning up...');
        await subscriber.cleanup();
        process.exit(0);
    });
    
    await subscriber.listen();
}

main().catch(console.error);