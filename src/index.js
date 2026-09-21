const UPSTREAM_M3U8 =
  "https://d1g8wgjurz8via.cloudfront.net/bpk-tv/ColorsHD/default/ColorsHD.m3u8";

const TOKEN_TTL = 300;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/token") {
      const token = await createToken(env.STREAM_SECRET);

      return new Response(JSON.stringify({
        stream: `${url.origin}/live.m3u8?token=${encodeURIComponent(token)}`,
        token,
        expires_in: TOKEN_TTL
      }), {
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
          "Access-Control-Allow-Origin": "*"
        }
      });
    }

    if (url.pathname === "/live.m3u8") {
      const token = url.searchParams.get("token");

      if (!token || !(await verifyToken(token, env.STREAM_SECRET))) {
        return new Response("Token expired or invalid", { status: 403 });
      }

      return proxyPlaylist(UPSTREAM_M3U8, token, url.origin);
    }

    if (url.pathname === "/hls") {
      const token = url.searchParams.get("token");
      const target = url.searchParams.get("url");

      if (!token || !target ||
          !(await verifyToken(token, env.STREAM_SECRET))) {
        return new Response("Forbidden", { status: 403 });
      }

      let targetURL;

      try {
        targetURL = new URL(target);
      } catch {
        return new Response("Invalid URL", { status: 400 });
      }

      if (targetURL.hostname !== new URL(UPSTREAM_M3U8).hostname) {
        return new Response("Forbidden", { status: 403 });
      }

      const response = await fetch(targetURL.toString(), {
        headers: { "User-Agent": "Mozilla/5.0" }
      });

      if (!response.ok) {
        return new Response("Upstream error", { status: 502 });
      }

      const type = response.headers.get("Content-Type") || "";

      if (type.includes("mpegurl") ||
          targetURL.pathname.endsWith(".m3u8")) {

        const text = await response.text();

        return new Response(
          rewritePlaylist(text, targetURL, token, url.origin),
          {
            headers: {
              "Content-Type": "application/vnd.apple.mpegurl",
              "Cache-Control": "no-store",
              "Access-Control-Allow-Origin": "*"
            }
          }
        );
      }

      return new Response(response.body, {
        headers: {
          "Content-Type": type || "application/octet-stream",
          "Cache-Control": "no-store",
          "Access-Control-Allow-Origin": "*"
        }
      });
    }

    return new Response("Not found", { status: 404 });
  }
};

async function proxyPlaylist(upstream, token, origin) {
  const response = await fetch(upstream, {
    headers: { "User-Agent": "Mozilla/5.0" }
  });

  if (!response.ok) {
    return new Response("Upstream unavailable", { status: 502 });
  }

  const text = await response.text();

  return new Response(
    rewritePlaylist(text, new URL(upstream), token, origin),
    {
      headers: {
        "Content-Type": "application/vnd.apple.mpegurl",
        "Cache-Control": "no-store",
        "Access-Control-Allow-Origin": "*"
      }
    }
  );
}

function rewritePlaylist(text, baseURL, token, origin) {
  return text.split(/\r?\n/).map(line => {

    if (line.startsWith("#")) {
      return line.replace(/URI="([^"]+)"/g, (_, uri) => {
        const absolute = new URL(uri, baseURL).toString();

        return `URI="${proxyURL(absolute, token, origin)}"`;
      });
    }

    if (!line.trim()) return line;

    const absolute = new URL(line.trim(), baseURL).toString();

    return proxyURL(absolute, token, origin);

  }).join("\n");
}

function proxyURL(target, token, origin) {
  return `${origin}/hls?token=${encodeURIComponent(token)}&url=${encodeURIComponent(target)}`;
}

async function createToken(secret) {
  const expires = Math.floor(Date.now() / 1000) + TOKEN_TTL;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(String(expires))
  );

  return `${expires}.${base64url(signature)}`;
}

async function verifyToken(token, secret) {
  try {
    const parts = token.split(".");
    if (parts.length !== 2) return false;

    const expires = Number(parts[0]);

    if (!Number.isFinite(expires)) return false;
    if (Math.floor(Date.now() / 1000) >= expires) return false;

    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );

    const signature = await crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode(String(expires))
    );

    return parts[1] === base64url(signature);

  } catch {
    return false;
  }
}

function base64url(buffer) {
  let binary = "";

  for (const byte of new Uint8Array(buffer)) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
  }
