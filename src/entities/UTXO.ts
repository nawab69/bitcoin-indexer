import { Entity, PrimaryGeneratedColumn, Column, Index, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('utxos')
@Index(['transaction_id', 'output_index'], { unique: true })
@Index(['address'])
@Index(['is_spent'])
export class UTXO {
    @PrimaryGeneratedColumn()
    id!: number;

    @Column({ type: 'varchar', length: 64 })
    transaction_id!: string;

    @Column({ type: 'integer' })
    output_index!: number;

    @Column({ type: 'varchar', length: 64 })
    address!: string;

    @Column({ type: 'numeric', precision: 20, scale: 0 })
    value!: string;

    @Column({ type: 'text' })
    script_pub_key!: string;

    @Column({ type: 'varchar', length: 20, nullable: true })
    script_type: string | null;

    @Column({ type: 'integer' })
    block_height!: number;

    @Column({ type: 'bigint' })
    block_time!: number;

    @Column({ type: 'boolean', default: false })
    is_spent!: boolean;

    @Column({ type: 'varchar', length: 64, nullable: true })
    spent_by_txid: string | null;

    @Column({ type: 'integer', nullable: true })
    spent_by_input_index: number | null;

    @Column({ type: 'integer', nullable: true })
    spent_at_height: number | null;

    @Column({ type: 'bigint', nullable: true })
    spent_at_time: number | null;

    @CreateDateColumn()
    created_at!: Date;

    @UpdateDateColumn()
    updated_at!: Date;
} 