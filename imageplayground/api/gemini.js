export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // STRICT ENVIRONMENT VARIABLE ENFORCEMENT
    const apiKey = process.env.GEMINI_API;
    if (!apiKey) {
        return res.status(500).json({ error: 'CRITICAL: GEMINI_API is missing from Vercel Environment Variables.' });
    }

    const { prompt, mode } = req.body;
    if (!prompt) {
        return res.status(400).json({ error: 'Prompt is required' });
    }

    try {
        let finalResult = '';

        if (mode === 'text') {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=${apiKey}`;
            const apiRes = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
            });
            const data = await apiRes.json();
            if (!apiRes.ok) throw new Error(data.error?.message || `API Error ${apiRes.status}`);
            finalResult = data.candidates[0].content.parts[0].text;

        } else if (mode === 'image') {
            const chain = [
                'imagen-4.0-ultra-generate-001', 
                'imagen-4.0-generate-001', 
                'imagen-4.0-fast-generate-001'
            ];
            let lastError = null;
            let success = false;

            for (let currentModel of chain) {
                try {
                    const url = `https://generativelanguage.googleapis.com/v1beta/models/${currentModel}:predict?key=${apiKey}`;
                    const apiRes = await fetch(url, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ instances: [{ prompt: prompt }], parameters: { sampleCount: 1 } })
                    });
                    const data = await apiRes.json();
                    
                    if (!apiRes.ok) throw new Error(`${currentModel} failed: ${data.error?.message}`);
                    const base64 = data.predictions?.[0]?.bytesBase64Encoded;
                    if (!base64) throw new Error(`No image data from ${currentModel}`);
                    
                    finalResult = `data:image/png;base64,${base64}`;
                    success = true;
                    break; // Stop falling back if successful!
                } catch (e) {
                    lastError = e.message;
                }
            }
            if (!success) throw new Error(`All models in fallback chain failed.\nLast error: ${lastError}`);

        } else if (mode === 'audio') {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-native-audio-dialog:generateContent?key=${apiKey}`;
            const apiRes = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }],
                    generationConfig: {
                        responseModalities: ["AUDIO"],
                        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: "Aoede" } } }
                    }
                })
            });
            const data = await apiRes.json();
            if (!apiRes.ok) throw new Error(data.error?.message || `API Error ${apiRes.status}`);
            
            const b64pcm = data.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
            if (!b64pcm) throw new Error("No audio data returned");

            // Encode to a format HTML Audio can play directly
            finalResult = `data:audio/L16;rate=24000;base64,${b64pcm}`;
        }

        // Send successful response back to HTML
        return res.status(200).json({ result: finalResult });

    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}

