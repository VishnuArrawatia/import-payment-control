// Authentication and Role-Based Access Control Types

export type UserRole = 'admin' | 'management' | 'executor' | 'purchase';

export interface AppUser {
  id: string;
  username: string; // e.g. "admin", "management", "executor1", "executor2", "executor3"
  displayName: string;
  role: UserRole;
  passwordHash: string; // SHA-256 hashed password
  salt: string;
  active: boolean;
  createdAt: string;
  lastLoginAt?: string;
}

export interface AuthSession {
  user: AppUser;
  token: string;
  expiresAt: string;
}

export interface RolePermissions {
  canManageUsers: boolean;
  canManageSettings: boolean;
  canManageMasters: boolean;
  canManageBackups: boolean;
  canCreatePI: boolean;
  canCreateCI: boolean;
  canRecordPayment: boolean;
  canIssueDebitNote: boolean;
  canRecordRefund: boolean;
  canSubmitBOE: boolean;
  canViewReports: boolean;
  canExportExcel: boolean;
  canViewFinance: boolean;
  canViewPurchase: boolean;
  canManagePurchase: boolean;
  canManageIGCR: boolean;
}

export const ROLE_PERMISSIONS: Record<UserRole, RolePermissions> = {
  admin: {
    canManageUsers: true,
    canManageSettings: true,
    canManageMasters: true,
    canManageBackups: true,
    canCreatePI: true,
    canCreateCI: true,
    canRecordPayment: true,
    canIssueDebitNote: true,
    canRecordRefund: true,
    canSubmitBOE: true,
    canViewReports: true,
    canExportExcel: true,
    canViewFinance: true,
    canViewPurchase: true,
    canManagePurchase: true,
    canManageIGCR: true,
  },
  management: {
    canManageUsers: false,
    canManageSettings: false,
    canManageMasters: false,
    canManageBackups: false,
    canCreatePI: false,
    canCreateCI: false,
    canRecordPayment: false,
    canIssueDebitNote: false,
    canRecordRefund: false,
    canSubmitBOE: false,
    canViewReports: true,
    canExportExcel: true,
    canViewFinance: true,
    canViewPurchase: true,
    canManagePurchase: false,
    canManageIGCR: false,
  },
  executor: {
    canManageUsers: false,
    canManageSettings: false,
    canManageMasters: false,
    canManageBackups: false,
    canCreatePI: true,
    canCreateCI: true,
    canRecordPayment: true,
    canIssueDebitNote: true,
    canRecordRefund: true,
    canSubmitBOE: true,
    canViewReports: true,
    canExportExcel: true,
    canViewFinance: true,
    canViewPurchase: true,
    canManagePurchase: true,
    canManageIGCR: true,
  },
  purchase: {
    canManageUsers: false,
    canManageSettings: false,
    canManageMasters: false,
    canManageBackups: false,
    canCreatePI: true,
    canCreateCI: false,
    canRecordPayment: false,
    canIssueDebitNote: false,
    canRecordRefund: false,
    canSubmitBOE: false,
    canViewReports: false,
    canExportExcel: true,
    canViewFinance: false,
    canViewPurchase: true,
    canManagePurchase: true,
    canManageIGCR: false,
  },
};
