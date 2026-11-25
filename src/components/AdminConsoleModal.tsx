import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { usePlayer } from '../context/PlayerContext';
import { api } from '../services/api';
import {
  formatFileSizeLabel,
  removeDeletedSharedOfflineTrackLocal,
} from '../services/sharedOffline';
import { SafeImage } from './SafeImage';
import {
  X,
  ShieldCheck,
  LayoutDashboard,
  BarChart3,
  Megaphone,
  Users,
  ShieldAlert,
  Layers,
  Wrench,
  KeyRound,
  RefreshCw,
  Download,
  LogOut,
  Search,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Trash2,
  Ban,
  Unlock,
  Plus,
  Send,
  Radio,
  Sliders,
  Server,
  Monitor,
  Smartphone,
  Tablet,
  Eraser,
  ArrowRight,
} from 'lucide-react';

type AdminNavSection =
  | 'overview'
  | 'analytics'
  | 'announcements'
  | 'users'
  | 'safety'
  | 'content'
  | 'system';

type AnalyticsSubTab = 'ranking' | 'traffic';
type AnnouncementsSubTab = 'banner' | 'features' | 'email';
type SafetySubTab = 'reports' | 'comments' | 'dms';
type ContentSubTab = 'sharedOffline' | 'rooms' | 'playlists' | 'offsets';
type SystemSubTab = 'maintenance' | 'diagnostics';
type UserFilter = 'all' | 'banned' | 'withEmail';

interface NavItemConfig {
  id: AdminNavSection;
  group: string;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}

const NAV_GROUPS: Array<{ title: string; items: NavItemConfig[] }> = [
  {
    title: '基本',
    items: [
      {
        id: 'overview',
        group: '基本',
        label: '概要・ホーム',
        description: '利用状況のサマリーや、未対応の確認事項をまとめて表示します。',
        icon: LayoutDashboard,
      },
      {
        id: 'analytics',
        group: '基本',
        label: '再生・アクセス分析',
        description: 'よく聴かれている曲、検索キーワード、接続中ユーザーと端末の内訳を確認できます。',
        icon: BarChart3,
      },
    ],
  },
  {
    title: '運営・告知',
    items: [
      {
        id: 'announcements',
        group: '運営・告知',
        label: 'お知らせ・機能制御',
        description: '全ユーザー画面へのお知らせ表示、即時通知、各機能のON/OFF、一斉メールを管理します。',
        icon: Megaphone,
      },
    ],
  },
  {
    title: 'ユーザー・安全',
    items: [
      {
        id: 'users',
        group: 'ユーザー・安全',
        label: 'ユーザー管理',
        description: '登録ユーザーの検索、アカウント凍結・解除、パスワード変更、削除を行います。',
        icon: Users,
      },
      {
        id: 'safety',
        group: 'ユーザー・安全',
        label: '通報・コメント・DM監査',
        description: 'ユーザーからの通報対応、コメント削除、NGワード設定、DM履歴の確認を行えます。',
        icon: ShieldAlert,
      },
    ],
  },
  {
    title: 'コンテンツ・保守',
    items: [
      {
        id: 'content',
        group: 'コンテンツ・保守',
        label: '投稿コンテンツ・歌詞補正',
        description: '共有オフライン曲、リスニングルーム、公開プレイリスト、歌詞タイミング補正を管理します。',
        icon: Layers,
      },
      {
        id: 'system',
        group: 'コンテンツ・保守',
        label: 'システム保守・診断',
        description: 'サーバーキャッシュやログの消去、API疎通テスト、データのバックアップを行えます。',
        icon: Wrench,
      },
    ],
  },
];

const ALL_NAV_ITEMS = NAV_GROUPS.flatMap((g) => g.items);

export const AdminConsoleModal: React.FC = () => {
  const {
    isAdmin,
    adminModalOpen,
    setAdminModalOpen,
    adminLoginWithPassword,
    logoutAccount,
    refreshTrackOffsets,
    refreshStats,
    currentTrack,
    setSiteSettings,
  } = usePlayer();

  // Primary navigation & sub-tabs
  const [activeNav, setActiveNav] = useState<AdminNavSection>('overview');
  const [analyticsTab, setAnalyticsTab] = useState<AnalyticsSubTab>('ranking');
  const [announcementsTab, setAnnouncementsTab] = useState<AnnouncementsSubTab>('banner');
  const [safetyTab, setSafetyTab] = useState<SafetySubTab>('reports');
  const [contentTab, setContentTab] = useState<ContentSubTab>('sharedOffline');
  const [systemTab, setSystemTab] = useState<SystemSubTab>('maintenance');

  // Admin authentication form
  const [adminPassInput, setAdminPassInput] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  // Toast feedback inside console
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  }, []);

  // Core overview telemetry
  const [overviewData, setOverviewData] = useState<any>(null);
  const [loadingOverview, setLoadingOverview] = useState(false);

  // Moderation & DMs
  const [moderationData, setModerationData] = useState<any>(null);
  const [loadingModeration, setLoadingModeration] = useState(false);
  const [newNgWord, setNewNgWord] = useState('');
  const [savingNgWord, setSavingNgWord] = useState(false);
  const [confirmDeleteCommentId, setConfirmDeleteCommentId] = useState<string | null>(null);

  const [adminDmData, setAdminDmData] = useState<{
    totalMessages: number;
    totalConversations: number;
    conversations: Array<{
      conversationId: string;
      participants: [string, string];
      messageCount: number;
      lastTimestamp: string;
      messages: any[];
    }>;
  } | null>(null);
  const [loadingAdminDms, setLoadingAdminDms] = useState(false);
  const [selectedAdminConvId, setSelectedAdminConvId] = useState<string | null>(null);
  const [dmSearchFilter, setDmSearchFilter] = useState('');
  const [confirmDeleteDmId, setConfirmDeleteDmId] = useState<string | null>(null);

  // Shared offline management
  const [sharedOfflineData, setSharedOfflineData] = useState<{
    tracks: any[];
    totalCount: number;
    totalBytes: number;
  } | null>(null);
  const [loadingSharedOffline, setLoadingSharedOffline] = useState(false);
  const [sharedSearchFilter, setSharedSearchFilter] = useState('');
  const [confirmDeleteSharedId, setConfirmDeleteSharedId] = useState<string | null>(null);
  const [deletingSharedId, setDeletingSharedId] = useState<string | null>(null);

  // Rooms & Playlists management
  const [contentOverview, setContentOverview] = useState<{
    rooms: any[];
    sharedPlaylists: any[];
    collabPlaylists: any[];
  } | null>(null);
  const [loadingContentOverview, setLoadingContentOverview] = useState(false);
  const [confirmDeleteContentKey, setConfirmDeleteContentKey] = useState<string | null>(null);

  // Users management
  const [userSearchFilter, setUserSearchFilter] = useState('');
  const [userFilter, setUserFilter] = useState<UserFilter>('all');
  const [userPasswordReset, setUserPasswordReset] = useState<{
    username: string;
    newPass: string;
  } | null>(null);
  const [confirmDeleteUser, setConfirmDeleteUser] = useState<string | null>(null);

  // Announcements, Feature switches & Email Broadcast
  const [announcementActive, setAnnouncementActive] = useState(false);
  const [announcementLevel, setAnnouncementLevel] = useState<'info' | 'warning' | 'alert'>('info');
  const [announcementMessage, setAnnouncementMessage] = useState('');
  const [allowNewRegistrations, setAllowNewRegistrations] = useState(true);
  const [sharedOfflineUploadEnabled, setSharedOfflineUploadEnabled] = useState(true);
  const [commentsEnabled, setCommentsEnabled] = useState(true);
  const [dmsEnabled, setDmsEnabled] = useState(true);
  const [savingSiteSettings, setSavingSiteSettings] = useState(false);

  const [pushToastMessage, setPushToastMessage] = useState('');
  const [pushToastType, setPushToastType] = useState<'info' | 'warning' | 'success'>('info');
  const [sendingPushToast, setSendingPushToast] = useState(false);

  const [broadcastSubject, setBroadcastSubject] = useState('');
  const [broadcastBody, setBroadcastBody] = useState('');
  const [sendingBroadcast, setSendingBroadcast] = useState(false);

  // Track Offsets
  const [offsetVideoId, setOffsetVideoId] = useState('');
  const [offsetTitle, setOffsetTitle] = useState('');
  const [offsetSecVal, setOffsetSecVal] = useState('0');
  const [savingOffset, setSavingOffset] = useState(false);

  // System Maintenance & Ping
  const [pinging, setPinging] = useState(false);
  const [pingResult, setPingResult] = useState<string | null>(null);
  const [runningMaintenanceKey, setRunningMaintenanceKey] = useState<string | null>(null);

  // Data loaders
  const fetchOverview = useCallback(async () => {
    if (!isAdmin) return;
    setLoadingOverview(true);
    try {
      const data = await api.getAdminOverview();
      setOverviewData(data);
    } catch (err) {
      console.warn('Admin overview fetch error:', err);
    } finally {
      setLoadingOverview(false);
    }
  }, [isAdmin]);

  const fetchModeration = useCallback(async () => {
    if (!isAdmin) return;
    setLoadingModeration(true);
    try {
      const data = await api.getModerationOverview();
      setModerationData(data);
    } catch {}
    setLoadingModeration(false);
  }, [isAdmin]);

  const fetchAdminDms = useCallback(async () => {
    if (!isAdmin) return;
    setLoadingAdminDms(true);
    try {
      const data = await api.getAdminAllDms();
      setAdminDmData(data);
      if (!selectedAdminConvId && data.conversations?.length > 0) {
        setSelectedAdminConvId(data.conversations[0].conversationId);
      }
    } catch (e) {
      console.warn('Failed to load admin DMs:', e);
    } finally {
      setLoadingAdminDms(false);
    }
  }, [isAdmin, selectedAdminConvId]);

  const fetchAdminSharedOffline = useCallback(async () => {
    if (!isAdmin) return;
    setLoadingSharedOffline(true);
    try {
      const data = await api.getAdminSharedOfflineTracks();
      setSharedOfflineData(data);
    } catch (e) {
      console.warn('Failed to load admin shared offline tracks:', e);
    } finally {
      setLoadingSharedOffline(false);
    }
  }, [isAdmin]);

  const fetchContentOverview = useCallback(async () => {
    if (!isAdmin) return;
    setLoadingContentOverview(true);
    try {
      const data = await api.getAdminContentOverview();
      setContentOverview(data);
    } catch (e) {
      console.warn('Failed to load admin content overview:', e);
    } finally {
      setLoadingContentOverview(false);
    }
  }, [isAdmin]);

  const fetchSiteControlSettings = useCallback(async () => {
    if (!isAdmin) return;
    try {
      const res = await api.getAdminSiteSettings();
      if (res?.settings) {
        setAnnouncementActive(Boolean(res.settings.announcement?.active));
        setAnnouncementLevel(res.settings.announcement?.level || 'info');
        setAnnouncementMessage(res.settings.announcement?.message || '');
        setAllowNewRegistrations(res.settings.allowNewRegistrations !== false);
        setSharedOfflineUploadEnabled(res.settings.sharedOfflineUploadEnabled !== false);
        setCommentsEnabled(res.settings.commentsEnabled !== false);
        setDmsEnabled(res.settings.dmsEnabled !== false);
        setSiteSettings(res.settings);
      }
    } catch {}
  }, [isAdmin, setSiteSettings]);

  const refreshCurrentSection = useCallback(() => {
    fetchOverview();
    if (activeNav === 'overview') {
      fetchModeration();
      fetchAdminSharedOffline();
    } else if (activeNav === 'announcements') {
      fetchSiteControlSettings();
    } else if (activeNav === 'safety') {
      fetchModeration();
      if (safetyTab === 'dms') fetchAdminDms();
    } else if (activeNav === 'content') {
      fetchAdminSharedOffline();
      fetchContentOverview();
    }
  }, [
    activeNav,
    safetyTab,
    fetchOverview,
    fetchModeration,
    fetchAdminSharedOffline,
    fetchSiteControlSettings,
    fetchAdminDms,
    fetchContentOverview,
  ]);

  useEffect(() => {
    if (adminModalOpen && isAdmin) {
      refreshCurrentSection();
    }
  }, [adminModalOpen, isAdmin, activeNav, safetyTab, contentTab, refreshCurrentSection]);

  const pendingReportsCount = useMemo(
    () => (moderationData?.reports || []).filter((r: any) => r.status === 'pending').length,
    [moderationData]
  );

  const filteredAccounts = useMemo(() => {
    const accounts: any[] = overviewData?.accounts || [];
    const q = userSearchFilter.trim().toLowerCase();
    return accounts.filter((acc) => {
      if (userFilter === 'banned' && !acc.isBanned) return false;
      if (userFilter === 'withEmail' && !acc.hasEmail) return false;
      if (!q) return true;
      return (
        String(acc.username || '').toLowerCase().includes(q) ||
        String(acc.email || '').toLowerCase().includes(q)
      );
    });
  }, [overviewData?.accounts, userSearchFilter, userFilter]);

  if (!adminModalOpen) return null;

  const currentNavMeta = ALL_NAV_ITEMS.find((i) => i.id === activeNav) || ALL_NAV_ITEMS[0];

  const totalDeviceCount =
    (overviewData?.traffic?.clientDevices?.desktop || 0) +
      (overviewData?.traffic?.clientDevices?.mobile || 0) +
      (overviewData?.traffic?.clientDevices?.tablet || 0) || 1;

  // Handlers
  const handleAdminAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginLoading(true);
    setLoginError(null);
    try {
      await adminLoginWithPassword(adminPassInput.trim());
      setAdminPassInput('');
      showToast('管理者としてログインしました');
      fetchOverview();
    } catch (err: any) {
      setLoginError(err.message || 'パスワードが正しくありません');
    } finally {
      setLoginLoading(false);
    }
  };

  const handleSaveSiteSettings = async () => {
    setSavingSiteSettings(true);
    try {
      const res = await api.updateAdminSiteSettings({
        announcement: {
          active: announcementActive,
          level: announcementLevel,
          message: announcementMessage.trim(),
        },
        allowNewRegistrations,
        sharedOfflineUploadEnabled,
        commentsEnabled,
        dmsEnabled,
      });
      if (res?.settings) setSiteSettings(res.settings);
      showToast(res.message || '設定を保存しました');
    } catch (err: any) {
      showToast(err?.message || '設定の保存に失敗しました');
    } finally {
      setSavingSiteSettings(false);
    }
  };

  const handleSendPushToast = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pushToastMessage.trim()) return;
    setSendingPushToast(true);
    try {
      const res = await api.sendAdminPushToast(pushToastMessage.trim(), pushToastType);
      setPushToastMessage('');
      showToast(res.message || '通知を送信しました');
    } catch (err: any) {
      showToast(err?.message || '送信に失敗しました');
    } finally {
      setSendingPushToast(false);
    }
  };

  const handleSendBroadcast = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!broadcastSubject.trim() || !broadcastBody.trim()) return;
    setSendingBroadcast(true);
    try {
      const res = await api.broadcastNotification(broadcastSubject, broadcastBody);
      showToast(res.message || '一斉メールを送信しました');
      setBroadcastSubject('');
      setBroadcastBody('');
      fetchOverview();
    } catch (err: any) {
      showToast(err?.message || '送信に失敗しました');
    } finally {
      setSendingBroadcast(false);
    }
  };

  const handleDeleteUser = async (username: string) => {
    try {
      await api.deleteUser(username);
      setConfirmDeleteUser(null);
      showToast(`「${username}」を削除しました`);
      fetchOverview();
      refreshStats();
    } catch (err: any) {
      showToast(err?.message || '削除に失敗しました');
    }
  };

  const handleResetUserPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userPasswordReset) return;
    try {
      await api.resetUserPassword(userPasswordReset.username, userPasswordReset.newPass);
      showToast(`「${userPasswordReset.username}」のパスワードを変更しました`);
      setUserPasswordReset(null);
    } catch (err: any) {
      showToast(err?.message || '変更に失敗しました');
    }
  };

  const handleSaveTrackOffset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!offsetVideoId.trim()) return;
    setSavingOffset(true);
    try {
      await api.setTrackOffset({
        videoId: offsetVideoId.trim(),
        offsetSec: parseFloat(offsetSecVal) || 0,
        title: offsetTitle.trim() || offsetVideoId.trim(),
      });
      showToast(`補正値（${offsetSecVal}秒）を保存しました`);
      setOffsetVideoId('');
      setOffsetTitle('');
      setOffsetSecVal('0');
      refreshTrackOffsets();
      fetchOverview();
    } catch (err: any) {
      showToast(err?.message || '保存に失敗しました');
    } finally {
      setSavingOffset(false);
    }
  };

  const handleDeleteTrackOffset = async (videoId: string) => {
    try {
      await api.setTrackOffset({ videoId, offsetSec: 0, remove: true });
      showToast('補正を解除しました');
      refreshTrackOffsets();
      fetchOverview();
    } catch (err: any) {
      showToast(err?.message || '解除に失敗しました');
    }
  };

  const handleTestPing = async () => {
    setPinging(true);
    setPingResult(null);
    const start = performance.now();
    try {
      const res = await api.getHealth();
      const ms = Math.round(performance.now() - start);
      setPingResult(`正常に応答しました (${ms}ms / ${res.status || 'OK'})`);
      fetchOverview();
    } catch (err: any) {
      setPingResult(`接続エラー: ${err.message}`);
    } finally {
      setPinging(false);
    }
  };

  const handleExportData = () => {
    if (!overviewData) return;
    const blob = new Blob([JSON.stringify(overviewData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `zeromusic_backup_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('バックアップファイルをダウンロードしました');
  };

  const runMaintenanceAction = async (key: string, fn: () => Promise<{ message?: string }>) => {
    setRunningMaintenanceKey(key);
    try {
      const res = await fn();
      showToast(res.message || '完了しました');
      fetchOverview();
    } catch (err: any) {
      showToast(err?.message || '処理に失敗しました');
    } finally {
      setRunningMaintenanceKey(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-4 bg-black/80 backdrop-blur-sm"
      onClick={() => setAdminModalOpen(false)}
    >
      <div
        className="w-full h-full sm:max-w-[1280px] sm:h-[90vh] bg-[#0A0B0E] sm:border border-white/[0.1] sm:rounded-2xl shadow-2xl relative overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Toast Alert */}
        {toastMessage && (
          <div className="absolute top-16 left-1/2 -translate-x-1/2 z-40 px-4 py-2 bg-[#161922] border border-amber-500/40 text-white text-xs font-medium rounded-lg shadow-xl flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-amber-400 shrink-0" />
            <span>{toastMessage}</span>
          </div>
        )}

        {/* Top Bar Contract: Breadcrumb on Left, Action Buttons on Right */}
        <header className="px-5 py-3.5 border-b border-white/[0.08] bg-[#0D0E13] flex items-center justify-between gap-6 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0 text-sm">
            <ShieldCheck className="w-4 h-4 text-amber-400 shrink-0" />
            <span className="font-semibold text-white whitespace-nowrap">管理ページ</span>
            {isAdmin && (
              <>
                <span className="text-neutral-600" aria-hidden="true">/</span>
                <span className="text-neutral-400 whitespace-nowrap hidden sm:inline">{currentNavMeta.group}</span>
                <span className="text-neutral-600 hidden sm:inline" aria-hidden="true">/</span>
                <span className="text-neutral-200 font-medium truncate">{currentNavMeta.label}</span>
              </>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {isAdmin && (
              <>
                <button
                  type="button"
                  onClick={refreshCurrentSection}
                  className="px-3 py-1.5 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.08] text-xs font-medium text-neutral-200 flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingOverview ? 'animate-spin' : ''}`} />
                  <span className="hidden sm:inline">最新に更新</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    logoutAccount();
                    showToast('ログアウトしました');
                  }}
                  aria-label="管理者からログアウト"
                  className="md:hidden px-2.5 py-1.5 rounded-lg bg-white/[0.05] hover:bg-red-500/15 border border-white/[0.08] text-xs font-medium text-neutral-300 hover:text-red-400 flex items-center gap-1 transition-colors cursor-pointer whitespace-nowrap"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </>
            )}
            <button
              type="button"
              onClick={() => setAdminModalOpen(false)}
              aria-label="管理ページを閉じる"
              className="px-3 py-1.5 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.08] text-xs font-medium text-neutral-300 hover:text-white flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
            >
              <X className="w-4 h-4" />
              <span className="hidden sm:inline">閉じる</span>
            </button>
          </div>
        </header>

        {/* Unauthenticated Login Screen */}
        {!isAdmin ? (
          <div className="flex-1 flex items-center justify-center p-6">
            <div className="w-full max-w-sm bg-[#111318] border border-white/[0.08] rounded-xl p-6 space-y-5">
              <div className="space-y-1.5 text-center">
                <div className="w-11 h-11 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 mx-auto mb-3">
                  <KeyRound className="w-5 h-5" />
                </div>
                <h2 className="text-base font-bold text-white">管理者ログイン</h2>
                <p className="text-xs text-neutral-400">
                  管理者パスワードを入力して開きます。
                </p>
              </div>

              <form onSubmit={handleAdminAuth} className="space-y-3">
                <input
                  type="password"
                  value={adminPassInput}
                  onChange={(e) => setAdminPassInput(e.target.value)}
                  placeholder="管理者パスワード"
                  className="w-full bg-[#0A0B0E] border border-white/[0.12] text-sm text-white px-3.5 py-2.5 rounded-lg focus:outline-none focus:border-amber-500 text-center font-mono tracking-wider"
                  autoFocus
                  required
                />

                {loginError && (
                  <p className="text-xs text-red-400 flex items-center justify-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                    <span>{loginError}</span>
                  </p>
                )}

                <button
                  type="submit"
                  disabled={loginLoading || !adminPassInput}
                  className="w-full py-2.5 px-4 bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-black font-bold text-sm rounded-lg transition-colors cursor-pointer flex items-center justify-center gap-2"
                >
                  {loginLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <ShieldCheck className="w-4 h-4" />
                  )}
                  <span>ログイン</span>
                </button>
              </form>
            </div>
          </div>
        ) : (
          /* Authenticated Workspace */
          <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
            {/* Grouped Sidebar Navigation */}
            <aside className="w-full md:w-64 bg-[#0D0E13] border-b md:border-b-0 md:border-r border-white/[0.08] p-3 flex md:flex-col gap-4 overflow-x-auto md:overflow-y-auto shrink-0">
              {NAV_GROUPS.map((group) => (
                <div key={group.title} className="flex md:flex-col gap-1 shrink-0">
                  <div className="px-2.5 py-1 text-[11px] font-semibold text-neutral-500 hidden md:block">
                    {group.title}
                  </div>
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    const isActive = activeNav === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setActiveNav(item.id)}
                        className={`px-3 py-2 rounded-lg text-xs font-medium flex items-center justify-between gap-2 transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                          isActive
                            ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                            : 'text-neutral-400 hover:text-white hover:bg-white/[0.04] border border-transparent'
                        }`}
                      >
                        <span className="flex items-center gap-2">
                          <Icon className="w-4 h-4 shrink-0" />
                          <span>{item.label}</span>
                        </span>
                        {item.id === 'safety' && pendingReportsCount > 0 && (
                          <span className="font-mono tabular-nums text-[11px] text-rose-400 font-bold">
                            {pendingReportsCount}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              ))}

              <div className="hidden md:block mt-auto pt-3 border-t border-white/[0.08]">
                <button
                  type="button"
                  onClick={() => {
                    logoutAccount();
                    showToast('ログアウトしました');
                  }}
                  className="w-full px-3 py-2 rounded-lg text-xs font-medium text-neutral-400 hover:text-red-400 hover:bg-white/[0.04] flex items-center gap-2 transition-colors cursor-pointer"
                >
                  <LogOut className="w-4 h-4" />
                  <span>管理者からログアウト</span>
                </button>
              </div>
            </aside>

            {/* Main Content Viewport */}
            <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 space-y-6">
              {/* Page Title + Plain 1-Line Explanation */}
              <div className="border-b border-white/[0.08] pb-4 flex flex-col sm:flex-row sm:items-end justify-between gap-3">
                <div>
                  <h1 className="text-lg sm:text-xl font-bold text-white tracking-tight">
                    {currentNavMeta.label}
                  </h1>
                  <p className="text-xs sm:text-sm text-neutral-400 mt-1">
                    {currentNavMeta.description}
                  </p>
                </div>
                {activeNav === 'overview' && (
                  <button
                    type="button"
                    onClick={() => {
                      setActiveNav('announcements');
                      setAnnouncementsTab('banner');
                    }}
                    className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap self-start sm:self-auto"
                  >
                    <Megaphone className="w-3.5 h-3.5" />
                    <span>お知らせを出す</span>
                  </button>
                )}
              </div>

              {/* ============================================================
                  PAGE 1: OVERVIEW (概要・ホーム)
                 ============================================================ */}
              {activeNav === 'overview' && (
                <div className="space-y-6">
                  {/* Pending Alert Banner if unresolved reports exist */}
                  {pendingReportsCount > 0 && (
                    <div className="p-4 rounded-xl bg-rose-950/30 border border-rose-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0" />
                        <div className="text-xs sm:text-sm">
                          <span className="font-bold text-white">
                            未対応の通報が {pendingReportsCount}件 あります
                          </span>
                          <span className="text-neutral-300 block sm:inline sm:ml-2">
                            内容を確認して解決またはアカウント凍結を行ってください。
                          </span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setActiveNav('safety');
                          setSafetyTab('reports');
                        }}
                        className="px-3.5 py-1.5 rounded-lg bg-rose-500 hover:bg-rose-400 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer whitespace-nowrap self-start sm:self-auto"
                      >
                        <span>通報を確認する</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}

                  {/* 4-Column Primary KPIs */}
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="p-4 rounded-xl bg-[#111318] border border-white/[0.08]">
                      <div className="text-xs text-neutral-400">現在オンライン中</div>
                      <div className="text-2xl font-bold text-emerald-400 font-mono tabular-nums mt-1">
                        {overviewData?.stats?.onlineCount ?? 1}
                        <span className="text-xs font-sans font-normal text-neutral-400 ml-1">人</span>
                      </div>
                    </div>
                    <div className="p-4 rounded-xl bg-[#111318] border border-white/[0.08]">
                      <div className="text-xs text-neutral-400">登録ユーザー数</div>
                      <div className="text-2xl font-bold text-white font-mono tabular-nums mt-1">
                        {(overviewData?.stats?.totalAccountsCount ?? 0).toLocaleString()}
                        <span className="text-xs font-sans font-normal text-neutral-400 ml-1">人</span>
                      </div>
                    </div>
                    <div className="p-4 rounded-xl bg-[#111318] border border-white/[0.08]">
                      <div className="text-xs text-neutral-400">総楽曲再生数</div>
                      <div className="text-2xl font-bold text-white font-mono tabular-nums mt-1">
                        {(overviewData?.stats?.totalTracksPlayed ?? 0).toLocaleString()}
                        <span className="text-xs font-sans font-normal text-neutral-400 ml-1">曲</span>
                      </div>
                    </div>
                    <div className="p-4 rounded-xl bg-[#111318] border border-white/[0.08]">
                      <div className="text-xs text-neutral-400">総アクセス数</div>
                      <div className="text-2xl font-bold text-white font-mono tabular-nums mt-1">
                        {(overviewData?.stats?.totalAccessCount ?? 0).toLocaleString()}
                        <span className="text-xs font-sans font-normal text-neutral-400 ml-1">回</span>
                      </div>
                    </div>
                  </div>

                  {/* Quick Shortcuts ("よく使う操作") */}
                  <div className="space-y-2.5">
                    <h2 className="text-xs font-semibold text-neutral-400">よく使う管理メニューへ移動</h2>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                      <button
                        type="button"
                        onClick={() => {
                          setActiveNav('users');
                        }}
                        className="p-3.5 rounded-xl bg-[#111318] hover:bg-[#161922] border border-white/[0.08] text-left transition-colors cursor-pointer group"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-white">ユーザーを管理</span>
                          <ArrowRight className="w-3.5 h-3.5 text-neutral-500 group-hover:text-amber-400 transition-colors" />
                        </div>
                        <p className="text-[11px] text-neutral-400 mt-1">
                          検索・アカウント凍結・パスワード変更
                        </p>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setActiveNav('content');
                          setContentTab('sharedOffline');
                        }}
                        className="p-3.5 rounded-xl bg-[#111318] hover:bg-[#161922] border border-white/[0.08] text-left transition-colors cursor-pointer group"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-white">
                            共有オフライン ({sharedOfflineData?.totalCount ?? 0}曲)
                          </span>
                          <ArrowRight className="w-3.5 h-3.5 text-neutral-500 group-hover:text-amber-400 transition-colors" />
                        </div>
                        <p className="text-[11px] text-neutral-400 mt-1">
                          投稿された音声ファイルの確認・削除
                        </p>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setActiveNav('announcements');
                          setAnnouncementsTab('features');
                        }}
                        className="p-3.5 rounded-xl bg-[#111318] hover:bg-[#161922] border border-white/[0.08] text-left transition-colors cursor-pointer group"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-white">機能ON/OFF制御</span>
                          <ArrowRight className="w-3.5 h-3.5 text-neutral-500 group-hover:text-amber-400 transition-colors" />
                        </div>
                        <p className="text-[11px] text-neutral-400 mt-1">
                          新規登録・投稿・コメント・DMの制限
                        </p>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setActiveNav('system');
                          setSystemTab('maintenance');
                        }}
                        className="p-3.5 rounded-xl bg-[#111318] hover:bg-[#161922] border border-white/[0.08] text-left transition-colors cursor-pointer group"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-white">キャッシュ・保守</span>
                          <ArrowRight className="w-3.5 h-3.5 text-neutral-500 group-hover:text-amber-400 transition-colors" />
                        </div>
                        <p className="text-[11px] text-neutral-400 mt-1">
                          キャッシュ消去・ログ削除・バックアップ
                        </p>
                      </button>
                    </div>
                  </div>

                  {/* Two-Column Summary: Top 5 Played Tracks + Server & Feature Summary */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div className="p-4 rounded-xl bg-[#111318] border border-white/[0.08] space-y-3">
                      <div className="flex items-center justify-between">
                        <h2 className="text-sm font-semibold text-white">人気再生ランキング (TOP 5)</h2>
                        <button
                          type="button"
                          onClick={() => {
                            setActiveNav('analytics');
                            setAnalyticsTab('ranking');
                          }}
                          className="text-xs text-amber-400 hover:text-amber-300 cursor-pointer"
                        >
                          すべて見る →
                        </button>
                      </div>
                      <div className="divide-y divide-white/[0.06]">
                        {!overviewData?.topTracks || overviewData.topTracks.length === 0 ? (
                          <p className="py-6 text-center text-xs text-neutral-500">
                            再生データはまだありません
                          </p>
                        ) : (
                          overviewData.topTracks.slice(0, 5).map((t: any, idx: number) => (
                            <div key={t.videoId} className="py-2.5 flex items-center justify-between gap-3 text-xs">
                              <div className="flex items-center gap-3 min-w-0">
                                <span className="w-5 text-neutral-500 font-mono tabular-nums text-right shrink-0">
                                  {idx + 1}.
                                </span>
                                <div className="min-w-0">
                                  <p className="text-white font-medium truncate">{t.title}</p>
                                  <p className="text-[11px] text-neutral-400 truncate">{t.artist}</p>
                                </div>
                              </div>
                              <span className="font-mono tabular-nums text-neutral-300 shrink-0">
                                {t.playCount}回
                              </span>
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    <div className="p-4 rounded-xl bg-[#111318] border border-white/[0.08] space-y-3">
                      <div className="flex items-center justify-between">
                        <h2 className="text-sm font-semibold text-white">サーバー稼働・統計データ</h2>
                        <button
                          type="button"
                          onClick={() => {
                            setActiveNav('system');
                            setSystemTab('diagnostics');
                          }}
                          className="text-xs text-amber-400 hover:text-amber-300 cursor-pointer"
                        >
                          詳細を見る →
                        </button>
                      </div>
                      <dl className="divide-y divide-white/[0.06] text-xs">
                        <div className="py-2.5 flex items-center justify-between">
                          <dt className="text-neutral-400">連続稼働時間</dt>
                          <dd className="font-mono tabular-nums text-white">
                            {Math.floor((overviewData?.system?.uptimeSeconds || 0) / 60)} 分
                          </dd>
                        </div>
                        <div className="py-2.5 flex items-center justify-between">
                          <dt className="text-neutral-400">総再生時間</dt>
                          <dd className="font-mono tabular-nums text-white">
                            {(overviewData?.stats?.totalPlaybackMinutes ?? 0).toLocaleString()} 分
                          </dd>
                        </div>
                        <div className="py-2.5 flex items-center justify-between">
                          <dt className="text-neutral-400">歌詞表示回数 / LRC同期率</dt>
                          <dd className="font-mono tabular-nums text-white">
                            {(overviewData?.stats?.totalLyricsViews ?? 0).toLocaleString()} 回 ·{' '}
                            <span className="text-emerald-400">
                              {overviewData?.stats?.lyricsMatchRate ?? 100}%
                            </span>
                          </dd>
                        </div>
                        <div className="py-2.5 flex items-center justify-between">
                          <dt className="text-neutral-400">メモリ使用量 / 実行環境</dt>
                          <dd className="font-mono tabular-nums text-neutral-300">
                            {overviewData?.system?.memoryUsageMb || 0} MB · {overviewData?.system?.nodeVersion || 'Node'}
                          </dd>
                        </div>
                        <div className="py-2.5 flex items-center justify-between">
                          <dt className="text-neutral-400">キャッシュ保持数</dt>
                          <dd className="font-mono tabular-nums text-neutral-300">
                            歌詞 {overviewData?.system?.lyricsCacheSize ?? 0}曲 · API {overviewData?.system?.kvCacheSize ?? 0}件
                          </dd>
                        </div>
                      </dl>
                    </div>
                  </div>
                </div>
              )}

              {/* ============================================================
                  PAGE 2: ANALYTICS (再生・アクセス分析)
                 ============================================================ */}
              {activeNav === 'analytics' && (
                <div className="space-y-6">
                  {/* Segmented Sub-Tab Switch */}
                  <div className="inline-flex items-center gap-1 p-1 bg-[#111318] border border-white/[0.08] rounded-lg">
                    <button
                      type="button"
                      onClick={() => setAnalyticsTab('ranking')}
                      className={`px-3.5 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                        analyticsTab === 'ranking'
                          ? 'bg-amber-500 text-black font-bold'
                          : 'text-neutral-400 hover:text-white'
                      }`}
                    >
                      人気曲・検索ワード
                    </button>
                    <button
                      type="button"
                      onClick={() => setAnalyticsTab('traffic')}
                      className={`px-3.5 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                        analyticsTab === 'traffic'
                          ? 'bg-amber-500 text-black font-bold'
                          : 'text-neutral-400 hover:text-white'
                      }`}
                    >
                      接続中の端末・時間帯別
                    </button>
                  </div>

                  {analyticsTab === 'ranking' && (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      {/* Top 15 Tracks */}
                      <div className="p-4 rounded-xl bg-[#111318] border border-white/[0.08] space-y-3">
                        <h2 className="text-sm font-semibold text-white">再生回数 TOP 15</h2>
                        {!overviewData?.topTracks || overviewData.topTracks.length === 0 ? (
                          <p className="py-10 text-center text-xs text-neutral-500">
                            再生ログはまだありません
                          </p>
                        ) : (
                          <div className="divide-y divide-white/[0.06] max-h-[440px] overflow-y-auto pr-1">
                            {overviewData.topTracks.map((t: any, idx: number) => (
                              <div key={t.videoId} className="py-2.5 flex items-center justify-between gap-3 text-xs">
                                <div className="flex items-center gap-3 min-w-0">
                                  <span className="w-6 text-right font-mono tabular-nums text-neutral-400 shrink-0">
                                    {idx + 1}
                                  </span>
                                  {t.thumbnail && (
                                    <SafeImage
                                      src={t.thumbnail}
                                      alt={t.title}
                                      className="w-9 h-9 rounded-md object-cover bg-neutral-800 shrink-0"
                                    />
                                  )}
                                  <div className="min-w-0">
                                    <p className="font-medium text-white truncate">{t.title}</p>
                                    <p className="text-[11px] text-neutral-400 truncate">{t.artist}</p>
                                  </div>
                                </div>
                                <span className="font-mono tabular-nums font-semibold text-amber-400 shrink-0">
                                  {t.playCount}回
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Top 15 Search Queries */}
                      <div className="p-4 rounded-xl bg-[#111318] border border-white/[0.08] space-y-3">
                        <h2 className="text-sm font-semibold text-white">よく検索されているワード TOP 15</h2>
                        {!overviewData?.topSearches || overviewData.topSearches.length === 0 ? (
                          <p className="py-10 text-center text-xs text-neutral-500">
                            検索ログはまだありません
                          </p>
                        ) : (
                          <div className="divide-y divide-white/[0.06] max-h-[440px] overflow-y-auto pr-1">
                            {overviewData.topSearches.map((s: any, idx: number) => (
                              <div key={s.query} className="py-2.5 flex items-center justify-between gap-3 text-xs">
                                <div className="flex items-center gap-3 min-w-0">
                                  <span className="w-6 text-right font-mono tabular-nums text-neutral-400 shrink-0">
                                    {idx + 1}
                                  </span>
                                  <span className="text-neutral-200 truncate">{s.query}</span>
                                </div>
                                <span className="font-mono tabular-nums font-semibold text-emerald-400 shrink-0">
                                  {s.count}回
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {analyticsTab === 'traffic' && (
                    <div className="space-y-6">
                      {/* Active Sessions */}
                      <div className="p-4 rounded-xl bg-[#111318] border border-white/[0.08] space-y-3">
                        <h2 className="text-sm font-semibold text-white">
                          現在オンライン中の端末 ({overviewData?.activeSessions?.length || 1}端末)
                        </h2>
                        <div className="overflow-x-auto">
                          <table className="w-full text-left text-xs">
                            <thead className="border-b border-white/[0.08] text-neutral-400">
                              <tr>
                                <th className="py-2 px-2 font-medium">ユーザー</th>
                                <th className="py-2 px-2 font-medium">端末 / 環境</th>
                                <th className="py-2 px-2 font-medium text-right">最終応答</th>
                                <th className="py-2 px-2 font-medium text-right">接続時間</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-white/[0.06]">
                              {(overviewData?.activeSessions || []).map((sess: any, idx: number) => (
                                <tr key={idx} className="hover:bg-white/[0.02]">
                                  <td className="py-2.5 px-2 text-white font-medium">
                                    {sess.username || 'ゲスト'}
                                    <span className="text-neutral-500 font-mono text-[11px] ml-1.5">
                                      ({sess.sessionId})
                                    </span>
                                  </td>
                                  <td className="py-2.5 px-2 text-neutral-400">
                                    {sess.device} · {sess.browser} · {sess.os}
                                  </td>
                                  <td className="py-2.5 px-2 text-right font-mono tabular-nums text-emerald-400">
                                    {sess.lastSeenSecondsAgo}秒前
                                  </td>
                                  <td className="py-2.5 px-2 text-right font-mono tabular-nums text-neutral-400">
                                    {sess.connectedDurationSeconds}秒
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>

                      {/* Device Breakdown + Browser/OS */}
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="p-4 rounded-xl bg-[#111318] border border-white/[0.08] flex items-center gap-3">
                          <Monitor className="w-5 h-5 text-sky-400 shrink-0" />
                          <div>
                            <div className="text-xs text-neutral-400">パソコン (PC)</div>
                            <div className="text-base font-bold text-white font-mono tabular-nums">
                              {overviewData?.traffic?.clientDevices?.desktop || 0}{' '}
                              <span className="text-xs font-normal text-neutral-500">
                                ({Math.round(((overviewData?.traffic?.clientDevices?.desktop || 0) / totalDeviceCount) * 100)}%)
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="p-4 rounded-xl bg-[#111318] border border-white/[0.08] flex items-center gap-3">
                          <Smartphone className="w-5 h-5 text-emerald-400 shrink-0" />
                          <div>
                            <div className="text-xs text-neutral-400">スマートフォン</div>
                            <div className="text-base font-bold text-white font-mono tabular-nums">
                              {overviewData?.traffic?.clientDevices?.mobile || 0}{' '}
                              <span className="text-xs font-normal text-neutral-500">
                                ({Math.round(((overviewData?.traffic?.clientDevices?.mobile || 0) / totalDeviceCount) * 100)}%)
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="p-4 rounded-xl bg-[#111318] border border-white/[0.08] flex items-center gap-3">
                          <Tablet className="w-5 h-5 text-amber-400 shrink-0" />
                          <div>
                            <div className="text-xs text-neutral-400">タブレット</div>
                            <div className="text-base font-bold text-white font-mono tabular-nums">
                              {overviewData?.traffic?.clientDevices?.tablet || 0}{' '}
                              <span className="text-xs font-normal text-neutral-500">
                                ({Math.round(((overviewData?.traffic?.clientDevices?.tablet || 0) / totalDeviceCount) * 100)}%)
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <div className="p-4 rounded-xl bg-[#111318] border border-white/[0.08] space-y-2.5">
                          <h3 className="text-xs font-semibold text-white">ブラウザ別アクセス数</h3>
                          <div className="divide-y divide-white/[0.06] text-xs">
                            {!overviewData?.traffic?.clientBrowsers ||
                            Object.keys(overviewData.traffic.clientBrowsers).length === 0 ? (
                              <p className="py-4 text-neutral-500">集計データがありません</p>
                            ) : (
                              Object.entries(overviewData.traffic.clientBrowsers).map(([b, cnt]: [string, any]) => (
                                <div key={b} className="py-2 flex items-center justify-between">
                                  <span className="text-neutral-300">{b}</span>
                                  <span className="font-mono tabular-nums text-white">{cnt}回</span>
                                </div>
                              ))
                            )}
                          </div>
                        </div>

                        <div className="p-4 rounded-xl bg-[#111318] border border-white/[0.08] space-y-2.5">
                          <h3 className="text-xs font-semibold text-white">OS別アクセス数</h3>
                          <div className="divide-y divide-white/[0.06] text-xs">
                            {!overviewData?.traffic?.clientOS ||
                            Object.keys(overviewData.traffic.clientOS).length === 0 ? (
                              <p className="py-4 text-neutral-500">集計データがありません</p>
                            ) : (
                              Object.entries(overviewData.traffic.clientOS).map(([os, cnt]: [string, any]) => (
                                <div key={os} className="py-2 flex items-center justify-between">
                                  <span className="text-neutral-300">{os}</span>
                                  <span className="font-mono tabular-nums text-white">{cnt}回</span>
                                </div>
                              ))
                            )}
                          </div>
                        </div>
                      </div>

                      {/* 24-Hour Distribution */}
                      <div className="p-4 rounded-xl bg-[#111318] border border-white/[0.08] space-y-3">
                        <h3 className="text-xs font-semibold text-white">時間帯別アクセス分布 (24時間)</h3>
                        <div className="grid grid-cols-12 sm:grid-cols-24 gap-1 items-end h-28 pt-4 border-b border-white/[0.08]">
                          {Array.from({ length: 24 }).map((_, h) => {
                            const count = overviewData?.traffic?.hourlyVisits?.[String(h)] || 0;
                            const maxH = Math.max(
                              1,
                              ...Object.values(overviewData?.traffic?.hourlyVisits || {}).map((v) => Number(v) || 0)
                            );
                            const heightPercent = Math.max(8, Math.round((count / maxH) * 100));
                            return (
                              <div key={h} className="flex flex-col items-center h-full justify-end group relative">
                                <div
                                  style={{ height: `${heightPercent}%` }}
                                  className="w-full bg-amber-500/75 rounded-t group-hover:bg-amber-400 transition-colors"
                                />
                                <span className="text-[10px] font-mono tabular-nums text-neutral-500 mt-1">{h}</span>
                                <div className="absolute -top-7 hidden group-hover:block px-2 py-0.5 rounded bg-neutral-900 text-[10px] text-white font-mono whitespace-nowrap z-10 border border-white/10">
                                  {h}時: {count}回
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ============================================================
                  PAGE 3: ANNOUNCEMENTS & FEATURE CONTROLS (お知らせ・機能制御)
                 ============================================================ */}
              {activeNav === 'announcements' && (
                <div className="space-y-6">
                  <div className="inline-flex items-center gap-1 p-1 bg-[#111318] border border-white/[0.08] rounded-lg overflow-x-auto max-w-full">
                    <button
                      type="button"
                      onClick={() => setAnnouncementsTab('banner')}
                      className={`px-3.5 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                        announcementsTab === 'banner'
                          ? 'bg-amber-500 text-black font-bold'
                          : 'text-neutral-400 hover:text-white'
                      }`}
                    >
                      お知らせバナー & 即時通知
                    </button>
                    <button
                      type="button"
                      onClick={() => setAnnouncementsTab('features')}
                      className={`px-3.5 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                        announcementsTab === 'features'
                          ? 'bg-amber-500 text-black font-bold'
                          : 'text-neutral-400 hover:text-white'
                      }`}
                    >
                      機能のON / OFF制御
                    </button>
                    <button
                      type="button"
                      onClick={() => setAnnouncementsTab('email')}
                      className={`px-3.5 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                        announcementsTab === 'email'
                          ? 'bg-amber-500 text-black font-bold'
                          : 'text-neutral-400 hover:text-white'
                      }`}
                    >
                      メール一斉送信
                    </button>
                  </div>

                  {announcementsTab === 'banner' && (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      {/* Screen-top Announcement Banner */}
                      <div className="p-5 rounded-xl bg-[#111318] border border-white/[0.08] space-y-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <h2 className="text-sm font-semibold text-white">画面上部のお知らせバナー</h2>
                            <p className="text-xs text-neutral-400 mt-0.5">
                              開いている全ユーザーの画面最上部に表示されます。
                            </p>
                          </div>
                          <button
                            type="button"
                            role="switch"
                            aria-checked={announcementActive}
                            onClick={() => setAnnouncementActive((v) => !v)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors cursor-pointer whitespace-nowrap ${
                              announcementActive
                                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                                : 'bg-white/[0.05] text-neutral-400 border-white/[0.08]'
                            }`}
                          >
                            {announcementActive ? '表示中 (ON)' : '非表示 (OFF)'}
                          </button>
                        </div>

                        <div className="space-y-3">
                          <div>
                            <label className="block text-xs text-neutral-300 mb-1">重要度 (色)</label>
                            <select
                              value={announcementLevel}
                              onChange={(e) => setAnnouncementLevel(e.target.value as 'info' | 'warning' | 'alert')}
                              className="w-full bg-[#0A0B0E] border border-white/[0.12] text-xs text-white px-3 py-2 rounded-lg focus:outline-none focus:border-amber-500"
                            >
                              <option value="info">通常のお知らせ (青)</option>
                              <option value="warning">注意喚起 (黄)</option>
                              <option value="alert">緊急・メンテナンス (赤)</option>
                            </select>
                          </div>

                          <div>
                            <label className="block text-xs text-neutral-300 mb-1">
                              表示するメッセージ (最大300文字)
                            </label>
                            <textarea
                              rows={3}
                              value={announcementMessage}
                              onChange={(e) => setAnnouncementMessage(e.target.value)}
                              maxLength={300}
                              placeholder="例: 本日23:00よりサーバーメンテナンスを実施します。"
                              className="w-full bg-[#0A0B0E] border border-white/[0.12] text-xs text-white px-3 py-2 rounded-lg focus:outline-none focus:border-amber-500"
                            />
                          </div>

                          {/* Live Preview */}
                          {announcementMessage.trim() && (
                            <div className="space-y-1">
                              <div className="text-[11px] text-neutral-500">表示プレビュー</div>
                              <div
                                className={`px-3 py-2 rounded-lg text-xs border ${
                                  announcementLevel === 'alert'
                                    ? 'bg-red-950/90 border-red-700/60 text-red-100'
                                    : announcementLevel === 'warning'
                                    ? 'bg-amber-950/90 border-amber-700/60 text-amber-100'
                                    : 'bg-sky-950/90 border-sky-700/60 text-sky-100'
                                }`}
                              >
                                {announcementMessage}
                              </div>
                            </div>
                          )}

                          <div className="pt-1 flex justify-end">
                            <button
                              type="button"
                              disabled={savingSiteSettings}
                              onClick={handleSaveSiteSettings}
                              className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-black text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                            >
                              {savingSiteSettings ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <CheckCircle2 className="w-3.5 h-3.5" />
                              )}
                              <span>バナー設定を保存して反映</span>
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Real-time Push Toast */}
                      <form
                        onSubmit={handleSendPushToast}
                        className="p-5 rounded-xl bg-[#111318] border border-white/[0.08] space-y-4 flex flex-col justify-between"
                      >
                        <div className="space-y-3">
                          <div>
                            <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                              <Radio className="w-4 h-4 text-amber-400" />
                              <span>今つないでいる人へ即時通知を送る</span>
                            </h2>
                            <p className="text-xs text-neutral-400 mt-0.5">
                              現在アプリを開いているすべてのユーザー画面に、数秒間の通知ポップアップを表示します。
                            </p>
                          </div>

                          <div>
                            <label className="block text-xs text-neutral-300 mb-1">通知の種類</label>
                            <select
                              value={pushToastType}
                              onChange={(e) => setPushToastType(e.target.value as 'info' | 'warning' | 'success')}
                              className="w-full bg-[#0A0B0E] border border-white/[0.12] text-xs text-white px-3 py-2 rounded-lg focus:outline-none focus:border-amber-500"
                            >
                              <option value="info">お知らせ</option>
                              <option value="success">完了 / 新着案内</option>
                              <option value="warning">注意 / 警告</option>
                            </select>
                          </div>

                          <div>
                            <label className="block text-xs text-neutral-300 mb-1">通知内容 (最大240文字)</label>
                            <textarea
                              rows={3}
                              value={pushToastMessage}
                              onChange={(e) => setPushToastMessage(e.target.value)}
                              maxLength={240}
                              placeholder="例: 新しい共有オフライン曲が追加されました。"
                              className="w-full bg-[#0A0B0E] border border-white/[0.12] text-xs text-white px-3 py-2 rounded-lg focus:outline-none focus:border-amber-500"
                            />
                          </div>
                        </div>

                        <div className="flex justify-end">
                          <button
                            type="submit"
                            disabled={sendingPushToast || !pushToastMessage.trim()}
                            className="px-4 py-2 rounded-lg bg-white text-black hover:bg-neutral-200 disabled:opacity-40 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                          >
                            {sendingPushToast ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Send className="w-3.5 h-3.5" />
                            )}
                            <span>今すぐ送信</span>
                          </button>
                        </div>
                      </form>
                    </div>
                  )}

                  {announcementsTab === 'features' && (
                    <div className="p-5 rounded-xl bg-[#111318] border border-white/[0.08] space-y-4 max-w-3xl">
                      <div>
                        <h2 className="text-sm font-semibold text-white">アプリ機能の公開・停止スイッチ</h2>
                        <p className="text-xs text-neutral-400 mt-0.5">
                          トラブル時やメンテナンス時に、特定の機能だけを一時停止できます。変更後は「設定を保存」を押してください。
                        </p>
                      </div>

                      <div className="divide-y divide-white/[0.08]">
                        {[
                          {
                            label: '新規アカウント登録',
                            desc: 'OFFにすると、新しいユーザー登録を受け付けなくなります。',
                            val: allowNewRegistrations,
                            set: setAllowNewRegistrations,
                          },
                          {
                            label: '共有オフラインへの曲投稿',
                            desc: 'OFFにすると、音声ファイルのアップロードを停止します（再生は継続できます）。',
                            val: sharedOfflineUploadEnabled,
                            set: setSharedOfflineUploadEnabled,
                          },
                          {
                            label: '楽曲コメント・弾幕の投稿',
                            desc: 'OFFにすると、新しいコメントの書き込みを一時停止します。',
                            val: commentsEnabled,
                            set: setCommentsEnabled,
                          },
                          {
                            label: 'ダイレクトメッセージ (DM) 送信',
                            desc: 'OFFにすると、ユーザー間の新規DM送信を一時停止します。',
                            val: dmsEnabled,
                            set: setDmsEnabled,
                          },
                        ].map((row) => (
                          <div key={row.label} className="py-3.5 flex items-center justify-between gap-4">
                            <div>
                              <div className="text-sm font-medium text-white">{row.label}</div>
                              <div className="text-xs text-neutral-400 mt-0.5">{row.desc}</div>
                            </div>
                            <button
                              type="button"
                              role="switch"
                              aria-checked={row.val}
                              onClick={() => row.set((v) => !v)}
                              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold border transition-colors cursor-pointer shrink-0 whitespace-nowrap ${
                                row.val
                                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                                  : 'bg-rose-500/15 text-rose-300 border-rose-500/35'
                              }`}
                            >
                              {row.val ? '許可中 (ON)' : '停止中 (OFF)'}
                            </button>
                          </div>
                        ))}
                      </div>

                      <div className="pt-2 flex justify-end">
                        <button
                          type="button"
                          disabled={savingSiteSettings}
                          onClick={handleSaveSiteSettings}
                          className="px-5 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-black text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                        >
                          {savingSiteSettings ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <CheckCircle2 className="w-3.5 h-3.5" />
                          )}
                          <span>設定を保存する</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {announcementsTab === 'email' && (
                    <form
                      onSubmit={handleSendBroadcast}
                      className="p-5 rounded-xl bg-[#111318] border border-white/[0.08] space-y-4 max-w-3xl"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-white/[0.08]">
                        <div>
                          <h2 className="text-sm font-semibold text-white">メール登録ユーザーへの一斉送信</h2>
                          <p className="text-xs text-neutral-400 mt-0.5">
                            メールアドレスが設定されているアカウント宛てに通知を送信します。
                          </p>
                        </div>
                        <span className="text-xs font-mono tabular-nums text-neutral-300">
                          送信対象: {overviewData?.accounts?.filter((a: any) => a.hasEmail)?.length || 0} /{' '}
                          {overviewData?.accounts?.length || 0} 人
                        </span>
                      </div>

                      <div>
                        <label className="block text-xs text-neutral-300 mb-1">件名</label>
                        <input
                          type="text"
                          value={broadcastSubject}
                          onChange={(e) => setBroadcastSubject(e.target.value)}
                          placeholder="例: 【Zero Music】新機能のお知らせ"
                          className="w-full bg-[#0A0B0E] border border-white/[0.12] text-sm text-white px-3.5 py-2 rounded-lg focus:outline-none focus:border-amber-500"
                          required
                        />
                      </div>

                      <div>
                        <label className="block text-xs text-neutral-300 mb-1">本文</label>
                        <textarea
                          rows={5}
                          value={broadcastBody}
                          onChange={(e) => setBroadcastBody(e.target.value)}
                          placeholder="送信する本文を入力してください..."
                          className="w-full bg-[#0A0B0E] border border-white/[0.12] text-sm text-white px-3.5 py-2 rounded-lg focus:outline-none focus:border-amber-500"
                          required
                        />
                      </div>

                      <div className="flex justify-end">
                        <button
                          type="submit"
                          disabled={sendingBroadcast || !broadcastSubject.trim() || !broadcastBody.trim()}
                          className="px-5 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-black text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                        >
                          {sendingBroadcast ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Send className="w-4 h-4" />
                          )}
                          <span>一斉送信する</span>
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              )}

              {/* ============================================================
                  PAGE 4: USERS MANAGEMENT (ユーザー管理)
                 ============================================================ */}
              {activeNav === 'users' && (
                <div className="space-y-4">
                  {/* Filter Bar */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="inline-flex items-center gap-1 p-1 bg-[#111318] border border-white/[0.08] rounded-lg self-start">
                      <button
                        type="button"
                        onClick={() => setUserFilter('all')}
                        className={`px-3 py-1.5 rounded-md text-xs font-medium cursor-pointer whitespace-nowrap ${
                          userFilter === 'all' ? 'bg-amber-500 text-black font-bold' : 'text-neutral-400 hover:text-white'
                        }`}
                      >
                        すべて ({overviewData?.accounts?.length ?? 0})
                      </button>
                      <button
                        type="button"
                        onClick={() => setUserFilter('banned')}
                        className={`px-3 py-1.5 rounded-md text-xs font-medium cursor-pointer whitespace-nowrap ${
                          userFilter === 'banned' ? 'bg-amber-500 text-black font-bold' : 'text-neutral-400 hover:text-white'
                        }`}
                      >
                        凍結中 ({(overviewData?.accounts || []).filter((a: any) => a.isBanned).length})
                      </button>
                      <button
                        type="button"
                        onClick={() => setUserFilter('withEmail')}
                        className={`px-3 py-1.5 rounded-md text-xs font-medium cursor-pointer whitespace-nowrap ${
                          userFilter === 'withEmail' ? 'bg-amber-500 text-black font-bold' : 'text-neutral-400 hover:text-white'
                        }`}
                      >
                        メール登録済み
                      </button>
                    </div>

                    <div className="relative w-full sm:w-72">
                      <Search className="w-4 h-4 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={userSearchFilter}
                        onChange={(e) => setUserSearchFilter(e.target.value)}
                        placeholder="ユーザー名・メールアドレスで検索"
                        className="w-full bg-[#111318] border border-white/[0.1] rounded-lg pl-9 pr-3 py-2 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-amber-500"
                      />
                    </div>
                  </div>

                  {/* Inline Password Reset Form */}
                  {userPasswordReset && (
                    <form
                      onSubmit={handleResetUserPassword}
                      className="p-4 rounded-xl bg-[#111318] border border-amber-500/40 flex flex-col sm:flex-row sm:items-center gap-3"
                    >
                      <span className="text-xs text-neutral-200 whitespace-nowrap">
                        「<strong className="text-white">{userPasswordReset.username}</strong>」の新しいパスワード:
                      </span>
                      <input
                        type="password"
                        value={userPasswordReset.newPass}
                        onChange={(e) =>
                          setUserPasswordReset({ ...userPasswordReset, newPass: e.target.value })
                        }
                        placeholder="新しいパスワードを入力"
                        className="flex-1 bg-[#0A0B0E] border border-white/[0.12] text-xs text-white px-3 py-2 rounded-lg focus:outline-none focus:border-amber-500"
                        required
                      />
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="submit"
                          className="px-3.5 py-2 bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold rounded-lg cursor-pointer"
                        >
                          変更する
                        </button>
                        <button
                          type="button"
                          onClick={() => setUserPasswordReset(null)}
                          className="px-3 py-2 bg-white/[0.06] text-neutral-300 text-xs rounded-lg cursor-pointer"
                        >
                          やめる
                        </button>
                      </div>
                    </form>
                  )}

                  {/* Users Table */}
                  <div className="overflow-x-auto rounded-xl bg-[#111318] border border-white/[0.08]">
                    <table className="w-full text-left text-xs">
                      <thead className="border-b border-white/[0.08] text-neutral-400">
                        <tr>
                          <th className="py-3 px-4 font-medium">ユーザー名</th>
                          <th className="py-3 px-4 font-medium">状態</th>
                          <th className="py-3 px-4 font-medium">メールアドレス</th>
                          <th className="py-3 px-4 font-medium text-right">プレイリスト</th>
                          <th className="py-3 px-4 font-medium">登録日</th>
                          <th className="py-3 px-4 font-medium">最終利用</th>
                          <th className="py-3 px-4 font-medium text-right">操作</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/[0.06]">
                        {filteredAccounts.length === 0 ? (
                          <tr>
                            <td colSpan={7} className="py-10 text-center text-neutral-500">
                              条件に一致するユーザーはいません
                            </td>
                          </tr>
                        ) : (
                          filteredAccounts.map((acc: any) => {
                            const isConfirmDel = confirmDeleteUser === acc.username;
                            return (
                              <tr key={acc.id} className="hover:bg-white/[0.02]">
                                <td className="py-3 px-4 font-semibold text-white">{acc.username}</td>
                                <td className="py-3 px-4">
                                  {acc.isBanned ? (
                                    <span className="text-rose-400 font-semibold">凍結中</span>
                                  ) : (
                                    <span className="text-emerald-400">利用中</span>
                                  )}
                                </td>
                                <td className="py-3 px-4 font-mono text-neutral-400">
                                  {acc.email || <span className="text-neutral-600">未登録</span>}
                                </td>
                                <td className="py-3 px-4 text-right font-mono tabular-nums text-neutral-300">
                                  {acc.playlistsCount}
                                </td>
                                <td className="py-3 px-4 font-mono tabular-nums text-neutral-400">
                                  {new Date(acc.registeredAt).toLocaleDateString('ja-JP')}
                                </td>
                                <td className="py-3 px-4 font-mono tabular-nums text-neutral-400">
                                  {acc.lastActive
                                    ? new Date(acc.lastActive).toLocaleString('ja-JP', {
                                        month: 'numeric',
                                        day: 'numeric',
                                        hour: '2-digit',
                                        minute: '2-digit',
                                      })
                                    : '未記録'}
                                </td>
                                <td className="py-3 px-4 text-right whitespace-nowrap space-x-2">
                                  <button
                                    type="button"
                                    onClick={async () => {
                                      try {
                                        const res = await api.toggleBanUser(acc.username);
                                        showToast(
                                          res.isBanned
                                            ? `「${acc.username}」を凍結しました`
                                            : `「${acc.username}」の凍結を解除しました`
                                        );
                                        fetchOverview();
                                      } catch (err: any) {
                                        showToast(err?.message || '更新に失敗しました');
                                      }
                                    }}
                                    className={`px-2.5 py-1 rounded-md text-xs font-medium inline-flex items-center gap-1 cursor-pointer border ${
                                      acc.isBanned
                                        ? 'border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/15'
                                        : 'border-rose-500/35 text-rose-300 hover:bg-rose-500/15'
                                    }`}
                                  >
                                    {acc.isBanned ? <Unlock className="w-3 h-3" /> : <Ban className="w-3 h-3" />}
                                    <span>{acc.isBanned ? '解除' : '凍結'}</span>
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => setUserPasswordReset({ username: acc.username, newPass: '' })}
                                    className="px-2.5 py-1 rounded-md text-xs text-neutral-300 hover:text-white border border-white/[0.08] hover:bg-white/[0.05] cursor-pointer"
                                  >
                                    PW変更
                                  </button>

                                  {isConfirmDel ? (
                                    <span className="inline-flex items-center gap-1.5">
                                      <button
                                        type="button"
                                        onClick={() => handleDeleteUser(acc.username)}
                                        className="px-2.5 py-1 bg-red-600 hover:bg-red-500 text-white rounded-md text-xs font-bold cursor-pointer"
                                      >
                                        本当に削除
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setConfirmDeleteUser(null)}
                                        className="px-2 py-1 bg-white/[0.06] text-neutral-300 rounded-md text-xs cursor-pointer"
                                      >
                                        取消
                                      </button>
                                    </span>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => setConfirmDeleteUser(acc.username)}
                                      className="px-2.5 py-1 rounded-md text-xs text-red-400 hover:bg-red-500/15 border border-red-500/25 cursor-pointer"
                                    >
                                      削除
                                    </button>
                                  )}
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* ============================================================
                  PAGE 5: SAFETY (通報・コメント・DM監査)
                 ============================================================ */}
              {activeNav === 'safety' && (
                <div className="space-y-6">
                  <div className="inline-flex items-center gap-1 p-1 bg-[#111318] border border-white/[0.08] rounded-lg overflow-x-auto max-w-full">
                    <button
                      type="button"
                      onClick={() => setSafetyTab('reports')}
                      className={`px-3.5 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                        safetyTab === 'reports'
                          ? 'bg-amber-500 text-black font-bold'
                          : 'text-neutral-400 hover:text-white'
                      }`}
                    >
                      通報キュー ({pendingReportsCount}件未対応)
                    </button>
                    <button
                      type="button"
                      onClick={() => setSafetyTab('comments')}
                      className={`px-3.5 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                        safetyTab === 'comments'
                          ? 'bg-amber-500 text-black font-bold'
                          : 'text-neutral-400 hover:text-white'
                      }`}
                    >
                      コメント & NGワード
                    </button>
                    <button
                      type="button"
                      onClick={() => setSafetyTab('dms')}
                      className={`px-3.5 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                        safetyTab === 'dms'
                          ? 'bg-amber-500 text-black font-bold'
                          : 'text-neutral-400 hover:text-white'
                      }`}
                    >
                      DM監視・監査
                    </button>
                  </div>

                  {/* Reports Sub-Tab */}
                  {safetyTab === 'reports' && (
                    <div className="p-4 rounded-xl bg-[#111318] border border-white/[0.08] space-y-3">
                      <div className="flex items-center justify-between">
                        <h2 className="text-sm font-semibold text-white">ユーザーからの通報一覧</h2>
                        <span className="text-xs text-neutral-400 font-mono tabular-nums">
                          全 {(moderationData?.reports || []).length} 件
                        </span>
                      </div>

                      {loadingModeration && !moderationData ? (
                        <div className="py-10 text-center text-xs text-neutral-400">読み込み中...</div>
                      ) : (moderationData?.reports || []).length === 0 ? (
                        <div className="py-10 text-center text-xs text-neutral-500">
                          現在、通報はありません。
                        </div>
                      ) : (
                        <div className="divide-y divide-white/[0.06]">
                          {(moderationData?.reports || []).map((rep: any) => (
                            <div
                              key={rep.id}
                              className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                            >
                              <div className="space-y-1 min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span
                                    className={`font-semibold ${
                                      rep.status === 'pending' ? 'text-rose-400' : 'text-neutral-400'
                                    }`}
                                  >
                                    {rep.status === 'pending'
                                      ? '未対応'
                                      : rep.status === 'resolved'
                                      ? '解決済み'
                                      : '却下'}
                                  </span>
                                  <span className="text-neutral-600">·</span>
                                  <span className="text-white font-semibold">対象: {rep.reportedUser}</span>
                                  <span className="text-neutral-600">·</span>
                                  <span className="text-neutral-300">理由: {rep.reason}</span>
                                </div>
                                {rep.contentSnippet && (
                                  <p className="text-neutral-300 bg-[#0A0B0E] px-2.5 py-1.5 rounded-md border border-white/[0.06] inline-block">
                                    「{rep.contentSnippet}」
                                  </p>
                                )}
                                <div className="text-[11px] text-neutral-500 font-mono">
                                  通報者: {rep.reporter} · {new Date(rep.timestamp).toLocaleString('ja-JP')}
                                </div>
                              </div>

                              <div className="flex items-center gap-2 shrink-0">
                                {rep.status === 'pending' && (
                                  <>
                                    <button
                                      type="button"
                                      onClick={async () => {
                                        await api.resolveModerationReport(rep.id, 'resolved');
                                        showToast('解決済みにしました');
                                        fetchModeration();
                                      }}
                                      className="px-3 py-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 font-semibold cursor-pointer"
                                    >
                                      解決にする
                                    </button>
                                    <button
                                      type="button"
                                      onClick={async () => {
                                        await api.resolveModerationReport(rep.id, 'dismissed');
                                        showToast('却下しました');
                                        fetchModeration();
                                      }}
                                      className="px-3 py-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] text-neutral-300 cursor-pointer"
                                    >
                                      却下
                                    </button>
                                  </>
                                )}
                                <button
                                  type="button"
                                  onClick={async () => {
                                    const res = await api.toggleBanUser(rep.reportedUser);
                                    showToast(
                                      res.isBanned
                                        ? `「${rep.reportedUser}」を凍結しました`
                                        : `「${rep.reportedUser}」の凍結を解除しました`
                                    );
                                    fetchModeration();
                                    fetchOverview();
                                  }}
                                  className="px-3 py-1.5 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/35 font-semibold cursor-pointer"
                                >
                                  凍結切替
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Comments & NG Words Sub-Tab */}
                  {safetyTab === 'comments' && (
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                      {/* Recent Comments (7 cols) */}
                      <div className="lg:col-span-7 p-4 rounded-xl bg-[#111318] border border-white/[0.08] space-y-3">
                        <div className="flex items-center justify-between">
                          <h2 className="text-sm font-semibold text-white">最近のコメント</h2>
                          <span className="text-xs text-neutral-400 font-mono tabular-nums">
                            総数 {moderationData?.totalComments ?? 0}件
                          </span>
                        </div>

                        {(moderationData?.recentComments || []).length === 0 ? (
                          <p className="py-10 text-center text-xs text-neutral-500">
                            コメントはまだありません
                          </p>
                        ) : (
                          <div className="divide-y divide-white/[0.06] max-h-[440px] overflow-y-auto pr-1">
                            {(moderationData?.recentComments || []).map((c: any) => (
                              <div key={c.id} className="py-3 flex items-start justify-between gap-3 text-xs">
                                <div className="min-w-0 space-y-1">
                                  <div className="text-[11px] text-neutral-400 font-mono">
                                    <span className="text-white font-semibold font-sans">{c.username}</span> ·{' '}
                                    {c.formattedTime} · 動画 {c.videoId}
                                  </div>
                                  <p className="text-neutral-200 break-words">{c.text}</p>
                                </div>

                                {confirmDeleteCommentId === c.id ? (
                                  <div className="flex items-center gap-1.5 shrink-0">
                                    <button
                                      type="button"
                                      onClick={async () => {
                                        try {
                                          await api.deleteComment(c.videoId, c.id, '', true);
                                          setConfirmDeleteCommentId(null);
                                          showToast('コメントを削除しました');
                                          fetchModeration();
                                        } catch (err: any) {
                                          showToast(err?.message || '削除に失敗しました');
                                        }
                                      }}
                                      className="px-2.5 py-1 bg-red-600 text-white rounded-md font-bold cursor-pointer"
                                    >
                                      削除実行
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setConfirmDeleteCommentId(null)}
                                      className="px-2 py-1 bg-white/[0.06] text-neutral-300 rounded-md cursor-pointer"
                                    >
                                      取消
                                    </button>
                                  </div>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => setConfirmDeleteCommentId(c.id)}
                                    className="px-2.5 py-1 rounded-md text-red-400 hover:bg-red-500/15 border border-red-500/25 shrink-0 cursor-pointer"
                                  >
                                    削除
                                  </button>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* NG Words (5 cols) */}
                      <div className="lg:col-span-5 p-4 rounded-xl bg-[#111318] border border-white/[0.08] space-y-4 self-start">
                        <div>
                          <h2 className="text-sm font-semibold text-white">NGワード自動伏字フィルター</h2>
                          <p className="text-xs text-neutral-400 mt-0.5">
                            登録された語句はコメントやDM投稿時に自動で「***」に置き換わります。
                          </p>
                        </div>

                        <form
                          onSubmit={async (e) => {
                            e.preventDefault();
                            const word = newNgWord.trim();
                            if (!word) return;
                            setSavingNgWord(true);
                            try {
                              const res = await api.addAdminNgWord(word);
                              setNewNgWord('');
                              showToast(res.message);
                              fetchModeration();
                            } catch (err: any) {
                              showToast(err?.message || '追加に失敗しました');
                            } finally {
                              setSavingNgWord(false);
                            }
                          }}
                          className="flex gap-2"
                        >
                          <input
                            type="text"
                            value={newNgWord}
                            onChange={(e) => setNewNgWord(e.target.value)}
                            placeholder="追加するNGワード"
                            maxLength={60}
                            className="flex-1 bg-[#0A0B0E] border border-white/[0.12] text-xs text-white px-3 py-2 rounded-lg focus:outline-none focus:border-amber-500"
                          />
                          <button
                            type="submit"
                            disabled={savingNgWord || !newNgWord.trim()}
                            className="px-3.5 py-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-black font-bold text-xs rounded-lg flex items-center gap-1 cursor-pointer shrink-0"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>追加</span>
                          </button>
                        </form>

                        <div className="space-y-3 pt-1">
                          <div>
                            <div className="text-[11px] text-neutral-400 mb-1">追加したNGワード (クリックで削除)</div>
                            {(moderationData?.customNgWords || []).length === 0 ? (
                              <p className="text-xs text-neutral-500">カスタムNGワードはまだありません</p>
                            ) : (
                              <div className="flex flex-wrap gap-1.5">
                                {(moderationData?.customNgWords || []).map((word: string) => (
                                  <button
                                    key={word}
                                    type="button"
                                    onClick={async () => {
                                      try {
                                        const res = await api.removeAdminNgWord(word);
                                        showToast(res.message);
                                        fetchModeration();
                                      } catch (err: any) {
                                        showToast(err?.message || '削除に失敗しました');
                                      }
                                    }}
                                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-rose-950/50 hover:bg-rose-900/60 text-rose-200 border border-rose-500/30 text-xs font-mono cursor-pointer"
                                    title="クリックして削除"
                                  >
                                    <span>{word}</span>
                                    <X className="w-3 h-3 text-rose-400" />
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>

                          <div className="pt-2 border-t border-white/[0.06]">
                            <div className="text-[11px] text-neutral-400 mb-1">標準の自動保護ワード</div>
                            <p className="text-xs text-neutral-500 font-mono leading-relaxed">
                              {(moderationData?.ngWords || []).join(' · ')}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* DMs Surveillance Sub-Tab */}
                  {safetyTab === 'dms' && (
                    <div className="space-y-4">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="text-xs text-neutral-400 font-mono tabular-nums">
                          スレッド {adminDmData?.totalConversations ?? 0}件 · 総メッセージ {adminDmData?.totalMessages ?? 0}通
                        </div>
                        <div className="relative w-full sm:w-72">
                          <Search className="w-4 h-4 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2" />
                          <input
                            type="text"
                            value={dmSearchFilter}
                            onChange={(e) => setDmSearchFilter(e.target.value)}
                            placeholder="ユーザー名・本文で検索"
                            className="w-full bg-[#111318] border border-white/[0.1] text-xs text-white pl-9 pr-3 py-2 rounded-lg focus:outline-none focus:border-amber-500"
                          />
                        </div>
                      </div>

                      {loadingAdminDms && !adminDmData ? (
                        <div className="py-12 text-center text-xs text-neutral-400">読み込み中...</div>
                      ) : !adminDmData || adminDmData.conversations.length === 0 ? (
                        <div className="p-12 text-center rounded-xl bg-[#111318] border border-white/[0.08] text-xs text-neutral-500">
                          DMの履歴はまだありません
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 min-h-[420px]">
                          <div className="md:col-span-5 rounded-xl bg-[#111318] border border-white/[0.08] divide-y divide-white/[0.06] max-h-[480px] overflow-y-auto">
                            {adminDmData.conversations
                              .filter((conv) => {
                                if (!dmSearchFilter.trim()) return true;
                                const q = dmSearchFilter.toLowerCase();
                                return (
                                  conv.participants.some((p) => p.toLowerCase().includes(q)) ||
                                  conv.messages.some((m) => (m.content || '').toLowerCase().includes(q))
                                );
                              })
                              .map((conv) => {
                                const isSelected = selectedAdminConvId === conv.conversationId;
                                const lastMsg = conv.messages[conv.messages.length - 1];
                                return (
                                  <button
                                    key={conv.conversationId}
                                    type="button"
                                    onClick={() => setSelectedAdminConvId(conv.conversationId)}
                                    className={`w-full text-left p-3.5 transition-colors cursor-pointer ${
                                      isSelected ? 'bg-amber-500/10' : 'hover:bg-white/[0.03]'
                                    }`}
                                  >
                                    <div className="flex items-center justify-between gap-2 text-xs">
                                      <span className={`font-semibold ${isSelected ? 'text-amber-300' : 'text-white'}`}>
                                        {conv.participants[0]} ↔ {conv.participants[1]}
                                      </span>
                                      <span className="font-mono tabular-nums text-[11px] text-neutral-500">
                                        {conv.messageCount}通
                                      </span>
                                    </div>
                                    <p className="text-[11px] text-neutral-400 truncate mt-1">
                                      {lastMsg?.content ||
                                        (lastMsg?.trackCard ? `楽曲: ${lastMsg.trackCard.title}` : '共有メッセージ')}
                                    </p>
                                  </button>
                                );
                              })}
                          </div>

                          <div className="md:col-span-7 rounded-xl bg-[#111318] border border-white/[0.08] flex flex-col max-h-[480px] overflow-hidden">
                            {(() => {
                              const activeConv =
                                adminDmData.conversations.find((c) => c.conversationId === selectedAdminConvId) ||
                                adminDmData.conversations[0];
                              if (!activeConv) {
                                return (
                                  <div className="flex-1 flex items-center justify-center text-xs text-neutral-500">
                                    左からスレッドを選んでください
                                  </div>
                                );
                              }
                              return (
                                <>
                                  <div className="px-4 py-3 border-b border-white/[0.08] flex items-center justify-between text-xs">
                                    <span className="font-semibold text-white">
                                      {activeConv.participants[0]} ↔ {activeConv.participants[1]}
                                    </span>
                                    <span className="text-neutral-500 font-mono tabular-nums">
                                      {activeConv.messages.length}件
                                    </span>
                                  </div>
                                  <div className="flex-1 p-4 overflow-y-auto divide-y divide-white/[0.06]">
                                    {activeConv.messages.map((msg) => (
                                      <div key={msg.id} className="py-3 first:pt-0 space-y-1.5 text-xs">
                                        <div className="flex items-center justify-between gap-2">
                                          <div className="text-neutral-400">
                                            <span className="font-semibold text-white">{msg.sender}</span> →{' '}
                                            <span>{msg.recipient}</span>
                                            <span className="ml-2 font-mono tabular-nums text-[11px] text-neutral-500">
                                              {new Date(msg.timestamp).toLocaleString('ja-JP', {
                                                month: '2-digit',
                                                day: '2-digit',
                                                hour: '2-digit',
                                                minute: '2-digit',
                                              })}
                                            </span>
                                          </div>
                                          {confirmDeleteDmId === msg.id ? (
                                            <div className="flex items-center gap-1.5">
                                              <button
                                                type="button"
                                                onClick={async () => {
                                                  try {
                                                    await api.deleteAdminDmMessage(msg.id);
                                                    setConfirmDeleteDmId(null);
                                                    showToast('DMを削除しました');
                                                    fetchAdminDms();
                                                  } catch (err: any) {
                                                    showToast(err?.message || '削除に失敗しました');
                                                  }
                                                }}
                                                className="px-2 py-0.5 bg-red-600 text-white rounded text-[11px] font-bold cursor-pointer"
                                              >
                                                削除実行
                                              </button>
                                              <button
                                                type="button"
                                                onClick={() => setConfirmDeleteDmId(null)}
                                                className="px-2 py-0.5 bg-white/[0.06] text-neutral-300 rounded text-[11px] cursor-pointer"
                                              >
                                                取消
                                              </button>
                                            </div>
                                          ) : (
                                            <button
                                              type="button"
                                              onClick={() => setConfirmDeleteDmId(msg.id)}
                                              className="text-neutral-500 hover:text-red-400 cursor-pointer"
                                              title="削除"
                                            >
                                              <Trash2 className="w-3.5 h-3.5" />
                                            </button>
                                          )}
                                        </div>
                                        {msg.content && <p className="text-neutral-200 break-words">{msg.content}</p>}
                                        {msg.trackCard && (
                                          <div className="text-[11px] text-neutral-400">
                                            共有曲: {msg.trackCard.title} ({msg.trackCard.artist})
                                          </div>
                                        )}
                                        {msg.playlistCard && (
                                          <div className="text-[11px] text-neutral-400">
                                            共有プレイリスト: {msg.playlistCard.name} ({msg.playlistCard.trackCount}曲)
                                          </div>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                </>
                              );
                            })()}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* ============================================================
                  PAGE 6: CONTENT MANAGEMENT (投稿コンテンツ・歌詞補正)
                 ============================================================ */}
              {activeNav === 'content' && (
                <div className="space-y-6">
                  <div className="inline-flex items-center gap-1 p-1 bg-[#111318] border border-white/[0.08] rounded-lg overflow-x-auto max-w-full">
                    <button
                      type="button"
                      onClick={() => setContentTab('sharedOffline')}
                      className={`px-3.5 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                        contentTab === 'sharedOffline'
                          ? 'bg-amber-500 text-black font-bold'
                          : 'text-neutral-400 hover:text-white'
                      }`}
                    >
                      共有オフライン ({sharedOfflineData?.totalCount ?? 0})
                    </button>
                    <button
                      type="button"
                      onClick={() => setContentTab('rooms')}
                      className={`px-3.5 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                        contentTab === 'rooms'
                          ? 'bg-amber-500 text-black font-bold'
                          : 'text-neutral-400 hover:text-white'
                      }`}
                    >
                      リスニングルーム ({contentOverview?.rooms?.length ?? 0})
                    </button>
                    <button
                      type="button"
                      onClick={() => setContentTab('playlists')}
                      className={`px-3.5 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                        contentTab === 'playlists'
                          ? 'bg-amber-500 text-black font-bold'
                          : 'text-neutral-400 hover:text-white'
                      }`}
                    >
                      公開・共同プレイリスト
                    </button>
                    <button
                      type="button"
                      onClick={() => setContentTab('offsets')}
                      className={`px-3.5 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                        contentTab === 'offsets'
                          ? 'bg-amber-500 text-black font-bold'
                          : 'text-neutral-400 hover:text-white'
                      }`}
                    >
                      歌詞タイミング補正
                    </button>
                  </div>

                  {/* Shared Offline Sub-Tab */}
                  {contentTab === 'sharedOffline' && (
                    <div className="space-y-4">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="text-xs text-neutral-400 font-mono tabular-nums">
                          公開曲数 {sharedOfflineData?.totalCount ?? 0}曲 · 合計容量{' '}
                          {formatFileSizeLabel(sharedOfflineData?.totalBytes ?? 0)}
                        </div>
                        <div className="relative w-full sm:w-72">
                          <Search className="w-4 h-4 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2" />
                          <input
                            type="text"
                            value={sharedSearchFilter}
                            onChange={(e) => setSharedSearchFilter(e.target.value)}
                            placeholder="曲名・アーティスト・投稿者で検索"
                            className="w-full bg-[#111318] border border-white/[0.1] rounded-lg pl-9 pr-3 py-2 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-amber-500"
                          />
                        </div>
                      </div>

                      {loadingSharedOffline && !sharedOfflineData ? (
                        <div className="py-12 text-center text-xs text-neutral-400">読み込み中...</div>
                      ) : !sharedOfflineData || sharedOfflineData.tracks.length === 0 ? (
                        <div className="p-12 text-center rounded-xl bg-[#111318] border border-white/[0.08] text-xs text-neutral-500">
                          共有オフラインに投稿された曲はまだありません
                        </div>
                      ) : (
                        <div className="rounded-xl bg-[#111318] border border-white/[0.08] divide-y divide-white/[0.06]">
                          {sharedOfflineData.tracks
                            .filter((t) => {
                              if (!sharedSearchFilter.trim()) return true;
                              const q = sharedSearchFilter.trim().toLowerCase();
                              return (
                                String(t.title || '').toLowerCase().includes(q) ||
                                String(t.artist || '').toLowerCase().includes(q) ||
                                String(t.uploadedBy || '').toLowerCase().includes(q)
                              );
                            })
                            .map((t) => {
                              const isConfirming = confirmDeleteSharedId === t.id;
                              const isDeleting = deletingSharedId === t.id;
                              return (
                                <div
                                  key={t.id}
                                  className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                                >
                                  <div className="flex items-center gap-3 min-w-0">
                                    <SafeImage
                                      src={t.thumbnail || `/api/shared-offline/cover/${encodeURIComponent(t.id)}`}
                                      alt={t.title}
                                      className="w-11 h-11 rounded-lg object-cover bg-neutral-800 shrink-0"
                                    />
                                    <div className="min-w-0">
                                      <p className="text-xs sm:text-sm font-semibold text-white truncate">
                                        {t.title}
                                      </p>
                                      <p className="text-[11px] text-neutral-400 truncate mt-0.5">
                                        {t.artist} · 投稿者: {t.uploadedBy || 'ゲスト'} ·{' '}
                                        {formatFileSizeLabel(t.fileSize || 0)} · 再生 {t.plays || 0}回
                                      </p>
                                    </div>
                                  </div>

                                  <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                                    {isConfirming ? (
                                      <>
                                        <button
                                          type="button"
                                          disabled={isDeleting}
                                          onClick={async () => {
                                            setDeletingSharedId(t.id);
                                            try {
                                              await api.deleteAdminSharedOfflineTrack(t.id);
                                              await removeDeletedSharedOfflineTrackLocal(t.id);
                                              setConfirmDeleteSharedId(null);
                                              showToast(`「${t.title}」を削除しました`);
                                              fetchAdminSharedOffline();
                                            } catch (err: any) {
                                              showToast(err?.message || '削除に失敗しました');
                                            } finally {
                                              setDeletingSharedId(null);
                                            }
                                          }}
                                          className="px-3 py-1.5 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white rounded-lg text-xs font-bold cursor-pointer"
                                        >
                                          {isDeleting ? '削除中...' : '削除を実行'}
                                        </button>
                                        <button
                                          type="button"
                                          disabled={isDeleting}
                                          onClick={() => setConfirmDeleteSharedId(null)}
                                          className="px-2.5 py-1.5 bg-white/[0.06] text-neutral-300 rounded-lg text-xs cursor-pointer"
                                        >
                                          取消
                                        </button>
                                      </>
                                    ) : (
                                      <button
                                        type="button"
                                        onClick={() => setConfirmDeleteSharedId(t.id)}
                                        className="px-3 py-1.5 rounded-lg text-xs text-red-400 hover:bg-red-500/15 border border-red-500/30 font-medium flex items-center gap-1.5 cursor-pointer"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                        <span>削除</span>
                                      </button>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Listening Rooms Sub-Tab */}
                  {contentTab === 'rooms' && (
                    <div className="p-4 rounded-xl bg-[#111318] border border-white/[0.08] space-y-3">
                      <h2 className="text-sm font-semibold text-white">稼働中のリスニングパーティールーム</h2>
                      {loadingContentOverview && !contentOverview ? (
                        <div className="py-10 text-center text-xs text-neutral-400">読み込み中...</div>
                      ) : !contentOverview?.rooms || contentOverview.rooms.length === 0 ? (
                        <div className="py-10 text-center text-xs text-neutral-500">
                          現在開かれているルームはありません
                        </div>
                      ) : (
                        <div className="divide-y divide-white/[0.06]">
                          {contentOverview.rooms.map((room: any) => {
                            const key = `room:${room.id}`;
                            const isConfirm = confirmDeleteContentKey === key;
                            return (
                              <div
                                key={room.id}
                                className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                              >
                                <div className="min-w-0">
                                  <p className="text-sm font-semibold text-white truncate">{room.name}</p>
                                  <p className="text-[11px] text-neutral-400 mt-0.5 truncate">
                                    ホスト: {room.hostUsername} · 参加者 {room.participantCount}人 · チャット{' '}
                                    {room.chatCount}件 · キュー {room.queueCount}曲
                                  </p>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  <button
                                    type="button"
                                    onClick={async () => {
                                      try {
                                        const res = await api.clearAdminRoomChat(room.id);
                                        showToast(res.message);
                                        fetchContentOverview();
                                      } catch (err: any) {
                                        showToast(err?.message || 'チャット消去に失敗しました');
                                      }
                                    }}
                                    className="px-3 py-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] text-neutral-200 flex items-center gap-1.5 cursor-pointer"
                                  >
                                    <Eraser className="w-3.5 h-3.5" />
                                    <span>チャット消去</span>
                                  </button>

                                  {isConfirm ? (
                                    <>
                                      <button
                                        type="button"
                                        onClick={async () => {
                                          try {
                                            const res = await api.deleteAdminRoom(room.id);
                                            setConfirmDeleteContentKey(null);
                                            showToast(res.message);
                                            fetchContentOverview();
                                          } catch (err: any) {
                                            showToast(err?.message || '削除に失敗しました');
                                          }
                                        }}
                                        className="px-3 py-1.5 bg-red-600 text-white rounded-lg font-bold cursor-pointer"
                                      >
                                        削除実行
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setConfirmDeleteContentKey(null)}
                                        className="px-2.5 py-1.5 bg-white/[0.06] text-neutral-300 rounded-lg cursor-pointer"
                                      >
                                        取消
                                      </button>
                                    </>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => setConfirmDeleteContentKey(key)}
                                      className="px-3 py-1.5 rounded-lg text-red-400 hover:bg-red-500/15 border border-red-500/30 font-medium cursor-pointer"
                                    >
                                      ルーム削除
                                    </button>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Shared & Collab Playlists Sub-Tab */}
                  {contentTab === 'playlists' && (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      <div className="p-4 rounded-xl bg-[#111318] border border-white/[0.08] space-y-3">
                        <h2 className="text-sm font-semibold text-white">
                          共有URLプレイリスト ({contentOverview?.sharedPlaylists?.length ?? 0}件)
                        </h2>
                        {!contentOverview?.sharedPlaylists || contentOverview.sharedPlaylists.length === 0 ? (
                          <p className="py-8 text-center text-xs text-neutral-500">
                            共有プレイリストはまだありません
                          </p>
                        ) : (
                          <div className="divide-y divide-white/[0.06] max-h-80 overflow-y-auto pr-1">
                            {contentOverview.sharedPlaylists.map((pl: any) => {
                              const key = `shared:${pl.id}`;
                              const isConfirm = confirmDeleteContentKey === key;
                              return (
                                <div key={pl.id} className="py-2.5 flex items-center justify-between gap-2 text-xs">
                                  <div className="min-w-0">
                                    <p className="font-medium text-white truncate">{pl.name}</p>
                                    <p className="text-[11px] text-neutral-400 truncate">
                                      作成者: {pl.author} · {pl.trackCount}曲 · 閲覧 {pl.views}回
                                    </p>
                                  </div>
                                  {isConfirm ? (
                                    <div className="flex items-center gap-1.5 shrink-0">
                                      <button
                                        type="button"
                                        onClick={async () => {
                                          try {
                                            const res = await api.deleteAdminSharedPlaylist(pl.id);
                                            setConfirmDeleteContentKey(null);
                                            showToast(res.message);
                                            fetchContentOverview();
                                          } catch (err: any) {
                                            showToast(err?.message || '削除に失敗しました');
                                          }
                                        }}
                                        className="px-2.5 py-1 bg-red-600 text-white rounded-md font-bold cursor-pointer"
                                      >
                                        実行
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setConfirmDeleteContentKey(null)}
                                        className="px-2 py-1 bg-white/[0.06] text-neutral-300 rounded-md cursor-pointer"
                                      >
                                        取消
                                      </button>
                                    </div>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => setConfirmDeleteContentKey(key)}
                                      className="p-1.5 text-neutral-400 hover:text-red-400 rounded cursor-pointer shrink-0"
                                      title="削除"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      <div className="p-4 rounded-xl bg-[#111318] border border-white/[0.08] space-y-3">
                        <h2 className="text-sm font-semibold text-white">
                          共同編集プレイリスト ({contentOverview?.collabPlaylists?.length ?? 0}件)
                        </h2>
                        {!contentOverview?.collabPlaylists || contentOverview.collabPlaylists.length === 0 ? (
                          <p className="py-8 text-center text-xs text-neutral-500">
                            共同編集プレイリストはまだありません
                          </p>
                        ) : (
                          <div className="divide-y divide-white/[0.06] max-h-80 overflow-y-auto pr-1">
                            {contentOverview.collabPlaylists.map((cp: any) => {
                              const key = `collab:${cp.code}`;
                              const isConfirm = confirmDeleteContentKey === key;
                              return (
                                <div key={cp.code} className="py-2.5 flex items-center justify-between gap-2 text-xs">
                                  <div className="min-w-0">
                                    <p className="font-medium text-white truncate">
                                      {cp.name} <span className="font-mono text-neutral-400">#{cp.code}</span>
                                    </p>
                                    <p className="text-[11px] text-neutral-400 truncate">
                                      作成者: {cp.owner} · 参加 {cp.memberCount}人 · {cp.trackCount}曲
                                    </p>
                                  </div>
                                  {isConfirm ? (
                                    <div className="flex items-center gap-1.5 shrink-0">
                                      <button
                                        type="button"
                                        onClick={async () => {
                                          try {
                                            const res = await api.deleteAdminCollabPlaylist(cp.code);
                                            setConfirmDeleteContentKey(null);
                                            showToast(res.message);
                                            fetchContentOverview();
                                          } catch (err: any) {
                                            showToast(err?.message || '削除に失敗しました');
                                          }
                                        }}
                                        className="px-2.5 py-1 bg-red-600 text-white rounded-md font-bold cursor-pointer"
                                      >
                                        実行
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setConfirmDeleteContentKey(null)}
                                        className="px-2 py-1 bg-white/[0.06] text-neutral-300 rounded-md cursor-pointer"
                                      >
                                        取消
                                      </button>
                                    </div>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => setConfirmDeleteContentKey(key)}
                                      className="p-1.5 text-neutral-400 hover:text-red-400 rounded cursor-pointer shrink-0"
                                      title="削除"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Track Sync Offset Sub-Tab */}
                  {contentTab === 'offsets' && (
                    <div className="space-y-6">
                      <form
                        onSubmit={handleSaveTrackOffset}
                        className="p-5 rounded-xl bg-[#111318] border border-white/[0.08] space-y-4"
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <div>
                            <h2 className="text-sm font-semibold text-white">歌詞の同期タイミングを補正する</h2>
                            <p className="text-xs text-neutral-400 mt-0.5">
                              歌詞が音より早い・遅い曲に対し、全ユーザー共通のズレ補正（秒）を登録します。
                            </p>
                          </div>
                          {currentTrack && (
                            <button
                              type="button"
                              onClick={() => {
                                setOffsetVideoId(currentTrack.id);
                                setOffsetTitle(`${currentTrack.title} - ${currentTrack.artist}`);
                              }}
                              className="px-3 py-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.1] text-xs text-amber-300 font-medium cursor-pointer shrink-0"
                            >
                              再生中の曲を入力 ({currentTrack.title.slice(0, 18)})
                            </button>
                          )}
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <div>
                            <label className="block text-xs text-neutral-300 mb-1">曲ID (YouTube ID)</label>
                            <input
                              type="text"
                              value={offsetVideoId}
                              onChange={(e) => setOffsetVideoId(e.target.value)}
                              placeholder="例: m9SMT5ipbxk"
                              className="w-full bg-[#0A0B0E] border border-white/[0.12] text-xs text-white px-3 py-2 rounded-lg font-mono focus:outline-none focus:border-amber-500"
                              required
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-neutral-300 mb-1">曲名・メモ</label>
                            <input
                              type="text"
                              value={offsetTitle}
                              onChange={(e) => setOffsetTitle(e.target.value)}
                              placeholder="曲名 (任意)"
                              className="w-full bg-[#0A0B0E] border border-white/[0.12] text-xs text-white px-3 py-2 rounded-lg focus:outline-none focus:border-amber-500"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-neutral-300 mb-1">補正値 (秒 / マイナスで早める)</label>
                            <input
                              type="number"
                              step="0.1"
                              value={offsetSecVal}
                              onChange={(e) => setOffsetSecVal(e.target.value)}
                              className="w-full bg-[#0A0B0E] border border-white/[0.12] text-xs text-white px-3 py-2 rounded-lg font-mono focus:outline-none focus:border-amber-500"
                              required
                            />
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div className="flex items-center gap-1.5 flex-wrap text-xs">
                            <span className="text-neutral-400 mr-1">よく使う値:</span>
                            {[-1.5, -1.0, -0.5, 0, 0.5, 1.0, 1.5].map((val) => (
                              <button
                                key={val}
                                type="button"
                                onClick={() => setOffsetSecVal(String(val))}
                                className={`px-2.5 py-1 rounded-md font-mono text-xs border cursor-pointer ${
                                  parseFloat(offsetSecVal) === val
                                    ? 'bg-amber-500 text-black border-amber-500 font-bold'
                                    : 'bg-[#0A0B0E] border-white/[0.1] text-neutral-300 hover:text-white'
                                }`}
                              >
                                {val > 0 ? `+${val}` : val}秒
                              </button>
                            ))}
                          </div>

                          <button
                            type="submit"
                            disabled={savingOffset || !offsetVideoId.trim()}
                            className="px-4 py-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-black font-bold text-xs rounded-lg flex items-center gap-1.5 cursor-pointer"
                          >
                            {savingOffset ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sliders className="w-3.5 h-3.5" />}
                            <span>補正を保存</span>
                          </button>
                        </div>
                      </form>

                      <div className="overflow-x-auto rounded-xl bg-[#111318] border border-white/[0.08]">
                        <table className="w-full text-left text-xs">
                          <thead className="border-b border-white/[0.08] text-neutral-400">
                            <tr>
                              <th className="py-3 px-4 font-medium">曲ID</th>
                              <th className="py-3 px-4 font-medium">曲名 / メモ</th>
                              <th className="py-3 px-4 font-medium text-right">補正値</th>
                              <th className="py-3 px-4 font-medium text-right">操作</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-white/[0.06]">
                            {!overviewData?.trackOffsets || Object.keys(overviewData.trackOffsets).length === 0 ? (
                              <tr>
                                <td colSpan={4} className="py-8 text-center text-neutral-500">
                                  登録された歌詞補正はまだありません
                                </td>
                              </tr>
                            ) : (
                              Object.entries(overviewData.trackOffsets).map(([vid, info]: [string, any]) => (
                                <tr key={vid} className="hover:bg-white/[0.02]">
                                  <td className="py-2.5 px-4 font-mono text-amber-300">{vid}</td>
                                  <td className="py-2.5 px-4 text-white">{info.title || vid}</td>
                                  <td className="py-2.5 px-4 text-right font-mono tabular-nums text-emerald-400">
                                    {info.offsetSec > 0 ? `+${info.offsetSec}` : info.offsetSec}秒
                                  </td>
                                  <td className="py-2.5 px-4 text-right">
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteTrackOffset(vid)}
                                      className="p-1.5 text-neutral-400 hover:text-red-400 rounded cursor-pointer"
                                      title="解除"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ============================================================
                  PAGE 7: SYSTEM & DIAGNOSTICS (システム保守・診断)
                 ============================================================ */}
              {activeNav === 'system' && (
                <div className="space-y-6">
                  <div className="inline-flex items-center gap-1 p-1 bg-[#111318] border border-white/[0.08] rounded-lg">
                    <button
                      type="button"
                      onClick={() => setSystemTab('maintenance')}
                      className={`px-3.5 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                        systemTab === 'maintenance'
                          ? 'bg-amber-500 text-black font-bold'
                          : 'text-neutral-400 hover:text-white'
                      }`}
                    >
                      キャッシュ・セッション・バックアップ
                    </button>
                    <button
                      type="button"
                      onClick={() => setSystemTab('diagnostics')}
                      className={`px-3.5 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                        systemTab === 'diagnostics'
                          ? 'bg-amber-500 text-black font-bold'
                          : 'text-neutral-400 hover:text-white'
                      }`}
                    >
                      API疎通テスト・エラーログ
                    </button>
                  </div>

                  {systemTab === 'maintenance' && (
                    <div className="space-y-6">
                      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                        <div className="p-4 rounded-xl bg-[#111318] border border-white/[0.08]">
                          <div className="text-xs text-neutral-400">歌詞キャッシュ</div>
                          <div className="text-xl font-bold text-white font-mono tabular-nums mt-1">
                            {overviewData?.system?.lyricsCacheSize ?? 0} 曲
                          </div>
                        </div>
                        <div className="p-4 rounded-xl bg-[#111318] border border-white/[0.08]">
                          <div className="text-xs text-neutral-400">検索・楽曲KVキャッシュ</div>
                          <div className="text-xl font-bold text-white font-mono tabular-nums mt-1">
                            {overviewData?.system?.kvCacheSize ?? 0} 件
                          </div>
                        </div>
                        <div className="p-4 rounded-xl bg-[#111318] border border-white/[0.08]">
                          <div className="text-xs text-neutral-400">有効な管理者セッション</div>
                          <div className="text-xl font-bold text-amber-400 font-mono tabular-nums mt-1">
                            {overviewData?.system?.activeAdminSessions ?? 1} 端末
                          </div>
                        </div>
                        <div className="p-4 rounded-xl bg-[#111318] border border-white/[0.08]">
                          <div className="text-xs text-neutral-400">記録された再生エラー</div>
                          <div className="text-xl font-bold text-rose-400 font-mono tabular-nums mt-1">
                            {overviewData?.playbackErrors?.length ?? 0} 件
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="p-4 rounded-xl bg-[#111318] border border-white/[0.08] flex items-center justify-between gap-4">
                          <div>
                            <h3 className="text-sm font-semibold text-white">歌詞キャッシュを消去</h3>
                            <p className="text-xs text-neutral-400 mt-0.5">
                              一時保存された歌詞データを消し、最新を取得し直します。
                            </p>
                          </div>
                          <button
                            type="button"
                            disabled={runningMaintenanceKey === 'lyrics'}
                            onClick={() => runMaintenanceAction('lyrics', () => api.clearLyricsCache())}
                            className="px-3.5 py-2 rounded-lg bg-white/[0.07] hover:bg-white/[0.12] text-white text-xs font-medium cursor-pointer shrink-0"
                          >
                            消去する
                          </button>
                        </div>

                        <div className="p-4 rounded-xl bg-[#111318] border border-white/[0.08] flex items-center justify-between gap-4">
                          <div>
                            <h3 className="text-sm font-semibold text-white">検索・楽曲キャッシュを全消去</h3>
                            <p className="text-xs text-neutral-400 mt-0.5">
                              ホーム・検索・ランキングのサーバー側キャッシュをリセットします。
                            </p>
                          </div>
                          <button
                            type="button"
                            disabled={runningMaintenanceKey === 'kv'}
                            onClick={() => runMaintenanceAction('kv', () => api.clearAdminKvCache())}
                            className="px-3.5 py-2 rounded-lg bg-white/[0.07] hover:bg-white/[0.12] text-white text-xs font-medium cursor-pointer shrink-0"
                          >
                            消去する
                          </button>
                        </div>

                        <div className="p-4 rounded-xl bg-[#111318] border border-white/[0.08] flex items-center justify-between gap-4">
                          <div>
                            <h3 className="text-sm font-semibold text-white">他端末の管理者セッションを失効</h3>
                            <p className="text-xs text-neutral-400 mt-0.5">
                              いま使っているこの画面以外の管理者ログインをすべて解除します。
                            </p>
                          </div>
                          <button
                            type="button"
                            disabled={runningMaintenanceKey === 'revoke'}
                            onClick={() => runMaintenanceAction('revoke', () => api.revokeOtherAdminSessions())}
                            className="px-3.5 py-2 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/35 text-rose-300 text-xs font-semibold cursor-pointer shrink-0"
                          >
                            他をログアウト
                          </button>
                        </div>

                        <div className="p-4 rounded-xl bg-[#111318] border border-white/[0.08] flex items-center justify-between gap-4">
                          <div>
                            <h3 className="text-sm font-semibold text-white">システムデータをJSONで保存</h3>
                            <p className="text-xs text-neutral-400 mt-0.5">
                              統計・アカウント一覧・歌詞補正などのバックアップを保存します。
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={handleExportData}
                            className="px-3.5 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold flex items-center gap-1.5 cursor-pointer shrink-0"
                          >
                            <Download className="w-3.5 h-3.5" />
                            <span>ダウンロード</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {systemTab === 'diagnostics' && (
                    <div className="space-y-6">
                      <div className="p-4 rounded-xl bg-[#111318] border border-white/[0.08] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div>
                          <h2 className="text-sm font-semibold text-white">サーバー疎通テスト</h2>
                          <p className="text-xs text-neutral-400 mt-0.5">
                            {pingResult || 'バックエンドサーバーとの通信応答速度を確認します。'}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={handleTestPing}
                          disabled={pinging}
                          className="px-4 py-2 rounded-lg bg-white/[0.07] hover:bg-white/[0.12] text-white text-xs font-medium flex items-center gap-1.5 cursor-pointer shrink-0 self-start sm:self-auto"
                        >
                          {pinging ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Server className="w-3.5 h-3.5" />}
                          <span>疎通テストを実行</span>
                        </button>
                      </div>

                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* API Call Logs */}
                        <div className="p-4 rounded-xl bg-[#111318] border border-white/[0.08] space-y-3">
                          <div className="flex items-center justify-between">
                            <h3 className="text-sm font-semibold text-white">直近のAPI通信ログ</h3>
                            <button
                              type="button"
                              disabled={runningMaintenanceKey === 'apiLogs'}
                              onClick={() => runMaintenanceAction('apiLogs', () => api.clearAdminApiLogs())}
                              className="text-xs text-neutral-400 hover:text-white cursor-pointer"
                            >
                              ログを消去
                            </button>
                          </div>
                          {!overviewData?.recentApiLogs || overviewData.recentApiLogs.length === 0 ? (
                            <p className="py-8 text-center text-xs text-neutral-500">ログはありません</p>
                          ) : (
                            <div className="divide-y divide-white/[0.06] max-h-72 overflow-y-auto pr-1 text-xs font-mono">
                              {overviewData.recentApiLogs.map((log: any) => (
                                <div key={log.id} className="py-2 flex items-center justify-between gap-3">
                                  <div className="truncate">
                                    <span className={log.status === 'success' ? 'text-emerald-400' : 'text-rose-400'}>
                                      {log.status === 'success' ? 'OK' : 'ERR'}
                                    </span>{' '}
                                    <span className="text-neutral-200">{log.endpoint}</span>
                                  </div>
                                  <span className="text-neutral-400 tabular-nums shrink-0">
                                    {log.durationMs}ms · {new Date(log.timestamp).toLocaleTimeString('ja-JP')}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Playback Error Logs */}
                        <div className="p-4 rounded-xl bg-[#111318] border border-white/[0.08] space-y-3">
                          <div className="flex items-center justify-between">
                            <h3 className="text-sm font-semibold text-white">再生エラーログ</h3>
                            <button
                              type="button"
                              disabled={runningMaintenanceKey === 'errLogs'}
                              onClick={() => runMaintenanceAction('errLogs', () => api.clearAdminPlaybackErrors())}
                              className="text-xs text-neutral-400 hover:text-white cursor-pointer"
                            >
                              ログを消去
                            </button>
                          </div>
                          {!overviewData?.playbackErrors || overviewData.playbackErrors.length === 0 ? (
                            <p className="py-8 text-center text-xs text-neutral-500">
                              再生エラーは記録されていません
                            </p>
                          ) : (
                            <div className="divide-y divide-white/[0.06] max-h-72 overflow-y-auto pr-1 text-xs">
                              {overviewData.playbackErrors.map((err: any, idx: number) => (
                                <div key={idx} className="py-2.5 flex items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <p className="font-medium text-white truncate">{err.title || err.videoId}</p>
                                    <p className="text-[11px] text-rose-400 truncate">{err.error}</p>
                                  </div>
                                  <span className="text-[11px] font-mono tabular-nums text-neutral-500 shrink-0">
                                    {new Date(err.timestamp).toLocaleTimeString('ja-JP')}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </main>
          </div>
        )}
      </div>
    </div>
  );
};
