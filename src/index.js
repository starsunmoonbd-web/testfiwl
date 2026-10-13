const STREAM_URL =
  "https://prod-linear-media.toffeelive.com/cdn/live/independent_tv/playlist.m3u8?edge-cache-token=Expires=1791903752~Starts=1791900152~URLPrefix=aHR0cHM6Ly9wcm9kLWxpbmVhci1tZWRpYS50b2ZmZWVsaXZlLmNvbQ~Data=eyJzdWJzY3JpYmVyX2lkIjoiMmYyNmEyZmYtODRkYS00NzRiLWJiN2EtMjFlY2VhZTIyNDBmIn0~Signature=NK8zf151RLZn8nhR6cy1rIKn9_7ffXE06QpM9ljXUutjtUy4XQtMFRizX1RYYcBYHXJeeyCshtPZgfwDbndhAg";

const ALLOWED_HOST = "prod-linear-media.toffeelive.com";

export default {
  async fetch(request) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders()
      });
    }

    if (url.pathname === "/") {
      return new Response(playerHTML(), {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store"
        }
      });
    }

    if (url.pathname === "/playlist.m3u8") {
      return streamResponse(STREAM_URL);
    }

    if (url.pathname === "/resource") {
      const value = url.searchParams.get("url");

      if (!value) {
        return textResponse("Missing resource URL", 400);
      }

      let target;

      try {
        target =
