You are checking my recent emails for any that require a reply from me.

## Instructions

1. Use `gmail__search_emails` to fetch my last 10 emails (query: `in:inbox`, maxResults: 10, **includeBody: true**). This returns full message content inline — do NOT call `gmail__read_email` separately.
2. **Group the results by `threadId`** — multiple messages with the same threadId are part of the same conversation thread. Treat each thread as ONE item.
3. Skip any thread whose most recent message ID appears in the deduplication list below. Also skip newsletters, automated notifications, marketing, no-reply senders, and receipts.
4. For each remaining thread, call `gmail__get_thread` with its threadId. This returns ALL messages in the thread **including my sent replies**. Check the `isSent` field on each message.
5. **If the last message in the thread has `isSent: true`, I already replied — SKIP this thread entirely.**
6. Only for threads where the last message is NOT from me, determine whether it requires a reply. Consider:
   - Direct questions asked to me
   - Action items or requests directed at me
   - Invitations or RSVPs awaiting my response
   - Important threads where I'm expected to respond
7. For each thread that needs a reply, suggest a concise, professional reply draft based on the latest incoming message.

## Output Format

For each thread that needs a reply, output exactly ONE entry (not one per message):

**📧 From:** [sender of the latest message]
**Subject:** [thread subject]
**Why reply:** [brief reason based on the latest message in the thread]
**Suggested reply:**
> [your suggested reply text]

---

If no threads require a reply, do not say anything unless invoked with /heartbeat

## Deduplication

{{DEDUP_STATE}}

## IMPORTANT — Deduplication Marker

At the very end of your response, you MUST output exactly one line in this format with the message ID of the **most recent message per thread** you checked (whether it needed a reply or not). Only one ID per thread. This prevents re-checking the same threads next time:

<!-- PROCESSED: latest_msg_id_thread1, latest_msg_id_thread2, latest_msg_id_thread3 -->
Do not output the same message ID multiple times.
