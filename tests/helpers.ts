export function randomAlg(n: number, seed = 1): string {
  let s = seed;
  const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const faces = 'URFDLB';
  const suf = ['', "'", '2'];
  const out: string[] = [];
  for (let i = 0; i < n; i++) out.push(faces[Math.floor(rnd() * 6)] + suf[Math.floor(rnd() * 3)]);
  return out.join(' ');
}
