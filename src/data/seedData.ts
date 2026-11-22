import { AppDatabase } from '../types';
import initialSeed from './initialSeed.json';

export const INITIAL_DATABASE: AppDatabase = initialSeed as unknown as AppDatabase;
