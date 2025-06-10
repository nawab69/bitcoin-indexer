declare module 'bitcoin-core' {
  interface BitcoinCoreOptions {
    host?: string;
    port?: number;
    username?: string;
    password?: string;
    network?: string;
  }

  export default class BitcoinCore {
    constructor(options: BitcoinCoreOptions);
    
    getBlockchainInfo(): Promise<any>;
    getBestBlockHash(): Promise<string>;
    getBlockHash(height: number): Promise<string>;
    getBlock(hash: string, verbosity?: number): Promise<any>;
    getRawTransaction(txid: string, verbose?: boolean, blockhash?: string): Promise<any>;
    getBlockCount(): Promise<number>;
    getBlockStats(hashOrHeight: string | number): Promise<any>;
    validateAddress(address: string): Promise<any>;
    getTxOut(txid: string, vout: number, includeMempool?: boolean): Promise<any>;
    ping(): Promise<void>;
    getNetworkInfo(): Promise<any>;
    getMempoolInfo(): Promise<any>;
    getRawMempool(verbose?: boolean): Promise<any>;
    estimateSmartFee(confTarget: number): Promise<any>;
  }
} 