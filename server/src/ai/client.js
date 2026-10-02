import Groq from 'groq-sdk'
import { db } from '../supabase.js'

let groq = null
function getGroqClient() {
  if (!groq && process.env.GROQ_API_KEY && process.env.GROQ_API_KEY !== 'placeholder') {
    groq = new Groq({ apiKey: process.env.GROQ_API_KEY })
  }
  return groq
}

/**
 * Universal wrapper for AI skills powered by GROQ LPU Inference.
 * Supports native JSON mode, strict Zod validation, 6-second timeout,
 * logging to ai_runs, and automatic deterministic fallback.
 */
export async function runSkill({
  name,
  userId = null,
  system,
  user,
  schema,
  fallback,
  maxTokens = 800
}) {
  const startTime = Date.now()
  let output
  let usedFallback = false
  const isDisabled = process.env.LLM_DISABLED === 'true' || !process.env.GROQ_API_KEY || process.env.GROQ_API_KEY === 'placeholder'

  try {
    if (isDisabled) {
      throw new Error('LLM is disabled or GROQ_API_KEY not configured')
    }

    const client = getGroqClient()
    if (!client) {
      throw new Error('Groq client not initialized')
    }

    const callPromise = client.chat.completions.create({
      model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
      max_tokens: maxTokens,
      temperature: 0.1,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `${system}\nCRITICAL: Return ONLY valid JSON adhering to the required schema. Do not enclose in markdown blocks.`
        },
        { role: 'user', content: user }
      ]
    })

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Skill execution timed out (6s)')), 6000)
    )

    const response = await Promise.race([callPromise, timeoutPromise])
    const rawText = response.choices?.[0]?.message?.content || '{}'

    const cleanJson = rawText.replace(/```json/gi, '').replace(/```/g, '').trim()
    const parsed = JSON.parse(cleanJson)
    output = schema.parse(parsed)
  } catch (err) {
    usedFallback = true
    output = await fallback()
  }

  const latencyMs = Date.now() - startTime

  // Fire-and-forget logging to ai_runs in Supabase
  db.from('ai_runs').insert({
    name,
    user_id: userId,
    input: { user },
    output,
    latency_ms: latencyMs,
    used_fallback: usedFallback
  }).then(() => {}, (logErr) => console.error('Failed to log ai_run:', logErr.message))

  return { output, usedFallback }
}
