import { Idleable, Closable } from '@eolian/common/@types';
import { ContextVoiceChannel, ContextMusicQueue } from '@eolian/framework/@types';
import { EventEmitter } from 'node-cache';

export interface Player extends EventEmitter, Idleable, Closable {
  readonly isStreaming: boolean;
  readonly paused: boolean;
  readonly queue: ContextMusicQueue;

  readonly volume: number;
  readonly nightcore: boolean;

  getChannel(): ContextVoiceChannel | undefined;
  setVolume(value: number): void;
  setNightcore(on: boolean): void;

  /**
   * Tells the player to start streaming.
   */
  play(): Promise<void>;

  /**
   * Tells the player to skip the song it is streaming.
   */
  skip(): Promise<void>;

  /**
   * Stops the player from streaming.
   */
  stop(): void;

  /**
   * Tells the player to pause the stream.
   */
  pause(): Promise<void>;

  /**
   * Tells the player to resume the stream.
   */
  resume(): Promise<void>;
}
