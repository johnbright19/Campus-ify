import { z } from 'zod'
import { runSkill } from '../client.js'

export const ApprovalBriefSchema = z.object({
  summary: z.string(),
  riskFlags: z.array(z.string()),
  suggestedAction: z.enum(['approve', 'reject', 'ask_changes']),
  reason: z.string()
})

export async function summarizeRequestForApprover({ booking, requester, softConflicts = 0, user }) {
  const fallback = async () => {
    const riskFlags = []
    if (requester?.no_show_count > 0) {
      riskFlags.push(`${requester.no_show_count} past no-show(s) recorded`)
    }
    if (softConflicts > 0) {
      riskFlags.push(`Overlaps with ${softConflicts} other pending request(s)`)
    }
    if (['exam', 'placement'].includes(booking.event_type) && !booking.verified) {
      riskFlags.push(`High priority event (${booking.event_type}) requires faculty verification`)
    }

    return {
      summary: `${booking.title} requested by ${requester?.full_name || 'User'} (${requester?.role || 'student'}, ${requester?.club || requester?.department || 'General'}) for ${booking.attendees} attendees.`,
      riskFlags,
      suggestedAction: riskFlags.length > 1 ? 'ask_changes' : 'approve',
      reason: riskFlags.length === 0 ? 'Standard request with no detected conflicts or history flags.' : 'Review flagged items before approving.'
    }
  }

  return runSkill({
    name: 'summarize_request_for_approver',
    userId: user?.id,
    schema: ApprovalBriefSchema,
    system: `You are the Approval Copilot. Provide a concise 2-3 line decision brief for an academic department head or facility manager.
Identify risk flags (e.g. no-shows, soft conflicts, unverified high-priority claims).
Suggest an action: 'approve', 'reject', or 'ask_changes'.
Base your output ONLY on the provided JSON data.`,
    user: JSON.stringify({ booking, requester, softConflicts }),
    fallback
  })
}
