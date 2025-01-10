import Client, { CommitmentLevel, SubscribeRequest } from "@triton-one/yellowstone-grpc";
import bs58 from "bs58";
import net from 'net';
import { web3,AnchorProvider, Program, Wallet  } from "@coral-xyz/anchor";
import {PublicKey, Connection} from "@solana/web3.js";
import {getKeypairFromEnvironment} from "@solana-developers/helpers";
import * as fs from "fs";
import * as path from "path";
import "dotenv/config";
import { ApiPoolInfoV4, Market, MARKET_STATE_LAYOUT_V3, SPL_MINT_LAYOUT } from "@raydium-io/raydium-sdk-v2";


const RAYDIUM_PROGRAM_ID = '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8';
const RAYDIUM_CREATEPOOL_FEE_ACCOUNT = '7YttLkHDoNj9wyDur5pM1ejNaAvT9X4eqaYcHQqtj2G5'

const GRPC_URL = "https://testgrpc.chainbuff.com";
const MAINNET_URL = "https://api.mainnet-beta.solana.com";
const connection = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');
const SOL_MINT = "So11111111111111111111111111111111111111112";


let latestBlockHash: string = "";

class RadiumSwapSubscriber {
    private bondingCurveSet: Set<string>;
    private stream: any;
    private client: Client | null = null;
    private pingInterval: NodeJS.Timeout | null = null;
    private isCleaningUp = false;  // 添加清理状态标志
    private isReconnecting = false;  // 添加重连状态标志
    private processingQueue: Array<QueueItem> = [];
    private isProcessing: boolean = false;


    
    constructor() {
    }


    public async cleanup() {
        if (this.isCleaningUp) return;
        try {
            this.isCleaningUp = true;
            console.log('Starting cleanup process...');
            
            if (this.pingInterval) {
                clearInterval(this.pingInterval);
                this.pingInterval = null;
                console.log('1. Ping interval cleared');
            }

            if (this.stream) {
                try {
                    this.stream.on('error', (error) => {
                        if (error.code === 1 && error.details === 'Cancelled on client') {
                            console.log('Expected cancellation error, safely ignored');
                        } else {
                            console.error('Stream error during cleanup:', error);
                        }
                    });

                    this.stream.removeAllListeners('data');
                    this.stream.removeAllListeners('end');
                    this.stream.removeAllListeners('close');
                    console.log('2. Stream listeners removed');

                    this.stream.cancel();
                    await new Promise(resolve => setTimeout(resolve, 1000));
                } catch (error) {
                    console.error('Error during stream cleanup:', error);
                } finally {
                    this.stream = null;
                    console.log('3. Stream cancelled and cleared');
                }
            }

            if (this.client) {
                this.client = null;
                console.log('4. Client reference cleared');
            }

            console.log('Cleanup completed successfully');
        } finally {
            this.isCleaningUp = false;
        }
    }

    async listen() {
        try {
            console.log("Subscribing to event stream with new mint");
            
            this.client = new Client(GRPC_URL, undefined, {
                "grpc.max_receive_message_length": 100 * 1024 * 1024, // 10MiB
            });
            
            this.stream = await this.client.subscribe();
            
            this.setupStreamListeners();

            const request: SubscribeRequest = {
                slots: {},
                accounts: {},
                transactions: {
                  transactionsSubKey: {
                    accountInclude: [RAYDIUM_CREATEPOOL_FEE_ACCOUNT],
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
                    console.error('Ping error:', error);
                    this.handleStreamError();
                }
            }, 5000);

        } catch (error) {
            console.error('Error in listen:', error);
            throw error;
        }
    }

    private setupStreamListeners() {
        if (!this.stream) return;

        this.stream.on('error', (error) => {
            console.error('Stream error:', error);
            this.handleStreamError();
        });

        this.stream.on('end', () => {
            console.log('Stream ended');
            this.handleStreamEnd();
        });

        this.stream.on('close', () => {
            console.log('Stream closed');
            this.handleStreamClose();
        });

        this.stream.on("data", async (data) => {
            if (data) {
                this.processSaveNewMint(data);                
            }
        });
    }

    private async handleStreamError() {
        if (this.isCleaningUp || this.isReconnecting) return;
        
        try {
            this.isReconnecting = true;
            console.log('Attempting to reconnect due to stream error...');
            await this.cleanup();
            
            setTimeout(async () => {
                try {
                    await this.listen();
                    console.log('Successfully reconnected');
                } catch (error) {
                    console.error('Failed to reconnect:', error);
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
        console.log('Stream ended, checking if reconnection needed...');
        
        if (this.client) {
            await this.handleStreamError();
        }
    }

    private async handleStreamClose() {
        if (this.isCleaningUp || this.isReconnecting) return;
        console.log('Stream closed');
        
        if (this.client) {
            this.client = null;
        }
    }

    
    private slotExists(slot: number): boolean {
        //return leaderSchedule.has(slot);
        return true
      }
      
    private async processSaveNewMint(data: any){
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
        
          
        return poolInfo
      }
    }

async function main() {
    const subscriber = new RadiumSwapSubscriber();
    
    process.on('SIGINT', async () => {
        console.log('Received SIGINT. Cleaning up...');
        await subscriber.cleanup();
        process.exit(0);
    });
    
    await subscriber.listen();
}

main().catch(console.error);