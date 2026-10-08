import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(fileURLToPath(new URL(".", import.meta.url)));
const port = Number.parseInt(process.env.PORT ?? "4174", 10);

const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".jpg", "image/jpeg"],
  [".png", "image/png"],
  [".webp", "image/webp"],
  [".woff2", "font/woff2"]
]);

function sendFile(response, filePath, fileStats) {
  response.writeHead(200, {
    "Content-Type": contentTypes.get(extname(filePath)) ?? "application/octet-stream",
    "Content-Length": fileStats.size,
    "Cache-Control": "no-cache"
  });
  createReadStream(filePath).pipe(response);
}

const server = createServer(async (request, response) => {
  const pathname = decodeURIComponent(new URL(request.url ?? "/", "http://localhost").pathname);
  const requestedPath = resolve(projectRoot, `.${pathname}`);
  const isInsideProject = requestedPath === projectRoot || requestedPath.startsWith(`${projectRoot}${sep}`);

  if (isInsideProject && extname(requestedPath)) {
    try {
      const fileStats = await stat(requestedPath);
      if (fileStats.isFile()) {
        sendFile(response, requestedPath, fileStats);
        return;
      }
    } catch {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Not found");
      return;
    }
  }

  const indexPath = resolve(projectRoot, "index.html");
  const indexStats = await stat(indexPath);
  sendFile(response, indexPath, indexStats);
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Webild portfolio running at http://127.0.0.1:${port}`);
});
