// Serverless API for D-Drop (Temporary Anonymous File & Text Vault)
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://gmwieijbrrztukqpfwkg.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'sb_publishable_KX3MYtV84QJJdy9bPDuMEA_V99sLKSE';

// Rate limiting in-memory store (sliding window per minute)
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 40;

function checkRateLimit(ip) {
  const now = Date.now();
  const entry = rateLimitMap.get(ip) || { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS };
  if (now > entry.resetAt) {
    entry.count = 0;
    entry.resetAt = now + RATE_LIMIT_WINDOW_MS;
  }
  entry.count++;
  rateLimitMap.set(ip, entry);

  // Periodic cleanup of stale IPs
  if (rateLimitMap.size > 2000) {
    for (const [k, v] of rateLimitMap.entries()) {
      if (now > v.resetAt) rateLimitMap.delete(k);
    }
  }

  return entry.count <= MAX_REQUESTS_PER_WINDOW;
}

// Call Supabase RPC
async function callRpc(fnName, payload) {
  const url = `${SUPABASE_URL}/rest/v1/rpc/${fnName}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    data = { raw: text };
  }

  if (!res.ok) {
    throw new Error(data.message || data.error || `RPC ${fnName} failed with HTTP ${res.status}`);
  }
  return data;
}

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const clientIp = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown')
    .toString().split(',')[0].trim();

  if (!checkRateLimit(clientIp)) {
    return res.status(429).json({ error: 'Too many requests. Please wait a moment.' });
  }

  try {
    // 1. GET: Inspect or Claim or Stream Download
    if (req.method === 'GET') {
      const code = (req.query.code || '').trim();
      const password = req.query.password || null;
      const isDownload = req.query.download === '1' || req.query.download === 'true';

      if (!code) {
        return res.status(400).json({ error: 'Drop code is required' });
      }

      // Claim drop (increments download count if downloading or burn-after-reading)
      const claimResult = await callRpc('claim_drop', {
        p_code: code,
        p_password: password,
        p_increment: isDownload
      });

      if (!claimResult.success) {
        const statusCode = claimResult.error === 'PASSWORD_REQUIRED' ? 401 :
                           claimResult.error === 'INVALID_PASSWORD' ? 403 :
                           claimResult.error === 'NOT_FOUND' ? 404 :
                           claimResult.error === 'EXPIRED' || claimResult.error === 'BURNED' ? 410 : 400;
        return res.status(statusCode).json(claimResult);
      }

      // If binary file download requested
      if (isDownload && claimResult.type === 'file' && claimResult.storage_path) {
        const fileUrl = `${SUPABASE_URL}/storage/v1/object/authenticated/drops/${claimResult.storage_path}`;
        const fileRes = await fetch(fileUrl, {
          headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
          }
        });

        if (!fileRes.ok) {
          return res.status(fileRes.status).json({ error: 'Failed to retrieve storage file' });
        }

        const safeFilename = encodeURIComponent(claimResult.file_name || 'download.bin');
        res.setHeader('Content-Type', claimResult.mime_type || 'application/octet-stream');
        res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"; filename*=UTF-8''${safeFilename}`);
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');

        // Stream file
        const buffer = await fileRes.arrayBuffer();
        return res.status(200).send(Buffer.from(buffer));
      }

      return res.status(200).json(claimResult);
    }

    // 2. POST: Create, Claim, or Delete
    if (req.method === 'POST') {
      const { action = 'create', ...params } = req.body || {};

      if (action === 'create') {
        const {
          type,
          fileName,
          fileSize,
          mimeType,
          textContent,
          encrypted,
          encryptionIv,
          encryptionSalt,
          hasPassword,
          password,
          burnAfterReading,
          ttlSeconds,
          maxDownloads
        } = params;

        if (!type || !['file', 'text'].includes(type)) {
          return res.status(400).json({ error: 'Invalid type. Must be file or text.' });
        }

        const result = await callRpc('create_drop', {
          p_type: type,
          p_file_name: fileName || null,
          p_file_size: fileSize || 0,
          p_mime_type: mimeType || 'application/octet-stream',
          p_text_content: textContent || null,
          p_encrypted: Boolean(encrypted),
          p_encryption_iv: encryptionIv || null,
          p_encryption_salt: encryptionSalt || null,
          p_has_password: Boolean(hasPassword),
          p_password: password || null,
          p_burn_after_reading: Boolean(burnAfterReading),
          p_ttl_seconds: ttlSeconds || 3600,
          p_max_downloads: maxDownloads || 100
        });

        return res.status(201).json(result);
      }

      if (action === 'claim') {
        const { code, password, increment } = params;
        if (!code) return res.status(400).json({ error: 'Drop code is required' });

        const result = await callRpc('claim_drop', {
          p_code: code,
          p_password: password || null,
          p_increment: increment !== false
        });

        if (!result.success) {
          const statusCode = result.error === 'PASSWORD_REQUIRED' ? 401 :
                             result.error === 'INVALID_PASSWORD' ? 403 :
                             result.error === 'NOT_FOUND' ? 404 :
                             result.error === 'EXPIRED' || result.error === 'BURNED' ? 410 : 400;
          return res.status(statusCode).json(result);
        }

        return res.status(200).json(result);
      }

      if (action === 'delete') {
        const { code, deleteToken } = params;
        if (!code || !deleteToken) {
          return res.status(400).json({ error: 'Both code and deleteToken are required' });
        }

        const result = await callRpc('delete_drop', {
          p_code: code,
          p_delete_token: deleteToken
        });

        // Also clean up storage object if returned
        if (result.success && result.storage_path) {
          try {
            await fetch(`${SUPABASE_URL}/storage/v1/object/drops`, {
              method: 'DELETE',
              headers: {
                'apikey': SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({ prefixes: [result.storage_path] })
            });
          } catch (e) {
            console.error('Storage deletion cleanup warning:', e);
          }
        }

        return res.status(result.success ? 200 : 403).json(result);
      }

      return res.status(400).json({ error: `Unknown action: ${action}` });
    }

    // 3. DELETE: Destroy drop via code and deleteToken
    if (req.method === 'DELETE') {
      const code = (req.query.code || req.body?.code || '').trim();
      const deleteToken = (req.query.token || req.body?.deleteToken || '').trim();

      if (!code || !deleteToken) {
        return res.status(400).json({ error: 'Both code and token are required to delete a drop' });
      }

      const result = await callRpc('delete_drop', {
        p_code: code,
        p_delete_token: deleteToken
      });

      if (result.success && result.storage_path) {
        try {
          await fetch(`${SUPABASE_URL}/storage/v1/object/drops`, {
            method: 'DELETE',
            headers: {
              'apikey': SUPABASE_ANON_KEY,
              'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ prefixes: [result.storage_path] })
          });
        } catch (e) {
          console.error('Storage cleanup warning:', e);
        }
      }

      return res.status(result.success ? 200 : 403).json(result);
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('D-Drop API Error:', error);
    return res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
}
