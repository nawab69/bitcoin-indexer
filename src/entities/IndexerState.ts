import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('indexer_state')
export class IndexerState {
    @PrimaryGeneratedColumn()
    id!: number;

    @Column({ type: 'varchar', length: 50, unique: true })
    key!: string;

    @Column({ type: 'text' })
    value!: string;

    @Column({ type: 'text', nullable: true })
    description: string | null;

    @CreateDateColumn()
    created_at!: Date;

    @UpdateDateColumn()
    updated_at!: Date;
} 