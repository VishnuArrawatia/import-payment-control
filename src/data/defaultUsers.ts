import { AppUser } from '../types/auth';

/**
 * Predefined User Accounts (1 Admin, 1 Management, 3 Executors, 2 Purchase)
 * Passwords are stored strictly as salted SHA-256 hashes (zero plaintext secrets in bundle).
 */
export const DEFAULT_USERS: AppUser[] = [
  {
    id: 'user-admin',
    username: 'admin',
    displayName: 'Head Administrator',
    role: 'admin',
    salt: 'a1b2c3d4e5f60718',
    passwordHash: '97fc2de4971b70bca5d3ccffe45f6633f9116da01f827ad67353f426e0684a7c',
    active: true,
    createdAt: '2026-04-01T00:00:00.000Z',
  },
  {
    id: 'user-mgmt',
    username: 'management',
    displayName: 'Executive Management',
    role: 'management',
    salt: 'b2c3d4e5f60718a1',
    passwordHash: '62d7db37429a4c72aec42d369a03b3eee8144095acda53bcdbcb95bc6537e3ac',
    active: true,
    createdAt: '2026-04-01T00:00:00.000Z',
  },
  {
    id: 'user-exec1',
    username: 'executor1',
    displayName: 'Import Operations Lead',
    role: 'executor',
    salt: 'c3d4e5f60718a1b2',
    passwordHash: '20bc5b10ab1b9ff7d4033568f9311287ffacb44ffe2bd852a6b9a40cbad5a5b2',
    active: true,
    createdAt: '2026-04-01T00:00:00.000Z',
  },
  {
    id: 'user-exec2',
    username: 'executor2',
    displayName: 'Customs & BOE Specialist',
    role: 'executor',
    salt: 'd4e5f60718a1b2c3',
    passwordHash: '2ed3e4a930f521959db6fa432034c8d663aa5d9e8286fd23539ee35ebf366c46',
    active: true,
    createdAt: '2026-04-01T00:00:00.000Z',
  },
  {
    id: 'user-exec3',
    username: 'executor3',
    displayName: 'Bank Remittance Executive',
    role: 'executor',
    salt: 'e5f60718a1b2c3d4',
    passwordHash: 'c4fbf8d4dca5468652f837759a8cd416b5a35ffbe932fc533a8e2f87ed07e651',
    active: true,
    createdAt: '2026-04-01T00:00:00.000Z',
  },
  {
    id: 'user-purch1',
    username: 'purchase1',
    displayName: 'Purchase Manager',
    role: 'purchase',
    salt: 'f60718a1b2c3d4e5',
    passwordHash: 'd125f652547521a350a6aae6d12782a75bea7e4040f767d07d4100ce1c1bbf25',
    active: true,
    createdAt: '2026-04-01T00:00:00.000Z',
  },
  {
    id: 'user-purch2',
    username: 'purchase2',
    displayName: 'Purchase & Logistics Executive',
    role: 'purchase',
    salt: '0718a1b2c3d4e5f6',
    passwordHash: 'f355af8e46a32b96d4b1ef3ea590401fdd82ce15c7e8cce0bd3fcbbcba9f1bea',
    active: true,
    createdAt: '2026-04-01T00:00:00.000Z',
  },
];
