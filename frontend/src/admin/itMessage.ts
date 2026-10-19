// The ready message an institution admin sends their IT people: what the
// site is, and the one DNS record that proves the domain (DomainProof).

export function itMessage(institution: string, domain: string, name: string, value: string): string {
  return [
    'שלום,',
    '',
    `${institution} מצטרף ל-StudySpot, אתר למציאת מקומות לימוד בקמפוס. סטודנטים ייכנסו אליו בקוד שנשלח למייל בסיומת ${domain}.`,
    'כדי להוכיח שהדומיין שלנו, צריך להוסיף רשומת DNS אחת:',
    '',
    `Type: TXT`,
    `Name: ${name}`,
    `Value: ${value}`,
    '',
    'הרשומה לא משנה שום דבר אחר בדומיין. אחרי שהיא נוספת, אפשר למחוק אותה, אבל עדיף להשאיר.',
    'תודה!',
  ].join('\n')
}
