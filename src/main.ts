// Boot: title screen (with a live 4D demo world behind it) -> world list / create world ->
// game. Starting or leaving a world reloads the page (?world=<id>), which keeps GPU and
// worker lifetimes simple. ?test / ?bench start an ephemeral world directly.

import { Game } from './game/Game';
import { loadSettings, type Settings } from './game/Settings';
import { Hud } from './ui/Hud';
import { InventoryScreen } from './ui/InventoryScreen';
import { AdvancementsScreen } from './ui/AdvancementsScreen';
import { IREG } from './content/itemRegistry';
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

/** Session key carrying a test world across a realm trip (the page reloads). */
const TRAVEL_KEY = 'hypercraft.travel';

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

// iPad/iOS Safari: block pinch-zoom gestures and double-tap zoom (the game handles every
// touch itself; Safari ignores user-scalable=no, so this has to be done in script too).
for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) {
  document.addEventListener(ev, (e) => e.preventDefault(), { passive: false });
}
document.addEventListener('dblclick', (e) => e.preventDefault(), { passive: false });
let lastTouchEnd = 0;
document.addEventListener(
  'touchend',
  (e) => {
    const now = performance.now();
    const t = e.target as HTMLElement | null;
    const typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT');
    // Buttons opt out of double-tap zoom in CSS (touch-action), and blocking their touchend
    // would swallow the click of a quick second tap on another button.
    const button = t?.closest?.('button') ?? null;
    if (!typing && !button && now - lastTouchEnd < 350) e.preventDefault();
    lastTouchEnd = now;
  },
  { passive: false },
);
document.addEventListener(
  'touchmove',
  (e) => {
    if (e.touches.length > 1) e.preventDefault(); // no pinch zoom
  },
  { passive: false },
);

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
    const realm = test && q.get('realm') && !info.state ? q.get('realm')! : undefined;
    game = new Game(canvas, { settings, test, workers: workerCount(), world: info, persistence, realm });
  } catch (err) {
    fail(err);
    return null;
  }
  const hud = new Hud(uiRoot, game);
  const menus = new Menus(uiRoot);
  const invScreen = new InventoryScreen(uiRoot, game);
  const advScreen = new AdvancementsScreen(uiRoot, game);
  game.message = (t) => hud.showMessage(t);
  // Realm travel (portals, respawning on the Surface): save, then reload into the new state.
  game.onTravel = (state) => {
    void (async () => {
      if (persistence) {
        await game.saveAll(true);
        info.state = state;
        persistence.info.state = state;
        await persistence.saveMeta();
        await persistence.flush();
      } else {
        info.state = state;
        sessionStorage.setItem(test ? TRAVEL_KEY : 'hypercraft.ephemeral', JSON.stringify(info));
      }
      location.reload();
    })();
  };
  game.onPickup = (id, n) => hud.showMessage(`+${n} ${IREG.displayName(id)}`);
  let lastHud = performance.now();
  game.onFrame = () => {
    const now = performance.now();
    const dt = (now - lastHud) / 1000;
    hud.update(dt);
    invScreen.update(dt);
    if (touch.isVisible) touch.update({ creative: game.player.mode === 'creative' || game.player.mode === 'spectator', onMob: game.targetMob !== null, nightVision: game.nightVisionOn });
    lastHud = now;
  };
  const touch = new TouchControls(uiRoot, game.input, {
    onPause: () => pause(),
    onInventory: () => game.onOpenScreen?.({ kind: 'inventory' }),
    onAdvancements: () => game.onOpenAdvancements?.(),
    onToggleFly: () => {
      if (game.player.mode === 'creative' || game.player.mode === 'spectator') game.player.flying = !game.player.flying;
    },
    onToggleNightVision: () => game.toggleNightVision(),
  });
  const usingTouch = () => touchWanted(settings);
  // Test worlds hide the touch controls unless ?touch=1 (e2e tests of the touch UI).
  const showTouchInTest = !test || q.has('touch');
  game.touchMode = usingTouch();
  // Inventory / crafting / chest / furnace screens: the world keeps running, player input stops.
  game.onOpenScreen = (r) => {
    if (game.paused || invScreen.isOpen || advScreen.isOpen || game.vitals.dead) return;
    game.input.enabled = false;
    touch.setVisible(false);
    invScreen.open(r);
    if (document.pointerLockElement) document.exitPointerLock();
  };
  // The advancements screen (L): the same dance as the inventory.
  game.onOpenAdvancements = () => {
    if (game.paused || invScreen.isOpen || advScreen.isOpen || game.vitals.dead) return;
    game.input.enabled = false;
    touch.setVisible(false);
    advScreen.open();
    if (document.pointerLockElement) document.exitPointerLock();
  };
  advScreen.onClose = () => {
    game.input.clearPressed();
    if (game.paused || game.vitals.dead) return;
    game.input.enabled = true;
    touch.setVisible(usingTouch() && showTouchInTest);
    if (!usingTouch() && !test) game.input.requestLock();
  };
  invScreen.onClose = () => {
    game.input.clearPressed();
    if (game.paused || game.vitals.dead) return;
    game.input.enabled = true;
    touch.setVisible(usingTouch() && showTouchInTest);
    if (!usingTouch() && !test) game.input.requestLock();
  };
  const setPaused = (p: boolean) => {
    game.paused = p;
    game.input.enabled = !p;
    touch.setVisible(!p && usingTouch() && showTouchInTest);
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
  // Death: the world keeps running behind the death screen; input stops until respawn.
  game.onDeath = (cause) => {
    if (invScreen.isOpen) invScreen.close();
    game.input.enabled = false;
    touch.setVisible(false);
    if (document.pointerLockElement) document.exitPointerLock();
    menus.death({
      cause,
      hardcore: info.hardcore,
      respawn: () => {
        game.respawn();
        game.input.clearPressed();
        menus.hide();
        if (game.paused) return;
        game.input.enabled = true;
        touch.setVisible(usingTouch() && showTouchInTest);
        if (!usingTouch() && !test) game.input.requestLock();
      },
      quit: async () => {
        await game.saveAll();
        location.search = '';
      },
    });
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
          game.touchMode = usingTouch();
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
      if (document.pointerLockElement !== canvas && !usingTouch() && !game.paused && !invScreen.isOpen && !game.vitals.dead) pause();
    });
  }
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Escape' && usingTouch() && !game.paused && !invScreen.isOpen && !game.vitals.dead) pause();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void game.saveAll();
  });
  window.addEventListener('beforeunload', () => void game.saveAll());
  installTestApi(game, invScreen);
  game.start();
  return game;
}

async function boot(): Promise<void> {
  const settings = loadSettings();
  const bench = q.has('bench');
  const test = q.has('test') || bench;
  if (test) {
    // Deterministic screenshots: no ambient particles unless asked for (?particles=1).
    if (!q.has('particles')) settings.particles = 'off';
    if (q.has('touch')) settings.touch = 'on';
    // A realm trip in a test world reloads the page with the world carried in session storage.
    const carried = sessionStorage.getItem(TRAVEL_KEY);
    if (carried) sessionStorage.removeItem(TRAVEL_KEY);
    const info = carried ? (JSON.parse(carried) as WorldInfo) : ephemeralWorld(q.get('seed') ?? 'hypercraft', 'creative');
    const game = startGame(info, null, settings, true);
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
