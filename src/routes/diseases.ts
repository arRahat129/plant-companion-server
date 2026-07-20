import { Router, Request, Response } from 'express';
import { getDB } from '../config/db.js';
import { env } from '../config/env.js';
import { InferenceClient } from "@huggingface/inference";

const router = Router();

// Determine token dynamically from env variables
const hfToken = process.env.HF_TOKEN || env.HF_INFERENCE_TOKEN || '';
const client = new InferenceClient(hfToken);

// ─── Helper: Get user from headers ──────────────────────────
function getSessionUser(req: Request) {
    return {
        id: req.headers['x-user-id'] as string || null,
        name: req.headers['x-user-name'] as string || 'Guest User',
        email: req.headers['x-user-email'] as string || 'anonymous@domain.com',
        image: req.headers['x-user-image'] as string || '',
    };
}

/**
 * GET /api/diseases/count
 */
router.get('/count', async (req: Request, res: Response) => {
    try {
        const user = getSessionUser(req);

        if (!user.id) {
            return res.status(401).json({ success: false, message: 'Authentication required' });
        }

        const db = getDB();
        const count = await db.collection('diseaseCollection').countDocuments({ userId: user.id });

        return res.json({ success: true, count });
    } catch (err: any) {
        console.error('Count fetch error:', err);
        return res.status(500).json({ success: false, message: 'Failed to fetch scan count' });
    }
});

/** 
 * POST /api/diseases/scan
 * Handles visual processing via Hugging Face Inference SDK and report generation via chatCompletion
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

        const imageBuffer = Buffer.from(imageBase64, 'base64');
        const imageBlob = new Blob([imageBuffer], { type: mimeType });

        console.log('📡 Calling HF Image Classification SDK...');

        const classificationResult = await client.imageClassification({
            data: imageBlob,
            model: "linkanjarad/mobilenet_v2_1.0_224-plant-disease-identification",
            provider: "hf-inference",
        });

        if (!classificationResult || classificationResult.length === 0 || !classificationResult[0].label) {
            return res.status(422).json({
                success: false,
                message: 'Classification failed. Please ensure the plant leaf is clearly visible in the image.',
            });
        }

        const primaryPrediction = classificationResult[0];
        const diseaseTag = primaryPrediction.label;
        const confidencePercentage = (primaryPrediction.score * 100).toFixed(1);

        console.log(`🔬 Classification: "${diseaseTag}" (${confidencePercentage}% confidence)`);

        // Generate detailed report via Hugging Face chatCompletion SDK
        console.log('📡 Generating pathology report via HF chatCompletion SDK...');
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

        const chatResponse = await client.chatCompletion({
            model: "openai/gpt-oss-20b:groq",
            messages: [
                {
                    role: "user",
                    content: prompt,
                },
            ],
        });

        const detailedReport = chatResponse.choices[0]?.message?.content || 'Recovery roadmap could not be drafted automatically.';

        // Parse plant and disease names
        const labelParts = diseaseTag.split('___').length > 1
            ? diseaseTag.split('___')
            : diseaseTag.split('__');

        const plantName = labelParts[0]?.replace(/_/g, ' ') || 'Unknown Plant';
        const detectedDisease = labelParts[1]?.replace(/_/g, ' ') || diseaseTag.replace(/_/g, ' ');

        const diagnosticDoc = {
            userId: user.id,
            userName: user.name,
            userEmail: user.email,
            userImage: user.image,
            plantName,
            diseaseName: detectedDisease,
            aiLabels: classificationResult.slice(0, 5),
            reportMarkdown: detailedReport,
            createdAt: new Date(),
        };

        const db = getDB();
        const result = await db.collection('diseaseCollection').insertOne(diagnosticDoc);

        return res.status(201).json({
            success: true,
            message: 'Plant condition scanned and cataloged successfully',
            data: {
                recordId: result.insertedId,
                reportMarkdown: detailedReport,
                plantName,
                diseaseName: detectedDisease,
            },
        });
    } catch (err: any) {
        console.error('Plant Disease Scanning Failure:', err);
        return res.status(500).json({ success: false, message: 'AI diagnostics encountered an internal error' });
    }
});

/** 
 * POST /api/diseases/doctor-agent
 * Agentic conversation thread using previous diagnostic data context via HF SDK chatCompletion
 */
router.post('/doctor-agent', async (req: Request, res: Response) => {
    try {
        const { query, chatHistory } = req.body;
        const user = getSessionUser(req);

        if (!user.id) {
            return res.status(401).json({ success: false, message: 'Authentication required' });
        }

        if (!query || typeof query !== 'string' || !query.trim()) {
            return res.status(400).json({ success: false, message: 'Please provide a question' });
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

        const systemMessage = {
            role: 'system',
            content: `You are an elite, supportive AI Plant Doctor Agent. Your goal is to guide gardeners through fixing plant stresses.
Use this historical context to ground your recommendations if relevant: ${plantContext}.
Be conversational, highly technical yet clear, and focus strictly on botany, agricultural care, and pest management.
Format your responses in clear Markdown with headings, bullet points, and bold text where appropriate.`
        };

        const messages = [
            systemMessage,
            ...(chatHistory || []).map((msg: any) => ({
                role: msg.role === 'user' ? 'user' : 'assistant',
                content: msg.text,
            })),
            { role: 'user', content: query },
        ];

        console.log('📡 Contacting HF SDK chatCompletion for Plant Doctor...');
        const chatResponse = await client.chatCompletion({
            model: "openai/gpt-oss-20b:groq",
            messages: messages.map(msg => ({
                role: msg.role === 'assistant' ? 'assistant' as const : msg.role === 'system' ? 'system' as const : 'user' as const,
                content: msg.content
            })),
        });

        const reply = chatResponse.choices[0]?.message?.content || '';

        return res.json({
            success: true,
            reply: reply || "I'm processing that information, let me re-examine.",
        });
    } catch (err: any) {
        console.error('Plant Doctor Agent Error:', err);
        return res.status(500).json({ success: false, message: 'Plant Doctor AI encountered an error. Please try again.' });
    }
});

export const diseaseRouter = router;