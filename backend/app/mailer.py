"""Alert email: personalized subject and body (plain text + HTML). SMTP is used only when SMTP_HOST is set."""
import os, html as H, smtplib
from email.message import EmailMessage

COL = {"high": "#C74747", "medium": "#D99A32", "low": "#176B50"}
ROLE = {"head": "You are listed as the head of {org}, so you receive high-priority alerts and any alert that nobody has acknowledged.",
        "manager": "You are listed as a manager for {org}.", "staff": "You are listed as a staff contact for {org}."}

def app_url(): return os.getenv("APP_URL", "http://localhost:5173").rstrip("/") + "/app/anomalies"

def send(to, subject, text, html):
    host = os.getenv("SMTP_HOST")
    if not host: return "email not sent (SMTP not configured)"
    try:
        m = EmailMessage(); m["From"] = os.getenv("SMTP_FROM", os.getenv("SMTP_USER", "")); m["To"] = to; m["Subject"] = subject
        m.set_content(text); m.add_alternative(html, subtype="html")
        with smtplib.SMTP(host, int(os.getenv("SMTP_PORT", "587")), timeout=10) as s:
            s.starttls()
            if os.getenv("SMTP_USER"): s.login(os.getenv("SMTP_USER"), os.getenv("SMTP_PASS", ""))
            s.send_message(m)
        return "email sent"
    except Exception as e:
        return f"email failed ({type(e).__name__})"

def compose(kind, name, role, i):
    """i: id, org, sev, obs, exp, msg, when, time, test, esc, src. Returns (subject, text, html)."""
    sev = i["sev"]; org = i["org"]; ratio = i["obs"] / max(i["exp"], 0.01); pct = round((ratio - 1) * 100); color = COL.get(sev, "#176B50")
    if i["test"]: subject = f"[GridWise AI] TEST alert for {org}: notification check"; head = "Test alert: your notifications are working"
    elif kind == "escalated": subject = f"[GridWise AI] ESCALATED: {sev.upper()} alert for {org} not acknowledged after {i['esc']} min"; head = f"Escalation: this {sev} alert has not been acknowledged"
    else: subject = f"[GridWise AI] {sev.upper()} alert for {org}: {i['obs']:.2f} kW at {i['time']} (typical {i['exp']:.2f} kW)"; head = f"Power is {ratio:.1f}x higher than normal for this hour"
    who = ROLE.get(role, ROLE["staff"]).format(org=org)
    if kind == "escalated" and not i["test"]: who += f" It was raised {i['esc']} or more minutes ago and is still open."
    nxt = "This is a drill. No action is needed." if i["test"] else f"Check which equipment was running around {i['time']}. An alert shows unusual consumption, not proof of a fault."
    url = app_url()
    rows = [("Observed power", f"{i['obs']:.2f} kW"), ("Typical for this hour", f"{i['exp']:.2f} kW"), ("Above normal", f"+{pct}%"), ("Detected", i["when"]), ("Organization", org), ("Data source", i["src"]), ("Alert ID", f"#{i['id']}")]
    text = f"Dear {name},\n\n{head.upper()}\n\n{i['msg']}\n\n" + "\n".join(f"{k}: {v}" for k, v in rows) + f"\n\nSeverity: {sev.upper()}\n\n{who}\n\nNext step: {nxt}\n\nReview and acknowledge: {url}\n\nThis is an automated message from GridWise AI. Estimates come from your readings and a statistical baseline."
    e = lambda x: H.escape(str(x))
    tr = "".join(f'<tr><td style="padding:9px 0;color:#66736C;border-bottom:1px solid #E5E9E4;font-size:14px">{e(k)}</td><td style="padding:9px 0;text-align:right;font-weight:600;color:#202823;border-bottom:1px solid #E5E9E4;font-size:14px">{e(v)}</td></tr>' for k, v in rows)
    html = f'''<!doctype html><html><body style="margin:0;background:#FAFAF7;font-family:Segoe UI,Arial,sans-serif;color:#202823">
<div style="display:none;max-height:0;overflow:hidden">{e(head)}. {e(i['msg'])}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff;border:1px solid #E5E9E4;border-radius:12px;overflow:hidden">
<tr><td style="background:#176B50;padding:18px 24px;color:#fff"><span style="font-size:18px;font-weight:800">GridWise AI</span><span style="font-size:13px;opacity:.85"> &nbsp;|&nbsp; Energy alert</span></td></tr>
<tr><td style="padding:26px 24px 8px"><span style="display:inline-block;background:{color};color:#fff;font-size:12px;font-weight:700;letter-spacing:.06em;padding:4px 12px;border-radius:99px">{e(sev.upper())}{' &middot; TEST' if i['test'] else ''}</span>
<h1 style="font-size:22px;line-height:1.3;margin:14px 0 8px">{e(head)}</h1><p style="margin:0 0 6px;font-size:15px;line-height:1.55">Dear {e(name)},</p><p style="margin:0;font-size:15px;line-height:1.55">{e(i['msg'])}</p></td></tr>
<tr><td style="padding:12px 24px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">{tr}</table></td></tr>
<tr><td style="padding:6px 24px 4px"><div style="background:#E8F3EC;border-radius:10px;padding:14px 16px;font-size:14px;line-height:1.55"><b>Next step</b><br>{e(nxt)}</div><p style="font-size:13px;color:#66736C;line-height:1.5;margin:14px 0 0">{e(who)}</p></td></tr>
<tr><td align="center" style="padding:20px 24px 26px"><a href="{e(url)}" style="display:inline-block;background:#176B50;color:#fff;text-decoration:none;font-weight:600;padding:12px 26px;border-radius:10px">Review and acknowledge</a></td></tr>
<tr><td style="background:#FAFAF7;padding:14px 24px;font-size:12px;color:#66736C;border-top:1px solid #E5E9E4">Automated message from GridWise AI. Alerts reflect statistical comparison with your own usage pattern and are not a diagnosis of an electrical fault.</td></tr>
</table></td></tr></table></body></html>'''
    return subject, text, html