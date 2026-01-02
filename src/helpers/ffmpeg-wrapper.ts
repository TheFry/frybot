import { spawn } from 'child_process';
import { Readable, PassThrough } from 'stream';

export interface FfmpegOptions {
  input: string | Readable;
  output?: string;
  globalArgs?: string[];
  inputArgs?: string[];
  outputArgs?: string[];
}

export function ffmpeg(options: FfmpegOptions): Promise<string> | Readable {
  const { input, output, globalArgs = [], inputArgs = [], outputArgs = [] } = options;
  const args: string[] = [];

  args.push(...globalArgs);
  args.push(...inputArgs);

  if (typeof input === 'string') {
    args.push('-i', input);
  } else {
    input.on('error', (err) => {
      ffmpegProcess.kill();
      if (outputStream) outputStream.emit('error', err);
    });
    args.push('-i', 'pipe:0');
  }
  
  if (output) {
    args.push(...outputArgs, output);
  } else {
    args.push(...outputArgs, 'pipe:1');
  }

  const outputStream = output ? null : new PassThrough();

  const ffmpegProcess = spawn('ffmpeg', args, {
    stdio: [
      typeof input === 'string' ? 'ignore' : 'pipe',
      output ? 'ignore' : 'pipe',
      'pipe'
    ]
  });

  if (typeof input !== 'string' && ffmpegProcess.stdin) {
    input.pipe(ffmpegProcess.stdin);
  }

  if (!output && outputStream && ffmpegProcess.stdout) {
    ffmpegProcess.stdout.pipe(outputStream);
  }

  let stderr = '';
  ffmpegProcess.stderr?.on('data', (data) => {
    stderr += data.toString();
  });

  if(output) {
    return new Promise((resolve, reject) => {
      ffmpegProcess.on('error', reject);
      ffmpegProcess.on('close', (code) => {
        if (code === 0) {
          resolve(output);
        } else {
          reject(new Error(`FFmpeg exited with code ${code}. Error: ${stderr}`));
        }
      });
    });
  }

  if(outputArgs.length === 0) {
    throw new Error('Output arguments must be specified when no output path is provided.');
  }

  ffmpegProcess.on('error', (err) => outputStream!.emit('error', err));
  ffmpegProcess.on('close', (code) => {
    if (code !== 0) {
      outputStream!.emit('error', new Error(`FFmpeg exited with code ${code}. Error: ${stderr}`));
    } else {
      outputStream!.end();
    }
  });
  outputStream!.on('close', () => {
    if (!ffmpegProcess.killed) {
      ffmpegProcess.kill();
    }
  });
  return outputStream!;
}