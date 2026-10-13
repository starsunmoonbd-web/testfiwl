const STREAM_URL =
  "https://prod-linear-media.toffeelive.com/cdn/live/independent_tv/playlist.m3u8?edge-cache-token=Expires=1791903752~Starts=1791900152~URLPrefix=aHR0cHM6Ly9wcm9kLWxpbmVhci1tZWRpYS50b2ZmZWVsaXZlLmNvbQ~Data=eyJzdWJzY3JpYmVyX2lkIjoiMmYyNmEyZmYtODRkYS00NzRiLWJiN2EtMjFlY2VhZTIyNDBmIn0~Signature=NK8zf151RLZn8nhR6cy1rIKn9_7ffXE06QpM9ljXUutjtUy4XQtMFRizX1RYYcBYHXJeeyCshtPZgfwDbndhAg";

const UPSTREAM_HOST = "prod-linear-media.toffeelive.com";

export default {
  async fetch(request) {
    const requestUrl = new URL(request.url);

    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders()
      });
    }

    // ওয়েব প্লেয়ার
    if (requestUrl.pathname === "/") {
      return new Response(playerHTML(), {
        headers: {
          "Content-Type": "text/html; charset=UTF-8",
          "Cache-Control": "no-store"
        }
      });
    }

    // মূল M3U8 playlist
    if (requestUrl.pathname === "/playlist.m3u8") {
     
