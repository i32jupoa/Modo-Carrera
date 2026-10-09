import { describe, expect, it } from "vitest";
import { getAcademyTeamsScheduledForDate, shiftAcademyFixtureDateToSeason } from "./academyAiMatchdayRunner";

describe("calendario juvenil de clubes IA", () => {
  it("mueve las fechas del calendario a la temporada correspondiente", () => {
    expect(shiftAcademyFixtureDateToSeason("2026-08-14", 2026)).toBe("2026-08-14");
    expect(shiftAcademyFixtureDateToSeason("2026-08-14", 2027)).toBe("2027-08-14");
    expect(shiftAcademyFixtureDateToSeason("2027-03-12", 2027)).toBe("2028-03-12");
  });

  it("solo selecciona clubes que juegan Liga en esa fecha y excluye al equipo usuario", () => {
    const calendar = new Map<string, Set<string>>([
      ["2026-09-12", new Set(["rma", "bar", "mci", "ars"])],
      ["2026-09-13", new Set(["bayern", "psg"])],
    ]);
    expect(getAcademyTeamsScheduledForDate(calendar, "2026-09-12", "rma")).toEqual(["ars", "bar", "mci"]);
    expect(getAcademyTeamsScheduledForDate(calendar, "2026-09-14", "rma")).toEqual([]);
  });
});
