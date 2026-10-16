"""Sending the one-time sign-in codes by email.

Production uses Brevo's HTTPS API: the free hosting blocks the SMTP ports,
and an HTTPS call needs nothing but an API key. Development can print the
code to the server log instead (EMAIL_LOGIN_DEV_LOG), which Settings refuses
on a deployed site. Tests use a fake that keeps the codes.
"""

import logging
from typing import Protocol

import httpx

from app.errors import Refusal

BREVO_URL = "https://api.brevo.com/v3/smtp/email"

log = logging.getLogger(__name__)


class Mailer(Protocol):
    def send_code(self, to: str, code: str) -> None:
        """Send the code, or raise Refusal(502, "email_not_sent")."""


def _subject(code: str) -> str:
    # The code in the subject: phones show it in the notification.
    return f"קוד הכניסה שלך ל-StudySpot: {code}"


def _text(code: str) -> str:
    return (
        f"קוד הכניסה שלך הוא {code}.\n"
        "הקוד תקף ל-20 דקות, ולשימוש אחד.\n"
        "אם לא ביקשת להתחבר, אפשר להתעלם מההודעה הזאת."
    )


class BrevoMailer:
    def __init__(self, http: httpx.Client, api_key: str, sender: str, sender_name: str = "StudySpot"):
        self.http, self.api_key, self.sender, self.sender_name = http, api_key, sender, sender_name

    def send_code(self, to: str, code: str) -> None:
        try:
            response = self.http.post(
                BREVO_URL,
                headers={"api-key": self.api_key, "accept": "application/json"},
                json={
                    "sender": {"name": self.sender_name, "email": self.sender},
                    "to": [{"email": to}],
                    "subject": _subject(code),
                    # Plain text only: Brevo adds a hidden image to an HTML
                    # email and logs when it is opened. Here it has nowhere to go.
                    "textContent": _text(code),
                },
                timeout=10,
            )
        except httpx.HTTPError:
            log.warning("Brevo could not be reached")
            raise Refusal(502, "email_not_sent") from None
        if response.status_code >= 300:
            # The status only: the response may repeat the address.
            log.warning("Brevo refused the email: HTTP %s", response.status_code)
            raise Refusal(502, "email_not_sent")


class LogMailer:
    """Development only: the code goes to the server log."""

    def send_code(self, to: str, code: str) -> None:
        log.warning("EMAIL_LOGIN_DEV_LOG: sign-in code for %s is %s", to, code)
