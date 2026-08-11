export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    // Ensure API Key exists in Vercel
    const apiKey = (process.env.GEMINI_API || '').trim();
    if (!apiKey) return res.status(500).json({ error: 'CRITICAL: GEMINI_API environment variable is missing.' });

    const { prompt, mode } = req.body;
    if (!prompt) return res.status(400).json({ error: 'Prompt is required' });

    // Helper to safely fetch from Google
    const makeGoogleRequest = async (url, payload) => {
        const apiRes = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        const rawText = await apiRes.text();
        let data;
        try { data = JSON.parse(rawText); } catch (e) { data = { raw: rawText }; }

        if (!apiRes.ok) {
            const googleMsg = data.error?.message || JSON.stringify(data);
            throw new Error(`Google API [${apiRes.status}]: ${googleMsg}`);
        }
        return data;
    };

    try {
        let finalResult = '';

        if (mode === 'text') {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=${apiKey}`;
            const data = await makeGoogleRequest(url, { contents: [{ parts: [{ text: prompt }] }] });
            finalResult = data.candidates?.[0]?.content?.parts?.[0]?.text || 'No text generated.';

        } else if (mode === 'image') {
            const chain = [
                'imagen-4.0-ultra-generate-001', 
                'imagen-4.0-generate-001', 
                'imagen-4.0-fast-generate-001'
            ];
            let errors = [];
            let success = false;

            for (let model of chain) {
                try {
                    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:predict?key=${apiKey}`;
                    const data = await makeGoogleRequest(url, { instances: [{ prompt }], parameters: { sampleCount: 1 } });
                    
                    const base64 = data.predictions?.[0]?.bytesBase64Encoded;
                    if (!base64) throw new Error(`No image data from ${model}`);
                    
                    finalResult = `data:image/png;base64,${base64}`;
                    success = true;
                    break; 
                } catch (e) {
                    errors.push(`[${model}] failed: ${e.message}`);
                }
            }
            if (!success) {
                throw new Error(`All fallback models failed.\n\nDetails:\n${errors.join('\n')}`);
            }

        } else if (mode === 'audio') {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-native-audio-dialog:generateContent?key=${apiKey}`;
            const data = await makeGoogleRequest(url, {
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: {
                    responseModalities: ["AUDIO"],
                    speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: "Aoede" } } }
                }
            });
            
            const b64pcm = data.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
            if (!b64pcm) throw new Error("API succeeded, but no audio data returned");

            const pcmBuffer = Buffer.from(b64pcm, 'base64');
            const sampleRate = 24000;
            const wavBuffer = Buffer.alloc(44 + pcmBuffer.length);
            
            wavBuffer.write('RIFF', 0);
            wavBuffer.writeUInt32LE(36 + pcmBuffer.length, 4);
            wavBuffer.write('WAVE', 8);
            wavBuffer.write('fmt ', 12);
            wavBuffer.writeUInt32LE(16, 16); 
            wavBuffer.writeUInt16LE(1, 20);  
            wavBuffer.writeUInt16LE(1, 22);  
            wavBuffer.writeUInt32LE(sampleRate, 24); 
            wavBuffer.writeUInt32LE(sampleRate * 2, 28); 
            wavBuffer.writeUInt16LE(2, 32);  
            wavBuffer.writeUInt16LE(16, 34); 
            wavBuffer.write('data', 36);
            wavBuffer.writeUInt32LE(pcmBuffer.length, 40);
            pcmBuffer.copy(wavBuffer, 44);

            finalResult = `data:audio/wav;base64,${wavBuffer.toString('base64')}`;
        }

        return res.status(200).json({ result: finalResult });

    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}


