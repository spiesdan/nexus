import { describe, expect, it } from "vitest";

import { PITCH, PITCH_MAX, YAW_MAX, olharPara } from "./gaze";

describe("olharPara — o bloub segue o cursor", () => {
  it("cursor à direita olha para a direita, à esquerda para a esquerda", () => {
    expect(olharPara({ nx: 1, ny: 0 }).yaw).toBe(YAW_MAX);
    expect(olharPara({ nx: -1, ny: 0 }).yaw).toBe(-YAW_MAX);
    expect(olharPara({ nx: 0, ny: 0 }).yaw).toBe(0);
  });

  it("cursor abaixo desce e acima sobe, sempre a partir da altura de repouso", () => {
    expect(olharPara({ nx: 0, ny: 1 }).pitch).toBe(PITCH - PITCH_MAX);
    expect(olharPara({ nx: 0, ny: -1 }).pitch).toBe(PITCH + PITCH_MAX);
    expect(olharPara({ nx: 0, ny: 0 }).pitch).toBe(PITCH);
  });

  it("com o cursor no centro o olhar está completo e sem giro residual", () => {
    const olhar = olharPara({ nx: 0, ny: 0 });
    expect(olhar.mix).toBe(1);
    expect(olhar.spin).toBe(0);
    expect(olhar.wander).toBe(0);
  });

  it("o alvo é puro: mesma entrada, mesmo alvo", () => {
    expect(olharPara({ nx: 0.4, ny: -0.7 })).toEqual(olharPara({ nx: 0.4, ny: -0.7 }));
  });
});
