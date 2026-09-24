import './ui/base.css';
import './ui/fonts.css';
import './ui/ui.css';
import { App } from './core/App.js';
import { PHYSICS } from './config/physics.js';

// Safari ignores user-scalable=no; stop pinch-zoom gestures on the game itself.
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('dblclick', (e) => e.preventDefault(), { passive: false });

async function boot() {
  // Canvas-drawn textures (signs, banners) need the comic font ready.
  try {
    await Promise.race([
      Promise.all([document.fonts.load('64px Bangers'), document.fonts.load('700 20px "Comic Neue"')]),
      new Promise((r) => setTimeout(r, 2500)),
    ]);
  } catch {
    /* fall back to system fonts */
  }
  const app = new App({ canvas: document.getElementById('game'), uiRoot: document.getElementById('ui') });
  app.start();
  // Debug handle for automated verification + live tuning from the console.
  window.__INKTRACK__ = app;
  window.INKTRACK = { app, physics: PHYSICS };
}

boot();
