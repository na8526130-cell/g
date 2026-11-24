import type { Express, Request, Response } from 'express';
import { normalizeArtistName } from '../utils/artistNames.js';
import { kvCache } from './kvCache.js';

export interface ConnectDeviceRecord {
  deviceId: string;
  name: string;
  deviceType: 'mobile' | 'pc' | 'tablet';
  username?: string;
  pairingCode: string;
  lastSeen: number;
  currentTrack?: any | null;
  queue?: any[];
  isPlaying?: boolean;
  positionSec?: number;
  durationSec?: number;
  volume?: number;
}

export interface CollabPlaylistRecord {
  code: string;
  title: string;
  description?: string;
  hostUsername: string;
  members: string[];
  tracks: any[];
  updatedAt: string;
}

export interface ConnectAndJamHelpers {
  getAccounts: () => Array<{
    id: string;
    username: string;
    syncedLibrary?: any;
  }>;
  getCollabPlaylists: () => Record<string, CollabPlaylistRecord>;
  saveStorage: () => void;
  broadcast: (data: any) => void;
  pushRealtimeEvent: (
    target: { all?: boolean; roomId?: string; videoId?: string; username?: string; pairingCode?: string; deviceId?: string; collabCode?: string },
    event: any
  ) => number;
  sendWsToMatching: (
    predicate: (meta: any) => boolean,
    data: any
  ) => void;
}

const connectDevices = new Map<string, ConnectDeviceRecord>();
const pendingDeviceCommands = new Map<string, Array<{ cmd: any; expiresAt: number }>>();
const DEVICE_TTL_MS = 90000;
const CONNECT_CACHE_KEY = 'zero_connect_devices_v1';

function syncConnectCacheFromMap() {
  try {
    const obj: Record<string, ConnectDeviceRecord> = {};
    for (const [k, v] of connectDevices.entries()) {
      obj[k] = v;
    }
    kvCache.set(CONNECT_CACHE_KEY, obj, 180);
  } catch {}
}

function hydrateConnectMapFromCache() {
  try {
    const cached = kvCache.get<Record<string, ConnectDeviceRecord>>(CONNECT_CACHE_KEY);
    if (cached && typeof cached === 'object') {
      const now = Date.now();
      for (const [k, v] of Object.entries(cached)) {
        if (v && now - v.lastSeen <= DEVICE_TTL_MS) {
          const cur = connectDevices.get(k);
          if (!cur || v.lastSeen > cur.lastSeen) {
            connectDevices.set(k, v);
          }
        }
      }
    }
  } catch {}
}

function pruneStaleDevices() {
  hydrateConnectMapFromCache();
  const now = Date.now();
  let changed = false;
  for (const [id, rec] of connectDevices.entries()) {
    if (now - rec.lastSeen > DEVICE_TTL_MS) {
      connectDevices.delete(id);
      changed = true;
    }
  }
  for (const [id, list] of pendingDeviceCommands.entries()) {
    const active = list.filter((item) => item.expiresAt > now);
    if (active.length === 0) pendingDeviceCommands.delete(id);
    else if (active.length !== list.length) pendingDeviceCommands.set(id, active);
  }
  if (changed) syncConnectCacheFromMap();
}

function normalizePairingCode(raw: string): string {
  const trimmed = String(raw || '').trim().toUpperCase().replace(/[^A-Z0-9-]/g, '');
  if (!trimmed) return '';
  if (/^\d{4}$/.test(trimmed)) return `ZM-${trimmed}`;
  return trimmed.slice(0, 16);
}

export function getDevicesForSession(params: {
  username?: string;
  pairingCode?: string;
}): ConnectDeviceRecord[] {
  pruneStaleDevices();
  const cleanUser = (params.username || '').trim().toLowerCase();
  const cleanCode = normalizePairingCode(params.pairingCode || '');
  const result: ConnectDeviceRecord[] = [];

  for (const rec of connectDevices.values()) {
    const matchUser = cleanUser && rec.username && rec.username.toLowerCase() === cleanUser;
    const matchCode = cleanCode && rec.pairingCode.toUpperCase() === cleanCode;
    if (matchUser || matchCode) {
      result.push(rec);
    }
  }
  return result.sort((a, b) => b.lastSeen - a.lastSeen);
}

function emitDevicesUpdate(
  helpers: ConnectAndJamHelpers,
  pairingCode: string,
  username?: string
) {
  const visibleDevices = getDevicesForSession({ username, pairingCode });
  const updateEv = {
    type: 'connect:devices_update',
    pairingCode,
    username,
    devices: visibleDevices,
  };
  helpers.pushRealtimeEvent(
    { pairingCode, ...(username ? { username } : {}) },
    updateEv
  );
  helpers.sendWsToMatching(
    (meta) =>
      Boolean(username && meta.username?.toLowerCase() === username.toLowerCase()) ||
      Boolean(meta.pairingCode && meta.pairingCode.toUpperCase() === pairingCode.toUpperCase()),
    updateEv
  );
  return visibleDevices;
}

export function registerConnectAndJamRoutes(app: Express, helpers: ConnectAndJamHelpers) {
  // === 1. Zero Connect (Remote Device Control & Handoff) ===
  app.post('/api/connect/register', (req: Request, res: Response) => {
    const {
      deviceId,
      name,
      deviceType,
      username,
      pairingCode,
      currentTrack,
      queue,
      isPlaying,
      positionSec,
      durationSec,
      volume,
    } = req.body || {};

    const cleanId = String(deviceId || '').trim();
    if (!cleanId) return res.status(400).json({ error: 'deviceId is required' });

    hydrateConnectMapFromCache();
    const prev = connectDevices.get(cleanId);
    const cleanCode =
      normalizePairingCode(pairingCode || prev?.pairingCode || '') ||
      `ZM-${Math.floor(1000 + Math.random() * 9000)}`;

    const record: ConnectDeviceRecord = {
      deviceId: cleanId,
      name: String(name || prev?.name || 'Zero Device').trim().slice(0, 48),
      deviceType:
        deviceType === 'mobile' || deviceType === 'tablet' || deviceType === 'pc'
          ? deviceType
          : prev?.deviceType || 'pc',
      username: username ? String(username).trim() : prev?.username,
      pairingCode: cleanCode,
      lastSeen: Date.now(),
      currentTrack: currentTrack !== undefined ? currentTrack : prev?.currentTrack || null,
      queue: Array.isArray(queue) ? queue.slice(0, 25) : prev?.queue || [],
      isPlaying: isPlaying !== undefined ? Boolean(isPlaying) : Boolean(prev?.isPlaying),
      positionSec: positionSec !== undefined ? Number(positionSec) || 0 : prev?.positionSec || 0,
      durationSec: durationSec !== undefined ? Number(durationSec) || 0 : prev?.durationSec || 0,
      volume: volume !== undefined ? Number(volume) : prev?.volume ?? 100,
    };

    connectDevices.set(cleanId, record);
    syncConnectCacheFromMap();

    const visibleDevices = emitDevicesUpdate(helpers, record.pairingCode, record.username);

    // Drain any pending commands queued for this device
    const now = Date.now();
    const queued = (pendingDeviceCommands.get(cleanId) || [])
      .filter((item) => item.expiresAt > now)
      .map((item) => item.cmd);
    if (pendingDeviceCommands.has(cleanId)) {
      pendingDeviceCommands.delete(cleanId);
    }

    res.json({
      success: true,
      device: record,
      devices: visibleDevices,
      pendingCommands: queued,
    });
  });

  app.get('/api/connect/devices', (req: Request, res: Response) => {
    const username = String(req.query.username || '').trim();
    const pairingCode = String(req.query.pairingCode || '').trim();
    const devices = getDevicesForSession({ username, pairingCode });
    res.json({ devices });
  });

  app.post('/api/connect/command', (req: Request, res: Response) => {
    const {
      targetDeviceId,
      fromDeviceId,
      fromDeviceName,
      action,
      positionSec,
      seekSec,
      volume,
      track,
      queue,
    } = req.body || {};

    const cleanTarget = String(targetDeviceId || '').trim();
    if (!cleanTarget || !action) {
      return res.status(400).json({ error: 'targetDeviceId and action are required' });
    }

    hydrateConnectMapFromCache();
    const targetDevice = connectDevices.get(cleanTarget);
    const resolvedPos =
      typeof positionSec === 'number'
        ? positionSec
        : typeof seekSec === 'number'
        ? seekSec
        : undefined;

    const cmdId = `cmd_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const ev = {
      type: 'connect:command',
      cmdId,
      targetDeviceId: cleanTarget,
      fromDeviceId,
      fromDeviceName: fromDeviceName || '別の端末',
      action,
      positionSec: resolvedPos,
      volume,
      track,
      queue,
      timestamp: Date.now(),
    };

    const qList = pendingDeviceCommands.get(cleanTarget) || [];
    qList.push({ cmd: ev, expiresAt: Date.now() + 60000 });
    if (qList.length > 20) qList.splice(0, qList.length - 20);
    pendingDeviceCommands.set(cleanTarget, qList);

    helpers.pushRealtimeEvent({ deviceId: cleanTarget }, ev);
    helpers.sendWsToMatching((meta) => meta.deviceId === cleanTarget, ev);

    // Update cached server snapshot optimistically for immediate status reflection
    if (targetDevice) {
      if (action === 'play') targetDevice.isPlaying = true;
      if (action === 'pause') targetDevice.isPlaying = false;
      if (action === 'toggle') targetDevice.isPlaying = !targetDevice.isPlaying;
      if (action === 'seek' && typeof resolvedPos === 'number') targetDevice.positionSec = resolvedPos;
      if (action === 'volume' && typeof volume === 'number') targetDevice.volume = volume;
      if (action === 'playTrack' && track) {
        targetDevice.currentTrack = track;
        if (Array.isArray(queue)) targetDevice.queue = queue.slice(0, 25);
        targetDevice.isPlaying = true;
        targetDevice.positionSec = 0;
      }
      if (action === 'transfer' && track) {
        targetDevice.currentTrack = track;
        if (Array.isArray(queue)) targetDevice.queue = queue.slice(0, 25);
        targetDevice.isPlaying = true;
        targetDevice.positionSec = typeof resolvedPos === 'number' ? resolvedPos : 0;
      }
      targetDevice.lastSeen = Date.now();
      connectDevices.set(cleanTarget, targetDevice);
      syncConnectCacheFromMap();
      emitDevicesUpdate(helpers, targetDevice.pairingCode, targetDevice.username);
    }

    res.json({ success: true, cmdId, deliveredTo: cleanTarget, online: Boolean(targetDevice) });
  });

  // === 2. Real-Time Collaborative Playlists (/api/collab/playlists) ===
  app.get('/api/collab/playlists/:code', (req: Request, res: Response) => {
    const code = String(req.params.code || '').trim().toUpperCase();
    if (!code) return res.status(400).json({ error: 'Collab code required' });
    const store = helpers.getCollabPlaylists();
    const room = store[code];
    if (!room) {
      return res.status(404).json({ error: '共同プレイリストが見つかりません' });
    }
    res.json({ success: true, playlist: room });
  });

  app.post('/api/collab/playlists/:code', (req: Request, res: Response) => {
    const code = String(req.params.code || '').trim().toUpperCase();
    if (!code) return res.status(400).json({ error: 'Collab code required' });

    const { action, title, description, username, track, trackId, fromIndex, toIndex, seedTracks } =
      req.body || {};

    const cleanUser = String(username || 'ゲスト').trim();
    const store = helpers.getCollabPlaylists();
    let room = store[code];

    if (!room) {
      room = {
        code,
        title: String(title || '共同編集プレイリスト').trim(),
        description: String(description || '友達とリアルタイム共同編集').trim(),
        hostUsername: cleanUser,
        members: [cleanUser],
        tracks: Array.isArray(seedTracks) ? seedTracks.slice(0, 50) : [],
        updatedAt: new Date().toISOString(),
      };
      store[code] = room;
    }

    if (cleanUser && !room.members.some((m) => m.toLowerCase() === cleanUser.toLowerCase())) {
      room.members.push(cleanUser);
    }

    switch (action) {
      case 'rename':
        if (title) room.title = String(title).trim().slice(0, 80);
        break;
      case 'add_track':
        if (track?.id && !room.tracks.some((t) => t.id === track.id)) {
          room.tracks.push({ ...track, addedBy: cleanUser });
        }
        break;
      case 'remove_track':
        if (trackId) {
          room.tracks = room.tracks.filter((t) => t.id !== trackId);
        }
        break;
      case 'reorder': {
        const fi = Number(fromIndex);
        const ti = Number(toIndex);
        if (
          Number.isInteger(fi) &&
          Number.isInteger(ti) &&
          fi >= 0 &&
          ti >= 0 &&
          fi < room.tracks.length &&
          ti < room.tracks.length
        ) {
          const [moved] = room.tracks.splice(fi, 1);
          room.tracks.splice(ti, 0, moved);
        }
        break;
      }
      case 'sync_all':
        if (title) room.title = String(title).trim().slice(0, 80);
        if (Array.isArray(req.body?.tracks)) {
          room.tracks = req.body.tracks.slice(0, 100);
        }
        break;
      default:
        break;
    }

    room.updatedAt = new Date().toISOString();
    store[code] = room;
    helpers.saveStorage();

    const ev = {
      type: 'collab:updated',
      code,
      playlist: room,
      actor: cleanUser,
    };
    helpers.pushRealtimeEvent({ collabCode: code }, ev);
    helpers.sendWsToMatching(
      (meta) => meta.collabCode && meta.collabCode.toUpperCase() === code,
      ev
    );

    res.json({ success: true, playlist: room });
  });

  // === 3. Friend Blend Mix Generator (Blend) ===
  app.post('/api/blend/create', (req: Request, res: Response) => {
    const { userAName, userATracks, userBName, friendUsername } = req.body || {};
    const nameA = String(userAName || 'あなた').trim();
    const listA: any[] = Array.isArray(userATracks) ? userATracks : [];

    const cleanFriend = String(friendUsername || '').trim();
    const accounts = helpers.getAccounts();
    const matchedFriend = cleanFriend
      ? accounts.find((a) => a.username.toLowerCase() === cleanFriend.toLowerCase())
      : null;

    const nameB = matchedFriend?.username || cleanFriend || String(userBName || 'フレンド').trim();
    const libB = matchedFriend?.syncedLibrary;
    const listB: any[] = libB
      ? [...(libB.likedTracks || []), ...(libB.recentTracks || [])]
      : [];

    if (listA.length === 0 && listB.length === 0) {
      return res.status(400).json({ error: 'ブレンド元の再生履歴・お気に入り楽曲が不足しています' });
    }

    // Compute real artist/track overlap compatibility score
    const artistsA = new Set(
      listA.map((t) => normalizeArtistName(String(t?.artist || '')).toLowerCase()).filter(Boolean)
    );
    const artistsB = new Set(
      listB.map((t) => normalizeArtistName(String(t?.artist || '')).toLowerCase()).filter(Boolean)
    );

    const sharedArtists: string[] = [];
    for (const art of artistsA) {
      if (artistsB.has(art)) {
        sharedArtists.push(art);
      }
    }

    const idsA = new Set(listA.map((t) => t?.id).filter(Boolean));
    const sharedTracksCount = listB.filter((t) => t?.id && idsA.has(t.id)).length;

    let tasteMatchPercent = 68;
    if (artistsA.size > 0 && artistsB.size > 0) {
      const unionSize = new Set([...artistsA, ...artistsB]).size;
      const overlapRatio = (sharedArtists.length + sharedTracksCount * 0.5) / Math.max(1, unionSize);
      tasteMatchPercent = Math.min(99, Math.max(52, Math.round(58 + overlapRatio * 90)));
    } else if (!matchedFriend) {
      // If friend hasn't synced yet, use active community tracks from other accounts for genuine Blend
      const otherAccounts = accounts.filter(
        (a) => a.username.toLowerCase() !== nameA.toLowerCase() && a.syncedLibrary
      );
      for (const acc of otherAccounts.slice(0, 3)) {
        const pool = [
          ...(acc.syncedLibrary?.likedTracks || []),
          ...(acc.syncedLibrary?.recentTracks || []),
        ];
        listB.push(...pool.slice(0, 8));
      }
    }

    // Interleave tracks from User A and User B with attribution
    const blended: any[] = [];
    const seenIds = new Set<string>();
    const maxLoops = Math.max(listA.length, listB.length, 1);

    for (let i = 0; i < maxLoops && blended.length < 24; i++) {
      const aTrack = listA[i];
      if (aTrack?.id && !seenIds.has(aTrack.id)) {
        seenIds.add(aTrack.id);
        blended.push({ ...aTrack, addedBy: nameA });
      }
      const bTrack = listB[i];
      if (bTrack?.id && !seenIds.has(bTrack.id)) {
        seenIds.add(bTrack.id);
        blended.push({ ...bTrack, addedBy: nameB });
      }
    }

    res.json({
      success: true,
      blendTitle: `${nameA} × ${nameB} Blend`,
      userA: nameA,
      userB: nameB,
      tasteMatchPercent,
      sharedArtistsCount: sharedArtists.length,
      friendFoundInCloud: Boolean(matchedFriend),
      tracks: blended,
    });
  });
}
