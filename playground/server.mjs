import http from "http";
import { execFile } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, "..");

const server = http.createServer((req, res) => {
  // Enable CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Content-Type", "application/json");

  if (req.method === "OPTIONS") {
    res.writeHead(200);
    res.end();
    return;
  }

  if (req.method === "POST" && req.url === "/api/generate-fixture") {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString();
    });

    req.on("end", () => {
      try {
        if (!body) {
          res.writeHead(400);
          res.end(JSON.stringify({ error: "Request body is empty" }));
          return;
        }

        let parsedData;
        try {
          parsedData = JSON.parse(body);
        } catch (parseErr) {
          console.error("JSON parse error:", parseErr.message);
          console.error("Body received:", body);
          res.writeHead(400);
          res.end(
            JSON.stringify({
              error: "Invalid JSON",
              details: parseErr.message,
              received: body.substring(0, 100),
            }),
          );
          return;
        }

        const { username, type } = parsedData;

        if (!username || !type) {
          res.writeHead(400);
          res.end(JSON.stringify({ error: "Missing username or type" }));
          return;
        }

        // Execute the pnpm command
        console.log(`Executing: pnpm add:fixture ${username} ${type}`);

        execFile(
          "pnpm",
          ["add:fixture", username, type],
          { cwd: rootDir },
          (error, stdout, stderr) => {
            if (error) {
              res.writeHead(500);
              res.end(
                JSON.stringify({
                  error: error.message,
                  stderr: stderr || "",
                }),
              );
              return;
            }

            res.writeHead(200);
            res.end(
              JSON.stringify({
                success: true,
                message: stdout.trim(),
              }),
            );
          },
        );
      } catch (err) {
        res.writeHead(500);
        res.end(
          JSON.stringify({
            error: "Server error",
            details: err.message,
          }),
        );
      }
    });
    return;
  }

  res.writeHead(404);
  res.end(JSON.stringify({ error: "Not found" }));
});

const PORT = 3001;
server.listen(PORT, () => {
  console.log(`Fixture API server running on http://localhost:${PORT}`);
});
