// The suites npm test runs, in order. Each is { name, what, run(t) }; see run.mjs for `t`.
import boot from './boot.mjs';
import ui from './ui.mjs';
import tutorial from './tutorial.mjs';
import campaign from './campaign.mjs';
import shop from './shop.mjs';
import walk from './walk.mjs';
import shots from './shots.mjs';
import lockstep from './lockstep.mjs';
import online from './online.mjs';
import relay from './relay.mjs';
import cpu from './cpu.mjs';
import perf from './perf.mjs';

export const SUITES = [boot, ui, tutorial, campaign, shop, walk, shots, lockstep, online, relay, cpu, perf];
