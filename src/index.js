const UPSTREAM_M3U8 =
  "https://liveline.bond/st/live.php?id=11154&e=.m3u8";

const UPSTREAM_HOST = "liveline.bond";
const TOKEN_TTL = 300;

export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url);

      if (request.method === "OPTIONS") {
        return new Response(null, {
          status: 204,
          headers: corsHeaders()
        });
      }

      if (!env.STREAM_SECRET) {
        return jsonResponse({
          error: "STREAM_SECRET is not configured"
        }, 500);
      }

      if (url.pathname === "/token") {
        const token = await createToken(env.STREAM_SECRET);

        return jsonResponse({
          stream:
            `${url.origin}/live.m3u8?token=${encodeURIComponent(token)}`,
          expires_in: TOKEN_TTL
        });
      }

      if (url.pathname === "/live.m3u8") {
        const token = url.searchParams.get("token");

        if (!token) {
          return textResponse("Token missing", 403);
        }

        if (!(await verifyToken(token, env.STREAM_SECRET))) {
          return textResponse("Token expired or invalid", 403);
        }

        const response = await fetch(UPSTREAM_M3U8, {
          headers: {
            "User-Agent": "Mozilla/5.0"
          },
          cf: {
            cacheTtl: 0,
            cacheEverything: false
          }
        });

        if (!response.ok) {
          return textResponse(
            `Upstream playlist error: ${response.status}`,
            502
          );
        }

        const content = await response.text();

        if (!content.trimStart().startsWith("#EXTM3U")) {
          return textResponse(
            "Upstream did not return an HLS playlist",
            502
          );
        }

        const playlist = await rewritePlaylist(
          content,
          new URL(UPSTREAM_M3U8),
          token,
          env.STREAM_SECRET,
          url.origin
        );

        return new Response(playlist, {
          headers: {
            ...corsHeaders(),
            "Content-Type": "application/vnd.apple.mpegurl",
            "Cache-Control": "no-store"
          }
        });
      }

      if (url.pathname === "/hls") {
        const token = url.searchParams.get("token");
        const encrypted = url.searchParams.get("p");

        if (!token || !encrypted) {
          return textResponse("Missing parameters", 400);
        }

        if (!(await verifyToken(token, env.STREAM_SECRET))) {
          return textResponse("Token expired or invalid", 403);
        }

        let targetUrl;

        try {
          targetUrl = await decryptTarget(
            encrypted,
            env.STREAM_SECRET
          );
        } catch {
          return textResponse("Invalid encrypted URL", 403);
        }

        let target;

        try {
          target = new URL(targetUrl);
        } catch {
          return textResponse("Invalid target URL", 400);
        }

        if (
          target.protocol !== "https:" ||
          target.hostname !== UPSTREAM_HOST
        ) {
          return textResponse("Host not allowed", 403);
        }

        const response = await fetch(target.toString(), {
          headers: {
            "User-Agent": "Mozilla/5.0"
          },
          cf: {
            cacheTtl: 0,
            cacheEverything: false
          }
        });

        if (!response.ok) {
          return textResponse(
            `Upstream HLS error: ${response.status}`,
            502
          );
        }

        const contentType =
          response.headers.get("content-type") || "";

        const isPlaylist =
          contentType.includes("mpegurl") ||
          target.pathname.endsWith(".m3u8") ||
          target.pathname.endsWith(".m3u");

        if (isPlaylist) {
          const body = await response.text();

          const playlist = await rewritePlaylist(
            body,
            target,
            token,
            env.STREAM_SECRET,
            url.origin
          );

          return new Response(playlist, {
            headers: {
              ...corsHeaders(),
              "Content-Type": "application/vnd.apple.mpegurl",
              "Cache-Control": "no-store"
            }
          });
        }

        return new Response(response.body, {
          status: response.status,
          headers: {
            ...corsHeaders(),
            "Content-Type":
              contentType || "application/octet-stream",
            "Cache-Control": "no-store"
          }
        });
      }

      return textResponse("Not found", 404);

    } catch (error) {
      return jsonResponse({
        error: "Internal Server Error",
        message: error.message
      }, 500);
    }
  }
};

function isAllowedHost(targetUrl) {
  try {
    const target = new URL(targetUrl);

    return (
      target.protocol === "https:" &&
      target.hostname === UPSTREAM_HOST
    );
  } catch {
    return false;
  }
}

async function rewritePlaylist(
  text,
  baseUrl,
  token,
  secret,
  origin
) {
  const lines = text.split(/\r?\n/);
  const output = [];

  for (const originalLine of lines) {
    const line = originalLine.trim();

    if (!line) {
      output.push(originalLine);
      continue;
    }

    if (line.startsWith("#")) {
      const matches = [
        ...line.matchAll(/URI="([^"]+)"/g)
      ];

      let rewrittenLine = line;

      for (const match of matches) {
        try {
          const absolute = new URL(
            match[1],
            baseUrl
          ).toString();

          if (!isAllowedHost(absolute)) {
            continue;
          }

          const proxy = await makeProxyUrl(
            absolute,
            token,
            secret,
            origin
          );

          rewrittenLine = rewrittenLine.replace(
            `URI="${match[1]}"`,
            `URI="${proxy}"`
          );
        } catch {
          // Keep the original URI.
        }
      }

      output.push(rewrittenLine);
      continue;
    }

    try {
      const absolute = new URL(
        line,
        baseUrl
      ).toString();

      if (isAllowedHost(absolute)) {
        output.push(
          await makeProxyUrl(
            absolute,
            token,
            secret,
            origin
          )
        );
      } else {
        output.push(line);
      }
    } catch {
      output.push(line);
    }
  }

  return output.join("\n");
}

async function makeProxyUrl(
  target,
  token,
  secret,
  origin
) {
  const encrypted = await encryptTarget(
    target,
    secret
  );

  return (
    `${origin}/hls?token=${encodeURIComponent(token)}` +
    `&p=${encodeURIComponent(encrypted)}`
  );
}

async function createToken(secret) {
  const expires =
    Math.floor(Date.now() / 1000) + TOKEN_TTL;

  const signature = await hmacSign(
    String(expires),
    secret
  );

  return `${expires}.${signature}`;
}

async function verifyToken(token, secret) {
  try {
    const parts = token.split(".");

    if (parts.length !== 2) return false;

    const expires = Number(parts[0]);

    if (!Number.isFinite(expires)) return false;

    if (expires < Math.floor(Date.now() / 1000)) {
      return false;
    }

    const expected = await hmacSign(
      String(expires),
      secret
    );

    return timingSafeEqual(parts[1], expected);
  } catch {
    return false;
  }
}

async function hmacSign(message, secret) {
  const encoder = new TextEncoder();

  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    {
      name: "HMAC",
      hash: "SHA-256"
    },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(message)
  );

  return arrayBufferToBase64Url(signature);
}

async function deriveAESKey(secret) {
  const hash = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(secret)
  );

  return crypto.subtle.importKey(
    "raw",
    hash,
    {
      name: "AES-GCM"
    },
    false,
    ["encrypt", "decrypt"]
  );
}

async function encryptTarget(text, secret) {
  const key = await deriveAESKey(secret);

  const iv = crypto.getRandomValues(
    new Uint8Array(12)
  );

  const encrypted = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv
    },
    key,
    new TextEncoder().encode(text)
  );

  const result = new Uint8Array(
    12 + encrypted.byteLength
  );

  result.set(iv, 0);
  result.set(new Uint8Array(encrypted), 12);

  return arrayBufferToBase64Url(result.buffer);
}

async function decryptTarget(encoded, secret) {
  const key = await deriveAESKey(secret);
  const data = base64UrlToUint8Array(encoded);

  if (data.length < 13) {
    throw new Error("Invalid encrypted data");
  }

  const iv = data.slice(0, 12);
  const encrypted = data.slice(12);

  const decrypted = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv
    },
    key,
    encrypted
  );

  return new TextDecoder().decode(decrypted);
}

function arrayBufferToBase64Url(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function base64UrlToUint8Array(input) {
  let base64 = input
    .replace(/-/g, "+")
    .replace(/_/g, "/");

  while (base64.length % 4) {
    base64 += "=";
  }

  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes;
}

function timingSafeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string") {
    return false;
  }

  if (a.length !== b.length) return false;

  let result = 0;

  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  return result === 0;
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
    "Access-Control-Allow-Headers":
      "Content-Type, Authorization",
    "Access-Control-Expose-Headers":
      "Content-Length, Content-Type"
  };
}

function textResponse(text, status = 200) {
  return new Response(text, {
    status,
    headers: {
      ...corsHeaders(),
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders(),
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}
