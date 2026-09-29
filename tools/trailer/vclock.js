// Injected into every page the trailer records (Playwright addInitScript),
// before any of the page's own scripts. It takes time away from the page:
//
// - requestAnimationFrame callbacks and performance.now() only move when
//   the recorder calls __vclock.step(), exactly 1/60 s each time, so every
//   recorded frame is one engine frame, none dropped or doubled however
//   slow the capture is;
// - Math.random() is seeded, so a take plays the same way every time;
// - the page's AudioContext is an OfflineAudioContext on the same virtual
//   clock: sounds and music are scheduled when the game plays them and
//   rendered afterwards by __vclock.renderAudio(), in sync with the frames.
//
// Settings come from window.__vclockConfig (set by an earlier init script):
// { seed, audioSeconds }.
(() =>
{
  const config = window.__vclockConfig || {};
  const FRAME_MS = 1000 / 60;
  let now = 1000;
  let nextId = 1;
  let queue = [];
  let timers = [];

  window.requestAnimationFrame = (callback) =>
  {
    const id = nextId++;
    queue.push({ id, callback });
    return id;
  };
  window.cancelAnimationFrame = (id) =>
  {
    queue = queue.filter((entry) => entry.id !== id);
  };
  performance.now = () => now;

  let seed = (Number(config.seed) >>> 0) || 1;
  Math.random = () =>
  {
    seed = (seed + 0x6d2b79f5) >>> 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  // Calls `fn` when the virtual clock reaches `at` (ms).
  const at = (time, fn) => timers.push({ time, fn });

  // ── Audio ───────────────────────────────────────────────────────────
  const RATE = 44100;
  const Offline = window.OfflineAudioContext;
  let audio = null;
  let audioStart = 0;
  const audioNow = () => (now - audioStart) / 1000;
  if (Offline)
  {
    class VirtualAudioContext extends Offline
    {
      constructor()
      {
        super(2, Math.ceil(RATE * (Number(config.audioSeconds) || 60)), RATE);
        audio = this;
        audioStart = now;
      }

      get state()
      {
        return 'running';
      }

      get currentTime()
      {
        return audioNow();
      }

      resume()
      {
        return Promise.resolve();
      }

      suspend()
      {
        return Promise.resolve();
      }

      close()
      {
        return Promise.resolve();
      }
    }
    window.AudioContext = VirtualAudioContext;
    window.webkitAudioContext = VirtualAudioContext;

    // start()/stop() without a time mean "now" on the virtual clock, and
    // `onended` fires when the virtual clock passes the end (games ask
    // is_playing_sound).
    const patch = (proto) =>
    {
      const start = proto.start;
      const stop = proto.stop;
      proto.start = function (when, ...rest)
      {
        if (this.context !== audio)
        {
          return start.call(this, when, ...rest);
        }
        const t = when === undefined || when < audioNow() ? audioNow() : when;
        start.call(this, t, ...rest);
        if (this.buffer && !this.loop)
        {
          const rate = this.playbackRate ? Math.max(0.05, this.playbackRate.value) : 1;
          at(audioStart + (t + this.buffer.duration / rate) * 1000, () => this.onended && this.onended());
        }
        return undefined;
      };
      proto.stop = function (when)
      {
        if (this.context !== audio)
        {
          return stop.call(this, when);
        }
        const t = when === undefined || when < audioNow() ? audioNow() : when;
        stop.call(this, t);
        at(audioStart + t * 1000, () => this.onended && this.onended());
        return undefined;
      };
    };
    for (const type of ['AudioScheduledSourceNode', 'AudioBufferSourceNode', 'OscillatorNode', 'ConstantSourceNode'])
    {
      const proto = window[type] && window[type].prototype;
      if (proto && Object.prototype.hasOwnProperty.call(proto, 'start'))
      {
        patch(proto);
      }
    }
  }

  window.__vclock = {
    FRAME_MS,
    now: () => now,
    // Advances one frame: runs the timers that fall due and the animation
    // frame callbacks queued so far.
    step()
    {
      now += FRAME_MS;
      const due = timers.filter((t) => t.time <= now);
      timers = timers.filter((t) => t.time > now);
      for (const t of due)
      {
        t.fn();
      }
      const run = queue;
      queue = [];
      for (const entry of run)
      {
        entry.callback(now);
      }
    },
    // True while something waits for the next frame (the engine asks for
    // one at the end of every frame it finishes).
    waiting: () => queue.length > 0,
    // Renders everything scheduled so far and returns the sound between
    // virtual times fromMs and toMs as two base64 Float32 channels
    // (silence where the page had not made a sound yet).
    async renderAudio(fromMs, toMs)
    {
      if (!audio)
      {
        return null;
      }
      const buffer = await audio.startRendering();
      const offset = Math.round((fromMs - audioStart) / 1000 * RATE);
      const frames = Math.round((toMs - fromMs) / 1000 * RATE);
      const encode = (channel) =>
      {
        const source = buffer.getChannelData(channel);
        const part = new Float32Array(frames);
        for (let i = Math.max(0, -offset); i < frames && offset + i < source.length; i++)
        {
          part[i] = source[offset + i];
        }
        const bytes = new Uint8Array(part.buffer);
        let binary = '';
        for (let i = 0; i < bytes.length; i += 0x8000)
        {
          binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
        }
        return btoa(binary);
      };
      return { rate: RATE, left: encode(0), right: encode(1) };
    }
  };
})();
