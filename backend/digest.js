import nodemailer from 'nodemailer';

const STATUSES = ['Saved', 'Applied', 'Interviewing', 'Offer', 'Rejected'];
const WEEKLY_TARGET = 30;
const FROM_EMAIL = 'charlie@workbench-data.com';
const GEMINI_MODEL = 'gemini-1.5-flash';

export async function runWeeklyDigest(pool, gmailPass, geminiKey) {
  const { rows: accounts } = await pool.query(
    `SELECT id, email, notification_email, first_name, last_name
     FROM accounts WHERE "isDemo" IS NOT TRUE`
  );

  if (!accounts.length) {
    console.log('[Digest] No accounts to send to.');
    return;
  }

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: FROM_EMAIL, pass: gmailPass },
  });

  for (const account of accounts) {
    try {
      await sendDigestForAccount(pool, transporter, geminiKey, account);
    } catch (err) {
      console.error(`[Digest] Failed for account ${account.id}:`, err.message);
    }
  }
}

async function sendDigestForAccount(pool, transporter, geminiKey, account) {
  const { id: accountId, email, notification_email, first_name, last_name } = account;
  const toEmail = notification_email || email;
  const name = [first_name, last_name].filter(Boolean).join(' ') || email;

  const [movementsResult, journalResult] = await Promise.all([
    pool.query(
      `SELECT "toStatus", COUNT(*)::int AS count
       FROM job_status_history
       WHERE "accountId" = $1 AND "changedAt" >= NOW() - INTERVAL '7 days'
       GROUP BY "toStatus"`,
      [accountId]
    ),
    pool.query(
      `SELECT content, date FROM journal_entries
       WHERE "accountId" = $1 AND date >= NOW() - INTERVAL '7 days'
       ORDER BY date DESC`,
      [accountId]
    ),
  ]);

  const movementsByStatus = Object.fromEntries(movementsResult.rows.map(r => [r.toStatus, r.count]));
  const totalMovements = movementsResult.rows.reduce((sum, r) => sum + r.count, 0);
  const journalEntries = journalResult.rows;

  let focus = null;
  let resources = null;
  if (journalEntries.length > 0) {
    const journalText = journalEntries.map(j => `[${j.date}]\n${j.content}`).join('\n\n---\n\n');
    [focus, resources] = await generateInsights(geminiKey, journalText);
  }

  const weekOf = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const html = buildEmailHTML({ name, movementsByStatus, totalMovements, focus, resources, weekOf });

  await transporter.sendMail({
    from: `"Workbench" <${FROM_EMAIL}>`,
    to: toEmail,
    subject: `Your Weekly Job Search Digest — Week of ${weekOf}`,
    html,
  });

  console.log(`[Digest] Sent to ${toEmail} (account ${accountId}): ${totalMovements} movements`);
}

async function generateInsights(geminiKey, journalText) {
  const prompt = `You are a supportive job search coach reviewing someone's weekly journal entries. Based only on what they wrote, answer both questions in 2–3 sentences each. Be specific and actionable, not generic.

Journal entries from the past week:
${journalText}

Respond in JSON with exactly these two keys:
{
  "focus": "Answer to: What should be the focus in the upcoming week?",
  "resources": "Answer to: What additional resources or support would help in the upcoming week?"
}`;

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${geminiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.4 },
      }),
    }
  );

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Gemini API error: ${res.status} — ${errBody.slice(0, 200)}`);
  }
  const data = await res.json();
  let raw = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}';
  // Strip markdown code fences if the model wraps the JSON
  raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  const parsed = JSON.parse(raw);
  return [parsed.focus || '—', parsed.resources || '—'];
}

function bar(fraction) {
  const pct = Math.min(100, Math.round(fraction * 100));
  const color = pct >= 100 ? '#16a34a' : pct >= 60 ? '#4F46E5' : '#f59e0b';
  return `
    <div style="background:#E5E7EB;border-radius:6px;height:10px;width:100%;margin-top:10px;">
      <div style="background:${color};width:${pct}%;height:10px;border-radius:6px;"></div>
    </div>`;
}

function statusRow(label, count) {
  if (!count) return '';
  const dots = { Saved: '⬜', Applied: '🟦', Interviewing: '🟨', Offer: '🟩', Rejected: '🟥' };
  return `
    <tr>
      <td style="padding:6px 0;color:#374151;font-size:14px;">${dots[label] ?? '⬜'} ${label}</td>
      <td style="padding:6px 0;text-align:right;font-weight:600;color:#111;font-size:14px;">${count}</td>
    </tr>`;
}

function buildEmailHTML({ name, movementsByStatus, totalMovements, focus, resources, weekOf }) {
  const scorePct = totalMovements / WEEKLY_TARGET;
  const scoreColor = scorePct >= 1 ? '#16a34a' : scorePct >= 0.6 ? '#4F46E5' : '#f59e0b';
  const greeting = name ? `Hi ${name.split(' ')[0]},` : 'Hi,';

  const noJournal = focus === null;
  const insightsSection = noJournal
    ? `<p style="color:#6B7280;font-size:14px;font-style:italic;">No journal entries found for this week — add some to get personalized focus and resource recommendations next Monday.</p>`
    : `
      <div style="margin-bottom:18px;">
        <p style="font-size:13px;font-weight:600;color:#4F46E5;margin:0 0 6px;text-transform:uppercase;letter-spacing:0.05em;">Focus for the week</p>
        <p style="margin:0;font-size:14px;line-height:1.65;color:#374151;">${focus}</p>
      </div>
      <div>
        <p style="font-size:13px;font-weight:600;color:#4F46E5;margin:0 0 6px;text-transform:uppercase;letter-spacing:0.05em;">Resources &amp; support</p>
        <p style="margin:0;font-size:14px;line-height:1.65;color:#374151;">${resources}</p>
      </div>`;

  const noMovements = totalMovements === 0;
  const stageRows = STATUSES.map(s => statusRow(s, movementsByStatus[s] ?? 0)).join('');

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F3F4F6;font-family:Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F3F4F6;padding:32px 0;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;max-width:600px;width:100%;">

  <!-- Header -->
  <tr><td style="background:#4F46E5;padding:28px 32px;">
    <p style="margin:0;font-size:12px;color:#A5B4FC;text-transform:uppercase;letter-spacing:0.1em;">Workbench</p>
    <h1 style="margin:6px 0 0;font-size:22px;color:#ffffff;font-weight:700;">Weekly Job Search Digest</h1>
    <p style="margin:4px 0 0;font-size:13px;color:#C7D2FE;">Week of ${weekOf}</p>
  </td></tr>

  <!-- Body -->
  <tr><td style="padding:28px 32px;">
    <p style="margin:0 0 24px;font-size:15px;color:#374151;">${greeting}</p>

    <!-- Scorecard -->
    <div style="background:#F9FAFB;border:1px solid #E5E7EB;border-radius:10px;padding:20px;margin-bottom:24px;">
      <p style="margin:0 0 4px;font-size:13px;font-weight:600;color:#6B7280;text-transform:uppercase;letter-spacing:0.05em;">Weekly Scorecard</p>
      <p style="margin:0;">
        <span style="font-size:36px;font-weight:700;color:${scoreColor};">${totalMovements}</span>
        <span style="font-size:16px;color:#9CA3AF;margin-left:4px;">/ ${WEEKLY_TARGET} movements</span>
      </p>
      ${bar(scorePct)}
      ${scorePct >= 1
        ? `<p style="margin:8px 0 0;font-size:13px;color:#16a34a;font-weight:600;">Goal reached this week!</p>`
        : `<p style="margin:8px 0 0;font-size:13px;color:#6B7280;">${WEEKLY_TARGET - totalMovements} more to hit your weekly goal</p>`}
    </div>

    <!-- Stage movements -->
    <div style="margin-bottom:24px;">
      <p style="margin:0 0 12px;font-size:13px;font-weight:600;color:#6B7280;text-transform:uppercase;letter-spacing:0.05em;">Stage Movements</p>
      ${noMovements
        ? `<p style="color:#6B7280;font-size:14px;font-style:italic;">No stage movements recorded this week.</p>`
        : `<table width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #E5E7EB;">${stageRows}
           <tr><td style="padding-top:10px;font-size:13px;color:#6B7280;border-top:1px solid #E5E7EB;" colspan="2">Total movements</td>
           <td style="padding-top:10px;text-align:right;font-weight:700;font-size:14px;border-top:1px solid #E5E7EB;">${totalMovements}</td></tr>
           </table>`}
    </div>

    <!-- AI Insights -->
    <div style="background:#F9FAFB;border:1px solid #E5E7EB;border-radius:10px;padding:20px;">
      <p style="margin:0 0 16px;font-size:13px;font-weight:600;color:#6B7280;text-transform:uppercase;letter-spacing:0.05em;">The Week Ahead</p>
      ${insightsSection}
    </div>
  </td></tr>

  <!-- Footer -->
  <tr><td style="padding:20px 32px;background:#F9FAFB;border-top:1px solid #E5E7EB;">
    <p style="margin:0;font-size:12px;color:#9CA3AF;text-align:center;">Workbench · Sent every Monday at 7am PT</p>
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}
