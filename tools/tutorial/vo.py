"""Narration for the DivJS tutorial videos: speaks the lines of one lesson
script in one language, then checks each line by transcribing it back.

    <python> tools/tutorial/vo.py --lines <script.json> --out <dir>
                                  --engine kokoro|piper --voice <voice>
                                  [--speed 1.0] [--language en]
                                  [--whisper small.en] [--noise 0.25,0.25]

<python> is a Python with `soundfile`, `numpy`, `faster-whisper` and the
speech engine (`kokoro` or `piper-tts`), in a virtualenv outside the
repository (`npm run tutorial` finds it in $DIVJS_VO_PYTHON or --vo-python).

The script's "lines" are {id: text} or {id: {"text": ..., "say": ...}}:
`text` is what the subtitles show, `say` (optional) how it is spoken, with
the engine's own markup where a word needs help. `{name}` markers in the
text are cues: the video waits for them to act on the word that follows.

Writes <dir>/<id>.wav (mono) and <dir>/vo.json with, per line: its text,
duration, what was heard, a similarity score (1 = the words match), the
time of every written word (aligned to the transcription) and of every cue.
Lines whose text, voice and speed did not change are not spoken again.
"""

import argparse
import difflib
import json
import os
import re
import sys

import numpy as np
import soundfile as sf

MARK = re.compile(r'\{([a-z0-9_-]+)\}')


def words(text):
    text = text.lower().replace('divjs', 'div js')
    # "x160" is "x 160".
    text = re.sub(r'(?<=[^\W\d_])(?=\d)|(?<=\d)(?=[^\W\d_])', ' ', text)
    return re.sub(r"[^\w' ]+", ' ', text).split()


def plain(spoken):
    """The words of a line to speak, without Kokoro's [word](/phonemes/) markup."""
    return re.sub(r'\[([^\]]+)\]\(/[^)]*/\)', r'\1', spoken)


def trim(audio, rate, threshold=0.004, pad=0.12):
    """Cuts the silence before and after the speech (keeps `pad` s)."""
    loud = np.where(np.abs(audio) > threshold)[0]
    if len(loud) == 0:
        return audio
    a = max(0, loud[0] - int(pad * rate))
    b = min(len(audio), loud[-1] + int(pad * rate))
    return audio[a:b]


# ── Speech engines: each returns (float32 mono audio, sample rate) ─────────

class Kokoro:
    def __init__(self, voice, speed, noise=None):
        from kokoro import KPipeline
        self.pipeline = KPipeline(lang_code=voice[0], repo_id='hexgrad/Kokoro-82M')
        self.voice = voice
        self.speed = speed

    def speak(self, text):
        parts = [np.asarray(audio, dtype=np.float32) for _, _, audio in self.pipeline(text, voice=self.voice, speed=self.speed)]
        return np.concatenate(parts), 24000


class Piper:
    """A Piper voice from rhasspy/piper-voices, e.g. pt_PT-tugão-medium."""

    def __init__(self, voice, speed, noise=None):
        from huggingface_hub import hf_hub_download
        from piper import PiperVoice, SynthesisConfig
        lang, name, quality = voice.split('-')
        folder = f'{lang.split("_")[0]}/{lang}/{name}/{quality}'
        model = hf_hub_download('rhasspy/piper-voices', f'{folder}/{voice}.onnx')
        hf_hub_download('rhasspy/piper-voices', f'{folder}/{voice}.onnx.json')
        self.voice = PiperVoice.load(model)
        # `noise`: [noise_scale, noise_w_scale], lower = steadier speech.
        extra = {'noise_scale': noise[0], 'noise_w_scale': noise[1]} if noise else {}
        self.config = SynthesisConfig(length_scale=1.0 / speed, **extra)

    def speak(self, text):
        chunks = list(self.voice.synthesize(text, self.config))
        audio = np.concatenate([c.audio_float_array for c in chunks]).astype(np.float32)
        return audio, chunks[0].sample_rate


ENGINES = {'kokoro': Kokoro, 'piper': Piper}


# ── Word times ─────────────────────────────────────────────────────────────

def align(written, heard):
    """Times of the written words (list of str) from the heard ones
    ([(word, start, end)]): matched words take their time, the others are
    spread evenly between their neighbours."""
    a = [w for w in written]
    b = [h[0] for h in heard]
    times = [None] * len(a)
    for block in difflib.SequenceMatcher(None, a, b, autojunk=False).get_matching_blocks():
        for k in range(block.size):
            times[block.a + k] = (heard[block.b + k][1], heard[block.b + k][2])
    end = heard[-1][2] if heard else 0.0
    i = 0
    while i < len(times):
        if times[i] is not None:
            i += 1
            continue
        j = i
        while j < len(times) and times[j] is None:
            j += 1
        t0 = times[i - 1][1] if i > 0 else 0.0
        t1 = times[j][0] if j < len(times) else end
        step = (t1 - t0) / (j - i)
        for k in range(i, j):
            times[k] = (t0 + step * (k - i), t0 + step * (k - i + 1))
        i = j
    return times


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--lines', required=True)
    parser.add_argument('--out', required=True)
    parser.add_argument('--engine', default='kokoro', choices=sorted(ENGINES))
    parser.add_argument('--voice', default='af_heart')
    parser.add_argument('--speed', type=float, default=1.0)
    parser.add_argument('--language', default='en')
    parser.add_argument('--whisper', default='small.en')
    parser.add_argument('--noise', default='', help='Piper only: noise_scale,noise_w_scale')
    args = parser.parse_args()

    with open(args.lines, encoding='utf-8') as f:
        lines = json.load(f)['lines']
    os.makedirs(args.out, exist_ok=True)
    report_file = os.path.join(args.out, 'vo.json')
    old = {}
    if os.path.exists(report_file):
        with open(report_file, encoding='utf-8') as f:
            old = json.load(f).get('lines', {})

    engine = None
    whisper = None
    report = {'engine': args.engine, 'voice': args.voice, 'speed': args.speed, 'noise': args.noise, 'language': args.language, 'whisper': args.whisper, 'lines': {}}
    for line_id, line in lines.items():
        text = line['text'] if isinstance(line, dict) else line
        spoken = line.get('say', text) if isinstance(line, dict) else text
        spoken = MARK.sub('', spoken)
        shown = re.sub(r'\s+', ' ', MARK.sub('', text)).strip()
        key = [args.engine, args.voice, args.speed, args.noise, args.whisper, spoken, text]
        path = os.path.join(args.out, f'{line_id}.wav')
        if line_id in old and old[line_id].get('key') == key and os.path.exists(path):
            report['lines'][line_id] = old[line_id]
            print(f'{line_id}: unchanged ({old[line_id]["seconds"]:.2f} s)', file=sys.stderr)
            continue
        if engine is None:
            noise = [float(n) for n in args.noise.split(',')] if args.noise else None
            engine = ENGINES[args.engine](args.voice, args.speed, noise)
            from faster_whisper import WhisperModel
            whisper = WhisperModel(args.whisper, device='cpu', compute_type='int8')
        audio, rate = engine.speak(spoken)
        audio = trim(audio, rate)
        sf.write(path, audio, rate, subtype='FLOAT')
        segments = list(whisper.transcribe(path, language=args.language, beam_size=5, word_timestamps=True)[0])
        heard = ' '.join(s.text.strip() for s in segments)
        heard_words = []
        for s in segments:
            for w in s.words or []:
                for part in words(w.word):
                    heard_words.append((part, float(w.start), float(w.end)))
        # Word by word, or letter by letter without spaces (a transcription
        # that joins words, "SoundCoin", is not a mistake of the voice).
        score = max(max(difflib.SequenceMatcher(None, words(t), words(heard)).ratio(),
                        difflib.SequenceMatcher(None, ''.join(words(t)), ''.join(words(heard))).ratio()) for t in (shown, plain(spoken)))

        # The written words (as the subtitles show them) and the cues.
        tokens = []
        cues = {}
        for piece in re.split(r'(\{[a-z0-9_-]+\})', text):
            m = MARK.fullmatch(piece)
            if m:
                cues[m.group(1)] = len(tokens)
            else:
                tokens.extend(piece.split())
        times = align_tokens(tokens, heard_words)
        seconds = len(audio) / rate
        report['lines'][line_id] = {
            'text': shown,
            'said': spoken,
            'seconds': round(seconds, 3),
            'heard': heard,
            'match': round(score, 3),
            'match_words': round(max(difflib.SequenceMatcher(None, words(t), words(heard)).ratio() for t in (shown, plain(spoken))), 3),
            'words': [{'w': t, 'start': round(s, 3), 'end': round(e, 3)} for t, (s, e) in zip(tokens, times)],
            'cues': {name: round(times[i][0], 3) if i < len(times) else round(seconds, 3) for name, i in cues.items()},
            'key': key
        }
        print(f'{line_id}: {seconds:.2f} s, match {score:.2f} - heard "{heard}"', file=sys.stderr)

    with open(report_file, 'w', encoding='utf-8') as f:
        json.dump(report, f, indent=2, ensure_ascii=False)


def align_tokens(tokens, heard):
    """A time per written token: a token can be several heard words
    ("DivJS" is "div js"), so its words are aligned and it spans them."""
    flat = []
    owner = []
    for i, t in enumerate(tokens):
        for w in words(t):
            flat.append(w)
            owner.append(i)
    if not flat:
        return [(0.0, 0.0)] * len(tokens)
    times = align(flat, heard)
    result = [None] * len(tokens)
    for (s, e), i in zip(times, owner):
        if result[i] is None:
            result[i] = [s, e]
        else:
            result[i][1] = e
    # Tokens with no letters (a dash, say) sit where the next one starts.
    for i in range(len(result)):
        if result[i] is None:
            nxt = next((result[k] for k in range(i + 1, len(result)) if result[k] is not None), None)
            prev = result[i - 1] if i > 0 else None
            at = nxt[0] if nxt else (prev[1] if prev else 0.0)
            result[i] = [at, at]
    return [tuple(r) for r in result]


if __name__ == '__main__':
    main()
