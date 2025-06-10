import { Entity, PrimaryGeneratedColumn, Column, Index, CreateDateColumn, UpdateDateColumn, OneToMany } from 'typeorm';
import { Transaction } from './Transaction';

@Entity('blocks')
@Index(['height'], { unique: true })
@Index(['hash'], { unique: true })
export class Block {
    @PrimaryGeneratedColumn()
    id!: number;

    @Column({ type: 'varchar', length: 64, unique: true })
    hash!: string;

    @Column({ type: 'integer', unique: true })
    height!: number;

    @Column({ type: 'varchar', length: 64, nullable: true })
    previousblockhash: string | null;

    @Column({ type: 'varchar', length: 64, nullable: true })
    nextblockhash: string | null;

    @Column({ type: 'integer' })
    version!: number;

    @Column({ type: 'varchar', length: 64 })
    merkleroot!: string;

    @Column({ type: 'bigint' })
    time!: number;

    @Column({ type: 'bigint' })
    mediantime!: number;

    @Column({ type: 'integer' })
    nonce!: number;

    @Column({ type: 'varchar', length: 8 })
    bits!: string;

    @Column({ type: 'numeric', precision: 30, scale: 10 })
    difficulty!: string;

    @Column({ type: 'varchar', length: 64 })
    chainwork!: string;

    @Column({ type: 'integer' })
    nTx!: number;

    @Column({ type: 'integer' })
    size!: number;

    @Column({ type: 'integer' })
    strippedsize!: number;

    @Column({ type: 'integer' })
    weight!: number;

    @OneToMany(() => Transaction, transaction => transaction.block)
    transactions!: Transaction[];

    @CreateDateColumn()
    created_at!: Date;

    @UpdateDateColumn()
    updated_at!: Date;
} 