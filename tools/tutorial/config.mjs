// Settings shared by every tutorial video: the frame, the voices per
// language and the sound mix.

// 1920x1080 frames of a 1440x810 page (the page is drawn at the camera's
// zoom, so text stays sharp however close the camera goes).
export const VIDEO = {
  width: 1920,
  height: 1080,
  fps: 30,
  viewport: { width: 1440, height: 810 },
  // How close the camera may go (1 = the whole page).
  maxZoom: 2.4,
  // The bottom of the frame the subtitles use: framed things stay above it.
  subtitleBand: 0.15
};

// The narration voice of each language: `engine` is a speech engine of
// vo.py (kokoro or piper), `whisper` the faster-whisper model that checks
// it (an English-only model for English, a multilingual one otherwise).
export const LANGUAGES = {
  en: { engine: 'kokoro', voice: 'af_heart', speed: 1.0, whisper: 'small.en' },
  // Piper's tugão reads more clearly a little slower and steadier (less
  // noise); large-v3-turbo hears European Portuguese best.
  pt: { engine: 'piper', voice: 'pt_PT-tugão-medium', speed: 0.85, noise: '0.25,0.25', whisper: 'large-v3-turbo' }
};

// Loudness of the stems before the final -14 LUFS normalisation (see
// tools/trailer/mix.mjs): the music is a light bed well under the voice.
export const MIX = { music: -27, voice: -15, duck: -8 };

// Pauses around the narration (seconds).
export const TIMING = {
  // After each line, before the next step.
  gap: 0.45,
  // Before the first line and after the last one.
  head: 0.6,
  tail: 2.2
};
