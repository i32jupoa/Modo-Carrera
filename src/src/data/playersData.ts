import p1 from "./players.part1.json";
import p2 from "./players.part2.json";
import p3 from "./players.part3.json";
const all = [...(p1 as any[]), ...(p2 as any[]), ...(p3 as any[])];
export default all;
