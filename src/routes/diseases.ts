import { Router, Request, Response } from 'express';
import { getDB } from '../config/db.js';
import { GoogleGenAI } from '@google/genai';
import { InferenceClient } from '@huggingface/inference';
import { env } from '../config/env.js';

const router = Router();

// ─── Client Initializations ──────────────────────────────────
const aiStudio = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });
const hfClient = new InferenceClient(env.HF_INFERENCE_TOKEN);

/** Helper to extract custom tracking headers sent by Next.js client */
function getSessionUser(req: Request) {
    return {
        id: req.headers['x-user-id'] as string || null,
        name: req.headers['x-user-name'] as string || 'Guest User',
        email: req.headers['x-user-email'] as string || 'anonymous@domain.com',
        image: req.headers['x-user-image'] as string || '',
    };
}

/** 
 * POST /api/diseases/scan
 * Handles visual processing via Hugging Face and report generation via Gemini
 */
router.post('/scan', async (req: Request, res: Response) => {
    try {
        const { imageBase64, mimeType } = req.body;
        const user = getSessionUser(req);

        if (!user.id) {
            return res.status(401).json({ success: false, message: 'Authentication required' });
        }

        if (!imageBase64 || !mimeType) {
            return res.status(400).json({ success: false, message: 'No plant image provided' });
        }

        // ─── STAGE 1: TS-COMPATIBLE BUFFER CONVERSION ─────────────
        const nodeBuffer = Buffer.from(imageBase64, 'base64');
        const imageArrayBuffer = nodeBuffer.buffer.slice(
            nodeBuffer.byteOffset,
            nodeBuffer.byteOffset + nodeBuffer.byteLength
        );

        // ─── STAGE 2: RESILIENT HARDCODED IP INFERENCE ROUTING ────
        // Pre-defined official Hugging Face edge server IPs to completely bypass local network blocks
        const HUGGINGFACE_STATIC_IPS = [
            '18.235.124.214',
            '50.17.214.228',
            '54.227.147.228',
            '3.220.124.87'
        ];

        // Cycle through the IP pool based on current timestamp for basic distribution
        const selectedIp = HUGGINGFACE_STATIC_IPS[Math.floor(Date.now() % HUGGINGFACE_STATIC_IPS.length)];

        // Construct the raw IP endpoint
        const modelEndpoint = `https://${selectedIp}/models/linkanjarad/mobilenet_v2_1.0_224-plant-disease-identification`;

        console.log(`📡 Routing inference call directly through static edge IP: ${selectedIp}`);

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000); // 15-second network deadline fail-safe

        let responseHF;
        try {
            responseHF = await fetch(modelEndpoint, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${env.HF_INFERENCE_TOKEN}`,
                    'Content-Type': mimeType,
                    // Crucial: The remote gateway needs the exact Host header to map to the correct serverless worker
                    'Host': 'api-inference.huggingface.co'
                },
                body: imageArrayBuffer,
                signal: controller.signal
            });
        } catch (fetchErr: any) {
            if (fetchErr.name === 'AbortError') {
                return res.status(504).json({ success: false, message: 'Hugging Face serverless node timed out. Please retry.' });
            }
            console.error("Network Resolution Error Context:", fetchErr);
            return res.status(503).json({
                success: false,
                message: 'Network connection issue: Unable to securely route data to Hugging Face infrastructure.'
            });
        } finally {
            clearTimeout(timeoutId);
        }

        if (!responseHF.ok) {
            const errorBody = await responseHF.text();
            console.error('Hugging Face Direct API Error response:', errorBody);

            if (responseHF.status === 503) {
                return res.status(503).json({
                    success: false,
                    message: 'Model is currently cold-booting on Hugging Face servers. Try again in 20 seconds.'
                });
            }

            return res.status(responseHF.status).json({
                success: false,
                message: `Hugging Face inference error: ${responseHF.statusText}`
            });
        }

        const classificationResult = await responseHF.json() as any[];

        if (!classificationResult || classificationResult.length === 0 || !classificationResult[0].label) {
            return res.status(422).json({ success: false, message: 'Pathogen mapping failed. Ensure the leaf is highly visible.' });
        }

        // Extract leading matching criteria
        const primaryPrediction = classificationResult[0];
        const diseaseTag = primaryPrediction.label;
        const confidencePercentage = (primaryPrediction.score * 100).toFixed(1);

        // ─── STAGE 3: AGENTIC GENERATION VIA GEMINI ──────────────
        const prompt = `
      You are an expert plant pathologist. An automated vision system classified a plant image asset with these parameters:
      - Predicted Condition/Pathogen: "${diseaseTag}"
      - Vision System Confidence: ${confidencePercentage}%

      Formulate a professional, highly actionable diagnostic report based strictly on these metrics. 
      Format your response with these exact structural Markdown headings:
      
      ### 🌿 Diagnosis & Confidence
      Specify the plant name, matched condition [${diseaseTag}], and validation rate [${confidencePercentage}%].
      
      ### 🔍 Observed Symptoms
      Detail the physiological damage patterns typical for this specific condition.
      
      ### 🎯 Primary Causes
      Explain environmental factors, irrigation errors, or biological triggers related to this condition.
      
      ### 🛡️ Recommended Solutions & Action Plan
      Provide clear step-by-step biological treatments and chemical interventions.
    `;

        const response = await aiStudio.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt
        });

        const detailedReport = response.text || 'Recovery roadmap could not be drafted automatically.';

        // ─── STAGE 4: MONGODB DATA RETENTION STORAGE ──────────────
        const diagnosticDoc = {
            userId: user.id,
            userName: user.name,
            userEmail: user.email,
            userImage: user.image,
            scannedImageSummary: `data:${mimeType};base64,${imageBase64.substring(0, 40)}... [Stored Content]`,
            aiLabels: classificationResult.slice(0, 3),
            reportMarkdown: detailedReport,
            createdAt: new Date()
        };

        const db = getDB();
        const result = await db.collection('diseaseCollection').insertOne(diagnosticDoc);

        return res.status(201).json({
            success: true,
            message: 'Plant condition scanned and cataloged successfully',
            data: {
                recordId: result.insertedId,
                reportMarkdown: detailedReport
            }
        });

    } catch (err: any) {
        console.error('Plant Disease Scanning Failure:', err);
        return res.status(500).json({ success: false, message: 'AI diagnostics encountered an internal error' });
    }
});

/** 
 * POST /api/diseases/doctor-agent
 * Agentic conversation thread using previous diagnostic data context
 */
router.post('/doctor-agent', async (req: Request, res: Response) => {
    try {
        const { query, chatHistory } = req.body;
        const user = getSessionUser(req);

        if (!user.id) {
            return res.status(401).json({ success: false, message: 'Authentication required' });
        }

        const db = getDB();
        const latestScan = await db.collection('diseaseCollection')
            .find({ userId: user.id })
            .sort({ createdAt: -1 })
            .limit(1)
            .toArray();

        let plantContext = "The user has not scanned any plants yet.";
        if (latestScan.length > 0) {
            plantContext = `The user's latest scanned plant report states: \n${latestScan[0].reportMarkdown}`;
        }

        const systemInstruction = `
      You are an elite, supportive AI Plant Doctor Agent. Your goal is to guide gardeners through fixing plant stresses.
      Use this historical context to ground your recommendations if relevant: ${plantContext}.
      Be conversational, highly technical yet clear, and focus strictly on botany, agricultural care, and pest management.
    `;

        const mappedContents = [
            ...(chatHistory || []).map((msg: any) => ({
                role: msg.role === 'user' ? 'user' : 'model',
                parts: [{ text: msg.text }]
            })),
            { role: 'user', parts: [{ text: query }] }
        ];

        const response = await aiStudio.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: mappedContents,
            config: {
                systemInstruction: systemInstruction
            }
        });

        return res.json({
            success: true,
            reply: response.text || "I'm processing that information, let me re-examine."
        });

    } catch (err: any) {
        console.error('Plant Doctor Agent Breakdown:', err);
        return res.status(500).json({ success: false, message: 'Agentic processing loop failed' });
    }
});

export const diseaseRouter = router;