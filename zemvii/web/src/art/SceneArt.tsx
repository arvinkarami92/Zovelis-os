// Generative artwork. The demo world's "photos" and Zemvii's text-on-art
// posts are drawn from a scene name and a seed, so they are tiny to store,
// identical everywhere, and can be animated for Clips.

import { useId, useMemo, type ReactNode } from 'react';

type Rand = () => number;

function rng(seed: number): Rand {
  let a = (seed * 2654435761) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = <T,>(r: Rand, list: T[]): T => list[Math.floor(r() * list.length)];
const f = (n: number) => n.toFixed(1);

/** A ridge line by midpoint displacement, closed to the bottom of the frame. */
function ridge(r: Rand, base: number, amp: number, rough = 0.58): string {
  let pts = [base + (r() - 0.5) * amp, base + (r() - 0.5) * amp];
  let disp = amp;
  for (let i = 0; i < 5; i++) {
    const next: number[] = [];
    for (let j = 0; j < pts.length - 1; j++) next.push(pts[j], (pts[j] + pts[j + 1]) / 2 + (r() - 0.5) * disp);
    next.push(pts[pts.length - 1]);
    pts = next;
    disp *= rough;
  }
  const step = 440 / (pts.length - 1);
  return `M-20,430 ${pts.map((y, i) => `L${f(-20 + i * step)},${f(y)}`).join(' ')} L420,430 Z`;
}

function wave(phase: number, base: number, amp: number, length: number): string {
  let d = `M-400,430 L-400,${f(base)}`;
  for (let x = -400; x <= 800; x += 10) d += ` L${x},${f(base + Math.sin((x / length) * Math.PI * 2 + phase) * amp)}`;
  return `${d} L800,430 Z`;
}

interface Gradient {
  id: string;
  stops: string[];
}

function linear({ id, stops }: Gradient, vertical = true): ReactNode {
  return (
    <linearGradient id={id} x1="0" y1="0" x2={vertical ? '0' : '1'} y2={vertical ? '1' : '0'}>
      {stops.map((c, i) => (
        <stop key={i} offset={stops.length === 1 ? 0 : i / (stops.length - 1)} stopColor={c} />
      ))}
    </linearGradient>
  );
}

function stars(r: Rand, count: number, maxY: number, cls = 'anim-twinkle'): ReactNode {
  return (
    <g>
      {Array.from({ length: count }, (_, i) => (
        <circle
          key={i}
          className={i % 3 === 0 ? cls : undefined}
          style={i % 3 === 0 ? { animationDelay: `${f(r() * 4)}s` } : undefined}
          cx={f(r() * 400)}
          cy={f(r() * maxY)}
          r={f(0.4 + r() * r() * 1.6)}
          fill="#fff"
          opacity={f(0.35 + r() * 0.65)}
        />
      ))}
    </g>
  );
}

function sun(cx: number, cy: number, r: number, color: string, glowId: string, cls?: string): ReactNode {
  return (
    <g className={cls}>
      <circle cx={cx} cy={cy} r={r * 3.2} fill={`url(#${glowId})`} />
      <circle cx={cx} cy={cy} r={r} fill={color} />
    </g>
  );
}

function glow(id: string, color: string): ReactNode {
  return (
    <radialGradient id={id}>
      <stop offset="0" stopColor={color} stopOpacity="0.75" />
      <stop offset="1" stopColor={color} stopOpacity="0" />
    </radialGradient>
  );
}

function render(scene: string, seed: number, u: string): ReactNode {
  const r = rng(seed + scene.length * 997);
  const id = (name: string) => `${u}-${name}`;
  const url = (name: string) => `url(#${id(name)})`;

  switch (scene) {
    case 'mountains':
    case 'lake': {
      const palette = pick(r, [
        { sky: ['#2c3e6b', '#9b6f9e', '#f7b38a'], sun: '#ffe2b6', layers: ['#7a6797', '#55497c', '#35305e', '#1d1d3c'], water: ['#3a3a66', '#1a1b36'] },
        { sky: ['#5fa7dd', '#a9d4f2', '#eaf6ff'], sun: '#fffdf4', layers: ['#a9c2d6', '#7f9db4', '#56758d', '#304c60'], water: ['#5c86a6', '#294a63'] },
        { sky: ['#3b1f4a', '#a2496a', '#f39a6d'], sun: '#ffd47e', layers: ['#8d4d6d', '#633659', '#3e2445', '#1f1430'], water: ['#5a2c4c', '#1d1129'] },
        { sky: ['#8cc2ac', '#cfe3cf', '#f5f0d8'], sun: '#fff7df', layers: ['#7aa892', '#55836f', '#37604f', '#1f3d33'], water: ['#4f8270', '#203c33'] },
      ]);
      const horizon = scene === 'lake' ? 250 : 400;
      const layers = palette.layers.map((color, i) => ({ color, d: ridge(r, 150 + i * 46, 130 - i * 22) }));
      return (
        <>
          <defs>
            {linear({ id: id('sky'), stops: palette.sky })}
            {linear({ id: id('water'), stops: palette.water })}
            {glow(id('glow'), palette.sun)}
            <linearGradient id={id('mist')} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#fff" stopOpacity="0" />
              <stop offset="1" stopColor="#fff" stopOpacity="0.22" />
            </linearGradient>
          </defs>
          <rect width="400" height="400" fill={url('sky')} />
          {sun(120 + r() * 160, 120 + r() * 50, 18 + r() * 10, palette.sun, id('glow'), 'anim-rise')}
          <g className="anim-drift-slow" opacity="0.55">
            {Array.from({ length: 3 }, (_, i) => (
              <ellipse key={i} cx={f(r() * 400)} cy={f(60 + r() * 80)} rx={f(40 + r() * 50)} ry={f(6 + r() * 6)} fill="#fff" opacity="0.5" />
            ))}
          </g>
          {scene === 'lake' ? (
            <>
              <g transform={`translate(0 ${horizon - 400 + 160})`}>
                {layers.slice(0, 3).map((l, i) => (
                  <path key={i} d={l.d} fill={l.color} />
                ))}
              </g>
              <rect y={horizon} width="400" height={400 - horizon} fill={url('water')} />
              <g transform={`translate(0 ${2 * horizon}) scale(1 -1) translate(0 ${400 - 160 - horizon})`} opacity="0.35">
                {layers.slice(0, 3).map((l, i) => (
                  <path key={i} d={l.d} fill={l.color} />
                ))}
              </g>
              <g className="anim-shimmer">
                {Array.from({ length: 9 }, (_, i) => (
                  <rect key={i} x={f(150 + r() * 100 - i * 2)} y={f(horizon + 8 + i * 15)} width={f(30 + r() * 60)} height="2" rx="1" fill={palette.sun} opacity={f(0.5 - i * 0.04)} />
                ))}
              </g>
            </>
          ) : (
            <>
              {layers.map((l, i) => (
                <path key={i} d={l.d} fill={l.color} />
              ))}
              <rect y="250" width="400" height="150" fill={url('mist')} className="anim-breathe" />
            </>
          )}
        </>
      );
    }

    case 'ocean': {
      const palette = pick(r, [
        { sky: ['#89c9ef', '#f9dcc0'], sun: '#fff3d6', sea: ['#2e86b0', '#0d4a6b'] },
        { sky: ['#f5a77f', '#ffd9a8'], sun: '#fff0c4', sea: ['#3b6f9a', '#132f4f'] },
        { sky: ['#b6e2e6', '#f2f7f1'], sun: '#ffffff', sea: ['#3aa6a2', '#11555f'] },
      ]);
      return (
        <>
          <defs>
            {linear({ id: id('sky'), stops: palette.sky })}
            {linear({ id: id('sea'), stops: palette.sea })}
            {glow(id('glow'), palette.sun)}
          </defs>
          <rect width="400" height="400" fill={url('sky')} />
          {sun(200 + (r() - 0.5) * 160, 150 + r() * 40, 22, palette.sun, id('glow'), 'anim-rise')}
          <rect y="215" width="400" height="185" fill={url('sea')} />
          <g className="anim-waves">
            {Array.from({ length: 14 }, (_, i) => (
              <rect key={i} x={f(-40 + r() * 440)} y={f(222 + i * 12 + r() * 4)} width={f(20 + r() * 70 + i * 3)} height="2" rx="1" fill="#fff" opacity={f(0.18 + r() * 0.25)} />
            ))}
          </g>
          <path d={`M0,215 L400,215`} stroke="#fff" strokeOpacity="0.5" strokeWidth="1.2" />
        </>
      );
    }

    case 'city': {
      const palette = pick(r, [
        { sky: ['#141b3a', '#3a2f6b', '#a2577a'], building: '#0f1328', window: '#ffd27a', moon: '#f7f1d9' },
        { sky: ['#0b1d2e', '#174a5c', '#3b8c88'], building: '#08131e', window: '#9ff2e1', moon: '#e9fff8' },
        { sky: ['#2b1b3d', '#7a3b62', '#f08f6c'], building: '#1c1129', window: '#ffe0a3', moon: '#ffe7cf' },
      ]);
      const buildings: ReactNode[] = [];
      let x = -10;
      while (x < 410) {
        const w = 28 + r() * 46;
        const h = 90 + r() * 200;
        const top = 400 - h;
        buildings.push(<rect key={`b${x}`} x={f(x)} y={f(top)} width={f(w)} height={f(h)} fill={palette.building} />);
        for (let wy = top + 10; wy < 392; wy += 13) {
          for (let wx = x + 5; wx < x + w - 6; wx += 9) {
            if (r() < 0.32) buildings.push(<rect key={`w${f(wx)}-${f(wy)}`} className={r() < 0.12 ? 'anim-flicker' : undefined} x={f(wx)} y={f(wy)} width="4" height="6" fill={palette.window} opacity={f(0.55 + r() * 0.45)} />);
          }
        }
        x += w + 2;
      }
      return (
        <>
          <defs>
            {linear({ id: id('sky'), stops: palette.sky })}
            {glow(id('glow'), palette.moon)}
          </defs>
          <rect width="400" height="400" fill={url('sky')} />
          {stars(r, 40, 180)}
          {sun(80 + r() * 240, 70 + r() * 40, 14, palette.moon, id('glow'))}
          <g>{buildings}</g>
        </>
      );
    }

    case 'desert': {
      const palette = pick(r, [
        { sky: ['#f4b183', '#fbe3c4'], sun: '#fff1d0', dunes: ['#e6a065', '#d0814a', '#b0603a', '#86452b'] },
        { sky: ['#a3c9e8', '#f6e7cf'], sun: '#ffffff', dunes: ['#ecc58f', '#d9a56b', '#c0834f', '#9a6339'] },
        { sky: ['#3e2a5c', '#c46a7b', '#f6b183'], sun: '#ffe1a8', dunes: ['#c9746a', '#a0525b', '#753a4d', '#4a2639'] },
      ]);
      return (
        <>
          <defs>
            {linear({ id: id('sky'), stops: palette.sky })}
            {glow(id('glow'), palette.sun)}
          </defs>
          <rect width="400" height="400" fill={url('sky')} />
          {sun(100 + r() * 200, 130 + r() * 40, 34, palette.sun, id('glow'), 'anim-rise')}
          {palette.dunes.map((color, i) => {
            const y = 230 + i * 45;
            const c1 = 60 + r() * 120;
            const c2 = 220 + r() * 140;
            return <path key={i} d={`M-20,${y} Q${f(c1)},${f(y - 50 - r() * 40)} ${f((c1 + c2) / 2)},${y} T420,${f(y - 10)} L420,430 L-20,430 Z`} fill={color} />;
          })}
        </>
      );
    }

    case 'forest': {
      const palette = pick(r, [
        { sky: ['#cfe8d5', '#f4f1d0'], trees: ['#8bb89a', '#5e9476', '#3c6f55', '#234b39'] },
        { sky: ['#f6d6b8', '#fdf0dc'], trees: ['#c49a7a', '#8e7a5c', '#5a5f45', '#2f3d2c'] },
        { sky: ['#a8c8d8', '#e8f1f0'], trees: ['#8faab5', '#5f8291', '#3a5c6b', '#1e3a46'] },
      ]);
      return (
        <>
          <defs>
            {linear({ id: id('sky'), stops: palette.sky })}
            <linearGradient id={id('mist')} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#fff" stopOpacity="0" />
              <stop offset="1" stopColor="#fff" stopOpacity="0.45" />
            </linearGradient>
          </defs>
          <rect width="400" height="400" fill={url('sky')} />
          {palette.trees.map((color, layer) => {
            const base = 210 + layer * 52;
            const trees: ReactNode[] = [];
            for (let x = -10; x < 420; x += 14 + r() * 18 - layer * 2) {
              const h = 50 + r() * 70 + layer * 12;
              const w = h * (0.32 + r() * 0.1);
              trees.push(<path key={x} d={`M${f(x)},${f(base - h)} L${f(x + w / 2)},${base} L${f(x - w / 2)},${base} Z`} fill={color} />);
            }
            return (
              <g key={layer}>
                {trees}
                <rect y={base - 1} width="400" height={430 - base} fill={color} />
                <rect y={base - 60} width="400" height="60" fill={url('mist')} className={layer === 1 ? 'anim-breathe' : undefined} />
              </g>
            );
          })}
        </>
      );
    }

    case 'aurora':
    case 'stars': {
      const aurora = scene === 'aurora';
      const palette = pick(r, [
        { sky: ['#040b1f', '#0d2440', '#163b4a'], bands: ['#45f0b3', '#2cc2d9', '#9b7bff'], ground: '#03070f' },
        { sky: ['#07061a', '#1d1446', '#3a1f5c'], bands: ['#ff7ad9', '#7f8cff', '#4be3c0'], ground: '#050311' },
      ]);
      return (
        <>
          <defs>
            {linear({ id: id('sky'), stops: palette.sky })}
            <filter id={id('blur')} x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="14" />
            </filter>
            <radialGradient id={id('milky')}>
              <stop offset="0" stopColor="#d9d4ff" stopOpacity="0.45" />
              <stop offset="1" stopColor="#d9d4ff" stopOpacity="0" />
            </radialGradient>
          </defs>
          <rect width="400" height="400" fill={url('sky')} />
          {stars(r, aurora ? 70 : 160, 330)}
          {!aurora && <ellipse cx="200" cy="170" rx="260" ry="46" transform={`rotate(${f(-25 - r() * 20)} 200 170)`} fill={url('milky')} />}
          {aurora && (
            <g filter={url('blur')} className="anim-sway">
              {palette.bands.map((color, i) => (
                <path key={i} d={wave(r() * 6, 120 + i * 40, 26 + r() * 20, 260 + r() * 120).replace('L800,430 Z', '').replace(/^M-400,430 L-400,/, 'M-400,')} stroke={color} strokeWidth={f(26 - i * 6)} fill="none" opacity={f(0.75 - i * 0.15)} />
              ))}
            </g>
          )}
          {!aurora && r() < 0.6 && <circle cx={f(60 + r() * 280)} cy={f(60 + r() * 80)} r="5" fill="#f6d9a6" />}
          <path d={ridge(r, 335, 60, 0.5)} fill={palette.ground} />
        </>
      );
    }

    case 'bloom': {
      const palette = pick(r, [
        { bg: ['#fff4e6', '#ffe1cc'], petals: ['#ff7a5c', '#ffb347', '#e05780', '#ffd166'], leaf: '#5f9e6e', center: '#7a3e1d' },
        { bg: ['#eef6ec', '#d7ecd9'], petals: ['#f4a6c8', '#c48bd6', '#ffd6a5', '#9bc1ff'], leaf: '#4f8a5c', center: '#5b3b2a' },
        { bg: ['#1f2a44', '#2f3d63'], petals: ['#ff9f80', '#ffd07a', '#ff6f91', '#c3a6ff'], leaf: '#6fb38a', center: '#2a1a12' },
      ]);
      const flowers = Array.from({ length: 4 + Math.floor(r() * 3) }, (_, i) => ({ cx: 50 + r() * 300, cy: 60 + r() * 280, size: 30 + r() * 46, petals: 5 + Math.floor(r() * 4), color: palette.petals[i % palette.petals.length], spin: r() * 60 }));
      return (
        <>
          <defs>{linear({ id: id('bg'), stops: palette.bg })}</defs>
          <rect width="400" height="400" fill={url('bg')} />
          {flowers.map((fl, i) => (
            <g key={`l${i}`}>
              <ellipse cx={f(fl.cx + fl.size * 0.6)} cy={f(fl.cy + fl.size * 0.9)} rx={f(fl.size * 0.5)} ry={f(fl.size * 0.18)} transform={`rotate(${f(-30 + r() * 60)} ${f(fl.cx + fl.size * 0.6)} ${f(fl.cy + fl.size * 0.9)})`} fill={palette.leaf} opacity="0.85" />
            </g>
          ))}
          {flowers.map((fl, i) => (
            <g key={i} className="anim-spin" style={{ animationDuration: `${f(30 + r() * 30)}s` }}>
              {Array.from({ length: fl.petals }, (_, p) => (
                <ellipse key={p} cx={f(fl.cx)} cy={f(fl.cy - fl.size * 0.5)} rx={f(fl.size * 0.28)} ry={f(fl.size * 0.52)} transform={`rotate(${f(fl.spin + (360 / fl.petals) * p)} ${f(fl.cx)} ${f(fl.cy)})`} fill={fl.color} opacity="0.92" />
              ))}
              <circle cx={f(fl.cx)} cy={f(fl.cy)} r={f(fl.size * 0.2)} fill={palette.center} />
            </g>
          ))}
        </>
      );
    }

    case 'waves': {
      const palette = pick(r, [
        ['#0b3c5d', '#1d6a8a', '#328cc1', '#7fc8e6', '#d9b310'],
        ['#14213d', '#2a4d69', '#4b86b4', '#adcbe3', '#ff7a5c'],
        ['#1b4332', '#2d6a4f', '#52b788', '#95d5b2', '#ffd166'],
      ]);
      return (
        <>
          <rect width="400" height="400" fill={palette[3]} opacity="0.35" />
          <rect width="400" height="400" fill="#fff" opacity="0.4" />
          <circle cx={f(80 + r() * 240)} cy={f(70 + r() * 50)} r="26" fill={palette[4]} className="anim-rise" />
          {[0, 1, 2, 3].map((i) => (
            <path key={i} className="anim-waves" style={{ animationDuration: `${8 + i * 3}s` }} d={wave(r() * 6, 170 + i * 52, 14 + i * 4, 200 + r() * 160)} fill={palette[3 - i]} opacity={f(0.75 + i * 0.08)} />
          ))}
        </>
      );
    }

    case 'grid': {
      const palette = pick(r, [
        { bg: '#f2e8d5', shapes: ['#e4572e', '#29335c', '#f3a712', '#669bbc'] },
        { bg: '#e8eef2', shapes: ['#0b7a61', '#ff7a5c', '#1f2a44', '#f4c95d'] },
        { bg: '#1e1e2a', shapes: ['#ff6f59', '#43aa8b', '#f4f1de', '#5b7cfa'] },
      ]);
      const cells = 4;
      const size = 400 / cells;
      const shapes: ReactNode[] = [];
      for (let gx = 0; gx < cells; gx++) {
        for (let gy = 0; gy < cells; gy++) {
          const x = gx * size;
          const y = gy * size;
          const color = pick(r, palette.shapes);
          const kind = Math.floor(r() * 5);
          const key = `${gx}-${gy}`;
          if (kind === 0) shapes.push(<circle key={key} cx={x + size / 2} cy={y + size / 2} r={size * 0.38} fill={color} />);
          else if (kind === 1) shapes.push(<path key={key} d={`M${x},${y + size} A${size},${size} 0 0 1 ${x + size},${y}`} fill={color} transform={`rotate(${90 * Math.floor(r() * 4)} ${x + size / 2} ${y + size / 2})`} />);
          else if (kind === 2) shapes.push(<rect key={key} x={x + size * 0.12} y={y + size * 0.12} width={size * 0.76} height={size * 0.76} fill={color} />);
          else if (kind === 3) shapes.push(<path key={key} d={`M${x},${y} L${x + size},${y + size} L${x},${y + size} Z`} fill={color} transform={`rotate(${90 * Math.floor(r() * 4)} ${x + size / 2} ${y + size / 2})`} />);
          else for (let k = 0; k < 4; k++) shapes.push(<rect key={`${key}-${k}`} x={x + 10} y={y + 14 + k * 22} width={size - 20} height="8" rx="4" fill={color} />);
        }
      }
      return (
        <>
          <rect width="400" height="400" fill={palette.bg} />
          <g className="anim-breathe">{shapes}</g>
        </>
      );
    }

    default: {
      // blobs
      const palette = pick(r, [
        ['#ffd3b6', '#ffaaa5', '#ff8b94', '#dcedc1', '#a8e6cf'],
        ['#b8f2e6', '#aed9e0', '#5e6472', '#ffa69e', '#faf3dd'],
        ['#f9c784', '#e7a977', '#d16666', '#7fb069', '#e6aa68'],
        ['#cdb4db', '#ffc8dd', '#ffafcc', '#bde0fe', '#a2d2ff'],
      ]);
      return (
        <>
          <defs>
            <filter id={id('blur')} x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="36" />
            </filter>
          </defs>
          <rect width="400" height="400" fill={palette[4]} />
          <g filter={url('blur')}>
            {palette.slice(0, 4).map((color, i) => (
              <circle key={i} className="anim-float" style={{ animationDelay: `${-i * 2.5}s`, animationDuration: `${10 + i * 2}s` }} cx={f(60 + r() * 280)} cy={f(60 + r() * 280)} r={f(90 + r() * 70)} fill={color} />
            ))}
          </g>
        </>
      );
    }
  }
}

export function SceneArt({ scene, seed, animated, label, className }: { scene: string; seed: number; animated?: boolean; label?: string; className?: string }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const content = useMemo(() => render(scene, seed, uid), [scene, seed, uid]);
  return (
    <svg
      viewBox="0 0 400 400"
      preserveAspectRatio="xMidYMid slice"
      className={`scene${animated ? ' scene-animated' : ''}${className ? ` ${className}` : ''}`}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {content}
    </svg>
  );
}
