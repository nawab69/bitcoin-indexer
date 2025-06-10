import zmq from 'zeromq';
import { EventEmitter } from 'events';
import { logger } from '../utils/logger';

export interface ZmqConfig {
  rawBlockPort: number;
  rawTxPort: number;
  host?: string;
}

export class ZmqService extends EventEmitter {
  private blockSocket: zmq.Subscriber | null = null;
  private txSocket: zmq.Subscriber | null = null;
  private config: ZmqConfig;
  private isRunning = false;

  constructor(config: ZmqConfig) {
    super();
    this.config = {
      host: 'localhost',
      ...config,
    };
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('ZMQ service is already running');
      return;
    }

    try {
      // Initialize block socket
      this.blockSocket = new zmq.Subscriber();
      this.blockSocket.connect(`tcp://${this.config.host}:${this.config.rawBlockPort}`);
      this.blockSocket.subscribe('rawblock');

      // Initialize transaction socket
      this.txSocket = new zmq.Subscriber();
      this.txSocket.connect(`tcp://${this.config.host}:${this.config.rawTxPort}`);
      this.txSocket.subscribe('rawtx');

      // Start listening for messages
      this.startListening();

      this.isRunning = true;
      logger.info('ZMQ service started successfully');
      this.emit('started');
    } catch (error) {
      logger.error('Failed to start ZMQ service:', error);
      await this.stop();
      throw error;
    }
  }

  private async startListening(): Promise<void> {
    // Listen for new blocks
    if (this.blockSocket) {
      this.listenForBlocks();
    }

    // Listen for new transactions
    if (this.txSocket) {
      this.listenForTransactions();
    }
  }

  private async listenForBlocks(): Promise<void> {
    if (!this.blockSocket) return;

    try {
      for await (const [topic, message] of this.blockSocket) {
        if (topic && topic.toString() === 'rawblock' && message) {
          const blockHash = this.reverseBuffer(message.subarray(4, 36)).toString('hex');
          logger.debug(`Received new block: ${blockHash}`);
          this.emit('rawblock', {
            topic: topic.toString(),
            hash: blockHash,
            data: message,
          });
        }
      }
    } catch (error) {
      logger.error('Error listening for blocks:', error);
      this.emit('error', error);
    }
  }

  private async listenForTransactions(): Promise<void> {
    if (!this.txSocket) return;

    try {
      for await (const [topic, message] of this.txSocket) {
        if (topic && topic.toString() === 'rawtx' && message) {
          // Extract transaction hash from raw transaction data
          const txHash = this.calculateTxHash(message as Buffer);
          logger.debug(`Received new transaction: ${txHash}`);
          this.emit('rawtx', {
            topic: topic.toString(),
            hash: txHash,
            data: message,
          });
        }
      }
    } catch (error) {
      logger.error('Error listening for transactions:', error);
      this.emit('error', error);
    }
  }

  private reverseBuffer(buffer: Buffer): Buffer {
    const reversed = Buffer.allocUnsafe(buffer.length);
    for (let i = 0; i < buffer.length; i++) {
      const byte = buffer[buffer.length - 1 - i];
      if (byte !== undefined) {
        reversed[i] = byte;
      }
    }
    return reversed;
  }

  private calculateTxHash(rawTxData: Buffer): string {
    // For now, we'll extract the hash if it's available in the data
    // In a production implementation, you might want to parse the transaction
    // and calculate the double SHA256 hash
    try {
      // This is a simplified approach - you may need to implement proper
      // transaction parsing to get the exact txid
      const crypto = require('crypto');
      const hash1 = crypto.createHash('sha256').update(rawTxData).digest();
      const hash2 = crypto.createHash('sha256').update(hash1).digest();
      return this.reverseBuffer(hash2).toString('hex');
    } catch (error) {
      logger.error('Failed to calculate transaction hash:', error);
      return 'unknown';
    }
  }

  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    try {
      if (this.blockSocket) {
        this.blockSocket.close();
        this.blockSocket = null;
      }

      if (this.txSocket) {
        this.txSocket.close();
        this.txSocket = null;
      }

      this.isRunning = false;
      logger.info('ZMQ service stopped');
      this.emit('stopped');
    } catch (error) {
      logger.error('Error stopping ZMQ service:', error);
      throw error;
    }
  }

  isServiceRunning(): boolean {
    return this.isRunning;
  }

  getConfig(): ZmqConfig {
    return { ...this.config };
  }
} 