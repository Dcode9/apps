export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // STRICT ENVIRONMENT VARIABLE ENFORCEMENT
    // Added .trim() in case a hidden space was copied into the Vercel dashboard
    const apiKey = process.env.GEMINI_API?.trim();
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
                    break; 
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

            // --- THE FIX: Convert raw PCM to a standard WAV file in Node.js ---
            const pcmBuffer = Buffer.from(b64pcm, 'base64');
            const sampleRate = 24000;
            const wavBuffer = Buffer.alloc(44 + pcmBuffer.length);
            
            wavBuffer.write('RIFF', 0);
            wavBuffer.writeUInt32LE(36 + pcmBuffer.length, 4);
            wavBuffer.write('WAVE', 8);
            wavBuffer.write('fmt ', 12);
            wavBuffer.writeUInt32LE(16, 16); // Subchunk1Size
            wavBuffer.writeUInt16LE(1, 20);  // AudioFormat (PCM)
            wavBuffer.writeUInt16LE(1, 22);  // NumChannels
            wavBuffer.writeUInt32LE(sampleRate, 24); 
            wavBuffer.writeUInt32LE(sampleRate * 2, 28); // ByteRate
            wavBuffer.writeUInt16LE(2, 32);  // BlockAlign
            wavBuffer.writeUInt16LE(16, 34); // BitsPerSample
            wavBuffer.write('data', 36);
            wavBuffer.writeUInt32LE(pcmBuffer.length, 40);
            pcmBuffer.copy(wavBuffer, 44);

            const wavBase64 = wavBuffer.toString('base64');
            
            // Now we send a highly-compatible standard WAV string!
            finalResult = `data:audio/wav;base64,${wavBase64}`;
        }

        return res.status(200).json({ result: finalResult });

    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}


