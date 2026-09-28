import { Game } from './game/Game';
import { loadSettings } from './game/Settings';
import { Hud } from './ui/Hud';
import { installTestApi } from './debug/testApi';
import { runBenchmark } from './debug/bench';

function boot(): void {
  const canvas = document.getElementById('game') as HTMLCanvasElement;
  const uiRoot = document.getElementById('ui')!;
  const q = new URLSearchParams(location.search);
  const bench = q.has('bench');
  const test = q.has('test') || bench;
  const settings = loadSettings();
  const workers = q.has('workers')
    ? Math.max(1, Number(q.get('workers')))
    : Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 4) - 1));
  let game: Game;
  try {
    game = new Game(canvas, { settings, test, workers });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    uiRoot.innerHTML = `<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;padding:24px;color:#fff;background:#200;pointer-events:auto;white-space:pre-wrap;font:12px monospace">HYPERCRAFT failed to start:\n\n${msg.replace(/</g, '&lt;')}</div>`;
    console.error(err);
    return;
  }
  const hud = new Hud(uiRoot, game);
  game.message = (t) => hud.showMessage(t);
  let lastHud = performance.now();
  game.onFrame = () => {
    const now = performance.now();
    hud.update((now - lastHud) / 1000);
    lastHud = now;
  };

  const setPaused = (p: boolean) => {
    game.paused = p;
    game.input.enabled = !p;
    hud.setMenuVisible(p);
  };
  if (test) {
    setPaused(false);
  } else {
    setPaused(true);
    const play = () => {
      game.input.requestLock();
      setPaused(false);
    };
    hud.menu.addEventListener('click', play);
    document.addEventListener('pointerlockchange', () => {
      if (document.pointerLockElement !== canvas) setPaused(true);
    });
  }
  installTestApi(game);
  game.start();
  if (bench) {
    const overlay = document.createElement('div');
    uiRoot.appendChild(overlay);
    void runBenchmark(game, overlay);
  }
}

boot();
