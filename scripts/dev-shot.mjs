/*
 * Local visual check helper: drives headless Chrome over CDP and writes a PNG.
 *
 * Usage:
 *   node scripts/dev-shot.mjs <url> <out.png> [waitMs] [clickX,clickY]
 *
 * Chrome runs with SwiftShader so WebGL works without a display server.
 */
import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { setTimeout as sleep } from 'node:timers/promises';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9333;
const [url = 'http://localhost:5173/', out = 'shot.png', waitRaw = '5000', clickRaw] = process.argv.slice(2);
const waitMs = Number(waitRaw);

const chrome = spawn(
  CHROME,
  [
    '--headless=new',
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-gpu-sandbox',
    '--hide-scrollbars',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--mute-audio',
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--disable-features=CalculateNativeWinOcclusion',
    '--window-size=1600,900',
    `--remote-debugging-port=${PORT}`,
    '--user-data-dir=./.chrome-cdp-profile',
    'about:blank',
  ],
  { stdio: 'ignore' }
);

async function waitForChrome() {
  for (let i = 0; i < 100; i++) {
    try {
      const response = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      if (response.ok) return;
    } catch {
      /* not up yet */
    }
    await sleep(120);
  }
  throw new Error('Chrome DevTools endpoint did not start');
}

await waitForChrome();

const target = await (
  await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })
).json();

const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true });
  socket.addEventListener('error', reject, { once: true });
});

let nextId = 1;
const pending = new Map();
socket.addEventListener('message', (event) => {
  const message = JSON.parse(event.data);
  if (message.id && pending.has(message.id)) {
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(new Error(message.error.message));
    else resolve(message.result);
  }
});

function send(method, params = {}) {
  const id = nextId++;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}

await send('Page.enable');
await send('Runtime.enable');
socket.addEventListener('message', (event) => {
  const message = JSON.parse(event.data);
  if (message.method === 'Runtime.exceptionThrown') {
    console.log('PAGE ERROR:', JSON.stringify(message.params.exceptionDetails, null, 1).slice(0, 2000));
  }
  if (message.method === 'Page.screencastFrame') {
    socket.send(JSON.stringify({
      id: 0,
      method: 'Page.screencastFrameAck',
      params: { sessionId: message.params.sessionId },
    }));
  }
  if (message.method === 'Runtime.consoleAPICalled') {
    const text = message.params.args.map((a) => a.value ?? a.description ?? '').join(' ');
    if (text) console.log('CONSOLE:', text.slice(0, 500));
  }
});
const [viewWidth, viewHeight] = (process.env.VIEWPORT ?? '1600x900').split('x').map(Number);
await send('Emulation.setDeviceMetricsOverride', {
  width: viewWidth,
  height: viewHeight,
  deviceScaleFactor: 1,
  mobile: viewWidth < 700,
});
await send('Page.startScreencast', { format: 'png', everyNthFrame: 1, maxWidth: 1600, maxHeight: 900 });
await send('Page.navigate', { url });
await sleep(waitMs);

if (process.env.CURSOR) {
  const [x, y] = process.env.CURSOR.split(',').map(Number);
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
  await sleep(Number(process.env.CURSOR_WAIT ?? 6000));
}

if (process.env.WHEEL) {
  const steps = Number(process.env.WHEEL);
  for (let i = 0; i < Math.abs(steps); i++) {
    await send('Input.dispatchMouseEvent', {
      type: 'mouseWheel',
      x: 800,
      y: 450,
      deltaX: 0,
      deltaY: steps > 0 ? 120 : -120,
    });
    await sleep(400);
  }
  await sleep(4000);
}

if (clickRaw) {
  const [x, y] = clickRaw.split(',').map(Number);
  for (const type of ['mousePressed', 'mouseReleased']) {
    await send('Input.dispatchMouseEvent', {
      type,
      x,
      y,
      button: 'left',
      clickCount: 1,
      buttons: type === 'mousePressed' ? 1 : 0,
    });
    await sleep(80);
  }
  await sleep(Number(process.env.CLICK_WAIT ?? 6000));
}

if (process.env.EXPR) {
  const result = await send('Runtime.evaluate', {
    expression: process.env.EXPR,
    returnByValue: true,
    awaitPromise: true,
  });
  console.log('EVAL:', JSON.stringify(result.result.value ?? result.result.description));
  if (process.env.EXPR_WAIT) await sleep(Number(process.env.EXPR_WAIT));
}

if (process.env.DEBUG_STATE) {
  const raf = await send('Runtime.evaluate', {
    expression: `new Promise((resolve) => {
      let frames = 0;
      const start = performance.now();
      const step = () => {
        frames += 1;
        if (performance.now() - start < 1000) requestAnimationFrame(step);
        else resolve(frames);
      };
      requestAnimationFrame(step);
    })`,
    awaitPromise: true,
    returnByValue: true,
  });
  console.log('RAF fps:', raf.result.value);
  const state = await send('Runtime.evaluate', {
    expression: `JSON.stringify({
      mode: window.__gallery?.mode,
      index: window.__gallery?.index,
      cam: window.__gallery?.camera?.position?.toArray?.(),
      look: window.__gallery?.cameraTarget?.toArray?.(),
      dist: window.__gallery?.galleryDist,
      arts: window.__gallery?.artworks?.slice(0,3).map(a => ({p: a.group.position.toArray(), s: a.group.scale.x, v: a.group.visible})),
      tweens: window.__gallery?.tweens?.length
    })`,
    returnByValue: true,
  });
  console.log('STATE:', state.result.value);
}

const shot = await send('Page.captureScreenshot', { format: 'png' });
await writeFile(out, Buffer.from(shot.data, 'base64'));
console.log(`wrote ${out}`);

socket.close();
chrome.kill('SIGKILL');
