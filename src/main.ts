// Boot: title screen (with a live 4D demo world behind it) -> world list / create world ->
// game. Starting or leaving a world reloads the page (?world=<id>), which keeps GPU and
// worker lifetimes simple. ?test / ?bench start an ephemeral world directly.

import { Game } from './game/Game';
import { loadSettings, type Settings } from './game/Settings';
import { Hud } from './ui/Hud';
import { Menus } from './ui/Menus';
import { installTestApi } from './debug/testApi';
import { runBenchmark } from './debug/bench';
import { TouchControls, isTouchDevice } from './input/Touch';
import { WorldStore } from './save/WorldStore';
import { Persistence } from './save/Persistence';
import { SAVE_VERSION, seedFromText, type WorldInfo } from './save/WorldInfo';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const uiRoot = document.getElementById('ui')!;
const q = new URLSearchParams(location.search);

function workerCount(): number {
  return q.has('workers') ? Math.max(1, Number(q.get('workers'))) : Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 4) - 1));
}

function ephemeralWorld(seedText: string, mode: WorldInfo['mode']): WorldInfo {
  return {
    id: 'ephemeral',
    name: 'Test world',
    seedText,
    seed: seedFromText(seedText),
    mode,
    difficulty: 'normal',
    hardcore: false,
    cheats: true,
    created: Date.now(),
    lastPlayed: Date.now(),
    version: SAVE_VERSION,
    palette: [],
  };
}

function fail(err: unknown): void {
  const msg = err instanceof Error ? err.message : String(err);
  uiRoot.innerHTML = `<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;padding:24px;color:#fff;background:#200;pointer-events:auto;white-space:pre-wrap;font:12px monospace">HYPERCRAFT failed to start:\n\n${msg.replace(/</g, '&lt;')}</div>`;
  console.error(err);
}

function touchWanted(s: Settings): boolean {
  return s.touch === 'on' || (s.touch === 'auto' && isTouchDevice());
}

function startGame(info: WorldInfo, persistence: Persistence | null, settings: Settings, test: boolean): Game | null {
  let game: Game;
  try {
    game = new Game(canvas, { settings, test, workers: workerCount(), world: info, persistence });
  } catch (err) {
    fail(err);
    return null;
  }
  const hud = new Hud(uiRoot, game);
  const menus = new Menus(uiRoot);
  game.message = (t) => hud.showMessage(t);
  let lastHud = performance.now();
  game.onFrame = () => {
    const now = performance.now();
    hud.update((now - lastHud) / 1000);
    lastHud = now;
  };
  const touch = new TouchControls(uiRoot, game.input, {
    onPause: () => pause(),
    onToggleFly: () => {
      if (game.player.mode === 'creative' || game.player.mode === 'spectator') game.player.flying = !game.player.flying;
    },
  });
  const usingTouch = () => touchWanted(settings);
  const setPaused = (p: boolean) => {
    game.paused = p;
    game.input.enabled = !p;
    touch.setVisible(!p && usingTouch() && !test);
    if (!p) menus.hide();
  };
  const resume = () => {
    if (!usingTouch() && !test) game.input.requestLock();
    setPaused(false);
  };
  const pause = () => {
    if (game.paused) return;
    setPaused(true);
    if (document.pointerLockElement) document.exitPointerLock();
    showPause();
  };
  const showPause = () =>
    menus.pause({
      worldName: info.name,
      seedText: info.seedText || String(info.seed),
      resume,
      settings: () =>
        menus.settings(settings, () => {
          game.applySettings();
          touch.sensitivity = settings.sensitivity;
        }, showPause),
      quit: async () => {
        await game.saveAll();
        location.search = '';
      },
      saveStatus: () => (persistence ? (persistence.lastSave ? `Last saved ${new Date(persistence.lastSave).toLocaleTimeString()}` : 'Autosaves every 30 s') : 'This world is not saved'),
    });

  if (test) setPaused(false);
  else {
    setPaused(true);
    menus.pause({
      worldName: info.name,
      seedText: info.seedText || String(info.seed),
      resume,
      settings: () => menus.settings(settings, () => game.applySettings(), showPause),
      quit: async () => {
        await game.saveAll();
        location.search = '';
      },
      saveStatus: () => (usingTouch() ? 'Tap Resume to start' : 'Click Resume to capture the mouse'),
    });
    document.addEventListener('pointerlockchange', () => {
      if (document.pointerLockElement !== canvas && !usingTouch() && !game.paused) pause();
    });
  }
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Escape' && usingTouch() && !game.paused) pause();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void game.saveAll();
  });
  window.addEventListener('beforeunload', () => void game.saveAll());
  installTestApi(game);
  game.start();
  return game;
}

async function boot(): Promise<void> {
  const settings = loadSettings();
  const bench = q.has('bench');
  const test = q.has('test') || bench;
  if (test) {
    const game = startGame(ephemeralWorld(q.get('seed') ?? 'hypercraft', 'creative'), null, settings, true);
    if (game && bench) {
      const overlay = document.createElement('div');
      uiRoot.appendChild(overlay);
      void runBenchmark(game, overlay);
    }
    return;
  }
  let store: WorldStore | null = null;
  try {
    store = await WorldStore.open();
  } catch (err) {
    console.warn('No persistent storage:', err);
  }
  const worldId = q.get('world');
  if (worldId) {
    let info = store ? await store.getWorld(worldId) : null;
    if (!info) {
      const eph = sessionStorage.getItem('hypercraft.ephemeral');
      if (eph) info = JSON.parse(eph) as WorldInfo;
    }
    if (info) {
      const persistence = store && info.id !== 'ephemeral' ? await Persistence.open(store, info, info.state?.realm ?? 'surface') : null;
      if (persistence) {
        info.lastPlayed = Date.now();
        void store!.putWorld(info);
      }
      startGame(info, persistence, settings, false);
      return;
    }
  }
  // Title screen with a live demo world behind it.
  let demo: Game | null = null;
  try {
    demo = new Game(canvas, { settings: { ...settings, renderDistance: Math.min(3, settings.renderDistance) }, test: false, workers: workerCount(), world: ephemeralWorld('hypercraft', 'spectator'), persistence: null, demo: true });
    demo.paused = true;
    demo.input.enabled = false;
    demo.start();
  } catch (err) {
    console.warn('demo world unavailable', err);
  }
  const menus = new Menus(uiRoot);
  menus.title({
    store,
    settings,
    play: (id) => {
      demo?.stop();
      location.search = `?world=${encodeURIComponent(id)}`;
    },
    onSettings: () => demo?.applySettings(),
  });
}

void boot();
