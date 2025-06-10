import { Entity, PrimaryGeneratedColumn, Column, Index, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Transaction } from './Transaction';

@Entity('transaction_inputs')
@Index(['transaction_id'])
@Index(['previous_output_txid'])
export class TransactionInput {
    @PrimaryGeneratedColumn()
    id!: number;

    @Column({ type: 'varchar', length: 64 })
    transaction_id!: string;

    @Column({ type: 'integer' })
    input_index!: number;

    @Column({ type: 'varchar', length: 64, nullable: true })
    previous_output_txid: string | null;

    @Column({ type: 'integer', nullable: true })
    previous_output_index: number | null;

    @Column({ type: 'text', nullable: true })
    script_sig: string | null;

    @Column({ type: 'text', nullable: true })
    script_sig_asm: string | null;

    @Column({ type: 'bigint' })
    sequence!: number;

    @Column({ type: 'text', nullable: true, array: true })
    witness: string[] | null;

    @Column({ type: 'varchar', length: 64, nullable: true })
    coinbase: string | null;

    @Column({ type: 'numeric', precision: 20, scale: 0, nullable: true })
    value: string | null;

    @Column({ type: 'varchar', length: 64, nullable: true })
    address: string | null;

    @ManyToOne(() => Transaction, transaction => transaction.inputs)
    @JoinColumn({ name: 'transaction_id', referencedColumnName: 'txid' })
    transaction!: Transaction;

    @CreateDateColumn()
    created_at!: Date;

    @UpdateDateColumn()
    updated_at!: Date;
} 