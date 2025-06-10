import { Entity, PrimaryGeneratedColumn, Column, Index, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Transaction } from './Transaction';

@Entity('transaction_outputs')
@Index(['transaction_id'])
@Index(['address'])
@Index(['is_spent'])
export class TransactionOutput {
    @PrimaryGeneratedColumn()
    id!: number;

    @Column({ type: 'varchar', length: 64 })
    transaction_id!: string;

    @Column({ type: 'integer' })
    output_index!: number;

    @Column({ type: 'numeric', precision: 20, scale: 0 })
    value!: string;

    @Column({ type: 'text' })
    script_pub_key!: string;

    @Column({ type: 'text', nullable: true })
    script_pub_key_asm: string | null;

    @Column({ type: 'varchar', length: 20, nullable: true })
    script_pub_key_type: string | null;

    @Column({ type: 'varchar', length: 64, nullable: true })
    address: string | null;

    @Column({ type: 'boolean', default: false })
    is_spent!: boolean;

    @Column({ type: 'varchar', length: 64, nullable: true })
    spent_by_txid: string | null;

    @Column({ type: 'integer', nullable: true })
    spent_by_input_index: number | null;

    @Column({ type: 'integer', nullable: true })
    spent_at_height: number | null;

    @ManyToOne(() => Transaction, transaction => transaction.outputs)
    @JoinColumn({ name: 'transaction_id', referencedColumnName: 'txid' })
    transaction!: Transaction;

    @CreateDateColumn()
    created_at!: Date;

    @UpdateDateColumn()
    updated_at!: Date;
} 