import React, { useEffect, useRef, useState } from 'react';
import { Download, Upload, CheckCircle2, AlertTriangle, FileJson, X, Loader2 } from 'lucide-react';
import { usePlayer } from '../context/PlayerContext';
import { MAX_USER_BACKUP_JSON_BYTES, UserBackupPreview } from '../utils/userBackupJson';
import {
  getCachedSharedOfflineIds,
  SHARED_OFFLINE_CHANGED_EVENT,
} from '../services/offlineStorage';

interface UserBackupJsonPanelProps {
  compact?: boolean;
}

export const UserBackupJsonPanel: React.FC<UserBackupJsonPanelProps> = ({ compact = false }) => {
  const {
    currentUser,
    userPlaylists,
    likedTracks,
    followedArtists,
    exportUserDataJson,
    inspectUserBackupFile,
    importUserDataJson,
  } = usePlayer();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingJsonText, setPendingJsonText] = useState<string | null>(null);
  const [pendingFilename, setPendingFilename] = useState<string>('');
  const [preview, setPreview] = useState<UserBackupPreview | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [sharedCachedCount, setSharedCachedCount] = useState(0);

  useEffect(() => {
    const refreshSharedCount = () => {
      getCachedSharedOfflineIds()
        .then((ids) => setSharedCachedCount(ids.size))
        .catch(() => {});
    };
    refreshSharedCount();
    window.addEventListener(SHARED_OFFLINE_CHANGED_EVENT, refreshSharedCount);
    return () => {
      window.removeEventListener(SHARED_OFFLINE_CHANGED_EVENT, refreshSharedCount);
    };
  }, []);

  const handleExport = async () => {
    if (exporting) return;
    setErrorMsg(null);
    setExporting(true);
    try {
      const res = await exportUserDataJson();
      const sharedNote =
        res.sharedOfflineCount > 0 ? ` / 共有オフライン ${res.sharedOfflineCount}曲` : '';
      const omitNote =
        res.omittedForSizeCount > 0
          ? `（※サイズ上限により ${res.omittedForSizeCount}曲はメタデータのみ）`
          : '';
      setStatusMsg(
        `${res.filename} を保存しました（プレイリスト ${res.playlistsCount}件 / いいね ${res.likedTracksCount}曲${sharedNote}）${omitNote}`
      );
    } catch (err: any) {
      setErrorMsg(err?.message || 'JSONバックアップの書き出しに失敗しました');
    } finally {
      setExporting(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    setErrorMsg(null);
    setStatusMsg(null);
    if (!file) return;

    if (file.size > MAX_USER_BACKUP_JSON_BYTES) {
      setErrorMsg('JSONファイルサイズは150MB以下にしてください');
      return;
    }

    try {
      const text = await file.text();
      const parsedPreview = inspectUserBackupFile(text);
      setPendingJsonText(text);
      setPendingFilename(file.name);
      setPreview(parsedPreview);
    } catch (err: any) {
      setPendingJsonText(null);
      setPendingFilename('');
      setPreview(null);
      setErrorMsg(err?.message || 'JSONファイルの読み込みに失敗しました');
    }
  };

  const handleConfirmImport = async (mode: 'merge' | 'replace') => {
    if (!pendingJsonText || importing) return;
    setImporting(true);
    setErrorMsg(null);
    try {
      const res = await importUserDataJson(pendingJsonText, mode);
      const sharedNote =
        res.sharedOfflineCount > 0
          ? ` / 共有オフライン ${res.sharedOfflineCount}曲（サーバー復元 ${res.sharedRestoredServerCount}曲）`
          : '';
      setStatusMsg(
        mode === 'merge'
          ? `統合完了：プレイリスト ${res.playlistsCount}件 / いいね ${res.likedTracksCount}曲${sharedNote}`
          : `復元完了：プレイリスト ${res.playlistsCount}件 / いいね ${res.likedTracksCount}曲${sharedNote}`
      );
      setPendingJsonText(null);
      setPendingFilename('');
      setPreview(null);
    } catch (err: any) {
      setErrorMsg(err?.message || 'JSONインポートに失敗しました');
    } finally {
      setImporting(false);
    }
  };

  const cancelPending = () => {
    setPendingJsonText(null);
    setPendingFilename('');
    setPreview(null);
    setErrorMsg(null);
  };

  return (
    <div
      className={`${
        compact ? 'p-4' : 'p-4'
      } rounded-xl bg-neutral-900/70 border border-neutral-800 space-y-3`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-sky-500/15 border border-sky-500/30 text-sky-400 flex items-center justify-center shrink-0 mt-0.5">
            <FileJson className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-white">マイデータ JSONバックアップ / 復元</p>
            <p className="text-xs text-neutral-400 mt-0.5 leading-relaxed">
              プレイリスト・いいね・フォロー・履歴・音質設定・共有オフライン音源をJSONで保存し、別端末やゲスト利用時でも復元できます
            </p>
          </div>
        </div>
        <span className="text-[11px] font-mono text-neutral-400 tabular-nums shrink-0">
          {currentUser ? currentUser.username : 'ゲスト'}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-[11px] text-neutral-400 font-mono tabular-nums bg-neutral-950/60 border border-neutral-800/80 rounded-lg px-3 py-2">
        <span>現在: プレイリスト {userPlaylists.length}件</span>
        <span>/</span>
        <span>いいね {likedTracks.length}曲</span>
        <span>/</span>
        <span>フォロー {followedArtists.length}組</span>
        <span>/</span>
        <span className="text-emerald-300">共有オフライン {sharedCachedCount}曲</span>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".json,application/json"
        onChange={handleFileChange}
        className="hidden"
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <button
          type="button"
          onClick={handleExport}
          disabled={exporting}
          className="px-3.5 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white text-xs font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer"
        >
          {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
          <span>{exporting ? '書き出し準備中…' : 'JSONファイルに書き出す'}</span>
        </button>

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={importing || exporting}
          className="px-3.5 py-2.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-neutral-100 text-xs font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-50"
        >
          <Upload className="w-4 h-4 text-emerald-400" />
          <span>JSONファイルを読み込む</span>
        </button>
      </div>

      {errorMsg && (
        <div className="p-2.5 rounded-lg bg-red-950/50 border border-red-500/40 text-xs text-red-200 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
          <span className="flex-1">{errorMsg}</span>
        </div>
      )}

      {statusMsg && !pendingJsonText && (
        <div className="p-2.5 rounded-lg bg-emerald-950/45 border border-emerald-500/35 text-xs text-emerald-200 flex items-start gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
          <span className="flex-1">{statusMsg}</span>
        </div>
      )}

      {preview && (
        <div className="p-3.5 rounded-xl bg-neutral-950 border border-sky-500/40 space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-xs font-bold text-white break-all">
                読み込み確認: {pendingFilename}
              </p>
              <p className="text-[11px] text-neutral-400 mt-0.5">
                {preview.sourceUsername ? `作成元: ${preview.sourceUsername}` : 'Zero Musicデータ'}
                {preview.exportedAt
                  ? ` ・ ${new Date(preview.exportedAt).toLocaleString('ja-JP')}`
                  : ''}
              </p>
            </div>
            <button
              type="button"
              onClick={cancelPending}
              className="p-1 text-neutral-400 hover:text-white rounded cursor-pointer"
              aria-label="キャンセル"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-[11px] font-mono tabular-nums">
            <div className="p-2 rounded-lg bg-neutral-900 border border-neutral-800">
              <div className="text-neutral-400">プレイリスト</div>
              <div className="text-white font-bold">{preview.playlistsCount}件</div>
            </div>
            <div className="p-2 rounded-lg bg-neutral-900 border border-neutral-800">
              <div className="text-neutral-400">いいね曲</div>
              <div className="text-white font-bold">{preview.likedTracksCount}曲</div>
            </div>
            <div className="p-2 rounded-lg bg-neutral-900 border border-neutral-800">
              <div className="text-neutral-400">フォロー</div>
              <div className="text-white font-bold">{preview.followedArtistsCount}組</div>
            </div>
            <div className="p-2 rounded-lg bg-neutral-900 border border-neutral-800">
              <div className="text-neutral-400">再生ログ</div>
              <div className="text-white font-bold">{preview.listeningLogsCount}件</div>
            </div>
            <div className="p-2 rounded-lg bg-neutral-900 border border-emerald-500/30">
              <div className="text-emerald-300">共有オフライン</div>
              <div className="text-white font-bold">
                {preview.sharedOfflineCount}曲
                <span className="text-[10px] text-neutral-400 font-normal block">
                  (音源 {preview.sharedOfflineWithAudioCount}曲)
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button
              type="button"
              disabled={importing}
              onClick={() => handleConfirmImport('merge')}
              className="flex-1 min-w-[150px] px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-colors cursor-pointer disabled:opacity-50"
            >
              {importing ? '復元処理中…' : '現在のデータと統合して追加'}
            </button>
            <button
              type="button"
              disabled={importing}
              onClick={() => handleConfirmImport('replace')}
              className="flex-1 min-w-[150px] px-3 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold transition-colors cursor-pointer disabled:opacity-50"
            >
              {importing ? '復元処理中…' : 'JSONの内容で上書き復元'}
            </button>
            <button
              type="button"
              disabled={importing}
              onClick={cancelPending}
              className="px-3 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs font-semibold transition-colors cursor-pointer"
            >
              キャンセル
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
