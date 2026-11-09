/** Step-by-step player for a move sequence on the 3D cube. */

import { FaceletState } from '../cube/facelets';
import { applyMoves } from '../cube/moves';
import { Move, invertMove } from '../cube/notation';
import { Cube3D } from './cube3d';

export class SequencePlayer {
  private start: FaceletState = '';
  private moves: Move[] = [];
  /** number of moves already applied */
  index = 0;
  private playing = false;
  private busy = false;
  speedMs = 450;

  constructor(private cube: Cube3D, private onChange: () => void) {}

  load(start: FaceletState, moves: Move[]) {
    this.playing = false;
    this.start = start;
    this.moves = moves;
    this.index = 0;
    this.cube.setState(start);
    this.onChange();
  }

  getMoves(): readonly Move[] {
    return this.moves;
  }

  isPlaying() {
    return this.playing;
  }

  isAtEnd() {
    return this.index >= this.moves.length;
  }

  finalState(): FaceletState {
    return applyMoves(this.start, this.moves);
  }

  async next(): Promise<boolean> {
    if (this.busy || this.isAtEnd()) return false;
    this.busy = true;
    await this.cube.animateMove(this.moves[this.index], this.speedMs);
    this.index++;
    this.busy = false;
    this.onChange();
    return true;
  }

  async prev(): Promise<boolean> {
    if (this.busy || this.index === 0) return false;
    this.busy = true;
    this.playing = false;
    await this.cube.animateMove(invertMove(this.moves[this.index - 1]), this.speedMs);
    this.index--;
    this.busy = false;
    this.onChange();
    return true;
  }

  /** Jump without animation. */
  seek(index: number) {
    this.playing = false;
    this.index = Math.max(0, Math.min(this.moves.length, index));
    this.cube.setState(applyMoves(this.start, this.moves.slice(0, this.index)));
    this.onChange();
  }

  async play() {
    if (this.playing) return;
    if (this.isAtEnd()) this.seek(0);
    this.playing = true;
    this.onChange();
    while (this.playing && !this.isAtEnd()) {
      await this.next();
      if (this.playing) await new Promise((r) => setTimeout(r, this.speedMs * 0.25));
    }
    this.playing = false;
    this.onChange();
  }

  pause() {
    this.playing = false;
    this.onChange();
  }
}
