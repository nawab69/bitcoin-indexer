import { Entity, PrimaryGeneratedColumn, Column, Index, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('addresses')
@Index(['address'], { unique: true })
export class Address {
    @PrimaryGeneratedColumn()
    id!: number;

    @Column({ type: 'varchar', length: 64, unique: true })
    address!: string;

    @Column({ type: 'numeric', precision: 20, scale: 0, default: 0 })
    balance!: string;

    @Column({ type: 'numeric', precision: 20, scale: 0, default: 0 })
    total_received!: string;

    @Column({ type: 'numeric', precision: 20, scale: 0, default: 0 })
    total_sent!: string;

    @Column({ type: 'integer', default: 0 })
    transaction_count!: number;

    @Column({ type: 'integer', default: 0 })
    utxo_count!: number;

    @Column({ type: 'integer', nullable: true })
    first_seen_height: number | null;

    @Column({ type: 'bigint', nullable: true })
    first_seen_time: number | null;

    @Column({ type: 'integer', nullable: true })
    last_activity_height: number | null;

    @Column({ type: 'bigint', nullable: true })
    last_activity_time: number | null;

    @CreateDateColumn()
    created_at!: Date;

    @UpdateDateColumn()
    updated_at!: Date;
} 