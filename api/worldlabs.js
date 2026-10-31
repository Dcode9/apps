// /api/worldlabs.js
// Vercel Serverless Function Proxy for World Labs Marble API
// Solves browser CORS restrictions and securely routes World Labs operations.

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

    // Extract API key: from headers, body payload, or env variable fallback
    const incomingKey =
        req.headers['wlt-api-key'] ||
        req.headers['x-worldlabs-key'] ||
        (req.headers['authorization'] ? req.headers['authorization'].replace(/^Bearer\s+/i, '') : null) ||
        req.body?.apiKey ||
        process.env.WORLDLABS_API_KEY ||
        process.env.WLT_API_KEY;

    if (!incomingKey) {
        return res.status(401).json({
            error: 'Missing World Labs API Key. Enter your WLT API Key in the application interface or configure WORLDLABS_API_KEY.'
        });
    }

    const { action, operationId, worldId, payload } = req.body || {};
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
            targetBody = payload || req.body;
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
        } else {
            return res.status(400).json({
                error: `Unknown action: "${actionParam}". Supported actions: generate, operation, world, list.`
            });
        }

        const headers = {
            'WLT-Api-Key': incomingKey.trim(),
            'Content-Type': 'application/json'
        };

        const fetchOptions = {
            method: targetMethod,
            headers
        };

        if (targetMethod === 'POST' && targetBody) {
            const cleanBody = targetBody.payload ? { ...targetBody.payload } : { ...targetBody };
            delete cleanBody.apiKey;
            delete cleanBody.action;
            delete cleanBody.operationId;
            delete cleanBody.worldId;
            fetchOptions.body = JSON.stringify(cleanBody);
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
            return res.status(response.status).json({
                error: data.error?.message || data.error || data.message || `World Labs API returned status ${response.status}`,
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
