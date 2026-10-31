// /api/worldlabs.js
// Vercel Serverless Function Proxy for World Labs Marble API
// Solves browser CORS restrictions, sanitizes keys, and provides transparent diagnostic logging.

export default async function handler(req, res) {
    // CORS setup for apps.d-verse.in and local development
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-Type, WLT-Api-Key, Authorization, x-worldlabs-key'
    );

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // Safely parse body if received as raw text
    let reqBody = req.body;
    if (typeof reqBody === 'string') {
        try {
            reqBody = JSON.parse(reqBody);
        } catch {
            reqBody = {};
        }
    } else if (!reqBody) {
        reqBody = {};
    }

    // Extract API key: from headers, body payload, query string, or env variable fallback
    const rawKey =
        req.headers['wlt-api-key'] ||
        req.headers['x-worldlabs-key'] ||
        (req.headers['authorization'] ? req.headers['authorization'].replace(/^Bearer\s+/i, '') : null) ||
        reqBody.apiKey ||
        req.query?.apiKey ||
        process.env.WORLDLABS_API_KEY ||
        process.env.WLT_API_KEY;

    // Sanitize API key: remove whitespace, quotes, and 'Bearer ' prefixes
    const cleanKey = (rawKey || '')
        .trim()
        .replace(/^Bearer\s+/i, '')
        .replace(/^["']|["']$/g, '')
        .trim();

    if (!cleanKey) {
        return res.status(401).json({
            error: 'Missing World Labs API Key. Enter your Developer API key from https://platform.worldlabs.ai/api-keys in the application.'
        });
    }

    const { action, operationId, worldId, payload } = reqBody;
    const actionParam = action || req.query?.action;
    const opId = operationId || req.query?.operationId;
    const wId = worldId || req.query?.worldId;

    const BASE_URL = 'https://api.worldlabs.ai/marble/v1';

    try {
        let targetUrl = '';
        let targetMethod = 'GET';
        let targetBody = null;

        if (actionParam === 'generate') {
            targetUrl = `${BASE_URL}/worlds:generate`;
            targetMethod = 'POST';
            targetBody = payload || reqBody;
        } else if (actionParam === 'operation') {
            if (!opId) return res.status(400).json({ error: 'operationId parameter is required' });
            targetUrl = `${BASE_URL}/operations/${encodeURIComponent(opId)}`;
            targetMethod = 'GET';
        } else if (actionParam === 'world') {
            if (!wId) return res.status(400).json({ error: 'worldId parameter is required' });
            targetUrl = `${BASE_URL}/worlds/${encodeURIComponent(wId)}`;
            targetMethod = 'GET';
        } else if (actionParam === 'list') {
            targetUrl = `${BASE_URL}/worlds:list`;
            targetMethod = 'POST';
            targetBody = payload || { page_size: 20 };
        } else if (actionParam === 'credits') {
            targetUrl = `${BASE_URL}/credits`;
            targetMethod = 'GET';
        } else {
            return res.status(400).json({
                error: `Unknown action: "${actionParam}". Supported actions: generate, operation, world, list, credits.`
            });
        }

        const headers = {
            'WLT-Api-Key': cleanKey,
            'Content-Type': 'application/json'
        };

        const fetchOptions = {
            method: targetMethod,
            headers
        };

        if (targetMethod === 'POST' && targetBody) {
            const sanitized = targetBody.payload ? { ...targetBody.payload } : { ...targetBody };
            delete sanitized.apiKey;
            delete sanitized.action;
            delete sanitized.operationId;
            delete sanitized.worldId;
            fetchOptions.body = JSON.stringify(sanitized);
        }

        const response = await fetch(targetUrl, fetchOptions);
        const contentType = response.headers.get('content-type') || '';

        let data;
        if (contentType.includes('application/json')) {
            data = await response.json();
        } else {
            const rawText = await response.text();
            try {
                data = JSON.parse(rawText);
            } catch {
                data = { raw: rawText };
            }
        }

        if (!response.ok) {
            let errorMsg = data.error?.message || data.error || data.message || `World Labs API returned status ${response.status}`;
            
            // Enrich 401 error with diagnostic guidance
            if (response.status === 401) {
                errorMsg = 'World Labs API returned 401 Unauthorized. Ensure you are using a Developer API key created from https://platform.worldlabs.ai/api-keys (not a platform dashboard session token) and that your developer account has active billing/credits.';
            }

            return res.status(response.status).json({
                error: errorMsg,
                statusCode: response.status,
                details: data
            });
        }

        return res.status(200).json(data);
    } catch (err) {
        return res.status(500).json({
            error: `Failed to proxy World Labs request: ${err.message}`
        });
    }
}
