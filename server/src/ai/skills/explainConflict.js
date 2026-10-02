import { z } from 'zod'
import { runSkill } from '../client.js'

export const ConflictExplanationSchema = z.object({
  forRequester: z.string(),
  forDisplaced: z.string(),
  rationaleSummary: z.string(),
  tone: z.literal('neutral')
})

export async function explainConflict({ requesterBooking, existingBooking, requesterScore, existingScore, user }) {
  const fallback = async () => {
    const higherScore = requesterScore?.score > existingScore?.score ? 'your' : 'the competing'
    return {
      forRequester: `Your request (${requesterScore?.score || 0} pts) clashed with an existing booking (${existingScore?.score || 0} pts). Priority policy awarded the slot to ${higherScore} request based on event type and notice window.`,
      forDisplaced: `An urgent higher-priority booking was scheduled during your requested time window. We have provided instant alternatives.`,
      rationaleSummary: `Conflict evaluated based on institutional priority scoring (${requesterScore?.score} vs ${existingScore?.score}).`,
      tone: 'neutral'
    }
  }

  return runSkill({
    name: 'explain_conflict',
    userId: user?.id,
    schema: ConflictExplanationSchema,
    system: `You are the Conflict Mediator for campus resources. Explain clearly, respectfully, and neutrally why a booking conflict occurred and how it was resolved according to priority scores.
Do NOT invent facts, rules, or numbers that are not in the provided payload.
Output JSON keys: forRequester, forDisplaced, rationaleSummary, tone.`,
    user: JSON.stringify({
      requesterBooking,
      existingBooking,
      requesterScore,
      existingScore
    }),
    fallback
  })
}
