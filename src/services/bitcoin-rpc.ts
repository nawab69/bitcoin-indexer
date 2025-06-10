import BitcoinCore from 'bitcoin-core';
import { BitcoinBlock, BitcoinTransaction } from '../types/bitcoin';
import { logger } from '../utils/logger';

export class BitcoinRpcClient {
  private client: BitcoinCore;

  constructor(config: {
    host: string;
    port: number;
    username: string;
    password: string;
    network: string;
  }) {
    this.client = new BitcoinCore({
      host: config.host,
      port: config.port,
      username: config.username,
      password: config.password,
      network: config.network,
    });
  }

  async getBlockchainInfo(): Promise<any> {
    try {
      return await this.client.getBlockchainInfo();
    } catch (error) {
      logger.error('Failed to get blockchain info:', error);
      throw error;
    }
  }

  async getBestBlockHash(): Promise<string> {
    try {
      return await this.client.getBestBlockHash();
    } catch (error) {
      logger.error('Failed to get best block hash:', error);
      throw error;
    }
  }

  async getBlockHash(height: number): Promise<string> {
    try {
      return await this.client.getBlockHash(height);
    } catch (error) {
      logger.error(`Failed to get block hash for height ${height}:`, error);
      throw error;
    }
  }

  async getBlock(hash: string, verbosity: number = 1): Promise<BitcoinBlock> {
    try {
      const block = await this.client.getBlock(hash, verbosity);
      return block as BitcoinBlock;
    } catch (error) {
      logger.error(`Failed to get block ${hash}:`, error);
      throw error;
    }
  }

  async getBlockByHeight(height: number, verbosity: number = 1): Promise<BitcoinBlock> {
    try {
      const hash = await this.getBlockHash(height);
      return await this.getBlock(hash, verbosity);
    } catch (error) {
      logger.error(`Failed to get block at height ${height}:`, error);
      throw error;
    }
  }

  async getTransaction(txid: string, verbose: boolean = true): Promise<BitcoinTransaction> {
    try {
      // For bitcoin-core library, the second parameter is verbose (boolean)
      // The third parameter is blockhash (optional)
      const tx = await this.client.getRawTransaction(txid, verbose);
      return tx as BitcoinTransaction;
    } catch (error) {
      logger.error(`Failed to get transaction ${txid}:`, error);
      throw error;
    }
  }

  async getBlockCount(): Promise<number> {
    try {
      return await this.client.getBlockCount();
    } catch (error) {
      logger.error('Failed to get block count:', error);
      throw error;
    }
  }

  async getBlockStats(hashOrHeight: string | number): Promise<any> {
    try {
      return await this.client.getBlockStats(hashOrHeight);
    } catch (error) {
      logger.error(`Failed to get block stats for ${hashOrHeight}:`, error);
      throw error;
    }
  }

  async validateAddress(address: string): Promise<any> {
    try {
      return await this.client.validateAddress(address);
    } catch (error) {
      logger.error(`Failed to validate address ${address}:`, error);
      throw error;
    }
  }

  async getTxOut(txid: string, vout: number, includeMempool: boolean = true): Promise<any> {
    try {
      return await this.client.getTxOut(txid, vout, includeMempool);
    } catch (error) {
      logger.error(`Failed to get txout ${txid}:${vout}:`, error);
      throw error;
    }
  }

  async ping(): Promise<void> {
    try {
      await this.client.ping();
    } catch (error) {
      logger.error('Failed to ping Bitcoin node:', error);
      throw error;
    }
  }

  async getNetworkInfo(): Promise<any> {
    try {
      return await this.client.getNetworkInfo();
    } catch (error) {
      logger.error('Failed to get network info:', error);
      throw error;
    }
  }

  async getMempoolInfo(): Promise<any> {
    try {
      return await this.client.getMempoolInfo();
    } catch (error) {
      logger.error('Failed to get mempool info:', error);
      throw error;
    }
  }

  async getRawMempool(verbose: boolean = false): Promise<any> {
    try {
      return await this.client.getRawMempool(verbose);
    } catch (error) {
      logger.error('Failed to get raw mempool:', error);
      throw error;
    }
  }

  async estimateSmartFee(confTarget: number): Promise<any> {
    try {
      return await this.client.estimateSmartFee(confTarget);
    } catch (error) {
      logger.error(`Failed to estimate smart fee for ${confTarget} blocks:`, error);
      throw error;
    }
  }
} 