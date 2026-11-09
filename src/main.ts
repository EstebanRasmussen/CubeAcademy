import { COLOR_FACE, COLOR_HEX, COLOR_NAMES, ColorName, FACES, FACE_COLOR, Face, FaceletState, SOLVED } from './cube/facelets';
import { applyAlg } from './cube/moves';
import { Move, formatAlg, formatMove, parseAlg, parseAlgTree, segmentsOf } from './cube/notation';
import { TRIGGER_BY_NAME, findTriggers } from './cube/triggers';
import { fingerFor } from './cube/fingertricks';
import { faceletsToCubie, describeError } from './cube/cubie';
import { AlgCase, AlgSet, BUILTIN_SETS, caseKind } from './algs/sets';
import { PatternKind } from './algs/pattern';
import { caseState } from './algs/setup';
import { SolverClient } from './solver/solverClient';
import { Cube3D } from './render/cube3d';
import { SequencePlayer } from './render/player';
import { caseDiagramSvg } from './render/caseDiagram';
import { Camera, CameraError } from './vision/camera';
import { SyntheticSource } from './vision/synthetic';
import { DetectMode, FrameInfo, Scanner } from './vision/scanner';
import { GUIDED_ORDER, ScanResult, assembleFromColors, calibrationFrom } from './vision/session';
import { setPrototypes } from './vision/colorClassifier';
import { caseKey, loadSettings, saveSettings } from './app/storage';
import {
  advanceState, algFor, caseName, caseOf, computeSetup, errorText, getSet, pickNextCase, selectedIds, validateCustomAlg, validateUserAlg,
} from './app/trainer';
import { sound } from './app/sound';
import { STAGES, Stage, solveBeginner } from './guide/beginner';
import { LANGS, LANG_NAMES, Lang, applyDom, detectLang, setLang, t } from './i18n';

// ---------------------------------------------------------------------------- helpers
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const hex = (n: number) => '#' + n.toString(16).padStart(6, '0');
const colorCss = (c: ColorName) => hex(COLOR_HEX[c]);
const colorName = (c: ColorName) => t(`color.${c}`);
const esc = (s: string) => s.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);

type Phase = 'scan' | 'computing' | 'setup' | 'practice' | 'guide' | 'solved';

// ---------------------------------------------------------------------------- state
const settings = loadSettings();
setLang(settings.lang ?? detectLang());
setPrototypes(settings.calibration);
const solver = new SolverClient();
const cube = new Cube3D($('cube3d'), '?'.repeat(54));
let phase: Phase = 'scan';
let tracked: FaceletState | null = null;
let currentCase: string | null = null;
let practiceMoves: Move[] = [];
let algRevealed = false;
let timerStart = 0;
let timerHandle = 0;
let focusCase: string | null = null;
let stages: Stage[] = [];
let stageIndex = 0;
let solverMs: number | null = null;
let solverErr: string | null = null;

const activeSet = (): AlgSet => getSet(settings);

const player = new SequencePlayer(cube, () => renderMoves());
player.speedMs = settings.speedMs;

// ---------------------------------------------------------------------------- scanning
const camera = new Camera();
let synthetic: SyntheticSource | null = null;
let scanResult: ScanResult | null = null;
let editColors: ColorName[][] | null = null;
let justCaptured = -1;
let videoHint: () => string = () => t('video.hintStart');

const overlay = $<HTMLCanvasElement>('overlay');
const octx = overlay.getContext('2d')!;

function setVideoHint(fn: () => string) {
  videoHint = fn;
  $('videoHint').textContent = fn();
}

const scanner = new Scanner({
  onFrame: drawOverlay,
  onEvent: (ev) => {
    if (ev.type === 'capture') {
      justCaptured = ev.index;
      sound.capture();
      renderNet();
      showProvisionalCube(COLOR_FACE[ev.hint]);
      const n = scanner.captured.length;
      const hint = ev.hint;
      setVideoHint(() => t(ev.replaced ? 'capture.updated' : 'capture.acquired', { color: colorName(hint), n }));
      renderGuide();
    } else handleScanResult(ev.result);
  },
});
scanner.mode = settings.detectMode;
scanner.session.guided = settings.guided;
scanner.session.reset();

/** Guided scan: which face to show next, and chips to tell the app which face is shown. */
function renderGuide() {
  const session = scanner.session;
  $<HTMLInputElement>('guided').checked = session.guided;
  const chips = $('faceChips');
  const text = $('guideText');
  chips.hidden = !session.guided;
  text.hidden = !session.guided;
  if (!session.guided) return;
  const done = new Set(session.labeled());
  chips.innerHTML = '';
  for (const c of GUIDED_ORDER) {
    const b = document.createElement('button');
    b.className = 'chip' + (c === session.expected ? ' expected' : '') + (done.has(c) ? ' done' : '');
    b.style.background = colorCss(c);
    b.title = t(done.has(c) ? 'chip.reread' : 'chip.showing', { color: colorName(c) });
    b.onclick = () => {
      session.expected = c;
      renderGuide();
    };
    chips.appendChild(b);
  }
  text.innerHTML = session.expected
    ? t('guide.show', {
        color: `<b style="color:${colorCss(session.expected)}">${colorName(session.expected)}</b>`,
        logo: session.expected === 'white' ? t('guide.logo') : '',
      })
    : t('guide.allDone');
}

function drawOverlay(info: FrameInfo) {
  if (overlay.width !== info.width || overlay.height !== info.height) {
    overlay.width = info.width;
    overlay.height = info.height;
    $('videoWrap').style.aspectRatio = `${info.width} / ${info.height}`;
  }
  octx.clearRect(0, 0, overlay.width, overlay.height);
  if (info.mode === 'guide') {
    const r = info.guide;
    octx.fillStyle = 'rgba(0,0,0,0.35)';
    octx.fillRect(0, 0, overlay.width, overlay.height);
    octx.clearRect(r.x, r.y, r.size, r.size);
    octx.strokeStyle = 'rgba(255,255,255,0.8)';
    octx.lineWidth = 2;
    for (let k = 0; k <= 3; k++) {
      octx.beginPath();
      octx.moveTo(r.x + (k * r.size) / 3, r.y);
      octx.lineTo(r.x + (k * r.size) / 3, r.y + r.size);
      octx.moveTo(r.x, r.y + (k * r.size) / 3);
      octx.lineTo(r.x + r.size, r.y + (k * r.size) / 3);
      octx.stroke();
    }
  } else if ($<HTMLInputElement>('showCandidates').checked) {
    octx.fillStyle = 'rgba(255,0,255,0.9)';
    for (const c of info.candidates) octx.fillRect(c.x - 2, c.y - 2, 4, 4);
  }
  info.faces.forEach((f, i) => {
    const p = info.progress[i] ?? 0;
    const ok = f.frontal >= 0.5;
    octx.lineWidth = 3;
    octx.strokeStyle = !ok ? 'rgba(255,255,255,0.35)' : p >= 1 ? '#2ecc71' : '#ffd500';
    octx.beginPath();
    f.corners.forEach(([x, y], k) => (k ? octx.lineTo(x, y) : octx.moveTo(x, y)));
    octx.closePath();
    octx.stroke();
    if (ok && p < 1) {
      const [a, b] = f.corners;
      octx.strokeStyle = '#2ecc71';
      octx.lineWidth = 5;
      octx.beginPath();
      octx.moveTo(a[0], a[1]);
      octx.lineTo(a[0] + (b[0] - a[0]) * p, a[1] + (b[1] - a[1]) * p);
      octx.stroke();
    }
    const r = Math.max(3, f.pitch * 0.18);
    f.centers.forEach(([x, y], k) => {
      octx.fillStyle = colorCss(scanner.session.hint(f.rgb[k]));
      octx.beginPath();
      octx.arc(x, y, r, 0, Math.PI * 2);
      octx.fill();
      octx.strokeStyle = 'rgba(0,0,0,0.6)';
      octx.lineWidth = 1;
      octx.stroke();
    });
  });
  $('detStats').textContent = `${info.ms.toFixed(0)} ms/frame`;
}

function showProvisionalCube(viewFace: Face) {
  const letters = Array(54).fill('?');
  for (const c of scanner.captured) {
    const slot = FACES.indexOf(COLOR_FACE[c.label ?? scanner.session.hint(c.rgb[4])]);
    c.rgb.forEach((p, i) => (letters[slot * 9 + i] = COLOR_FACE[scanner.session.hint(p)]));
  }
  cube.setState(letters.join(''));
  cube.setView(viewFace);
}

function renderNet() {
  const net = $('net');
  net.innerHTML = '';
  for (let i = 0; i < 6; i++) {
    const div = document.createElement('div');
    div.className = 'face' + (i === justCaptured ? ' just' : '');
    const cap = scanner.captured[i];
    const colors: (ColorName | null)[] = editColors?.[i] ?? cap?.rgb.map((p) => scanner.session.hint(p)) ?? Array(9).fill(null);
    const conf = scanResult?.classification.confidence[i];
    const name = cap?.label ?? (cap && colors[4]) ?? null;
    div.innerHTML = `<div class="label">${name ? colorName(name) : '—'}</div>`;
    const grid = document.createElement('div');
    grid.className = 'grid';
    colors.forEach((c, k) => {
      const s = document.createElement('span');
      if (c) s.style.background = colorCss(c);
      if (conf && conf[k] < 0.25 && k !== 4) s.classList.add('doubt');
      if (editColors && k !== 4) {
        s.title = t('net.clickToChange');
        s.onclick = () => {
          const cur = editColors![i][k];
          editColors![i][k] = COLOR_NAMES[(COLOR_NAMES.indexOf(cur) + 1) % 6];
          renderNet();
        };
      }
      grid.appendChild(s);
    });
    div.appendChild(grid);
    net.appendChild(div);
  }
}

let lastMsg: (() => string) | null = null;
let lastMsgOk = false;
function showMsg(text: (() => string) | null, ok = false) {
  lastMsg = text;
  lastMsgOk = ok;
  const m = $('scanMsg');
  m.hidden = !text;
  m.textContent = text ? text() : '';
  m.classList.toggle('ok', ok);
}

function handleScanResult(result: ScanResult) {
  scanResult = result;
  editColors = result.classification.colors.map((r) => r.slice());
  renderNet();
  if (result.assembled.ok) {
    sound.complete();
    stopScanSources();
    // Static calibration: remember how this lighting renders each color for next time.
    settings.calibration = calibrationFrom(result);
    setPrototypes(settings.calibration);
    saveSettings(settings);
    showMsg(() => t('scan.ok'), true);
    $('fixRow').hidden = true;
    editColors = null;
    start(result.assembled.state);
  } else {
    sound.error();
    const msg = result.assembled.message;
    showMsg(() => t('scan.fix', { msg }));
    $('fixRow').hidden = false;
  }
}

function stopScanSources() {
  scanner.stop();
  camera.stop();
  synthetic = null;
  fileVideo?.pause();
  $('videoWrap').classList.remove('nomirror');
  $('mirror').innerHTML = '';
  octx.clearRect(0, 0, overlay.width, overlay.height);
  $('btnCamera').textContent = t('btn.startCam');
  $('btnLock').hidden = true;
}

/** Forgets the captured faces; the camera (or demo/video) keeps running. */
function resetScan() {
  scanner.reset();
  renderGuide();
  scanResult = null;
  editColors = null;
  justCaptured = -1;
  showMsg(null);
  $('fixRow').hidden = true;
  renderNet();
  if (phase === 'scan') {
    cube.setState('?'.repeat(54));
    cube.setView('home');
  }
}

async function startCamera() {
  try {
    resetScan();
    synthetic = null;
    fileVideo?.pause();
    $('videoWrap').classList.remove('nomirror');
    await camera.start(settings.deviceId);
    const mirror = $('mirror');
    mirror.innerHTML = '';
    mirror.appendChild(camera.video);
    scanner.run({ video: camera.video });
    $('btnCamera').textContent = t('btn.stopCam');
    setVideoHint(() => t('cam.running'));
    settings.deviceId = camera.currentDeviceId;
    saveSettings(settings);
    await fillCameraSelect();
    // Let auto-exposure settle, then lock exposure/white balance if supported.
    setTimeout(async () => {
      if (!camera.active) return;
      const r = await camera.setColorLock(true);
      const btn = $('btnLock');
      btn.hidden = r === 'unsupported';
      btn.dataset.locked = String(r === 'locked');
      btn.textContent = t(r === 'locked' ? 'btn.unlock' : 'btn.lock');
    }, 2500);
  } catch (e) {
    const msg = e instanceof CameraError ? e.message : String(e);
    setVideoHint(() => msg);
  }
}

async function fillCameraSelect() {
  const sel = $<HTMLSelectElement>('cameraSelect');
  const devices = await Camera.listDevices();
  sel.hidden = devices.length < 2;
  sel.innerHTML = devices.map((d, i) => `<option value="${esc(d.deviceId)}">${esc(d.label || 'Webcam ' + (i + 1))}</option>`).join('');
  sel.value = camera.currentDeviceId ?? '';
}

function startDemo() {
  resetScan();
  camera.stop();
  fileVideo?.pause();
  $('videoWrap').classList.remove('nomirror');
  const hidden = applyAlg(SOLVED, Array.from({ length: 25 }, () => 'URFDLB'[Math.floor(Math.random() * 6)] + ['', "'", '2'][Math.floor(Math.random() * 3)]).join(' '));
  // the simulated hand follows the guide, like a person would
  synthetic = new SyntheticSource(hidden, scanner.session.guided ? GUIDED_ORDER.map((c) => COLOR_FACE[c]) : undefined);
  const mirror = $('mirror');
  mirror.innerHTML = '';
  mirror.appendChild(synthetic.canvas);
  const src = synthetic;
  scanner.run({ draw: () => (src.render(), src.canvas) });
  setVideoHint(() => t('demo.running'));
}

let fileVideo: HTMLVideoElement | null = null;

/** A recorded video used as the camera (shown unmirrored, as it was recorded). */
function startFileVideo(file: File) {
  resetScan();
  camera.stop();
  synthetic = null;
  if (fileVideo) URL.revokeObjectURL(fileVideo.src);
  const v = document.createElement('video');
  v.muted = true;
  v.loop = true;
  v.playsInline = true;
  v.src = URL.createObjectURL(file);
  fileVideo = v;
  const mirror = $('mirror');
  mirror.innerHTML = '';
  mirror.appendChild(v);
  $('videoWrap').classList.add('nomirror');
  void v.play();
  scanner.run({ video: v });
  setVideoHint(() => t('video.running', { name: file.name }));
}

// ---------------------------------------------------------------------------- phases
function renderSteps() {
  const steps = settings.appMode === 'guide' ? ['scan', 'guide'] : ['scan', 'setup', 'practice'];
  const active = phase === 'computing' ? 'setup' : phase === 'solved' ? 'guide' : phase;
  $('steps').innerHTML = steps
    .map((s, i) => `<li class="${s === active ? 'active' : ''}">${i + 1} · ${t('steps.' + s)}</li>`)
    .join('');
  document.querySelectorAll<HTMLElement>('[data-appmode]').forEach((b) => b.classList.toggle('active', b.dataset.appmode === settings.appMode));
}

function setPhase(p: Phase) {
  phase = p;
  renderSteps();
  const titleKey: Record<Phase, string> = {
    scan: 'phase.scan',
    computing: 'phase.computing',
    setup: 'phase.setup',
    practice: 'phase.practice',
    guide: 'phase.guide',
    solved: 'phase.guide',
  };
  $('phaseTitle').textContent = p === 'guide' && stages[stageIndex] ? t('stage.' + stages[stageIndex].id) : t(titleKey[p]);
  const training = p === 'setup' || p === 'practice';
  $('btnDone').hidden = !training && p !== 'guide';
  $('btnLost').hidden = !training && p !== 'computing' && p !== 'guide';
  $('btnShowAlg').hidden = p !== 'practice';
  $('btnSkip').hidden = p !== 'setup' || selectedIds(settings, activeSet()).length < 2;
  $('btnToTrain').hidden = p !== 'solved';
  $('practiceCard').hidden = p !== 'practice';
  $('controls').style.visibility = p === 'setup' || p === 'guide' || (p === 'practice' && algRevealed) ? 'visible' : 'hidden';
  $('stageList').hidden = p !== 'guide' && p !== 'solved';
  $('stageInfo').hidden = p !== 'guide' && p !== 'solved';
  if (p !== 'practice') stopTimer();
  renderStages();
  renderMoves();
}

/** A cube is known: train or guide, depending on the mode. */
function start(state: FaceletState) {
  tracked = state;
  cube.setState(state);
  cube.setView('home');
  if (settings.appMode === 'guide') startGuide();
  else {
    const next = pickNextCase(settings, activeSet(), currentCase);
    if (next !== null) void nextRound(next);
  }
}

// ---------------------------------------------------------------------------- training flow
async function nextRound(caseId: string) {
  if (!tracked) return;
  const set = activeSet();
  const c = caseOf(set, caseId);
  if (!c) return;
  currentCase = caseId;
  renderCaseBadge();
  setPhase('computing');
  try {
    const setup = await computeSetup(tracked, set, c, settings, solver);
    if (currentCase !== caseId || phase !== 'computing') return; // superseded
    if (setup.moves.length === 0) return enterPractice();
    player.load(tracked, setup.moves);
    setPhase('setup');
  } catch (e) {
    $('moves').innerHTML = `<span class="info">${esc(t('error', { msg: errorText(e) }))}</span>`;
  }
}

function finishSetup() {
  if (!tracked) return;
  const r = advanceState(tracked, player.getMoves());
  tracked = r.state;
  showRegrip(r.regrip);
  enterPractice();
}

function currentCaseObj(): AlgCase | null {
  return currentCase === null ? null : caseOf(activeSet(), currentCase) ?? null;
}

function enterPractice() {
  const c = currentCaseObj();
  if (!tracked || !c) return;
  const set = activeSet();
  algRevealed = false;
  practiceMoves = parseAlg(algFor(settings, set, c));
  cube.setState(tracked);
  player.load(tracked, practiceMoves);
  $('bigDiagram').innerHTML = caseDiagramSvg(tracked, caseKind(set, c), set.diagram, 140);
  setPhase('practice');
  startTimer();
}

function finishPractice() {
  const c = currentCaseObj();
  if (!tracked || !c) return;
  const set = activeSet();
  const ms = stopTimer();
  const st = (settings.statsBy[caseKey(set.id, c.id)] ??= { reps: 0, times: [] });
  st.reps++;
  if (!algRevealed) st.times = [...st.times, ms].slice(-50);
  saveSettings(settings);
  const r = advanceState(tracked, practiceMoves);
  tracked = r.state;
  showRegrip(r.regrip);
  renderCases();
  const next = pickNextCase(settings, set, currentCase);
  if (next !== null) void nextRound(next);
}

function showRegrip(rot: Move[]) {
  const el = $('regrip');
  el.hidden = rot.length === 0;
  el.textContent = t('regrip');
}

// ---------------------------------------------------------------------------- guide flow
function startGuide() {
  if (!tracked) return;
  stages = solveBeginner(tracked);
  stageIndex = 0;
  currentCase = null;
  renderCaseBadge();
  loadStage();
}

function loadStage() {
  // skip the stages that are already done
  while (stageIndex < stages.length && stages[stageIndex].moves.length === 0) stageIndex++;
  if (stageIndex >= stages.length || !tracked) {
    cube.setState(tracked ?? SOLVED);
    player.load(tracked ?? SOLVED, []);
    setPhase('solved');
    sound.complete();
    return;
  }
  player.load(tracked, stages[stageIndex].moves);
  setPhase('guide');
}

function finishStage() {
  if (!tracked || !stages[stageIndex]) return;
  tracked = advanceState(tracked, stages[stageIndex].moves).state;
  stageIndex++;
  loadStage();
}

function renderStages() {
  const list = $('stageList');
  const info = $('stageInfo');
  if (phase !== 'guide' && phase !== 'solved') return;
  list.innerHTML = STAGES.map((id, i) => {
    const st = stages[i];
    const cls = i < stageIndex || phase === 'solved' ? 'done' : i === stageIndex ? 'current' : '';
    const n = st ? st.moves.filter((m) => !'xyz'.includes(m.letter)).length : 0;
    return `<li class="${cls}"><span>${t('stage.' + id)}</span><small>${st && n ? t('guide.moves', { n }) : '✓'}</small></li>`;
  }).join('');
  info.textContent = phase === 'solved' ? t('guide.finished') : stages[stageIndex] ? t('info.' + stages[stageIndex].id) : '';
}

// ---------------------------------------------------------------------------- common
function onDone() {
  if (phase === 'setup') finishSetup();
  else if (phase === 'practice') finishPractice();
  else if (phase === 'guide') finishStage();
}

function startTimer() {
  timerStart = performance.now();
  clearInterval(timerHandle);
  timerHandle = window.setInterval(() => ($('timer').textContent = ((performance.now() - timerStart) / 1000).toFixed(2)), 50);
}

function stopTimer(): number {
  clearInterval(timerHandle);
  return timerStart ? performance.now() - timerStart : 0;
}

function backToScan() {
  setPhase('scan');
  tracked = null;
  currentCase = null;
  stages = [];
  renderCaseBadge();
  $('regrip').hidden = true;
  resetScan();
}

// ---------------------------------------------------------------------------- moves bar
interface Seg {
  start: number;
  end: number;
  label: string;
}

/** Groups to draw under the moves: the guide's steps, or the algorithm's groups and triggers. */
function segmentsForBar(): Seg[] {
  if (phase === 'guide') {
    return (stages[stageIndex]?.segments ?? [])
      .filter((s) => s.label !== 'auf' && s.label !== 'cross')
      .map((s) => ({ start: s.start, end: s.end, label: t('step.' + s.label) + (s.repeat > 1 ? ` ×${s.repeat}` : '') }));
  }
  const moves = player.getMoves();
  if (phase === 'practice') {
    const c = currentCaseObj();
    if (c) {
      const alg = algFor(settings, activeSet(), c);
      try {
        const explicit = parseAlgTree(alg).some((n) => n.type !== 'move');
        if (explicit) {
          return segmentsOf(alg).map((s) => ({
            start: s.start,
            end: s.end,
            label: s.trigger ? TRIGGER_BY_NAME.get(s.trigger)!.name : s.repeat > 1 ? `×${s.repeat}` : '',
          }));
        }
      } catch {
        /* fall back to detection */
      }
    }
  }
  return findTriggers(moves).map((f) => ({ start: f.start, end: f.end, label: TRIGGER_BY_NAME.get(f.id)!.name }));
}

function renderMoves() {
  const el = $('moves');
  $('btnPlay').textContent = player.isPlaying() ? '⏸' : '▶';
  if (phase === 'scan') {
    el.innerHTML = `<span class="info">${esc(t('moves.placeholder'))}</span>`;
    return;
  }
  if (phase === 'computing') {
    el.innerHTML = `<span class="info">${esc(t('moves.computing'))}</span>`;
    return;
  }
  if (phase === 'practice' && !algRevealed) {
    el.innerHTML = `<span class="hidden-alg">${esc(t('moves.hidden'))}</span>`;
    return;
  }
  const moves = player.getMoves();
  el.innerHTML = '';
  if (!moves.length) {
    el.innerHTML = `<span class="info">${esc(t(phase === 'guide' ? 'guide.stageDone' : 'moves.none'))}</span>`;
    return;
  }
  const segs = segmentsForBar();
  const fingers = settings.showFingers;
  const moveEl = (i: number) => {
    const m = moves[i];
    const b = document.createElement('span');
    b.className = 'mv' + (i < player.index ? ' done' : i === player.index ? ' current' : '');
    b.innerHTML = `<b>${formatMove(m)}</b>${fingers ? `<small>${esc(t('ft.' + fingerFor(moves, i)))}</small>` : ''}`;
    b.title = t('moves.goto');
    b.onclick = () => player.seek(i);
    return b;
  };
  let i = 0;
  for (const s of segs) {
    while (i < s.start) el.appendChild(moveEl(i++));
    const g = document.createElement('span');
    g.className = 'seg';
    const inner = document.createElement('span');
    inner.className = 'seg-moves';
    for (; i < s.end; i++) inner.appendChild(moveEl(i));
    g.appendChild(inner);
    if (s.label) {
      const l = document.createElement('span');
      l.className = 'seg-label';
      l.textContent = s.label;
      g.appendChild(l);
    }
    el.appendChild(g);
  }
  while (i < moves.length) el.appendChild(moveEl(i++));
  el.querySelector('.mv.current')?.scrollIntoView({ block: 'nearest' });
}

function renderCaseBadge() {
  const b = $('caseBadge');
  const set = activeSet();
  const c = currentCaseObj();
  b.hidden = !c;
  if (c) b.textContent = `${caseName(set, c)} · ${t('group.' + c.group)}`;
}

// ---------------------------------------------------------------------------- cases panel
function renderSetSelect() {
  const sel = $<HTMLSelectElement>('setSelect');
  sel.innerHTML = [...BUILTIN_SETS.map((s) => s.id), 'custom'].map((id) => `<option value="${id}">${esc(t('set.' + id))}</option>`).join('');
  sel.value = settings.set;
}

function renderCases() {
  const set = activeSet();
  const grid = $('caseGrid');
  grid.innerHTML = '';
  const selected = selectedIds(settings, set);
  if (focusCase === null || !caseOf(set, focusCase)) focusCase = selected[0] ?? set.cases[0]?.id ?? null;
  for (const group of set.groups) {
    const cases = set.cases.filter((c) => c.group === group);
    if (!cases.length) continue;
    const g = document.createElement('div');
    g.className = 'group';
    g.innerHTML = `<h3>${esc(t('group.' + group))}</h3>`;
    const items = document.createElement('div');
    items.className = 'items';
    for (const c of cases) {
      const tile = document.createElement('div');
      const sel = selected.includes(c.id);
      tile.className = 'case' + (sel ? ' selected' : '') + (c.id === focusCase ? ' focus' : '');
      const reps = settings.statsBy[caseKey(set.id, c.id)]?.reps;
      tile.innerHTML = `${diagramFor(set, c, 64)}<span>${esc(c.id)}</span>${reps ? `<span class="reps">${reps}</span>` : ''}`;
      tile.title = t('case.tileTitle', { name: caseName(set, c) });
      tile.onclick = () => {
        focusCase = c.id;
        const cur = selectedIds(settings, set);
        settings.selectedBy[set.id] = sel ? cur.filter((x) => x !== c.id) : [...cur, c.id];
        saveSettings(settings);
        renderCases();
      };
      items.appendChild(tile);
    }
    g.appendChild(items);
    grid.appendChild(g);
  }
  $('selCount').textContent = selected.length ? t('sel.count', { n: selected.length }) : t('sel.none', { n: set.cases.length });
  $('btnSkip').hidden = phase !== 'setup' || selected.length < 2;
  $('customForm').hidden = !set.custom;
  renderDetail();
}

function diagramFor(set: AlgSet, c: AlgCase, size: number): string {
  try {
    return caseDiagramSvg(caseState(algFor(settings, set, c)), caseKind(set, c), set.diagram, size);
  } catch {
    return '';
  }
}

function renderDetail() {
  const set = activeSet();
  const d = $('caseDetail');
  const c = focusCase === null ? undefined : caseOf(set, focusCase);
  if (!c) {
    d.innerHTML = '';
    return;
  }
  const alg = algFor(settings, set, c);
  const key = caseKey(set.id, c.id);
  const st = settings.statsBy[key];
  const times = st?.times ?? [];
  const last = times.slice(-12);
  const avg = last.length ? last.reduce((a, b) => a + b, 0) / last.length / 1000 : 0;
  const best = times.length ? Math.min(...times) / 1000 : 0;
  let triggers = '';
  try {
    const found = findTriggers(parseAlg(alg));
    if (found.length) triggers = [...new Set(found.map((f) => TRIGGER_BY_NAME.get(f.id)!.name))].join(' · ');
  } catch {
    /* invalid stored alg: shown as is */
  }
  d.innerHTML = `
    <div class="top">
      ${diagramFor(set, c, 72)}
      <div>
        <div><b>${esc(caseName(set, c))}</b> · ${esc(t('group.' + c.group))}</div>
        <code dir="ltr">${esc(alg)}</code>
        ${triggers ? `<div class="triggers">${esc(triggers)}</div>` : ''}
        <div class="stats">${esc(st ? t('stats.reps', { n: st.reps }) + (times.length ? t('stats.times', { avg: avg.toFixed(2), best: best.toFixed(2) }) : '') : t('stats.never'))}</div>
      </div>
    </div>
    <div class="row"><input id="algInput" dir="ltr" value="${esc(alg)}" spellcheck="false" /><button id="btnSaveAlg">${esc(t('btn.save'))}</button>${
      settings.algsBy[key] ? `<button id="btnResetAlg" class="ghost">${esc(t('btn.restore'))}</button>` : ''
    }${set.custom ? `<button id="btnDeleteCustom" class="ghost">${esc(t('btn.delete'))}</button>` : ''}</div>
    ${c.alts?.length ? `<div class="row small">${esc(t('alts'))} ${c.alts.map((a, i) => `<button class="ghost" dir="ltr" data-alt="${i}">${esc(a)}</button>`).join('')}</div>` : ''}
    <div class="err" id="algErr"></div>
    <div class="row"><button id="btnTrainNow" class="primary">${esc(t('btn.trainOnly'))}</button></div>`;
  const setAlg = (value: string | null) => {
    if (value === null) delete settings.algsBy[key];
    else {
      const err = validateUserAlg(set, c, value);
      if (err) {
        $('algErr').textContent = err;
        return;
      }
      // keep the user's grouping and trigger names: they are part of how the algorithm is learned
      settings.algsBy[key] = value.trim().replace(/\s+/g, ' ');
    }
    saveSettings(settings);
    renderCases();
  };
  $('btnSaveAlg').onclick = () => setAlg($<HTMLInputElement>('algInput').value);
  document.getElementById('btnResetAlg')?.addEventListener('click', () => setAlg(null));
  document.getElementById('btnDeleteCustom')?.addEventListener('click', () => {
    settings.custom = settings.custom.filter((a) => a.id !== c.id);
    delete settings.algsBy[key];
    focusCase = null;
    saveSettings(settings);
    renderCases();
  });
  d.querySelectorAll<HTMLButtonElement>('[data-alt]').forEach((b) => (b.onclick = () => setAlg(c.alts![+b.dataset.alt!])));
  $('btnTrainNow').onclick = () => {
    settings.selectedBy[set.id] = [c.id];
    settings.mode = 'same';
    if (settings.appMode !== 'train') setAppMode('train');
    saveSettings(settings);
    syncModeRadios();
    renderCases();
    if (tracked && phase !== 'scan' && phase !== 'computing') void nextRound(c.id);
  };
}

function syncModeRadios() {
  document.querySelectorAll<HTMLInputElement>('input[name=mode]').forEach((r) => (r.checked = r.value === settings.mode));
}

function setAppMode(m: 'train' | 'guide') {
  settings.appMode = m;
  saveSettings(settings);
  renderSteps();
  if (!tracked || phase === 'scan') return setPhase(phase);
  // a cube is known: switch flows on the same state
  if (m === 'guide') startGuide();
  else {
    currentCase = null;
    const next = pickNextCase(settings, activeSet(), null);
    if (next !== null) void nextRound(next);
  }
}

/** Re-renders everything that holds text, in the current language. */
function renderAll() {
  applyDom();
  renderSetSelect();
  const langSel = $<HTMLSelectElement>('langSelect');
  langSel.innerHTML = LANGS.map((l) => `<option value="${l}">${LANG_NAMES[l]}</option>`).join('');
  langSel.value = settings.lang ?? detectLang();
  $('holdText').innerHTML = t('hold', { yellow: `<b class="y">${colorName('yellow')}</b>`, green: `<b class="g">${colorName('green')}</b>` });
  $('scanHelp').textContent = t(settings.detectMode === 'auto' ? 'help.auto' : 'help.guide');
  $('videoHint').textContent = videoHint();
  $('btnCamera').textContent = t(camera.active ? 'btn.stopCam' : 'btn.startCam');
  if (!$('btnLock').hidden) $('btnLock').textContent = t($('btnLock').dataset.locked === 'true' ? 'btn.unlock' : 'btn.lock');
  if (lastMsg) showMsg(lastMsg, lastMsgOk);
  if (!$('regrip').hidden) $('regrip').textContent = t('regrip');
  renderSolverStatus();
  renderGuide();
  renderNet();
  renderCases();
  renderCaseBadge();
  setPhase(phase);
}

function renderSolverStatus() {
  const p = $('solverStatus');
  p.textContent = solverErr ? t('solver.error', { msg: solverErr }) : solverMs === null ? t('solver.loading') : t('solver.ready', { s: (solverMs / 1000).toFixed(1) });
  p.classList.toggle('ready', solverMs !== null);
}

// ---------------------------------------------------------------------------- wiring
$('btnCamera').onclick = () => (camera.active ? stopScanSources() : void startCamera());
$('btnResetScan').onclick = () => {
  if (phase !== 'scan') backToScan();
  else resetScan();
};
$<HTMLSelectElement>('cameraSelect').onchange = (e) => {
  settings.deviceId = (e.target as HTMLSelectElement).value;
  saveSettings(settings);
  void startCamera();
};
$('btnLock').onclick = async () => {
  const btn = $('btnLock');
  const locked = btn.dataset.locked === 'true';
  const r = await camera.setColorLock(!locked);
  btn.dataset.locked = String(r === 'locked');
  btn.textContent = t(r === 'locked' ? 'btn.unlock' : 'btn.lock');
};
$('btnDemo').onclick = startDemo;
$<HTMLInputElement>('guided').onchange = (e) => {
  settings.guided = (e.target as HTMLInputElement).checked;
  saveSettings(settings);
  scanner.session.guided = settings.guided;
  scanner.session.expected = null;
  resetScan();
};
$('btnVideo').onclick = () => $<HTMLInputElement>('videoFile').click();
$<HTMLInputElement>('videoFile').onchange = (e) => {
  const f = (e.target as HTMLInputElement).files?.[0];
  if (f) startFileVideo(f);
};
const modeSel = $<HTMLSelectElement>('detectMode');
modeSel.value = settings.detectMode;
modeSel.onchange = () => {
  settings.detectMode = modeSel.value as DetectMode;
  scanner.mode = settings.detectMode;
  saveSettings(settings);
  $('scanHelp').textContent = t(settings.detectMode === 'auto' ? 'help.auto' : 'help.guide');
};
$('btnResetCalib').onclick = () => {
  settings.calibration = undefined;
  setPrototypes(undefined);
  saveSettings(settings);
  showMsg(() => t('calib.reset'), true);
};
$('btnSolved').onclick = () => {
  stopScanSources();
  resetScan();
  start(SOLVED);
};
$('btnScramble').onclick = () => {
  try {
    const s = applyAlg(SOLVED, $<HTMLInputElement>('scrambleInput').value);
    stopScanSources();
    resetScan();
    start(s);
  } catch (e) {
    const msg = errorText(e);
    showMsg(() => msg);
  }
};
$('btnRetryAssemble').onclick = () => {
  if (!scanResult || !editColors) return;
  const r = assembleFromColors({ colors: editColors, confidence: scanResult.classification.confidence }, scanResult.labs, scanResult.gains);
  if (!r.assembled.ok) {
    const letters = FACES.map((f) => r.faces[f]?.colors.map((c) => COLOR_FACE[c]).join('') ?? '').join('');
    const v = faceletsToCubie(letters);
    const msg = r.assembled.message + (v.ok ? '' : ' ' + describeError(v.error));
    showMsg(() => msg);
    sound.error();
    return;
  }
  handleScanResult({ ...r, classification: { ...r.classification, colors: editColors } });
};
$('btnRescan').onclick = () => {
  resetScan();
  if (!camera.active && !synthetic) void startCamera();
};

$('btnFirst').onclick = () => player.seek(0);
$('btnPrev').onclick = () => void player.prev();
$('btnNext').onclick = () => void player.next();
$('btnPlay').onclick = () => (player.isPlaying() ? player.pause() : void player.play());
const speed = $<HTMLInputElement>('speed');
speed.value = String(1150 - settings.speedMs);
speed.oninput = () => {
  settings.speedMs = 1150 - Number(speed.value);
  player.speedMs = settings.speedMs;
  saveSettings(settings);
};
const fingersBox = $<HTMLInputElement>('showFingers');
fingersBox.checked = settings.showFingers;
fingersBox.onchange = () => {
  settings.showFingers = fingersBox.checked;
  saveSettings(settings);
  renderMoves();
};
$('btnDone').onclick = onDone;
$('btnLost').onclick = backToScan;
$('btnToTrain').onclick = () => setAppMode('train');
$('btnSkip').onclick = () => {
  if (phase !== 'setup' || !tracked) return;
  const others = selectedIds(settings, activeSet()).filter((id) => id !== currentCase);
  if (others.length) void nextRound(others[Math.floor(Math.random() * others.length)]);
};
$('btnShowAlg').onclick = revealAlg;
function revealAlg() {
  if (phase !== 'practice') return;
  algRevealed = true;
  setPhase('practice');
}
$('btnSelectNone').onclick = () => {
  settings.selectedBy[settings.set] = [];
  saveSettings(settings);
  renderCases();
};
document.querySelectorAll<HTMLInputElement>('input[name=mode]').forEach((r) =>
  r.addEventListener('change', () => {
    settings.mode = r.value as 'same' | 'random';
    saveSettings(settings);
  }),
);
document.querySelectorAll<HTMLButtonElement>('[data-appmode]').forEach((b) => (b.onclick = () => setAppMode(b.dataset.appmode as 'train' | 'guide')));
$<HTMLSelectElement>('setSelect').onchange = (e) => {
  settings.set = (e.target as HTMLSelectElement).value;
  focusCase = null;
  saveSettings(settings);
  renderCases();
  if (settings.appMode === 'train' && tracked && phase !== 'scan') {
    currentCase = null;
    const next = pickNextCase(settings, activeSet(), null);
    if (next !== null) void nextRound(next);
    else setPhase('scan');
  }
};
$<HTMLSelectElement>('langSelect').onchange = (e) => {
  settings.lang = (e.target as HTMLSelectElement).value as Lang;
  saveSettings(settings);
  setLang(settings.lang);
  renderAll();
};
$('btnAddCustom').onclick = () => {
  const name = $<HTMLInputElement>('customName').value.trim();
  const alg = $<HTMLInputElement>('customAlg').value.trim();
  const kind = $<HTMLSelectElement>('customKind').value as PatternKind;
  const err = validateCustomAlg(alg, kind);
  if (err) {
    $('customErr').textContent = err;
    return;
  }
  let id = name || `#${settings.custom.length + 1}`;
  while (settings.custom.some((a) => a.id === id)) id += "'";
  settings.custom.push({ id, name: id, alg, kind });
  $('customErr').textContent = '';
  $<HTMLInputElement>('customName').value = '';
  $<HTMLInputElement>('customAlg').value = '';
  focusCase = id;
  saveSettings(settings);
  renderCases();
};

window.addEventListener('keydown', (e) => {
  const tg = e.target as HTMLElement;
  if (tg.tagName === 'INPUT' || tg.tagName === 'SELECT' || tg.tagName === 'TEXTAREA') return;
  if (e.code === 'Space') {
    e.preventDefault();
    onDone();
  } else if (e.code === 'ArrowRight') void player.next();
  else if (e.code === 'ArrowLeft') void player.prev();
  else if (e.code === 'KeyP') player.isPlaying() ? player.pause() : void player.play();
  else if (e.code === 'KeyA') revealAlg();
});

solver.ready.then(
  (ms) => {
    solverMs = ms;
    renderSolverStatus();
  },
  (e) => {
    solverErr = e.message;
    renderSolverStatus();
  },
);

syncModeRadios();
renderAll();
setPhase('scan');

// Debug handle for the console.
Object.assign(window, {
  __trainer: { cube, player, scanner, settings, get tracked() { return tracked; }, get syntheticState() { return synthetic?.state; }, FACE_COLOR, formatAlg },
});
