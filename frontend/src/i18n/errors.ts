// Hebrew text for each error code the server can send (see backend/app).
// A code missing here falls back to a general message.

const MESSAGES: Record<string, string> = {
  network_error: 'אין חיבור לשרת. בדוק את החיבור לאינטרנט ונסה שוב.',
  unknown_error: 'משהו השתבש. נסה שוב.',
  validation_error: 'חלק מהפרטים לא תקינים.',
  too_many_requests: 'יותר מדי בקשות. חכה רגע ונסה שוב.',

  // Signing in
  not_authenticated: 'צריך להתחבר כדי לעשות את זה.',
  invalid_token: 'החיבור הסתיים. התחבר שוב.',
  token_expired: 'החיבור הסתיים. התחבר שוב.',
  invalid_session: 'החיבור הסתיים. התחבר שוב.',
  session_rotated: 'החיבור התחדש בלשונית אחרת. רענן את הדף.',
  origin_not_allowed: 'הבקשה נחסמה, כי היא לא הגיעה מהאתר עצמו.',
  forbidden: 'אין לך הרשאה לפעולה הזו.',
  invalid_state: 'ההתחברות לא הושלמה. נסה שוב מההתחלה.',
  token_exchange_failed: 'הספק לא אישר את ההתחברות. נסה שוב.',
  invalid_id_token: 'אישור ההתחברות מהספק לא תקין. נסה שוב.',
  provider_unavailable: 'שירות ההתחברות לא זמין כרגע. נסה שוב בעוד רגע.',
  provider_not_available: 'שיטת ההתחברות הזו לא פעילה.',
  institution_not_supported: 'החשבון הזה לא שייך למוסד שמחובר למערכת. התחבר עם חשבון המוסד שלך.',
  concurrent_sign_in: 'ההתחברות הושלמה בלשונית אחרת. רענן את הדף.',
  demo_login_disabled: 'כניסת ההדגמה כבויה בשרת הזה.',

  // Campus
  institution_not_found: 'המוסד לא נמצא.',
  place_not_found: 'המקום לא נמצא.',
}

export function errorMessage(code: string): string {
  return MESSAGES[code] ?? MESSAGES.unknown_error
}
