// The suites npm test runs, in order. Each is { name, what, run(t) }; see run.mjs for `t`.
import boot from './boot.mjs';
import ui from './ui.mjs';
import walk from './walk.mjs';
import shots from './shots.mjs';
import lockstep from './lockstep.mjs';
import online from './online.mjs';
import cpu from './cpu.mjs';

export const SUITES = [boot, ui, walk, shots, lockstep, online, cpu];
