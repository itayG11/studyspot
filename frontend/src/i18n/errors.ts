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
  concurrent_sign_in: 'התחברות אחרת לאותו חשבון הסתיימה באותו רגע. נסה שוב.',
  open_sign_in_full: 'היום נפתחו כבר הרבה חשבונות חדשים באתר ההדגמה. נסה שוב מחר, או היכנס כסטודנט לדוגמה.',
  demo_login_disabled: 'כניסת ההדגמה כבויה בשרת הזה.',
  demo_account: 'את המשתמש לדוגמה אי אפשר למחוק: הוא משותף לכל המבקרים. התחבר עם החשבון שלך כדי שיהיה לך חשבון משלך.',

  // Campus
  institution_not_found: 'המוסד לא נמצא.',
  place_not_found: 'המקום לא נמצא.',
  other_institution: 'המקום הזה שייך למוסד אחר.',

  // Bookings
  not_bookable: 'את המקום הזה לא מזמינים מראש. פשוט מגיעים וסורקים.',
  seat_required: 'צריך לבחור תא.',
  seat_not_in_place: 'התא לא שייך למקום הזה.',
  invalid_range: 'שעת הסיום צריכה להיות אחרי שעת ההתחלה.',
  not_on_slot: 'אפשר להזמין רק ברבעי שעה עגולים.',
  too_long: 'ההזמנה ארוכה מדי.',
  in_the_past: 'השעה הזו כבר עברה.',
  too_far_ahead: 'אי אפשר להזמין כל כך הרבה זמן מראש.',
  outside_opening_hours: 'המקום סגור בחלק מהזמן הזה.',
  too_many_bookings: 'יש לך כבר את מספר ההזמנות המרבי. בטל אחת כדי להזמין עוד.',
  slot_taken: 'מישהו הזמין את הזמן הזה ממש עכשיו. בחר זמן אחר.',
  concurrent_request: 'בקשה אחרת שלך רצה באותו רגע. נסה שוב.',
  booking_not_found: 'ההזמנה לא נמצאה, או שכבר אי אפשר לשנות אותה.',
  not_checked_in: 'אפשר להאריך רק אחרי שאישרת הגעה.',
  no_time_to_extend: 'אין זמן להאריך: מישהו הזמין אחריך, או שהמקום נסגר.',

  // Check-in
  invalid_code: 'הקוד לא תקין, או שהוחלף בקוד חדש. סרוק את השלט שבמקום.',
  place_closed: 'המקום סגור עכשיו.',
  place_full: 'המקום מלא כרגע.',
  no_booking_now: 'אין לך הזמנה לחדר הזה עכשיו. אפשר לאשר הגעה מעשר דקות לפני ההזמנה.',
  booked_other_seat: 'הזמנת תא אחר. שב בתא שהזמנת.',
  seat_still_in_use: 'מי שיושב בתא עדיין לא סיים. נסה שוב כשהזמן שלו נגמר.',
  seat_taken: 'מישהו כבר יושב בתא הזה.',
  seat_booked: 'התא מוזמן עכשיו, ובעל ההזמנה עוד יכול להגיע.',
  seat_booked_soon: 'התא מוזמן בעוד פחות מרבע שעה. בחר תא אחר.',
  no_active_check_in: 'אין לך כניסה פעילה.',
  check_in_not_found: 'הכניסה לא נמצאה, או שכבר הסתיימה.',

  // Admin
  building_not_found: 'הבניין לא נמצא.',
}

export function errorMessage(code: string): string {
  return MESSAGES[code] ?? MESSAGES.unknown_error
}
