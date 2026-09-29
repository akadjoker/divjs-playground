"""Narration for the DivJS trailers (optional): speaks the lines of
vo_lines.json with the Kokoro TTS model and checks them by transcribing
them back with faster-whisper.

    <python> tools/trailer/vo.py --video short --out <dir> [--voice bm_george]
                                 [--speed 1.0] [--lines tools/trailer/vo_lines.json]
                                 [--whisper small.en]

<python> is a Python that has the `kokoro`, `soundfile` and `faster-whisper`
packages (a virtualenv outside the repository; `npm run trailer` finds it
in $DIVJS_VO_PYTHON or --vo-python). Writes <dir>/<segment>.wav (24 kHz
mono) and <dir>/vo.json: each line's text, duration and transcription,
with a similarity score (1 = the words match). A line can be
{"text": ..., "say": ...} to speak it differently from how it is written,
with Kokoro's [word](/phonemes/) markup where a word needs help.
"""

import argparse
import difflib
import json
import os
import re
import sys

import numpy as np
import soundfile as sf

RATE = 24000


def words(text):
    text = text.lower().replace('divjs', 'div js')
    return re.sub(r"[^a-z0-9' ]+", ' ', text).split()


def plain(spoken):
    """The words of a line to speak, without Kokoro's [word](/phonemes/) markup."""
    return re.sub(r'\[([^\]]+)\]\(/[^)]*/\)', r'\1', spoken)


def trim(audio, threshold=0.004, pad=0.06):
    """Cuts the silence before and after the speech (keeps `pad` s)."""
    loud = np.where(np.abs(audio) > threshold)[0]
    if len(loud) == 0:
        return audio
    a = max(0, loud[0] - int(pad * RATE))
    b = min(len(audio), loud[-1] + int(pad * RATE))
    return audio[a:b]


def main():
    here = os.path.dirname(os.path.abspath(__file__))
    parser = argparse.ArgumentParser()
    parser.add_argument('--video', required=True)
    parser.add_argument('--out', required=True)
    parser.add_argument('--voice', default='bm_george')
    parser.add_argument('--speed', type=float, default=1.0)
    parser.add_argument('--lines', default=os.path.join(here, 'vo_lines.json'))
    parser.add_argument('--whisper', default='small.en')
    args = parser.parse_args()

    with open(args.lines, encoding='utf-8') as f:
        lines = json.load(f)[args.video]
    os.makedirs(args.out, exist_ok=True)

    from kokoro import KPipeline
    pipeline = KPipeline(lang_code=args.voice[0], repo_id='hexgrad/Kokoro-82M')
    from faster_whisper import WhisperModel
    whisper = WhisperModel(args.whisper, device='cpu', compute_type='int8')

    report = {'voice': args.voice, 'speed': args.speed, 'lines': {}}
    for segment, line in lines.items():
        text = line['text'] if isinstance(line, dict) else line
        spoken = line.get('say', text) if isinstance(line, dict) else text
        parts = [np.asarray(audio, dtype=np.float32) for _, _, audio in pipeline(spoken, voice=args.voice, speed=args.speed)]
        audio = trim(np.concatenate(parts))
        path = os.path.join(args.out, f'{segment}.wav')
        sf.write(path, audio, RATE, subtype='FLOAT')
        heard = ' '.join(s.text.strip() for s in whisper.transcribe(path, language='en', beam_size=5)[0])
        # Heard as written, or as said ("It is back" for "It's back").
        score = max(difflib.SequenceMatcher(None, words(t), words(heard)).ratio() for t in (text, plain(spoken)))
        report['lines'][segment] = {'text': text, 'said': spoken, 'seconds': round(len(audio) / RATE, 3), 'heard': heard, 'match': round(score, 3)}
        print(f'{segment}: {len(audio) / RATE:.2f} s, match {score:.2f} - heard "{heard}"', file=sys.stderr)

    with open(os.path.join(args.out, 'vo.json'), 'w', encoding='utf-8') as f:
        json.dump(report, f, indent=2)


if __name__ == '__main__':
    main()
