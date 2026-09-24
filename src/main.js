import './ui/base.css';
import { PHYSICS } from './config/physics.js';
import { Input } from './input/Input.js';
import { GameLoop } from './core/GameLoop.js';
import { Renderer } from './rendering/Renderer.js';
import { Stage } from './rendering/Stage.js';
import { Playground } from './race/Playground.js';

const canvas = document.getElementById('game');
const renderer = new Renderer(canvas);
const stage = new Stage(renderer);
const input = new Input();
const mode = new Playground({ stage, input });

const hud = document.getElementById('ui');
hud.style.cssText = 'position:fixed;left:12px;top:12px;font:bold 16px monospace;color:#111;background:#fff;border:3px solid #111;padding:6px 10px;pointer-events:none';

const loop = new GameLoop({
  tickRate: PHYSICS.tickRate,
  fixedUpdate: (dt) => mode.fixedUpdate(dt),
  frame: (dt, alpha) => {
    mode.frame(dt, alpha);
    const car = mode.car;
    const meter = '█'.repeat(Math.round(car.driftMeter * 10)).padEnd(10, '·');
    const info = renderer.info;
    hud.textContent = `${Math.round(Math.abs(car.speed) * 3.6)} km/h · drift [${meter}] · ${car.boosting ? 'BOOST ' : ''}${loop.fps.toFixed(0)} fps · ${info.calls} calls · ${(info.triangles / 1000).toFixed(1)}k tris`;
  },
});
loop.start();

// Debug handle for automated verification + live tuning from the console.
window.__INKTRACK__ = { mode, input, loop, renderer, stage, physics: PHYSICS };
window.INKTRACK = { physics: PHYSICS };
