import { n, v, op } from "../src/expressions.ts";
export const euler=op("add",op("sub",v("V"),v("E")),v("F"));
export const naiveEuler=op("eq",euler,n(2));
export const bettiSum=op("add",op("sub",op("sub",v("V"),v("r1")),op("sub",v("n1"),v("r2"))),v("n2"));
export const eulerIdentity=op("eq",euler,bettiSum);
