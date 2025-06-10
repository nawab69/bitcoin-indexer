export interface BitcoinBlock {
  hash: string;
  height: number;
  version: number;
  merkleroot: string;
  time: number;
  bits: string;
  nonce: number;
  difficulty: number;
  chainwork: string;
  tx: string[];
  size: number;
  weight: number;
  previousblockhash?: string;
  nextblockhash?: string;
  confirmations: number;
}

export interface BitcoinTransaction {
  txid: string;
  hash: string;
  version: number;
  size: number;
  vsize: number;
  weight: number;
  locktime: number;
  vin: BitcoinInput[];
  vout: BitcoinOutput[];
  blockhash?: string;
  blockheight?: number;
  blocktime?: number;
  confirmations?: number;
  fee?: number;
}

export interface BitcoinInput {
  txid?: string;
  vout?: number;
  scriptSig?: {
    asm: string;
    hex: string;
  };
  sequence: number;
  coinbase?: string;
}

export interface BitcoinOutput {
  value: number;
  n: number;
  scriptPubKey: {
    asm: string;
    hex: string;
    reqSigs?: number;
    type: string;
    addresses?: string[];
    address?: string;
  };
}

export interface UTXO {
  txid: string;
  vout: number;
  address: string;
  value: number;
  scriptPubKey: string;
  blockHeight: number;
  isCoinbase: boolean;
}

export interface AddressInfo {
  address: string;
  scriptType?: string;
  receivedCount: number;
  sentCount: number;
  balance: number;
  totalReceived: number;
  totalSent: number;
  firstSeenBlock?: number;
  lastSeenBlock?: number;
}

export interface AddressTransaction {
  address: string;
  txid: string;
  blockHeight?: number;
  valueChange: number;
  isInput: boolean;
}

export interface IndexerState {
  lastIndexedBlock: number;
  isInitialized: boolean;
  totalBlocks: number;
  totalTransactions: number;
  totalAddresses: number;
}

export interface ZmqMessage {
  topic: string;
  data: Buffer;
}

export interface ReorgInfo {
  commonAncestor: string;
  removedBlocks: string[];
  addedBlocks: string[];
} 