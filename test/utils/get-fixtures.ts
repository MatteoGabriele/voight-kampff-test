import fs from "fs";
import path from "path";
import type { IdentityClassification } from "../../src/types";

export function getFixtures(folderName: IdentityClassification) {
  const fixturesDir = path.join(__dirname, "../fixtures", folderName);
  return fs
    .readdirSync(fixturesDir)
    .filter((file) => file.endsWith(".json"))
    .map((file, index) => {
      const filePath = path.join(fixturesDir, file);
      return [
        JSON.parse(fs.readFileSync(filePath, "utf-8")),
        `automation ${index + 1}`,
      ];
    });
}
