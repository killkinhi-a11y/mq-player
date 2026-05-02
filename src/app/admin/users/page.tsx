"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Search,
  Shield,
  ShieldOff,
  CheckCircle,
  XCircle,
  Lock,
  Unlock,
  Key,
  Trash2,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Copy,
  Eye,
  EyeOff,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useAppStore } from "@/store/useAppStore";

interface User {
  id: string;
  username: string;
  email: string;
  confirmed: boolean;
  role: string;
  blocked: boolean;
  blockedAt: string | null;
  blockedReason: string | null;
  createdAt: string;
}

export default function AdminUsersPage() {
  const { userId } = useAppStore();
  const [users, setUsers] = useState<User[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [limit] = useState(20);

  // Dialogs
  const [blockDialogOpen, setBlockDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
  const [roleDialogOpen, setRoleDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [blockReason, setBlockReason] = useState("");
  const [tempPassword, setTempPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [newRole, setNewRole] = useState("user");
  const [passwordCopied, setPasswordCopied] = useState(false);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (search) params.set("search", search);
      const res = await fetch(`/api/admin/users?${params}`);
      const data = await res.json();
      if (data.error) return;
      setUsers(data.users || []);
      setTotal(data.total || 0);
    } catch (err) {
      console.error("Failed to fetch users:", err);
    } finally {
      setLoading(false);
    }
  }, [page, search, limit]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const totalPages = Math.ceil(total / limit);

  const performAction = async (targetId: string, action: string, data?: Record<string, unknown>) => {
    if (!userId) return;
    setActionLoading(targetId);
    try {
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, targetId, action, data }),
      });
      const result = await res.json();
      if (result.temporaryPassword) {
        setTempPassword(result.temporaryPassword);
        setPasswordDialogOpen(true);
      }
      fetchUsers();
    } catch (err) {
      console.error("Action failed:", err);
    } finally {
      setActionLoading(null);
    }
  };

  const deleteUser = async (targetId: string) => {
    if (!userId) return;
    setActionLoading(targetId);
    try {
      await fetch(`/api/admin/users/${targetId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      setDeleteDialogOpen(false);
      fetchUsers();
    } catch (err) {
      console.error("Delete failed:", err);
    } finally {
      setActionLoading(null);
    }
  };

  const handleConfirmEmail = (user: User) => {
    if (user.confirmed) return;
    performAction(user.id, "confirm_email");
  };

  const handleBlock = (user: User) => {
    setSelectedUser(user);
    setBlockReason("");
    setBlockDialogOpen(true);
  };

  const handleUnblock = (user: User) => {
    performAction(user.id, "unblock_user");
  };

  const handleRoleChange = (user: User) => {
    setSelectedUser(user);
    setNewRole(user.role === "admin" ? "user" : "admin");
    setRoleDialogOpen(true);
  };

  const handlePasswordReset = (user: User) => {
    setSelectedUser(user);
    setTempPassword("");
    performAction(user.id, "reset_password");
  };

  const handleDelete = (user: User) => {
    setSelectedUser(user);
    setDeleteDialogOpen(true);
  };

  const copyPassword = () => {
    navigator.clipboard.writeText(tempPassword);
    setPasswordCopied(true);
    setTimeout(() => setPasswordCopied(false), 2000);
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "var(--mq-text)" }}>
            Пользователи
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--mq-text-muted)" }}>
            Управление аккаунтами ({total.toLocaleString("ru-RU")})
          </p>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search
          className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4"
          style={{ color: "var(--mq-text-muted)" }}
        />
        <input
          type="text"
          placeholder="Поиск по имени или email..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          className="w-full pl-10 pr-4 py-2.5 rounded-xl text-sm"
          style={{
            backgroundColor: "var(--mq-input-bg)",
            border: "1px solid var(--mq-border)",
            color: "var(--mq-text)",
          }}
        />
      </div>

      {/* Users table */}
      <div
        className="rounded-2xl overflow-hidden"
        style={{
          backgroundColor: "var(--mq-card)",
          border: "1px solid var(--mq-border)",
        }}
      >
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin" style={{ color: "var(--mq-accent)" }} />
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--mq-border)" }}>
                    <th className="text-left px-4 py-2.5 font-medium text-xs uppercase tracking-wider" style={{ color: "var(--mq-text-muted)" }}>
                      Пользователь
                    </th>
                    <th className="text-left px-4 py-2.5 font-medium text-xs uppercase tracking-wider hidden md:table-cell" style={{ color: "var(--mq-text-muted)" }}>
                      Email
                    </th>
                    <th className="text-left px-4 py-2.5 font-medium text-xs uppercase tracking-wider" style={{ color: "var(--mq-text-muted)" }}>
                      Статус
                    </th>
                    <th className="text-left px-4 py-2.5 font-medium text-xs uppercase tracking-wider hidden lg:table-cell" style={{ color: "var(--mq-text-muted)" }}>
                      Роль
                    </th>
                    <th className="text-right px-4 py-2.5 font-medium text-xs uppercase tracking-wider hidden lg:table-cell" style={{ color: "var(--mq-text-muted)" }}>
                      Дата
                    </th>
                    <th className="text-right px-4 py-2.5 font-medium text-xs uppercase tracking-wider" style={{ color: "var(--mq-text-muted)" }}>
                      Действия
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr key={user.id} style={{ borderBottom: "1px solid var(--mq-border)" }}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div
                            className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                            style={{
                              backgroundColor: user.blocked ? "rgba(249,115,22,0.15)" : "rgba(224,49,49,0.15)",
                              color: user.blocked ? "#f97316" : "var(--mq-accent)",
                            }}
                          >
                            {user.username.charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium truncate" style={{ color: "var(--mq-text)" }}>
                              {user.username}
                            </p>
                            <p className="text-xs md:hidden truncate" style={{ color: "var(--mq-text-muted)" }}>
                              {user.email}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell" style={{ color: "var(--mq-text-muted)" }}>
                        <span className="truncate block max-w-[200px]">{user.email}</span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {user.confirmed ? (
                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0" style={{ backgroundColor: "rgba(74,222,128,0.15)", color: "#4ade80" }}>
                              Подтв.
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0" style={{ backgroundColor: "rgba(136,136,136,0.15)", color: "var(--mq-text-muted)" }}>
                              Не подтв.
                            </Badge>
                          )}
                          {user.blocked && (
                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0" style={{ backgroundColor: "rgba(249,115,22,0.15)", color: "#f97316" }}>
                              Блок
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell">
                        {user.role === "admin" ? (
                          <span className="flex items-center gap-1 text-xs" style={{ color: "var(--mq-accent)" }}>
                            <Shield className="w-3 h-3" />
                            Админ
                          </span>
                        ) : (
                          <span className="text-xs" style={{ color: "var(--mq-text-muted)" }}>
                            Пользователь
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right text-xs hidden lg:table-cell" style={{ color: "var(--mq-text-muted)" }}>
                        {formatDate(user.createdAt)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          {!user.confirmed && (
                            <button
                              onClick={() => handleConfirmEmail(user)}
                              disabled={actionLoading === user.id}
                              title="Подтвердить email"
                              className="p-1.5 rounded-lg hover:opacity-80 transition-opacity"
                              style={{ color: "#4ade80" }}
                            >
                              {actionLoading === user.id ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <CheckCircle className="w-3.5 h-3.5" />
                              )}
                            </button>
                          )}
                          {user.blocked ? (
                            <button
                              onClick={() => handleUnblock(user)}
                              disabled={actionLoading === user.id}
                              title="Разблокировать"
                              className="p-1.5 rounded-lg hover:opacity-80 transition-opacity"
                              style={{ color: "#4ade80" }}
                            >
                              <Unlock className="w-3.5 h-3.5" />
                            </button>
                          ) : (
                            <button
                              onClick={() => handleBlock(user)}
                              disabled={actionLoading === user.id}
                              title="Заблокировать"
                              className="p-1.5 rounded-lg hover:opacity-80 transition-opacity"
                              style={{ color: "#f97316" }}
                            >
                              <Lock className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <button
                            onClick={() => handleRoleChange(user)}
                            disabled={actionLoading === user.id}
                            title={user.role === "admin" ? "Снять права" : "Сделать админом"}
                            className="p-1.5 rounded-lg hover:opacity-80 transition-opacity"
                            style={{ color: user.role === "admin" ? "var(--mq-text-muted)" : "var(--mq-accent)" }}
                          >
                            {user.role === "admin" ? (
                              <ShieldOff className="w-3.5 h-3.5" />
                            ) : (
                              <Shield className="w-3.5 h-3.5" />
                            )}
                          </button>
                          <button
                            onClick={() => handlePasswordReset(user)}
                            disabled={actionLoading === user.id}
                            title="Сбросить пароль"
                            className="p-1.5 rounded-lg hover:opacity-80 transition-opacity"
                            style={{ color: "#f59e0b" }}
                          >
                            <Key className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDelete(user)}
                            disabled={actionLoading === user.id}
                            title="Удалить"
                            className="p-1.5 rounded-lg hover:opacity-80 transition-opacity"
                            style={{ color: "#ef4444" }}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {users.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center" style={{ color: "var(--mq-text-muted)" }}>
                        {search ? "Пользователи не найдены" : "Нет пользователей"}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div
                className="flex items-center justify-between px-4 py-3"
                style={{ borderTop: "1px solid var(--mq-border)" }}
              >
                <span className="text-xs" style={{ color: "var(--mq-text-muted)" }}>
                  Страница {page} из {totalPages}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPage(Math.max(1, page - 1))}
                    disabled={page === 1}
                    className="p-1.5 rounded-lg disabled:opacity-30"
                    style={{ color: "var(--mq-text-muted)" }}
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setPage(Math.min(totalPages, page + 1))}
                    disabled={page === totalPages}
                    className="p-1.5 rounded-lg disabled:opacity-30"
                    style={{ color: "var(--mq-text-muted)" }}
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Block Dialog */}
      <Dialog open={blockDialogOpen} onOpenChange={setBlockDialogOpen}>
        <DialogContent
          style={{
            backgroundColor: "var(--mq-card)",
            border: "1px solid var(--mq-border)",
          }}
        >
          <DialogHeader>
            <DialogTitle style={{ color: "var(--mq-text)" }}>
              Заблокировать пользователя
            </DialogTitle>
            <DialogDescription style={{ color: "var(--mq-text-muted)" }}>
              {selectedUser?.username} ({selectedUser?.email})
            </DialogDescription>
          </DialogHeader>
          <textarea
            placeholder="Причина блокировки..."
            value={blockReason}
            onChange={(e) => setBlockReason(e.target.value)}
            rows={3}
            className="w-full rounded-xl px-3 py-2 text-sm resize-none"
            style={{
              backgroundColor: "var(--mq-input-bg)",
              border: "1px solid var(--mq-border)",
              color: "var(--mq-text)",
            }}
          />
          <DialogFooter className="gap-2">
            <button
              onClick={() => setBlockDialogOpen(false)}
              className="px-4 py-2 rounded-xl text-sm"
              style={{
                backgroundColor: "transparent",
                border: "1px solid var(--mq-border)",
                color: "var(--mq-text-muted)",
              }}
            >
              Отмена
            </button>
            <button
              onClick={() => {
                if (selectedUser) {
                  performAction(selectedUser.id, "block_user", { reason: blockReason || "Не указана" });
                  setBlockDialogOpen(false);
                }
              }}
              className="px-4 py-2 rounded-xl text-sm font-medium"
              style={{
                backgroundColor: "rgba(249,115,22,0.2)",
                color: "#f97316",
              }}
            >
              Заблокировать
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent
          style={{
            backgroundColor: "var(--mq-card)",
            border: "1px solid var(--mq-border)",
          }}
        >
          <DialogHeader>
            <DialogTitle style={{ color: "var(--mq-text)" }}>
              Удалить пользователя?
            </DialogTitle>
            <DialogDescription style={{ color: "var(--mq-text-muted)" }}>
              Это действие необратимо. Все данные {selectedUser?.username} будут удалены.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <button
              onClick={() => setDeleteDialogOpen(false)}
              className="px-4 py-2 rounded-xl text-sm"
              style={{
                backgroundColor: "transparent",
                border: "1px solid var(--mq-border)",
                color: "var(--mq-text-muted)",
              }}
            >
              Отмена
            </button>
            <button
              onClick={() => {
                if (selectedUser) deleteUser(selectedUser.id);
              }}
              disabled={actionLoading === selectedUser?.id}
              className="px-4 py-2 rounded-xl text-sm font-medium"
              style={{
                backgroundColor: "rgba(239,68,68,0.2)",
                color: "#ef4444",
              }}
            >
              {actionLoading === selectedUser?.id ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                "Удалить"
              )}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Role Dialog */}
      <Dialog open={roleDialogOpen} onOpenChange={setRoleDialogOpen}>
        <DialogContent
          style={{
            backgroundColor: "var(--mq-card)",
            border: "1px solid var(--mq-border)",
          }}
        >
          <DialogHeader>
            <DialogTitle style={{ color: "var(--mq-text)" }}>
              Изменить роль
            </DialogTitle>
            <DialogDescription style={{ color: "var(--mq-text-muted)" }}>
              {selectedUser?.username}: {selectedUser?.role === "admin" ? "Админ → Пользователь" : "Пользователь → Админ"}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <button
              onClick={() => setRoleDialogOpen(false)}
              className="px-4 py-2 rounded-xl text-sm"
              style={{
                backgroundColor: "transparent",
                border: "1px solid var(--mq-border)",
                color: "var(--mq-text-muted)",
              }}
            >
              Отмена
            </button>
            <button
              onClick={() => {
                if (selectedUser) {
                  performAction(selectedUser.id, "change_role", { role: newRole, oldRole: selectedUser.role });
                  setRoleDialogOpen(false);
                }
              }}
              disabled={actionLoading === selectedUser?.id}
              className="px-4 py-2 rounded-xl text-sm font-medium"
              style={{
                backgroundColor: "rgba(224,49,49,0.2)",
                color: "var(--mq-accent)",
              }}
            >
              {actionLoading === selectedUser?.id ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                "Подтвердить"
              )}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Password Dialog */}
      <Dialog open={passwordDialogOpen} onOpenChange={setPasswordDialogOpen}>
        <DialogContent
          style={{
            backgroundColor: "var(--mq-card)",
            border: "1px solid var(--mq-border)",
          }}
        >
          <DialogHeader>
            <DialogTitle style={{ color: "var(--mq-text)" }}>
              Новый временный пароль
            </DialogTitle>
            <DialogDescription style={{ color: "var(--mq-text-muted)" }}>
              Для {selectedUser?.username} ({selectedUser?.email})
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2">
            <div
              className="flex-1 flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-mono"
              style={{
                backgroundColor: "var(--mq-input-bg)",
                border: "1px solid var(--mq-border)",
                color: "var(--mq-text)",
              }}
            >
              <span className="flex-1 truncate">
                {showPassword ? tempPassword : "••••••••••"}
              </span>
              <button
                onClick={() => setShowPassword(!showPassword)}
                className="flex-shrink-0"
                style={{ color: "var(--mq-text-muted)" }}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <button
              onClick={copyPassword}
              className="p-2 rounded-xl flex-shrink-0"
              style={{
                backgroundColor: "var(--mq-input-bg)",
                border: "1px solid var(--mq-border)",
                color: passwordCopied ? "#4ade80" : "var(--mq-text-muted)",
              }}
            >
              <Copy className="w-4 h-4" />
            </button>
          </div>
          <p className="text-xs" style={{ color: "var(--mq-text-muted)" }}>
            Передайте этот пароль пользователю. Он сможет изменить его после входа.
          </p>
          <DialogFooter>
            <button
              onClick={() => setPasswordDialogOpen(false)}
              className="px-4 py-2 rounded-xl text-sm font-medium"
              style={{
                backgroundColor: "var(--mq-accent)",
                color: "var(--mq-text)",
              }}
            >
              Закрыть
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
