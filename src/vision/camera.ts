import { t } from '../i18n';
/**
 * Webcam access following the usual best practices:
 * - `ideal` constraints (never exact) so any camera works;
 * - remembered deviceId;
 * - clear error messages;
 * - stream stopped when the page is hidden, restarted when visible;
 * - optional exposure / white-balance lock so colors stay stable between faces.
 */

export class CameraError extends Error {}

function explain(e: unknown): string {
  const name = (e as DOMException)?.name;
  switch (name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return t('cam.denied');
    case 'NotFoundError':
    case 'OverconstrainedError':
      return t('cam.none');
    case 'NotReadableError':
    case 'AbortError':
      return t('cam.busy');
    default:
      return t('cam.failed', { msg: name ?? String(e) });
  }
}

type ExtCaps = MediaTrackCapabilities & { exposureMode?: string[]; whiteBalanceMode?: string[] };

export class Camera {
  readonly video: HTMLVideoElement;
  private stream: MediaStream | null = null;
  private deviceId: string | undefined;
  private wantRunning = false;
  private onVisibility = () => {
    if (document.hidden) this.release();
    else if (this.wantRunning) void this.open().catch(() => {});
  };

  constructor() {
    this.video = document.createElement('video');
    this.video.playsInline = true;
    this.video.muted = true;
    this.video.autoplay = true;
    document.addEventListener('visibilitychange', this.onVisibility);
  }

  get active(): boolean {
    return !!this.stream;
  }

  get currentDeviceId(): string | undefined {
    return this.stream?.getVideoTracks()[0]?.getSettings().deviceId ?? this.deviceId;
  }

  static async listDevices(): Promise<MediaDeviceInfo[]> {
    const all = await navigator.mediaDevices.enumerateDevices();
    return all.filter((d) => d.kind === 'videoinput');
  }

  async start(deviceId?: string): Promise<void> {
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      throw new CameraError(t('cam.insecure'));
    }
    this.deviceId = deviceId;
    this.wantRunning = true;
    await this.open();
  }

  private async open() {
    this.release();
    const video: MediaTrackConstraints = {
      width: { ideal: 1280 },
      height: { ideal: 720 },
      frameRate: { ideal: 30 },
    };
    if (this.deviceId) video.deviceId = { ideal: this.deviceId };
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ video, audio: false });
    } catch (e) {
      this.wantRunning = false;
      throw new CameraError(explain(e));
    }
    this.video.srcObject = this.stream;
    await this.video.play().catch(() => {});
  }

  private release() {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.video.srcObject = null;
  }

  stop() {
    this.wantRunning = false;
    this.release();
  }

  /** Locks (or unlocks) exposure and white balance where the browser supports it. */
  async setColorLock(lock: boolean): Promise<'locked' | 'unlocked' | 'unsupported'> {
    const track = this.stream?.getVideoTracks()[0];
    if (!track || typeof track.getCapabilities !== 'function') return 'unsupported';
    const caps = track.getCapabilities() as ExtCaps;
    const adv: Record<string, string> = {};
    const mode = lock ? 'manual' : 'continuous';
    if (caps.exposureMode?.includes(mode)) adv.exposureMode = mode;
    if (caps.whiteBalanceMode?.includes(mode)) adv.whiteBalanceMode = mode;
    if (!Object.keys(adv).length) return 'unsupported';
    try {
      await track.applyConstraints({ advanced: [adv as MediaTrackConstraintSet] });
      return lock ? 'locked' : 'unlocked';
    } catch {
      return 'unsupported';
    }
  }

  dispose() {
    this.stop();
    document.removeEventListener('visibilitychange', this.onVisibility);
  }
}
