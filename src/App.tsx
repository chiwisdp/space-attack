import { useCallback, useEffect, useRef, useState } from 'react';
import { Crosshair, Heart, Keyboard, MoveHorizontal, Play, RotateCcw, Shield, Zap } from 'lucide-react';

const W = 960, H = 600;
type Mode = 'start' | 'playing' | 'countdown' | 'over';
type EnemyKind = 'scout' | 'fighter' | 'tank' | 'weaver' | 'special' | 'boss';
type Enemy = { x: number; y: number; w: number; h: number; hp: number; maxHp: number; kind: EnemyKind; phase: number; baseX: number; baseY: number; fire: number; row: number; state: 'formation' | 'diving' | 'returning'; diveTime: number; diveStartX: number; diveStartY: number; diveTargetX: number; returnFromX: number; returnFromY: number; spawnFx: number };
type Shot = { x: number; y: number; vx: number; vy: number; r: number; side: 'player' | 'enemy'; color: string; damage: number };
type Particle = { x: number; y: number; vx: number; vy: number; life: number; max: number; color: string; size: number };
type Game = { shipX: number; hp: number; bombs: number; score: number; level: number; enemies: Enemy[]; shots: Shot[]; particles: Particle[]; stars: { x: number; y: number; z: number }[]; lastShot: number; elapsed: number; invuln: number; bombFlash: number; hitFlash: number; shake: number; shakePower: number; spawnSpecial: boolean; lastHud: number; countdown: number; specialTimer: number; diveTimer: number; rowKinds: EnemyKind[]; rowRefilled: boolean[] };

const makeGame = (): Game => ({ shipX: W / 2, hp: 100, bombs: 3, score: 0, level: 1, enemies: [], shots: [], particles: [], stars: Array.from({ length: 105 }, () => ({ x: Math.random() * W, y: Math.random() * H, z: .35 + Math.random() * 1.5 })), lastShot: 0, elapsed: 0, invuln: 0, bombFlash: 0, hitFlash: 0, shake: 0, shakePower: 0, spawnSpecial: false, lastHud: 0, countdown: 10, specialTimer: 0, diveTimer: 2 + Math.random() * 3, rowKinds: [], rowRefilled: [] });
const fmt = (n: number) => n.toString().padStart(6, '0');

function formation(g: Game) {
  const bossRound = g.level % 3 === 0;
  const rows = Math.min(g.level, 4);
  g.enemies = [];
  const introduced: EnemyKind[] = [];
  if (g.level >= 4) introduced.push('fighter');
  if (g.level >= 7) introduced.push('tank');
  if (g.level >= 10) introduced.push('weaver');
  g.rowKinds = Array.from({ length: rows }, (_, row) => introduced[row] ?? 'scout');
  g.rowRefilled = Array(rows).fill(false);
  for (let row = 0; row < rows; row++) spawnFormationRow(g, row, false);
  if (bossRound) g.enemies.push({ x: W / 2 - 78, y: 104, w: 156, h: 96, hp: 42 + g.level * 5, maxHp: 42 + g.level * 5, kind: 'boss', phase: Math.random() * 6, baseX: W / 2 - 78, baseY: 104, fire: 2.2, row: -1, state: 'formation', diveTime: 0, diveStartX: 0, diveStartY: 0, diveTargetX: 0, returnFromX: 0, returnFromY: 0, spawnFx: .65 });
  g.spawnSpecial = g.level > 1 && Math.random() < .58;
  g.diveTimer = 2 + Math.random() * 3;
}

function spawnFormationRow(g: Game, row: number, reinforcement: boolean) {
  const cols = 6, gapX = 90, gapY = 56, left = W / 2 - ((cols - 1) * gapX) / 2, bossRound = g.level % 3 === 0;
  const rowType = g.rowKinds[row], threshold = rowType === 'fighter' ? 4 : rowType === 'tank' ? 7 : rowType === 'weaver' ? 10 : Infinity;
  const scaledRoleCount = rowType === 'fighter' || rowType === 'tank' ? Math.min(cols, 3 + Math.max(0, g.level - threshold) * 2 + (reinforcement ? 2 : 0)) : rowType === 'weaver' ? 3 : cols;
  for (let col = 0; col < cols; col++) {
    const kind: EnemyKind = col < scaledRoleCount ? rowType : 'scout';
    const hp = (kind === 'tank' ? 3 : kind === 'fighter' || kind === 'weaver' ? 2 : 1) + Math.floor((g.level - 1) / 5);
    const x = left + col * gapX, y = (bossRound ? 220 : 78) + row * (bossRound ? 48 : gapY);
    g.enemies.push({ x, y, w: kind === 'tank' ? 40 : kind === 'weaver' ? 36 : 32, h: 28, hp, maxHp: hp, kind, phase: Math.random() * 6, baseX: x, baseY: y, fire: row === 0 ? 3.4 + Math.random() * 2.3 : 1.5 + Math.random() * 2, row, state: 'formation', diveTime: 0, diveStartX: x, diveStartY: y, diveTargetX: x, returnFromX: x, returnFromY: y, spawnFx: reinforcement ? .5 : .65 });
  }
}

function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null), gameRef = useRef<Game>(makeGame()), keys = useRef(new Set<string>()), modeRef = useRef<Mode>('start'), rafRef = useRef(0), lastRef = useRef(0);
  const [mode, setModeState] = useState<Mode>('start');
  const [hud, setHud] = useState({ score: 0, level: 1, hp: 100, bombs: 3, countdown: 10 });
  const setMode = (next: Mode) => { modeRef.current = next; setModeState(next); };

  const start = useCallback(() => {
    const g = makeGame(); gameRef.current = g; keys.current.clear(); g.countdown = 10; g.specialTimer = 7 + Math.random() * 13; formation(g); setHud({ score: 0, level: 1, hp: 100, bombs: 3, countdown: 10 }); setMode('playing');
  }, []);

  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      if (['ArrowLeft', 'ArrowRight', ' ', 'Shift', 'ArrowUp', 'ArrowDown'].includes(e.key)) e.preventDefault();
      keys.current.add(e.key.toLowerCase());
      if (e.key === ' ' && modeRef.current === 'start') start();
      if (e.key.toLowerCase() === 'r' && modeRef.current === 'over') start();
      if (e.key === 'Shift' && !e.repeat && modeRef.current === 'playing') {
        const g = gameRef.current;
        if (g.bombs > 0) { g.bombs--; g.bombFlash = .6; g.shake = .46; g.shakePower = 10; burst(g, g.shipX, 490, '#ffcc66', 60); for (const enemy of [...g.enemies]) { const dx = enemy.x + enemy.w / 2 - g.shipX; if (Math.abs(dx) < 265) { enemy.hp -= enemy.kind === 'boss' ? 7 : enemy.kind === 'tank' ? 2 : 3; if (enemy.hp <= 0) killEnemy(g, enemy); } } }
      }
    };
    const onUp = (e: KeyboardEvent) => keys.current.delete(e.key.toLowerCase());
    window.addEventListener('keydown', onDown); window.addEventListener('keyup', onUp);
    return () => { window.removeEventListener('keydown', onDown); window.removeEventListener('keyup', onUp); };
  }, [start]);

  useEffect(() => {
    const canvas = canvasRef.current!, ctx = canvas.getContext('2d')!;
    const draw = (now: number) => {
      rafRef.current = requestAnimationFrame(draw);
      const dt = Math.min((now - (lastRef.current || now)) / 1000, .04); lastRef.current = now;
      const g = gameRef.current, modeNow = modeRef.current;
      updateStars(g, dt); g.particles.forEach(p => { p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; }); g.particles = g.particles.filter(p => p.life > 0);
      if (g.bombFlash > 0) g.bombFlash = Math.max(0, g.bombFlash - dt);
      if (g.shake > 0) g.shake = Math.max(0, g.shake - dt);
      if (g.hitFlash > 0) g.hitFlash = Math.max(0, g.hitFlash - dt);
      if (modeNow === 'playing') updateGame(g, dt, now, keys.current, setMode);
      if (modeNow === 'countdown') { g.countdown -= dt; if (g.countdown <= 0) { g.level++; g.specialTimer = 7 + Math.random() * 13; formation(g); setMode('playing'); } }
      if (now - g.lastHud > 90) { g.lastHud = now; setHud({ score: g.score, level: g.level, hp: g.hp, bombs: g.bombs, countdown: Math.ceil(g.countdown) }); }
      render(ctx, g, modeNow, g.countdown);
    };
    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  const barColor = hud.hp > 55 ? '#48e0b0' : hud.hp > 28 ? '#ffca66' : '#ff637e';
  return <main className="page-shell">
    <header className="topbar"><a className="brand" href="#top" aria-label="Space Attack home">SPACE ATTACK</a></header>
    <section className="game-layout" aria-label="Space Attack arcade game">
      <div className="game-column">
        <div className="hud">
          <div className="hud-cell score-cell"><span className="eyebrow">SCORE</span><span className="hud-number">{fmt(hud.score)}</span></div>
          <div className="hud-cell level-cell"><span className="eyebrow">WAVE</span><span className="hud-number level-number">{hud.level.toString().padStart(2, '0')}<span className="level-slash">/ ∞</span></span></div>
          <div className="hud-cell health-cell"><span className="eyebrow"><Heart size={11}/> HULL INTEGRITY <b>{hud.hp}%</b></span><div className="health-track"><div className="health-fill" style={{ width: `${hud.hp}%`, background: barColor }} /></div></div>
          <div className="hud-cell bomb-cell"><span className="eyebrow">PULSE BOMBS</span><span className="bomb-icons">{[0, 1, 2].map(i => <span key={i} className={i < hud.bombs ? 'bomb-pip' : 'bomb-pip empty'}>✳</span>)}</span></div>
        </div>
        <div className="canvas-frame"><div className="canvas-topline"><span><span className="tiny-led"/> LIVE FEED</span><span>EARTH ORBIT&nbsp; · &nbsp;45.2° N</span></div><canvas ref={canvasRef} width={W} height={H} aria-label="Space shooter game play area"/><div className="canvas-bottomline"><span>DEFENSE GRID <b>ACTIVE</b></span><span>THREAT LEVEL <b>{String(Math.min(hud.level * 10, 99)).padStart(2, '0')}</b></span></div>
          {mode === 'start' && <div className="overlay"><div className="intro-card"><span className="overline"><span className="tiny-led"/> INCOMING TRANSMISSION</span><h1>THEY'RE<br/><span>BACK.</span></h1><p className="intro-copy">The frontier is falling. Take the controls and hold the line.</p><div className="key-guide"><span><kbd>←</kbd><kbd>→</kbd><span>or</span><kbd>A</kbd><kbd>D</kbd><i>MOVE</i></span><span><kbd className="wide-key">SPACE</kbd><i>FIRE</i><kbd className="shift-key">SHIFT</kbd><i>PULSE BOMB</i></span></div><button className="primary-button" onClick={start}><Play size={15} fill="currentColor"/> START MISSION <span className="button-arrow">↗</span></button><span className="start-hint">OR PRESS SPACE TO DEPLOY</span></div><span className="overlay-coordinate">MISSION 001&nbsp; / &nbsp;SOL SYSTEM</span></div>}
          {mode === 'countdown' && <div className="countdown-overlay"><span className="overline"><span className="tiny-led"/> SECTOR SECURED</span><strong>{String(hud.countdown).padStart(2, '0')}<span>s</span></strong><span className="countdown-caption">NEXT WAVE INBOUND</span><span className="countdown-level">PREPARE FOR WAVE {String(hud.level + 1).padStart(2, '0')}</span></div>}
          {mode === 'over' && <div className="overlay"><div className="intro-card gameover-card"><span className="overline danger"><span className="danger-dot"/> SIGNAL LOST</span><h1>MISSION<br/><span>FAILED.</span></h1><p className="intro-copy">The frontier went quiet. Your run ends here.</p><div className="final-stats"><span>FINAL SCORE <b>{fmt(hud.score)}</b></span><span>WAVE REACHED <b>{String(hud.level).padStart(2, '0')}</b></span></div><button className="primary-button" onClick={start}><RotateCcw size={15}/> RUN IT BACK <span className="button-arrow">↗</span></button><span className="start-hint">OR PRESS R TO RESTART</span></div><span className="overlay-coordinate">CONNECTION TERMINATED</span></div>}
        </div>
        <div className="footer-note"><span>✳ &nbsp;PROTECT HOME AT ALL COSTS</span><span>BEST RUN&nbsp; <b>{fmt(Number(localStorage.getItem('starfall-best') || 0))}</b></span></div>
      </div>
      <aside className="side-panel"><div className="mission-block"><span className="eyebrow">YOUR MISSION</span><h2>One ship.<br/>One last stand.</h2><p>They're coming in waves. Keep firing, keep moving, and don't let a single one through.</p></div><div className="divider"/><div className="controls-block"><span className="eyebrow">FLIGHT CONTROLS</span><div className="control-row"><span className="control-icon"><MoveHorizontal size={17}/></span><span>Move ship</span><span className="control-keys"><kbd>←</kbd><kbd>→</kbd><small>or</small><kbd>A</kbd><kbd>D</kbd></span></div><div className="control-row"><span className="control-icon"><Crosshair size={17}/></span><span>Fire lasers</span><span className="control-keys"><kbd className="wide-key">SPACE</kbd></span></div><div className="control-row"><span className="control-icon bomb-icon"><Zap size={17}/></span><span>Pulse bomb</span><span className="control-keys"><kbd className="shift-key">SHIFT</kbd></span></div></div><div className="tip-card"><div className="tip-icon"><Shield size={17}/></div><div><span className="eyebrow">FIELD INTEL</span><p>Take out <b>golden scouts</b> to earn extra pulse bombs. You won't see one in every wave.</p></div></div><div className="side-bottom"><Keyboard size={14}/><span>BUILT FOR KEYBOARD</span><span className="side-bottom-rule"/></div></aside>
    </section><footer className="site-footer"><span>SPACE ATTACK DEFENSE INITIATIVE</span><span>MADE FOR THE LAST LIGHT &nbsp;✳</span></footer>
  </main>;
}

function updateStars(g: Game, dt: number) { for (const s of g.stars) { s.y += (9 + s.z * 29) * dt; if (s.y > H) { s.y = 0; s.x = Math.random() * W; } } }
function burst(g: Game, x: number, y: number, color: string, amount: number) { for (let i = 0; i < amount; i++) { const a = Math.random() * Math.PI * 2, speed = 35 + Math.random() * 230; g.particles.push({ x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, life: .3 + Math.random() * .7, max: 1, color, size: 1 + Math.random() * 3 }); } }
function killEnemy(g: Game, enemy: Enemy) { if (!g.enemies.includes(enemy)) return; g.enemies.splice(g.enemies.indexOf(enemy), 1); const color = enemy.kind === 'special' ? '#ffd16e' : enemy.kind === 'boss' ? '#ff6785' : enemy.kind === 'tank' ? '#f59c6b' : '#70d8e7'; burst(g, enemy.x + enemy.w / 2, enemy.y + enemy.h / 2, color, enemy.kind === 'boss' ? 60 : 18); g.score += enemy.kind === 'special' ? 350 : enemy.kind === 'boss' ? 1200 : enemy.kind === 'tank' ? 180 : enemy.kind === 'fighter' ? 120 : 80; if (enemy.kind === 'special') g.bombs = Math.min(3, g.bombs + 1); if (enemy.kind === 'boss') g.hp = Math.min(100, g.hp + 12); }
function updateGame(g: Game, dt: number, now: number, keys: Set<string>, setMode: (m: Mode) => void) {
  g.elapsed += dt; const movingLeft = keys.has('arrowleft') || keys.has('a'), movingRight = keys.has('arrowright') || keys.has('d'); g.shipX = Math.max(29, Math.min(W - 29, g.shipX + ((movingRight ? 1 : 0) - (movingLeft ? 1 : 0)) * 390 * dt));
  if (keys.has(' ') && now - g.lastShot > 205) { g.shots.push({ x: g.shipX - 8, y: 500, vx: 0, vy: -650, r: 3, side: 'player', color: '#67f4d2', damage: 1 }, { x: g.shipX + 8, y: 500, vx: 0, vy: -650, r: 3, side: 'player', color: '#67f4d2', damage: 1 }); g.lastShot = now; }
  g.diveTimer -= dt;
  if (g.diveTimer <= 0) {
    const activeDivers = g.enemies.filter(e => e.state === 'diving').length;
    const candidates = g.enemies.filter(e => e.kind !== 'special' && e.kind !== 'boss' && e.state === 'formation');
    if (activeDivers < 3 && candidates.length > 0) {
      const diver = candidates[Math.floor(Math.random() * candidates.length)];
      diver.state = 'diving'; diver.diveTime = 0; diver.diveStartX = diver.x; diver.diveStartY = diver.y; diver.diveTargetX = g.shipX; diver.fire = .25 + Math.random() * .3;
      diver.phase = Math.random() * Math.PI * 2;
      g.diveTimer = 2 + Math.random() * 3;
    } else g.diveTimer = .3;
  }
  for (const e of [...g.enemies]) {
    e.spawnFx = Math.max(0, e.spawnFx - dt);
    e.phase += dt * (e.kind === 'boss' ? .9 : 1.1 + g.level * .03);
    if (e.kind === 'boss') { e.x = W / 2 - e.w / 2 + Math.sin(e.phase) * 285; e.y = 85 + Math.sin(e.phase * 2.2) * 19; e.fire -= dt; if (e.fire <= 0) { const pattern = Math.floor(g.elapsed * 1.2) % 3; if (pattern === 0) { for (const d of [-.25, -.125, 0, .125, .25]) g.shots.push({ x: e.x + e.w / 2, y: e.y + e.h, vx: Math.sin(d * Math.PI) * 120, vy: 135 + g.level * 2, r: 6, side: 'enemy', color: '#ff6380', damage: 12 }); } else { for (const side of [-1, 1]) g.shots.push({ x: e.x + (side === -1 ? 12 : e.w - 12), y: e.y + e.h, vx: side * 70, vy: 155, r: 5, side: 'enemy', color: '#ff8b78', damage: 10 }); } e.fire = Math.max(.8, 1.5 - g.level * .025); } }
    else if (e.kind === 'special') { e.x += 115 * dt; e.y = e.baseY + Math.sin(e.phase * 2) * 14; if (e.x > W + 55) g.enemies.splice(g.enemies.indexOf(e), 1); }
    else {
      if (e.state === 'diving') {
        e.diveTime += dt; const t = e.diveTime;
        if (e.kind === 'scout') { e.x = e.diveStartX + (Math.sin(t * 3.4) - Math.sin(0)) * 27; e.y = e.diveStartY + 205 * t; }
        else if (e.kind === 'fighter') { const p = Math.min(1, t / 1.35), ease = p * p * (3 - 2 * p); e.x = e.diveStartX + (e.diveTargetX - e.diveStartX) * ease + Math.sin(t * 2.8) * 17; e.y = e.diveStartY + 235 * t; }
        else if (e.kind === 'tank') { e.x = e.diveStartX + (Math.sin(t * 1.65 + e.phase) - Math.sin(e.phase)) * 15; e.y = e.diveStartY + 132 * t; }
        else { e.x = e.diveStartX + Math.sin(t * 6.2) * 74; e.y = e.diveStartY + 195 * t; }
        if (e.y + e.h >= 475) { e.state = 'returning'; e.diveTime = 0; e.returnFromX = e.x; e.returnFromY = e.y; e.fire = e.row === 0 ? 3.5 + Math.random() * 2 : 2 + Math.random() * 1.5; }
      } else if (e.state === 'returning') {
        e.diveTime += dt; const duration = e.kind === 'tank' ? .95 : .72, p = Math.min(1, e.diveTime / duration), ease = p * p * (3 - 2 * p);
        e.x = e.returnFromX + (e.baseX - e.returnFromX) * ease; e.y = e.returnFromY + (e.baseY - e.returnFromY) * ease;
        if (p >= 1) { e.state = 'formation'; e.diveTime = 0; e.x = e.baseX; e.y = e.baseY; }
      } else { e.x = e.baseX + Math.sin(g.elapsed * (.48 + g.level * .025) + e.phase) * (14 + g.level * 2); e.y = e.baseY + Math.sin(g.elapsed * .8 + e.phase) * 5; }
      e.fire -= dt;
      if (e.fire <= 0) {
        const cx = e.x + e.w / 2, cy = e.y + e.h, scoutSpeed = Math.min(82 + g.level * 4, 132);
        if (e.kind === 'fighter') { const aim = Math.atan2(503 - cy, g.shipX - cx), speed = Math.min(108 + g.level * 4, 148); for (const offset of [-.09, .09]) g.shots.push({ x: cx, y: cy, vx: Math.cos(aim + offset) * speed, vy: Math.sin(aim + offset) * speed, r: 5, side: 'enemy', color: '#ffa36e', damage: 8 }); }
        else if (e.kind === 'tank') { const speed = Math.min(76 + g.level * 3, 112); for (const direction of [-1, 0, 1]) g.shots.push({ x: cx, y: cy, vx: direction * (42 + g.level * 2), vy: speed, r: 5.5, side: 'enemy', color: '#ff738b', damage: 9 }); }
        else if (e.kind === 'weaver') { const aim = Math.atan2(503 - cy, g.shipX - cx), speed = Math.min(62 + g.level * 2, 92); for (const offset of [-.32, -.16, 0, .16, .32]) g.shots.push({ x: cx, y: cy, vx: Math.cos(aim + offset) * speed, vy: Math.sin(aim + offset) * speed, r: 5, side: 'enemy', color: '#57dfc9', damage: 6 }); }
        else g.shots.push({ x: cx, y: cy, vx: 0, vy: scoutSpeed, r: 4, side: 'enemy', color: '#ba91ff', damage: 7 });
        e.fire = e.state === 'diving' ? .72 + Math.random() * .32 : e.row === 0 ? 4.2 + Math.random() * 2.2 : Math.max(1.7, 2.7 - g.level * .06) + Math.random() * .9;
      }
    }
  }
  if (g.spawnSpecial && g.specialTimer < 0) { const y = 62 + Math.random() * 35; g.enemies.push({ x: -50, y, w: 38, h: 24, hp: 1, maxHp: 1, kind: 'special', phase: 0, baseX: 0, baseY: y, fire: 99, row: -1, state: 'formation', diveTime: 0, diveStartX: 0, diveStartY: 0, diveTargetX: 0, returnFromX: 0, returnFromY: 0, spawnFx: .65 }); g.spawnSpecial = false; }
  if (g.spawnSpecial) { g.specialTimer -= dt; }
  for (const s of g.shots) { s.x += s.vx * dt; s.y += s.vy * dt; }
  const shipBox = { x: g.shipX - 17, y: 488, w: 34, h: 27 };
  for (const s of g.shots) if (s.side === 'player') { const e = g.enemies.find(e => s.x >= e.x - 3 && s.x <= e.x + e.w + 3 && s.y >= e.y - 3 && s.y <= e.y + e.h + 3); if (e) { e.hp -= s.damage; g.shake = .18; g.shakePower = 5; s.y = -30; if (e.hp <= 0) killEnemy(g, e); } }
  for (const s of g.shots) if (s.side === 'enemy' && g.invuln <= 0 && s.x >= shipBox.x && s.x <= shipBox.x + shipBox.w && s.y >= shipBox.y && s.y <= shipBox.y + shipBox.h) { g.hp = Math.max(0, g.hp - s.damage); g.invuln = .55; g.hitFlash = .28; g.shake = .28; g.shakePower = 6; s.y = H + 30; burst(g, g.shipX, 502, '#ff7685', 8); if (g.hp <= 0) { setMode('over'); return; } }
  if (g.level >= 5) for (let row = 0; row < g.rowKinds.length; row++) {
    if (!g.rowRefilled[row] && !g.enemies.some(enemy => enemy.row === row)) {
      g.rowRefilled[row] = true;
      spawnFormationRow(g, row, true);
    }
  }
  g.invuln = Math.max(0, g.invuln - dt); g.shots = g.shots.filter(s => s.y > -35 && s.y < H + 35 && s.x > -35 && s.x < W + 35);
  if (g.enemies.length === 0) { g.countdown = 10; setMode('countdown'); }
  if (g.score > Number(localStorage.getItem('starfall-best') || 0)) localStorage.setItem('starfall-best', String(g.score));
}

function render(ctx: CanvasRenderingContext2D, g: Game, mode: Mode, countdown: number) {
  ctx.clearRect(0, 0, W, H); ctx.fillStyle = '#070b17'; ctx.fillRect(0, 0, W, H);
  ctx.save();
  const shakeFade = g.shake > 0 ? Math.min(1, g.shake / .12) : 0;
  if (shakeFade > 0) ctx.translate((Math.random() - .5) * 2 * g.shakePower * shakeFade, (Math.random() - .5) * 2 * g.shakePower * shakeFade);
  const nebula = ctx.createRadialGradient(640, 170, 12, 640, 170, 440); nebula.addColorStop(0, 'rgba(29,48,89,.2)'); nebula.addColorStop(1, 'rgba(7,11,23,0)'); ctx.fillStyle = nebula; ctx.fillRect(0, 0, W, H);
  for (const s of g.stars) { ctx.globalAlpha = .24 + s.z * .42; ctx.fillStyle = '#d6e5ff'; ctx.fillRect(s.x, s.y, s.z * 1.3, s.z * 1.3); } ctx.globalAlpha = 1;
  ctx.strokeStyle = 'rgba(82,218,189,.18)'; ctx.setLineDash([3, 7]); ctx.beginPath(); ctx.moveTo(23, 475); ctx.lineTo(W - 23, 475); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle = 'rgba(255,104,132,.53)'; ctx.font = '9px "DM Mono", monospace'; ctx.fillText('BREACH LINE', 29, 468);
  for (const e of g.enemies) drawEnemy(ctx, e, g.elapsed);
  for (const s of g.shots) { ctx.fillStyle = s.color; if (s.side === 'player') { ctx.fillRect(Math.round(s.x / 2) * 2 - 2, Math.round(s.y / 2) * 2 - 12, 4, 14); ctx.fillStyle = '#d5fff5'; ctx.fillRect(Math.round(s.x / 2) * 2 - 1, Math.round(s.y / 2) * 2 - 10, 2, 8); } else { const size = Math.max(6, Math.round(s.r * 1.8)); ctx.fillRect(Math.round(s.x / 2) * 2 - size / 2, Math.round(s.y / 2) * 2 - size / 2, size, size); } }
  if (mode !== 'over') drawShip(ctx, g.shipX, 503, g.invuln > 0 && Math.floor(g.invuln * 18) % 2 === 0);
  for (const p of g.particles) { ctx.globalAlpha = Math.max(0, p.life / p.max); ctx.fillStyle = p.color; const size = Math.max(2, Math.round(p.size / 2) * 2); ctx.fillRect(Math.round(p.x / 2) * 2, Math.round(p.y / 2) * 2, size, size); } ctx.globalAlpha = 1;
  if (g.bombFlash > 0) { ctx.globalAlpha = g.bombFlash / .6 * .35; const grad = ctx.createRadialGradient(g.shipX, 490, 10, g.shipX, 490, 420); grad.addColorStop(0, '#fff2c1'); grad.addColorStop(.35, '#ffcf68'); grad.addColorStop(1, 'rgba(255,151,69,0)'); ctx.fillStyle = grad; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; }
  if (g.hitFlash > 0) { ctx.fillStyle = `rgba(255, 48, 70, ${.28 * g.hitFlash / .28})`; ctx.fillRect(0, 0, W, H); }
  ctx.fillStyle = 'rgba(1, 3, 13, .11)'; for (let y = 0; y < H; y += 4) ctx.fillRect(0, y, W, 1);
  ctx.fillStyle = 'rgba(156,183,226,.35)'; ctx.font = '9px "DM Mono", monospace'; ctx.fillText(`SYS // ORBITAL DEFENSE  ${String(Math.floor(g.elapsed)).padStart(3, '0')}`, 27, 34);
  if (mode === 'countdown') { ctx.fillStyle = '#ffcd70'; ctx.font = '500 10px "DM Mono", monospace'; ctx.textAlign = 'right'; ctx.fillText(`NEXT WAVE IN ${String(Math.ceil(countdown)).padStart(2, '0')}s`, W - 29, 34); ctx.textAlign = 'left'; }
  ctx.restore();
}
const PIXEL_SHAPES: Record<string, string[]> = {
  scout: ['..11..11', '.111111.', '11111111', '11.11.11', '11111111', '.11..11.', '..1..1..'],
  fighter: ['...11...', '..1111..', '.111111.', '11111111', '11.11.11', '..1111..', '.11..11.'],
  tank: ['11111111', '11111111', '11.11.11', '11111111', '11111111', '11....11', '11....11'],
  weaver: ['...11...', '..1111..', '.11..11.', '11.11.11', '.11..11.', '..1..1..'],
  special: ['..1111..', '.111111.', '11111111', '11111111', '..11..11'],
};

function drawPixelShape(ctx: CanvasRenderingContext2D, rows: string[], x: number, y: number, cell: number, body: string, highlight: string, shadow = '#182044') {
  const width = Math.max(...rows.map(row => row.length));
  rows.forEach((row, iy) => [...row].forEach((pixel, ix) => {
    if (pixel === '.') return;
    ctx.fillStyle = pixel === '2' ? highlight : pixel === '3' ? shadow : body;
    const inset = Math.floor((width - row.length) / 2);
    ctx.fillRect(x + (ix + inset) * cell, y + iy * cell, cell, cell);
  }));
  return { width: width * cell, height: rows.length * cell };
}

function drawShip(ctx: CanvasRenderingContext2D, x: number, y: number, blink: boolean) {
  if (blink) return;
  const rows = ['...11...', '..1111..', '.111111.', '11111111', '11111111', '.13..31.', '..1..1..', '...11...'];
  const left = Math.round(x / 4) * 4 - 16, top = Math.round(y / 4) * 4 - 16;
  drawPixelShape(ctx, rows, left, top, 4, '#36cbb8', '#e2fff7');
  ctx.fillStyle = '#ff9b54';
  ctx.fillRect(left + 12, top + 32, 4, 4 + Math.floor(Math.random() * 8));
  ctx.fillRect(left + 20, top + 32, 4, 4 + Math.floor(Math.random() * 8));
}

function drawEnemy(ctx: CanvasRenderingContext2D, e: Enemy, time: number) {
  const colors: Record<EnemyKind, [string, string]> = { scout: ['#9b84ed', '#e0d5ff'], fighter: ['#39c9d8', '#cffcff'], tank: ['#ee8656', '#ffe0a5'], weaver: ['#38cda9', '#c5ffe3'], special: ['#e5ad48', '#fff1a8'], boss: ['#ed5275', '#ffc0ca'] };
  const [body, highlight] = colors[e.kind];
  if (e.kind === 'boss') {
    const rows = ['........11111111........', '......111111111111......', '....1111111111111111....', '..11111111111111111111..', '111111111111111111111111', '111111111111111111111111', '.1111111111111111111111.', '..11111111111111111111..', '....1111111111111111....', '......1111..1111......', '.....111......111.....', '....11..........11....'];
    const { width } = drawPixelShape(ctx, rows, Math.round(e.x + e.w / 2 - 72), Math.round(e.y + e.h / 2 - 36), 6, body, highlight, '#531f45');
    ctx.fillStyle = '#140f28'; ctx.fillRect(e.x + e.w / 2 - 42, e.y + e.h / 2 - 4, 18, 12); ctx.fillRect(e.x + e.w / 2 + 24, e.y + e.h / 2 - 4, 18, 12);
    ctx.fillStyle = highlight; ctx.fillRect(e.x + e.w / 2 - 36, e.y + e.h / 2, 6, 6); ctx.fillRect(e.x + e.w / 2 + 30, e.y + e.h / 2, 6, 6);
    void width;
  } else {
    const rows = PIXEL_SHAPES[e.kind] ?? PIXEL_SHAPES.scout;
    const width = Math.max(...rows.map(row => row.length)) * 4, height = rows.length * 4;
    drawPixelShape(ctx, rows, Math.round((e.x + e.w / 2 - width / 2) / 4) * 4, Math.round((e.y + e.h / 2 - height / 2) / 4) * 4, 4, body, highlight, '#182044');
    if (e.kind === 'special') { ctx.fillStyle = '#fff4b5'; ctx.fillRect(e.x + 10, e.y + 8, 4, 4); ctx.fillRect(e.x + 24, e.y + 8, 4, 4); }
    else { ctx.fillStyle = '#16152d'; ctx.fillRect(e.x + 8, e.y + 10, 4, 4); ctx.fillRect(e.x + 20, e.y + 10, 4, 4); }
  }
  if (e.spawnFx > 0) {
    const strength = e.spawnFx / .65;
    ctx.globalAlpha = strength * .8;
    for (let i = 0; i < 4; i++) {
      const stripeY = e.y + ((i * 11 + Math.floor(time * 95)) % Math.max(12, e.h));
      ctx.fillStyle = i % 2 ? '#ff4fbd' : '#54fff2';
      ctx.fillRect(e.x - 5 + (i % 2 ? 7 : -4), stripeY, e.w + 4, 3);
    }
    ctx.globalAlpha = 1;
  }
  if (e.maxHp > 1) {
    const ww = e.kind === 'boss' ? 130 : 28, yy = e.kind === 'boss' ? e.y - 10 : e.y - 6;
    ctx.fillStyle = 'rgba(255,255,255,.18)'; ctx.fillRect(e.x + (e.w - ww) / 2, yy, ww, 3);
    ctx.fillStyle = body; ctx.fillRect(e.x + (e.w - ww) / 2, yy, ww * Math.max(0, e.hp / e.maxHp), 3);
  }
}

export default App;
