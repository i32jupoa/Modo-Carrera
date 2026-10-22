import { describe, expect, it } from "vitest";
import { marketValueFor } from "./players";
import { teamById, teamsByLeague } from "./teams";

describe("market valuation club and league context", () => {
  it("values the same high-rated player lower in Segunda than at Villarreal", () => {
    const atVillarreal = marketValueFor(88, 24, "ST", "vil", "laliga", 0, 0, 0, false, 77, undefined, undefined, 90).value;
    const atCordoba = marketValueFor(88, 24, "ST", "cordoba", "laliga2", 0, 0, 0, false, 64, undefined, undefined, 90).value;

    expect(atVillarreal).toBeGreaterThan(atCordoba * 1.5);
  });

  it("recognizes the additional value of an elite club", () => {
    const atRealMadrid = marketValueFor(88, 24, "ST", "rma", "laliga", 0, 0, 0, false, 88, undefined, undefined, 90).value;
    const atVillarreal = marketValueFor(88, 24, "ST", "vil", "laliga", 0, 0, 0, false, 77, undefined, undefined, 90).value;

    expect(atRealMadrid).toBeGreaterThan(atVillarreal);
  });


  it("keeps Málaga selectable in Primera and its high-potential player below €10M", () => {
    const malagaLeague = teamById("malaga").league;
    expect(malagaLeague).toBe("laliga");
    expect(teamById("malaga").name).toBe("Málaga CF");
    expect(teamsByLeague("laliga", { teamLeagueOverrides: {} }).some((team) => team.id === "malaga")).toBe(true);

    const chupeAtMalaga = marketValueFor(
      76,
      21,
      "ST",
      "malaga",
      malagaLeague,
      0,
      0,
      0,
      false,
      68.1,
      undefined,
      undefined,
      85,
    ).value;

    expect(chupeAtMalaga).toBeLessThan(10);
  });

  it("halves values for modest first-division clubs like Elche versus a European-level club", () => {
    const elche = marketValueFor(82, 24, "ST", "elc", "laliga", 0, 0, 0, false, 70, undefined, undefined, 86).value;
    const villarreal = marketValueFor(82, 24, "ST", "vil", "laliga", 0, 0, 0, false, 77, undefined, undefined, 86).value;
    expect(elche).toBeLessThan(villarreal * 0.65);
  });

  it("does not reduce the existing market values of elite forwards", () => {
    const mbappe = marketValueFor(91, 27, "ST", "rma", "laliga", 0, 0, 0, false, 79, undefined, undefined, 94).value;
    const vini = marketValueFor(89, 25, "LW", "rma", "laliga", 0, 0, 0, false, 79, undefined, undefined, 92).value;

    expect(mbappe).toBeGreaterThan(200);
    expect(vini).toBeGreaterThan(150);
  });
});
