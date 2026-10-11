"""A timetable file shaped like the college's export, for e2e/classes.spec.ts.
Made-up lecturers. Writes the file to the path given."""

import sys

from openpyxl import Workbook

DAYS = ["יום ראשון", "יום שני", "יום שלישי", "יום רביעי", "יום חמישי", "יום שישי"]

book = Workbook()
sheet = book.active
sheet.append(["טבלה - לוח מערכת שעות"])
sheet.append([""] + DAYS)
sheet.append(["17:00", "", "", "", "", "61774-יסודות המחשוב תרגיל מר דוגמה\t705 L L 17:00-18:30", ""])
sheet.append(["18:00", "", "", "", "", "המשך יסודות המחשוב", ""])
book.save(sys.argv[1])
