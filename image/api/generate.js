// Universal CommonJS format - avoids "Expected pattern" compiler errors on Vercel
module.exports = async (req, res) => {
    // Enable CORS headers so your frontend can communicate securely
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
    );

    // Handle browser pre-flight checks
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { prompt, image } = req.body;

        if (!prompt) {
            return res.status(400).json({ error: "Prompt is required" });
        }

        // Pull the key from Vercel's Environment Variables, fallback to hardcoded if not set
        const NVIDIA_API_KEY = process.env.NVIDIA_API_KEY || "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";
        const NVIDIA_ENDPOINT = "https://ai.api.nvidia.com/v1/genai/black-forest-labs/flux.2-klein-4b";

        const payload = {
            prompt: prompt,
            steps: 4,
            seed: Math.floor(Math.random() * 999999)
        };

        if (image) {
            payload.image = image;
            payload.strength = 0.8;
            payload.mode = "Image Editing";
        }

        // Fetch requests directly on the Vercel Serverless Environment (Zero browser CORS!)
        const response = await fetch(NVIDIA_ENDPOINT, {
            method: 'POST',
            headers: {
                'accept': 'application/json',
                'content-type': 'application/json',
                'authorization': `Bearer ${NVIDIA_API_KEY}`
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`NVIDIA API Error ${response.status}: ${errorText}`);
        }

        const data = await response.json();
        let base64String = "";

        if (data.artifacts && data.artifacts[0] && data.artifacts[0].base64) {
            base64String = data.artifacts[0].base64;
        } else if (data.data && data.data[0] && data.data[0].b64_json) {
            base64String = data.data[0].b64_json;
        } else if (data.base64) {
            base64String = data.base64;
        }

        if (!base64String) {
            throw new Error("No image data returned from NVIDIA.");
        }

        if (!base64String.startsWith("data:image")) {
            base64String = "data:image/png;base64," + base64String;
        }

        return res.status(200).json({ image_url: base64String });

    } catch (error) {
        console.error("Serverless Function Error:", error.message);
        return res.status(500).json({ error: error.message });
    }
};

