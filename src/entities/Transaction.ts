import { Entity, PrimaryGeneratedColumn, Column, Index, CreateDateColumn, UpdateDateColumn, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { Block } from './Block';
import { TransactionInput } from './TransactionInput';
import { TransactionOutput } from './TransactionOutput';

@Entity('transactions')
@Index(['txid'], { unique: true })
@Index(['block_height'])
export class Transaction {
    @PrimaryGeneratedColumn()
    id!: number;

    @Column({ type: 'varchar', length: 64, unique: true })
    txid!: string;

    @Column({ type: 'varchar', length: 64 })
    hash!: string;

    @Column({ type: 'integer' })
    version!: number;

    @Column({ type: 'integer' })
    size!: number;

    @Column({ type: 'integer' })
    vsize!: number;

    @Column({ type: 'integer' })
    weight!: number;

    @Column({ type: 'integer' })
    locktime!: number;

    @Column({ type: 'varchar', length: 64, nullable: true })
    block_hash: string | null;

    @Column({ type: 'integer', nullable: true })
    block_height: number | null;

    @Column({ type: 'integer', nullable: true })
    block_index: number | null;

    @Column({ type: 'bigint', nullable: true })
    block_time: number | null;

    @Column({ type: 'numeric', precision: 20, scale: 0, default: 0 })
    total_input_value!: string;

    @Column({ type: 'numeric', precision: 20, scale: 0, default: 0 })
    total_output_value!: string;

    @Column({ type: 'numeric', precision: 20, scale: 0, default: 0 })
    fee!: string;

    @Column({ type: 'boolean', default: false })
    is_coinbase!: boolean;

    @ManyToOne(() => Block, block => block.transactions)
    @JoinColumn({ name: 'block_hash', referencedColumnName: 'hash' })
    block!: Block;

    @OneToMany(() => TransactionInput, input => input.transaction)
    inputs!: TransactionInput[];

    @OneToMany(() => TransactionOutput, output => output.transaction)
    outputs!: TransactionOutput[];

    @CreateDateColumn()
    created_at!: Date;

    @UpdateDateColumn()
    updated_at!: Date;
} 