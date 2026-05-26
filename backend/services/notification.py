"""Notification dispatcher — sends private channel messages via Email or WhatsApp."""

from __future__ import annotations

import logging
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from config import settings

logger = logging.getLogger("aura_cx.notifications")


async def send_private_channel_message(
    *,
    channel: str,
    address: str,
    subject: str,
    text_body: str,
    html_body: str | None = None,
) -> bool:
    """Send a message via email or WhatsApp. Returns True on success."""
    if channel == "email":
        return await _send_email(address=address, subject=subject, text_body=text_body, html_body=html_body)
    elif channel == "whatsapp":
        return await _send_whatsapp(phone=address, body=text_body)
    else:
        logger.warning("Unknown notification channel: %s", channel)
        return False


async def _send_email(*, address: str, subject: str, text_body: str, html_body: str | None) -> bool:
    smtp_host = settings.SMTP_HOST if hasattr(settings, "SMTP_HOST") else None
    smtp_user = settings.SMTP_USER if hasattr(settings, "SMTP_USER") else None
    smtp_pass = settings.SMTP_PASS if hasattr(settings, "SMTP_PASS") else None
    smtp_port = int(getattr(settings, "SMTP_PORT", 587))

    if not smtp_host or not smtp_user:
        logger.warning("SMTP not configured — skipping email to %s", address)
        # In dev: just log the message
        logger.info("DEV EMAIL to %s:\nSubject: %s\n%s", address, subject, text_body)
        return True  # don't block flow in dev

    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = smtp_user
        msg["To"] = address
        msg.attach(MIMEText(text_body, "plain"))
        if html_body:
            msg.attach(MIMEText(html_body, "html"))

        with smtplib.SMTP(smtp_host, smtp_port) as server:
            server.starttls()
            server.login(smtp_user, smtp_pass or "")
            server.sendmail(smtp_user, address, msg.as_string())
        logger.info("Email sent to %s", address)
        return True
    except Exception as exc:  # noqa: BLE001
        logger.error("Email send failed: %s", exc)
        return False


async def _send_whatsapp(*, phone: str, body: str) -> bool:
    twilio_sid = settings.TWILIO_ACCOUNT_SID if hasattr(settings, "TWILIO_ACCOUNT_SID") else None
    twilio_token = settings.TWILIO_AUTH_TOKEN if hasattr(settings, "TWILIO_AUTH_TOKEN") else None
    twilio_phone = settings.TWILIO_PHONE_NUMBER if hasattr(settings, "TWILIO_PHONE_NUMBER") else None

    if not twilio_sid or not twilio_token or not twilio_phone:
        logger.warning("Twilio not configured — skipping WhatsApp to %s", phone)
        logger.info("DEV WHATSAPP to %s:\n%s", phone, body)
        return True  # don't block flow in dev

    try:
        from twilio.rest import Client  # type: ignore
        client = Client(twilio_sid, twilio_token)
        wa_from = f"whatsapp:{twilio_phone}"
        wa_to = f"whatsapp:{phone}" if not phone.startswith("whatsapp:") else phone
        client.messages.create(from_=wa_from, to=wa_to, body=body)
        logger.info("WhatsApp sent to %s", phone)
        return True
    except Exception as exc:  # noqa: BLE001
        logger.error("WhatsApp send failed: %s", exc)
        return False


def build_handoff_email_html(
    *,
    customer_name: str,
    ticket_summary: str,
    chat_url: str,
    intro_message: str,
) -> str:
    return f"""
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><style>
body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f8fafc; margin: 0; padding: 20px; }}
.card {{ background: white; border-radius: 12px; padding: 32px; max-width: 560px; margin: 0 auto; box-shadow: 0 2px 12px rgba(0,0,0,0.08); }}
h2 {{ color: #1e293b; margin: 0 0 8px; }}
p {{ color: #475569; line-height: 1.6; }}
.quote {{ background: #f1f5f9; border-left: 4px solid #6366f1; padding: 12px 16px; border-radius: 6px; margin: 16px 0; color: #334155; font-style: italic; }}
.btn {{ display: inline-block; background: #6366f1; color: white !important; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: 600; margin-top: 20px; }}
.footer {{ margin-top: 24px; font-size: 12px; color: #94a3b8; }}
</style></head>
<body>
<div class="card">
  <h2>🔒 Your Support Thread</h2>
  <p>Hi {customer_name},</p>
  <p>{intro_message}</p>
  <div class="quote">Your complaint: "{ticket_summary[:200]}{"..." if len(ticket_summary) > 200 else ""}"</div>
  <p>For your privacy and security, we handle all support discussions in a secure private channel — not on public social media.</p>
  <a href="{chat_url}" class="btn">Continue in Secure Chat →</a>
  <p class="footer">This link is private and expires in 7 days. Do not share it with others.</p>
</div>
</body>
</html>
"""


def build_resolution_email_html(
    *,
    customer_name: str,
    ticket_summary: str,
    resolution_note: str,
    csat_url: str,
) -> str:
    return f"""
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><style>
body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f8fafc; margin: 0; padding: 20px; }}
.card {{ background: white; border-radius: 12px; padding: 32px; max-width: 560px; margin: 0 auto; box-shadow: 0 2px 12px rgba(0,0,0,0.08); }}
.badge {{ display: inline-block; background: #dcfce7; color: #16a34a; padding: 4px 12px; border-radius: 20px; font-size: 13px; font-weight: 600; margin-bottom: 16px; }}
h2 {{ color: #1e293b; margin: 0 0 8px; }}
p {{ color: #475569; line-height: 1.6; }}
.resolution {{ background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 16px; margin: 16px 0; }}
.stars {{ font-size: 28px; margin: 8px 0; }}
a.star-btn {{ text-decoration: none; margin: 0 4px; font-size: 28px; }}
.footer {{ margin-top: 24px; font-size: 12px; color: #94a3b8; }}
</style></head>
<body>
<div class="card">
  <div class="badge">✅ Issue Resolved</div>
  <h2>Your complaint has been resolved</h2>
  <p>Hi {customer_name},</p>
  <p>We've looked into your issue and it has been resolved. Here's what we found:</p>
  <div class="resolution">
    <strong>Resolution:</strong><br>{resolution_note}
  </div>
  <p>How would you rate our support?</p>
  <div>
    {"".join(f'<a href="{csat_url}?score={i}" class="star-btn">{"⭐" if i <= 3 else "🌟"}</a>' for i in range(1, 6))}
  </div>
  <p style="font-size:12px; color:#94a3b8; margin-top:8px;">Original complaint: "{ticket_summary[:100]}..."</p>
  <p class="footer">Thank you for letting us know. We're continuously improving our service.</p>
</div>
</body>
</html>
"""
