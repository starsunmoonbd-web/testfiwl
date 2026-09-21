const UPSTREAM_M3U8 =
  "https://d1g8wgjurz8via.cloudfront.net/bpk-tv/ColorsHD/default/ColorsHD.m3u8";

const TOKEN_TTL = 300;

export default {
  async fetch(request, env) {
    try {
      // CORS preflight
      if (request.method === "OPTIONS") {
        return new Response(null, {
          status: 204,
          headers: corsHeaders()
        });
      }

      const url = new URL(request.url);

      // Secret না থাকলে পরিষ্কার error দেখাবে
      if (!env.STREAM_SECRET) {
        return jsonResponse(
          {
            error: "STREAM_SECRET is not configured",
            message:
              "Cloudflare Worker Settings > Variables and Secrets থেকে STREAM_SECRET যোগ করুন."
          },
          500
        );
      }

      // =========================
      // CREATE TOKEN
      // =========================
      if (url.pathname === "/token") {
        const token = await createToken(env.STREAM_SECRET);

        return jsonResponse({
          stream:
            `${url.origin}/live.m3u8?token=${encodeURIComponent(token)}`,
          token,
          expires_in: TOKEN_TTL
        });
      }

      // =========================
      // MAIN PLAYLIST
      // =========================
      if (url.pathname === "/live.m3u8") {
        const token = url.searchParams.get("token");

        if (!token) {
          return new Response("Token missing", {
            status: 403,
            headers: corsHeaders()
          });
        }

        const valid = await verifyToken(
          token,
          env.STREAM_SECRET
        );

        if (!valid) {
          return new Response("Token expired or invalid", {
            status: 403,
            headers: corsHeaders()
          });
        }

        return await proxyPlaylist(
          UPSTREAM_M3U8,
          token,
          url.origin
        );
      }

      // =========================
      // HLS SEGMENTS / PLAYLIST
      // =========================
      if (url.pathname === "/hls") {
        const token = url.searchParams.get("token");
        const target = url.searchParams.get("url");

        if (!token || !target) {
          return new Response("Forbidden", {
            status: 403,
            headers: corsHeaders()
          });
        }

        const valid = await verifyToken(
          token,
          env.STREAM_SECRET
        );

        if (!valid) {
          return new Response("Token expired or invalid", {
            status: 403,
            headers: corsHeaders()
          });
        }

        let targetURL;

        try {
          targetURL = new URL(target);
        } catch {
          return new Response("Invalid URL", {
            status: 400,
            headers: corsHeaders()
          });
        }

        // শুধু নির্দিষ্ট upstream host allow
        const upstreamHost =
          new URL(UPSTREAM_M3U8).hostname;

        if (targetURL.hostname !== upstreamHost) {
          return new Response("Forbidden host", {
            status: 403,
            headers: corsHeaders()
          });
        }

        let response;

        try {
          response = await fetch(targetURL.toString(), {
            headers: {
              "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
            }
          });
        } catch (error) {
          return new Response(
            "Upstream connection failed",
            {
              status: 502,
              headers: corsHeaders()
            }
          );
        }

        if (!response.ok) {
          return new Response(
            `Upstream error: ${response.status}`,
            {
              status: 502,
              headers: corsHeaders()
            }
          );
        }

        const contentType =
          response.headers.get("Content-Type") || "";

        // Playlist হলে rewrite করতে হবে
        if (
          contentType.toLowerCase().includes("mpegurl") ||
          targetURL.pathname.toLowerCase().endsWith(".m3u8")
        ) {
          const text = await response.text();

          const rewritten = rewritePlaylist(
            text,
            targetURL,
            token,
            url.origin
          );

          return new Response(rewritten, {
            status: 200,
            headers: {
              ...corsHeaders(),
              "Content-Type":
                "application/vnd.apple.mpegurl",
              "Cache-Control": "no-store"
            }
          });
        }

        // TS / AAC / অন্যান্য segment
        return new Response(response.body, {
          status: 200,
          headers: {
            ...corsHeaders(),
            "Content-Type":
              contentType ||
              "application/octet-stream",
            "Cache-Control": "no-store"
          }
        });
      }

      return new Response("Not found", {
        status: 404,
        headers: corsHeaders()
      });

    } catch (error) {
      // Worker exception হলে 1101-এর বদলে readable error
      return jsonResponse(
        {
          error: "Worker exception",
          message: error?.message || String(error)
        },
        500
      );
    }
  }
};


// ==========================================
// PROXY MAIN PLAYLIST
// ==========================================

async function proxyPlaylist(
  upstream,
  token,
  origin
) {
  let response;

  try {
    response = await fetch(upstream, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
      }
    });
  } catch {
    return new Response(
      "Could not connect to upstream",
      {
        status: 502,
        headers: corsHeaders()
      }
    );
  }

  if (!response.ok) {
    return new Response(
      `Upstream unavailable: ${response.status}`,
      {
        status: 502,
        headers: corsHeaders()
      }
    );
  }

  const text = await response.text();

  const rewritten = rewritePlaylist(
    text,
    new URL(upstream),
    token,
    origin
  );

  return new Response(rewritten, {
    status: 200,
    headers: {
      ...corsHeaders(),
      "Content-Type":
        "application/vnd.apple.mpegurl",
      "Cache-Control": "no-store"
    }
  });
}


// ==========================================
// REWRITE HLS PLAYLIST
// ==========================================

function rewritePlaylist(
  text,
  baseURL,
  token,
  origin
) {
  return text
    .split(/\r?\n/)
    .map((line) => {

      // Empty line
      if (!line.trim()) {
        return line;
      }

      // #EXT-X-KEY / #EXT-X-MAP / অন্যান্য URI=""
      if (line.startsWith("#")) {
        return line.replace(
          /URI="([^"]+)"/g,
          (_, uri) => {
            try {
              const absolute =
                new URL(uri, baseURL).toString();

              return `URI="${proxyURL(
                absolute,
                token,
                origin
              )}"`;
            } catch {
              return `URI="${uri}"`;
            }
          }
        );
      }

      // Segment / nested playlist
      try {
        const absolute =
          new URL(
            line.trim(),
            baseURL
          ).toString();

        return proxyURL(
          absolute,
          token,
          origin
        );
      } catch {
        return line;
      }

    })
    .join("\n");
}


// ==========================================
// CREATE PROXY URL
// ==========================================

function proxyURL(
  target,
  token,
  origin
) {
  return (
    `${origin}/hls` +
    `?token=${encodeURIComponent(token)}` +
    `&url=${encodeURIComponent(target)}`
  );
}


// ==========================================
// CREATE TOKEN
// ==========================================

async function createToken(secret) {
  const expires =
    Math.floor(Date.now() / 1000) +
    TOKEN_TTL;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    {
      name: "HMAC",
      hash: "SHA-256"
    },
    false,
    ["sign"]
  );

  const signature =
    await crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode(
        String(expires)
      )
    );

  return (
    `${expires}.` +
    base64url(signature)
  );
}


// ==========================================
// VERIFY TOKEN
// ==========================================

async function verifyToken(
  token,
  secret
) {
  try {
    const parts = token.split(".");

    if (parts.length !== 2) {
      return false;
    }

    const expires = Number(parts[0]);

    if (!Number.isFinite(expires)) {
      return false;
    }

    if (
      Math.floor(Date.now() / 1000) >=
      expires
    ) {
      return false;
    }

    const key =
      await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(secret),
        {
          name: "HMAC",
          hash: "SHA-256"
        },
        false,
        ["verify"]
      );

    const signature =
      base64urlToUint8Array(parts[1]);

    return await crypto.subtle.verify(
      "HMAC",
      key,
      signature,
      new TextEncoder().encode(
        String(expires)
      )
    );

  } catch {
    return false;
  }
}


// ==========================================
// BASE64URL
// ==========================================

function base64url(buffer) {
  let binary = "";

  for (
    const byte of new Uint8Array(buffer)
  ) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}


function base64urlToUint8Array(input) {
  let base64 =
    input
      .replace(/-/g, "+")
      .replace(/_/g, "/");

  while (base64.length % 4) {
    base64 += "=";
  }

  const binary =
    atob(base64);

  const bytes =
    new Uint8Array(binary.length);

  for (
    let i = 0;
    i < binary.length;
    i++
  ) {
    bytes[i] =
      binary.charCodeAt(i);
  }

  return bytes;
}


// ==========================================
// CORS
// ==========================================

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods":
      "GET, OPTIONS",
    "Access-Control-Allow-Headers":
      "Content-Type"
  };
}


// ==========================================
// JSON RESPONSE
// ==========================================

function jsonResponse(data, status = 200) {
  return new Response(
    JSON.stringify(data, null, 2),
    {
      status,
      headers: {
        ...corsHeaders(),
        "Content-Type":
          "application/json; charset=utf-8",
        "Cache-Control": "no-store"
      }
    }
  );
}
