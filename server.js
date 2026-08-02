/**
 * Divyasree AI Voice Agent — Backend Server
 * 
 * Secure WebSocket relay between browser and Gemini Live API.
 * The Gemini API key stays server-side; the browser never sees it.
 */

import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { GoogleGenAI, Modality, MediaResolution } from '@google/genai';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// ──────────────────────────────────────────────
// Config
// ──────────────────────────────────────────────
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PORT = process.env.PORT || 3000;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_API_KEY_BACKUP = process.env.GEMINI_API_KEY_BACKUP;

if (!GEMINI_API_KEY) {
  console.error('❌ GEMINI_API_KEY is not set. Create a .env file with your key.');
  process.exit(1);
}

// Dual API key failover system
const aiClients = [
  { ai: new GoogleGenAI({ apiKey: GEMINI_API_KEY }), label: 'Primary' },
];
if (GEMINI_API_KEY_BACKUP) {
  aiClients.push({ ai: new GoogleGenAI({ apiKey: GEMINI_API_KEY_BACKUP }), label: 'Backup' });
  console.log('✅ Backup API key loaded — failover enabled');
}
let currentClientIndex = 0;

/** Get the current AI client, optionally rotating to the next one */
function getAiClient(rotate = false) {
  if (rotate && aiClients.length > 1) {
    currentClientIndex = (currentClientIndex + 1) % aiClients.length;
    console.log(`[Failover] Switched to ${aiClients[currentClientIndex].label} API key`);
  }
  return aiClients[currentClientIndex];
}

const MODEL = 'models/gemini-3.1-flash-live-preview';

// ──────────────────────────────────────────────
// System Instruction
// ──────────────────────────────────────────────
const SYSTEM_INSTRUCTION = `# ROLE
You are Aarav, a professional outbound consultant calling on behalf of Divyasree Developers. Your goal is to have a natural, warm 2-3 minute conversation that qualifies the lead across 4 checkpoints, delivers a compelling pitch, and books a follow-up call — without ever sounding like a script. IMPORTANT: Your very first message must be SHORT — just greet, say your name and that you're from Divyasree, then ask if they have a moment. Do NOT mention any project name or details until the lead agrees to talk.

# CORE PROJECT CONTEXT (always use this — this is your default knowledge for greeting, qualification, and pitch)
- Project: Whispers of the Wind (WOW) by Divyasree Developers.
- Product: Premium "Private Valley" villa plots, 1200–3199 sq. ft.
- Location: Nandi Valley (near Nandi Hills), North Bengaluru.
- USP: 74% open spaces, a 20,000 sq. ft. clubhouse, eco-parks, and scenic hill views.
- Pricing: ₹92.4 Lakh – ₹2.46 Crore (inclusive of taxes).
- Target buyers: HNIs, CXOs, and NRIs seeking luxury weekend homes or high-yield investments.
- Possession timeline: December 2029.

# ADDITIONAL KNOWLEDGE (ONLY use this if the lead explicitly asks something beyond the core context above — do not volunteer these details unprompted)
- Scale: 38 acres, 207 villa plots total.
- Exact location: Heggadihalli Village, Doddaballapura, nestled between Dibbagiri Betta and Horagina Betta hills.
- Connectivity: ~20 minutes from Kempegowda International Airport; near the Devanahalli Business Park / KIADB IT Park corridor.
- Nearby institutions: Stonehill International School, Canadian International School, Aster CMI Hospital.
- Sustainability: 5 themed eco-parks, nature trails, rainwater harvesting, STP-treated water reuse, planned EV charging stations.
- Investment context: Nandi Hills is among Bengaluru's fastest-appreciating micro-markets, with land values roughly doubling over the past five years.
- Approvals: RERA-approved project.
If asked something you genuinely don't have data on, don't invent it — say the Property Expert will confirm exact details on the follow-up call.

# CONVERSATION FLOW
1. INTRODUCTION
   - Greet warmly and introduce yourself as a Divyasree consultant. Keep this opening line brief — 1 short sentence.
   - Immediately ask permission to continue (e.g., "Do you have a couple of minutes to chat?"). Do this before mentioning any project details.
   - If they say no or ask you to call later, politely acknowledge and end the call — do not push forward.
   - Only after they agree, briefly mention you're calling about "Whispers of the Wind," a project near Nandi Hills, North Bengaluru, before moving into qualification.

2. QUALIFICATION — cover these 4 checkpoints through natural conversation, not a rigid interrogation:
   - INTENT: Self-use home or investment?
   - GEOGRAPHY: Comfortable with the Nandi Hills/Devanahalli corridor?
   - BUDGET: Does a starting price of ₹92.4 Lakh+ fit their range?
   - TIMELINE: Comfortable with phased delivery / ongoing project status (possession Dec 2029)?
   
   IMPORTANT: If the lead volunteers information before you ask, acknowledge it naturally and do NOT ask that checkpoint again later.

3. THE PITCH
   - Only after qualifying, deliver a short, aspirational picture of the "Private Valley" lifestyle — using ONLY the Core Project Context USPs (open space, clubhouse, eco-parks, hill views, community). Keep it to 3-4 sentences, tailored to their stated intent.

4. CALL TO ACTION
   - Close by requesting a follow-up call with a Property Expert, ideally getting a preferred day/time.

# CONVERSATIONAL STYLE
- Use natural affirmations ("Understood," "Perfect," "Got it") before moving on.
- Never repeat a question the lead already answered.
- Keep responses concise and conversational — this is a dialogue, not a monologue.
- Tone: premium, warm, non-intrusive. Never pushy.
- Keep the full call to roughly 2-3 minutes.

# PRONUNCIATION GUIDE
- Divyasree → "Div-yaa-shree"
- Nandi → "Nun-dhee"
- Lakh → "Lahk"
- Crore → "Kror"

# EDGE CASE HANDLING
- IRRITATED / DISINTERESTED LEAD: Stay calm, acknowledge their tone, offer to be brief or end the call gracefully. Never argue.
- BUDGET FITS, LOCATION DOESN'T (or vice versa): Don't force it. Acknowledge honestly, ask if they'd like info for future reference, or close politely.
- SILENCE / CONFUSION: Gently re-orient rather than repeating verbatim.

# LANGUAGE — CRITICAL RULE
- Default to English at the start of the call.
- **IMMEDIATELY switch to Hindi or Hinglish the moment you detect the lead is speaking in Hindi or Hinglish.** Do NOT wait for them to ask you to speak in Hindi. If they say even a single sentence in Hindi (e.g., "Haan bataiye", "Kya price hai?", "Theek hai"), your very next response MUST be in Hindi/Hinglish.
- Match the lead's language style: if they speak pure Hindi, respond in Hindi. If they mix Hindi and English (Hinglish), respond in Hinglish.
- Keep project-specific terms (Whispers of the Wind, RERA, clubhouse, villa plots) in English even when speaking Hindi — this is natural in Indian business speech.
- If the lead switches back to English, switch back to English.
- This language mirroring must happen instantly and naturally, as a real bilingual Indian consultant would do.`;

// ──────────────────────────────────────────────
// Gemini Live Session Config
// ──────────────────────────────────────────────
const GEMINI_CONFIG = {
  responseModalities: [Modality.AUDIO],
  mediaResolution: MediaResolution.MEDIA_RESOLUTION_MEDIUM,
  speechConfig: {
    voiceConfig: {
      prebuiltVoiceConfig: {
        voiceName: 'Despina',
      },
    },
  },
  contextWindowCompression: {
    triggerTokens: '104857',
    slidingWindow: { targetTokens: '52428' },
  },
  systemInstruction: {
    parts: [{ text: SYSTEM_INSTRUCTION }],
  },
};

// ──────────────────────────────────────────────
// Express App — Static Files
// ──────────────────────────────────────────────
const app = express();
app.use(express.static(join(__dirname, 'public')));

const server = createServer(app);

// ──────────────────────────────────────────────
// WebSocket Server
// ──────────────────────────────────────────────
const wss = new WebSocketServer({ server, path: '/ws' });

/** Safely send JSON to a client WebSocket */
function sendToClient(ws, data) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

wss.on('connection', (ws) => {
  console.log('[WS] Client connected');
  let geminiSession = null;

  ws.on('message', async (rawData) => {
    let message;
    try {
      message = JSON.parse(rawData.toString());
    } catch {
      console.error('[WS] Invalid JSON from client');
      return;
    }

    switch (message.type) {
      // ── Start a new Gemini Live session ──
      case 'start_session': {
        if (geminiSession) {
          console.log('[Gemini] Closing existing session before starting new one');
          try { geminiSession.close(); } catch { }
          geminiSession = null;
        }

        // Try connecting with failover
        async function tryConnect(retried = false) {
          const { ai, label } = getAiClient();
          console.log(`[Gemini] Creating Live session with ${label} key...`);

          try {
            geminiSession = await ai.live.connect({
              model: MODEL,
              config: GEMINI_CONFIG,
              callbacks: {
                onopen() {
                  console.log(`[Gemini] Session opened (${label})`);
                  sendToClient(ws, { type: 'session_ready' });

                  setTimeout(() => {
                    if (geminiSession) {
                      geminiSession.sendClientContent({
                        turns: ['Hello?'],
                      });
                      console.log('[Gemini] Sent initial trigger to start conversation');
                    }
                  }, 500);
                },

                onmessage(msg) {
                  if (msg.serverContent?.modelTurn?.parts) {
                    for (const part of msg.serverContent.modelTurn.parts) {
                      if (part.inlineData) {
                        sendToClient(ws, {
                          type: 'audio',
                          data: part.inlineData.data,
                        });
                      }
                      if (part.text) {
                        sendToClient(ws, {
                          type: 'transcript',
                          role: 'agent',
                          text: part.text,
                        });
                      }
                    }
                  }

                  if (msg.serverContent?.turnComplete) {
                    sendToClient(ws, { type: 'turn_complete' });
                    console.log('[Gemini] Turn complete');
                  }
                },

                onerror(e) {
                  const errMsg = e.message || 'Unknown error';
                  console.error(`[Gemini] Error (${label}):`, errMsg);

                  // If rate-limited or server error, try failover
                  if (!retried && aiClients.length > 1 &&
                    (errMsg.includes('429') || errMsg.includes('rate') ||
                      errMsg.includes('503') || errMsg.includes('500') ||
                      errMsg.includes('RESOURCE_EXHAUSTED'))) {
                    console.log('[Failover] Rate limit / server error — switching key and retrying...');
                    geminiSession = null;
                    getAiClient(true); // rotate to backup
                    tryConnect(true);
                  } else {
                    sendToClient(ws, {
                      type: 'error',
                      message: 'Gemini session error: ' + errMsg,
                      fatal: true,
                    });
                  }
                },

                onclose(e) {
                  const reason = e?.reason || 'no reason';
                  console.log(`[Gemini] Session closed (${label}):`, reason);

                  // If closed unexpectedly mid-call, try failover
                  if (!retried && aiClients.length > 1 && geminiSession &&
                    (reason.includes('rate') || reason.includes('limit') ||
                      reason.includes('429') || reason.includes('RESOURCE_EXHAUSTED'))) {
                    console.log('[Failover] Session closed due to limits — retrying with backup...');
                    geminiSession = null;
                    getAiClient(true);
                    tryConnect(true);
                  } else {
                    geminiSession = null;
                  }
                },
              },
            });
          } catch (err) {
            console.error(`[Gemini] Failed to connect (${label}):`, err.message);

            // Try backup on connection failure
            if (!retried && aiClients.length > 1) {
              console.log('[Failover] Connection failed — trying backup key...');
              getAiClient(true);
              await tryConnect(true);
            } else {
              sendToClient(ws, {
                type: 'error',
                message: 'Failed to connect to Gemini: ' + err.message,
                fatal: true,
              });
            }
          }
        }

        await tryConnect();
        break;
      }

      // ── Relay mic audio to Gemini ──
      case 'audio': {
        if (geminiSession) {
          try {
            geminiSession.sendRealtimeInput({
              audio: {
                data: message.data,
                mimeType: 'audio/pcm;rate=16000',
              },
            });
          } catch (err) {
            console.error('[Gemini] Error sending audio:', err.message);
          }
        }
        break;
      }

      // ── End the session ──
      case 'end_session': {
        console.log('[WS] Client requested session end');
        if (geminiSession) {
          try { geminiSession.close(); } catch { }
          geminiSession = null;
        }
        break;
      }

      default:
        console.log('[WS] Unknown message type:', message.type);
    }
  });

  ws.on('close', () => {
    console.log('[WS] Client disconnected');
    if (geminiSession) {
      try { geminiSession.close(); } catch { }
      geminiSession = null;
    }
  });

  ws.on('error', (err) => {
    console.error('[WS] Client error:', err.message);
    if (geminiSession) {
      try { geminiSession.close(); } catch { }
      geminiSession = null;
    }
  });
});

// ──────────────────────────────────────────────
// Start Server
// ──────────────────────────────────────────────
server.listen(PORT, () => {
  console.log(`\n  ✅ Divyasree Voice Agent running at http://localhost:${PORT}\n`);
  console.log(`  📞 Open the URL above and click "Answer Call" to start\n`);
});
