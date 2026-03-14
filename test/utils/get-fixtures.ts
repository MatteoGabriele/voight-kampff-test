import fs from "fs";
import path from "path";

export function getFixtures() {
  const fixturesDir = path.join(__dirname, "../fixtures");

  return fs
    .readdirSync(fixturesDir)
    .filter((file) => file.endsWith(".json"))
    .map((file) => {
      const filePath = path.join(fixturesDir, file);
      const prefix = file.split("_")[0] || "unknown";
      return [JSON.parse(fs.readFileSync(filePath, "utf-8")), prefix];
    });
}
