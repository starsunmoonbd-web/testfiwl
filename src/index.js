const STREAM_URL = "https://prod-linear-media.toffeelive.com/cdn/live/independent_tv/playlist.m3u8?edge-cache-token=Expires=1791903752~Starts=1791900152~URLPrefix=aHR0cHM6Ly9wcm9kLWxpbmVhci1tZWRpYS50b2ZmZWVsaXZlLmNvbQ~Data=eyJzdWJzY3JpYmVyX2lkIjoiMmYyNmEyZmYtODRkYS00NzRiLWJiN2EtMjFlY2VhZTIyNDBmIn0~Signature=NK8zf151RLZn8nhR6cy1rIKn9_7ffXE06QpM9ljXUutjtUy4XQtMFRizX1RYYcBYHXJeeyCshtPZgfwDbndhAg";

const ALLOWED_HOST = "prod-linear-media.toffeelive.com";

export default {
  async fetch(request) {
    const incoming = new URL(request.url);

    if (incoming.pathname === "/") {
      return new Response(
        `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Independent TV</title>
<style>
body{margin:0;background:#000;color:white;font-family:Arial}
video{width:100%;height:100vh;background:#000}
</style>
</head>
<body>
<video id="player" controls autoplay playsinline></video>
<script>
document.getElementById("player").src="/playlist.m3u8";
</script>
</body>
</html>`,
        {
          headers: {
            "Content-Type": "text/html; charset=utf-8",
            "Cache-Control": "no-store"
          }
        }
      );
    }

    if (
      incoming.pathname !== "/playlist.m3u8" &&
      incoming.pathname !== "/segment"
    ) {
      return new Response("Not found", { status: 404 });
    }

    let target;

    if (incoming.pathname === "/playlist.m3u8") {
      target = new URL(STREAM_URL);
    } else {
      const raw = incoming.searchParams.get("url");

      if (!raw) {
        return new Response("Missing URL", { status: 400 });
      }

      try {
        target = new URL(raw);
      } catch {
        return new Response("Invalid URL", { status: 400 });
      }
    }

    if (
      target.protocol !== "https:" ||
      target.hostname !== ALLOWED_HOST
    ) {
      return new Response("URL not allowed", { status: 403 });
    }

    try {
      const response = await fetch(target.toString(), {
        headers: {
          "User-Agent": "Mozilla/5.0",
          "Accept": "*/*"
        }
      });

      const contentType =
        response.headers.get("Content-Type") ||
        "application/vnd.apple.mpegurl";

      let body = response.body;

      if (
        response.ok &&
        target.pathname.endsWith(".m3u8")
      ) {
        const text = await response.text();

        const rewritten = text
          .split(/\r?\n/)
          .map(line => {
            const value = line.trim();

            if (!value || value.startsWith("#")) {
              return line;
            }

            let absolute;

            try {
              absolute = new URL(value, target);
            } catch {
              return line;
            }

            if (
              absolute.protocol !== "https:" ||
              absolute.hostname !== ALLOWED_HOST
            ) {
              return line;
            }

            return "/segment?url=" +
              encodeURIComponent(absolute.toString());
          })
          .join("\n");

        body = rewritten;
      }

      return new Response(body, {
        status: response.status,
        headers: {
          "Content-Type": contentType,
          "Access-Control-Allow-Origin": "*",
          "Cache-Control": "no-store"
        }
      });
    } catch {
      return new Response(
        "Upstream request failed",
        { status: 502 }
      );
    }
  }
};
