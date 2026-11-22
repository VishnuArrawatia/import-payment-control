import React, { createContext, useContext, useState, useEffect } from 'react';
import { AppUser, RolePermissions, ROLE_PERMISSIONS } from '../types/auth';
import { DEFAULT_USERS } from '../data/defaultUsers';
import { hashPassword, verifyPassword } from '../utils/crypto';

interface AuthContextType {
  currentUser: AppUser | null;
  users: AppUser[];
  permissions: RolePermissions;
  isAuthenticated: boolean;
  authReady: boolean;
  login: (username: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
  updateUserPassword: (userId: string, newPass: string) => Promise<{ success: boolean; error?: string }>;
}

const AuthContext = createContext<AuthContextType | null>(null);

const USERS_STORAGE_KEY = 'ipc_app_users_v1';
const SESSION_STORAGE_KEY = 'ipc_auth_session_user';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [users, setUsers] = useState<AppUser[]>(DEFAULT_USERS);
  const [currentUser, setCurrentUser] = useState<AppUser | null>(null);
  const [authReady, setAuthReady] = useState<boolean>(false);
  const [serverAuthAvailable, setServerAuthAvailable] = useState<boolean>(false);

  const loadOfflineUsers = (): AppUser[] => {
    try {
      const stored = localStorage.getItem(USERS_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as AppUser[];
        if (
          Array.isArray(parsed) &&
          parsed.length >= 5 &&
          parsed.every(u => u.passwordHash && u.passwordHash.length === 64)
        ) {
          let changed = false;
          for (const def of DEFAULT_USERS) {
            if (!parsed.some(u => u.id === def.id)) {
              parsed.push(def);
              changed = true;
            }
          }
          if (changed) {
            localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(parsed));
          }
          return parsed;
        }
      }
      localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(DEFAULT_USERS));
    } catch {
      // ignore
    }
    return DEFAULT_USERS;
  };

  useEffect(() => {
    let cancelled = false;

    async function initAuth() {
      try {
        // Fetch public role list (safe, zero password hashes)
        const rolesRes = await fetch('/api/auth/roles', { credentials: 'same-origin' });
        if (rolesRes.ok) {
          const rolesData = await rolesRes.json();
          if (!cancelled && Array.isArray(rolesData.roles)) {
            setUsers(
              rolesData.roles.map((r: any) => ({
                ...r,
                salt: '',
                passwordHash: '',
                active: true,
                createdAt: '',
              }))
            );
          }
        }

        // Verify HttpOnly session cookie with server
        const meRes = await fetch('/api/auth/me', { credentials: 'same-origin' });
        setServerAuthAvailable(true);

        if (meRes.ok) {
          const meData = await meRes.json();
          if (!cancelled && meData.authenticated && meData.user) {
            setCurrentUser({ ...meData.user, salt: '', passwordHash: '' });
            if (meData.user.role === 'admin') {
              const usersRes = await fetch('/api/auth/users', { credentials: 'same-origin' });
              if (usersRes.ok) {
                const uData = await usersRes.json();
                if (!cancelled && Array.isArray(uData.users)) {
                  setUsers(uData.users.map((u: any) => ({ ...u, salt: '', passwordHash: '' })));
                }
              }
            }
          }
        } else {
          // 401 or not authenticated -> force Sign In modal (no auto-login)
          if (!cancelled) {
            setCurrentUser(null);
            try {
              sessionStorage.removeItem(SESSION_STORAGE_KEY);
            } catch {
              // ignore
            }
          }
        }
      } catch {
        // Offline / unit-test fallback (no backend server running)
        setServerAuthAvailable(false);
        const offlineList = loadOfflineUsers();
        if (!cancelled) {
          setUsers(offlineList);
          try {
            const activeUsername = sessionStorage.getItem(SESSION_STORAGE_KEY);
            if (activeUsername) {
              const found = offlineList.find(u => u.username === activeUsername && u.active);
              if (found) setCurrentUser(found);
            }
          } catch {
            // ignore
          }
        }
      } finally {
        if (!cancelled) setAuthReady(true);
      }
    }

    initAuth();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = async (username: string, password: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ username: username.trim(), password }),
      });

      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        setServerAuthAvailable(true);
        const data = await res.json();
        if (!res.ok || !data.success) {
          return { success: false, error: data.error || 'Invalid username or password.' };
        }
        const loggedUser: AppUser = { ...data.user, salt: '', passwordHash: '' };
        setCurrentUser(loggedUser);

        if (loggedUser.role === 'admin') {
          try {
            const usersRes = await fetch('/api/auth/users', { credentials: 'same-origin' });
            if (usersRes.ok) {
              const uData = await usersRes.json();
              if (Array.isArray(uData.users)) {
                setUsers(uData.users.map((u: any) => ({ ...u, salt: '', passwordHash: '' })));
              }
            }
          } catch {
            // ignore
          }
        }
        return { success: true };
      }
    } catch {
      // Fallback only if API server unreachable (e.g. pure Vite static dev without server)
    }

    if (serverAuthAvailable) {
      return { success: false, error: 'Authentication server returned an unexpected response.' };
    }

    const offlineList = loadOfflineUsers();
    const user = offlineList.find(u => u.username.toLowerCase() === username.trim().toLowerCase());
    if (!user || !user.active) {
      return { success: false, error: 'Invalid username or password.' };
    }
    const isValid = await verifyPassword(password, user.salt, user.passwordHash);
    if (!isValid) {
      return { success: false, error: 'Invalid username or password.' };
    }
    const updatedUser = { ...user, lastLoginAt: new Date().toISOString() };
    const updatedList = offlineList.map(u => (u.id === user.id ? updatedUser : u));
    setUsers(updatedList);
    localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(updatedList));
    setCurrentUser(updatedUser);
    sessionStorage.setItem(SESSION_STORAGE_KEY, user.username);
    return { success: true };
  };

  const logout = () => {
    void fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' }).catch(() => {});
    setCurrentUser(null);
    try {
      sessionStorage.removeItem(SESSION_STORAGE_KEY);
    } catch {
      // ignore
    }
  };

  const updateUserPassword = async (userId: string, newPass: string): Promise<{ success: boolean; error?: string }> => {
    if (!newPass || newPass.length < 6) {
      return { success: false, error: 'Password must be at least 6 characters long.' };
    }

    if (serverAuthAvailable) {
      try {
        const res = await fetch('/api/auth/users/password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ userId, newPassword: newPass }),
        });
        const data = await res.json();
        if (!res.ok || !data.success) {
          return { success: false, error: data.error || 'Failed to update password.' };
        }
        return { success: true };
      } catch (err: any) {
        return { success: false, error: err?.message || 'Server error updating password.' };
      }
    }

    const offlineList = loadOfflineUsers();
    const user = offlineList.find(u => u.id === userId);
    if (!user) return { success: false, error: 'User not found.' };

    const newHash = await hashPassword(newPass, user.salt);
    const updated = offlineList.map(u => (u.id === userId ? { ...u, passwordHash: newHash } : u));
    setUsers(updated);
    localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(updated));

    if (currentUser?.id === userId) {
      setCurrentUser({ ...user, passwordHash: newHash });
    }
    return { success: true };
  };

  const permissions = currentUser ? ROLE_PERMISSIONS[currentUser.role] : ROLE_PERMISSIONS.management;

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        users,
        permissions,
        isAuthenticated: !!currentUser,
        authReady,
        login,
        logout,
        updateUserPassword,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
};
