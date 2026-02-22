export default {
  async fetch(request, env) {
    // Handle CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: corsHeaders(env.ALLOWED_ORIGIN),
      });
    }

    if (request.method !== "POST") {
      return jsonResponse({ error: "Method not allowed" }, 405, env.ALLOWED_ORIGIN);
    }

    try {
      const data = await request.json();

      // Validate required fields
      if (!data.name || !data.email || !data.name.trim() || !data.email.trim()) {
        return jsonResponse({ error: "Name und E-Mail sind Pflichtfelder." }, 400, env.ALLOWED_ORIGIN);
      }

      // Basic email validation
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
        return jsonResponse({ error: "Bitte geben Sie eine gültige E-Mail-Adresse ein." }, 400, env.ALLOWED_ORIGIN);
      }

      // Simple honeypot check
      if (data.website) {
        return jsonResponse({ success: true }, 200, env.ALLOWED_ORIGIN);
      }

      // Rate limiting via CF headers
      const ip = request.headers.get("CF-Connecting-IP") || "unknown";

      // Build email content
      const subject = `Neue Kontaktanfrage: ${data.name}${data.company ? ` (${data.company})` : ""}`;
      const body = buildEmailBody(data);

      // Send via MailChannels (free for Cloudflare Workers)
      const emailResponse = await fetch("https://api.mailchannels.net/tx/v1/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          personalizations: [
            {
              to: [{ email: env.TO_EMAIL, name: "Nordvind AI" }],
            },
          ],
          from: {
            email: env.FROM_EMAIL,
            name: `Nordvind AI Kontaktformular`,
          },
          reply_to: {
            email: data.email,
            name: data.name,
          },
          subject: subject,
          content: [
            {
              type: "text/plain",
              value: body.text,
            },
            {
              type: "text/html",
              value: body.html,
            },
          ],
        }),
      });

      if (emailResponse.status === 202 || emailResponse.status === 200) {
        return jsonResponse({ success: true }, 200, env.ALLOWED_ORIGIN);
      }

      const errorText = await emailResponse.text();
      console.error("MailChannels error:", emailResponse.status, errorText);
      return jsonResponse(
        { error: "E-Mail konnte nicht gesendet werden. Bitte versuchen Sie es später erneut." },
        500,
        env.ALLOWED_ORIGIN
      );
    } catch (err) {
      console.error("Worker error:", err);
      return jsonResponse(
        { error: "Ein Fehler ist aufgetreten. Bitte versuchen Sie es später erneut." },
        500,
        env.ALLOWED_ORIGIN
      );
    }
  },
};

function buildEmailBody(data) {
  const interestMap = {
    prozessanalyse: "Prozessanalyse",
    "tool-implementierung": "Tool-Empfehlung & Implementierung",
    "ki-loesungen": "Individuelle KI-Lösungen",
    software: "Software-Entwicklung mit KI",
    marketing: "Marketing mit KI",
    ecommerce: "E-Commerce & Visual Content",
    betreuung: "Laufende Betreuung & Support",
    sonstiges: "Sonstiges",
  };

  const interest = data.interest ? interestMap[data.interest] || data.interest : "Nicht angegeben";

  const text = `Neue Kontaktanfrage über nordvind-ai.de
──────────────────────────────────

Name: ${data.name}
E-Mail: ${data.email}
Unternehmen: ${data.company || "Nicht angegeben"}
Interesse: ${interest}

Nachricht:
${data.message || "Keine Nachricht hinterlassen."}

──────────────────────────────────
Gesendet über das Kontaktformular auf nordvind-ai.de`;

  const html = `
<div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #f8fafc; border-radius: 12px; overflow: hidden;">
  <div style="background: linear-gradient(135deg, #0a1628, #1e3a5f); padding: 24px 32px;">
    <h1 style="color: #00d4ff; margin: 0; font-size: 18px; font-weight: 600;">Neue Kontaktanfrage</h1>
    <p style="color: #94a3b8; margin: 4px 0 0; font-size: 13px;">über nordvind-ai.de</p>
  </div>
  <div style="padding: 24px 32px;">
    <table style="width: 100%; border-collapse: collapse;">
      <tr>
        <td style="padding: 8px 0; color: #64748b; font-size: 14px; width: 120px;">Name</td>
        <td style="padding: 8px 0; color: #1e293b; font-size: 14px; font-weight: 500;">${escapeHtml(data.name)}</td>
      </tr>
      <tr>
        <td style="padding: 8px 0; color: #64748b; font-size: 14px;">E-Mail</td>
        <td style="padding: 8px 0; color: #1e293b; font-size: 14px;"><a href="mailto:${escapeHtml(data.email)}" style="color: #0066cc;">${escapeHtml(data.email)}</a></td>
      </tr>
      <tr>
        <td style="padding: 8px 0; color: #64748b; font-size: 14px;">Unternehmen</td>
        <td style="padding: 8px 0; color: #1e293b; font-size: 14px;">${escapeHtml(data.company || "Nicht angegeben")}</td>
      </tr>
      <tr>
        <td style="padding: 8px 0; color: #64748b; font-size: 14px;">Interesse</td>
        <td style="padding: 8px 0; color: #1e293b; font-size: 14px;">${escapeHtml(interest)}</td>
      </tr>
    </table>
    <div style="margin-top: 16px; padding: 16px; background: white; border-radius: 8px; border: 1px solid #e2e8f0;">
      <p style="margin: 0 0 8px; color: #64748b; font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">Nachricht</p>
      <p style="margin: 0; color: #334155; font-size: 14px; line-height: 1.6; white-space: pre-wrap;">${escapeHtml(data.message || "Keine Nachricht hinterlassen.")}</p>
    </div>
  </div>
  <div style="padding: 16px 32px; background: #f1f5f9; border-top: 1px solid #e2e8f0;">
    <p style="margin: 0; color: #94a3b8; font-size: 12px;">Gesendet über das Kontaktformular auf nordvind-ai.de</p>
  </div>
</div>`;

  return { text, html };
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

function jsonResponse(data, status, origin) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders(origin),
    },
  });
}
