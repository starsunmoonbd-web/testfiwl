const STREAM = "https://prod-linear-media.toffeelive.com/cdn/live/dw_tv/playlist.m3u8?edge-cache-token=Expires=1791907312~Starts=1791903712~URLPrefix=aHR0cHM6Ly9wcm9kLWxpbmVhci1tZWRpYS50b2ZmZWVsaXZlLmNvbQ~Data=eyJzdWJzY3JpYmVyX2lkIjoiMmYyNmEyZmYtODRkYS00NzRiLWJiN2EtMjFlY2VhZTIyNDBmIn0~Signature=B-KbE81E7wF4HM_Jvfx_NIXLN-gGtLpoivp6PrQGr5aUQqan6zDcgd3IcH5bsrBbdDLFiRbKJnbc2e5g2AyTCA";

const HOST = "prod-linear-media.toffeelive.com";
const TOKEN = new URL(STREAM).searchParams.get("edge-cache-token");

function cors() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "no-store"
  };
}

function proxyUrl(raw, base) {
  const u = new URL(raw, base);
  if (u.protocol !== "https:" || u.hostname !== HOST) return raw;
  if (!u.searchParams.has("edge-cache-token")) {
    u.searchParams.set("edge-cache-token", TOKEN);
  }
  return "/resource?url=" + encodeURIComponent(u.href);
}

export default {
  async fetch(req) {
    const url = new URL(req.url);

    if (url.pathname === "/") {
      return new Response(`<!doctype html>
<html><head><meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{margin:0;background:#000}video{width:100%;height:100vh}</style>
</head><body><video id="v" controls autoplay playsinline></video>
<script src="https://cdn.jsdelivr.net/npm/hls.js@1"></script>
<script>
const v=document.getElementById('v');
if(v.canPlayType('application/vnd.apple.mpegurl'))v.src='/playlist.m3u8';
else if(Hls.isSupported()){const h=new Hls();h.loadSource('/playlist.m3u8');h.attachMedia(v);}
else document.body.innerHTML='HLS not supported';
</script></body></html>`, {
        headers: { "Content-Type": "text/html;charset=UTF-8", ...cors() }
      });
    }

    if (url.pathname !== "/playlist.m3u8" && url.pathname !== "/resource") {
      return new Response("Not found", { status: 404 });
    }

    let target;
    try {
      target = url.pathname === "/playlist.m3u8"
        ? new URL(STREAM)
        : new URL(url.searchParams.get("url"));
    } catch {
      return new Response("Invalid URL", { status: 400 });
    }

    if (target.protocol !== "https:" || target.hostname !== HOST) {
      return new Response("URL not allowed", { status: 403 });
    }

    try {
      const r = await fetch(target.href, {
        headers: { "User-Agent": "Mozilla/5.0", "Accept": "*/*" }
      });

      if (!r.ok) {
        return new Response("Upstream error: " + r.status, {
          status: r.status, headers: cors()
        });
      }

      if (target.pathname.endsWith(".m3u8")) {
        let text = await r.text();

        text = text.split(/\r?\n/).map(line => {
          const s = line.trim();
          if (!s) return line;

          if (s.startsWith("#")) {
            return line.replace(/URI="([^"]+)"/g, (_, uri) =>
              'URI="' + proxyUrl(uri, target) + '"'
            );
          }

          return proxyUrl(s, target);
        }).join("\n");

        return new Response(text, {
          headers: {
            ...cors(),
            "Content-Type": "application/vnd.apple.mpegurl"
          }
        });
      }

      return new Response(r.body, {
        headers: {
          ...cors(),
          "Content-Type": r.headers.get("Content-Type") || "application/octet-stream"
        }
      });
    } catch (e) {
      return new Response("Proxy error: " + String(e), {
        status: 502, headers: cors()
      });
    }
  }
};
