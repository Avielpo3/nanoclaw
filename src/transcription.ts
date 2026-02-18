import { execFile } from 'child_process';
import { logger } from './logger.js';

const PYTHON = '/Library/Frameworks/Python.framework/Versions/3.11/bin/python3';
const TIMEOUT_MS = 60_000;

const TRANSCRIBE_SCRIPT = `
import sys, json
from faster_whisper import WhisperModel
model = WhisperModel("medium", compute_type="int8")
segments, info = model.transcribe(sys.argv[1])
print(" ".join(s.text.strip() for s in segments))
`;

export function transcribeAudio(audioPath: string): Promise<string | null> {
  return new Promise((resolve) => {
    execFile(
      PYTHON,
      ['-c', TRANSCRIBE_SCRIPT, audioPath],
      { timeout: TIMEOUT_MS },
      (err, stdout, stderr) => {
        if (err) {
          logger.error({ err, stderr }, 'Transcription failed');
          resolve(null);
          return;
        }
        const text = stdout.trim();
        if (!text) {
          logger.warn('Transcription returned empty text');
          resolve(null);
          return;
        }
        logger.info({ chars: text.length }, 'Transcription complete');
        resolve(text);
      },
    );
  });
}
