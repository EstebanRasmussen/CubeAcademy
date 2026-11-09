declare module 'cubejs' {
  export default class Cube {
    constructor(other?: Cube);
    static fromString(str: string): Cube;
    static initSolver(): void;
    static inverse(alg: string): string;
    static random(): Cube;
    move(alg: string): Cube;
    asString(): string;
    isSolved(): boolean;
    solve(maxDepth?: number): string;
    clone(): Cube;
  }
}
