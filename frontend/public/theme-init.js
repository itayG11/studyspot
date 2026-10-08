// The visitor's light or dark choice, before the first paint: a plain
// script in <head> runs before the page is drawn, and the app's own code
// (a module, src/logic/theme.ts) runs only after. A file, not an inline
// script, since the security policy allows no inline scripts. It reads the
// same key and values as theme.ts; keep the two the same.
try {
  var theme = localStorage.getItem('studyspot:theme')
  if (theme === 'light' || theme === 'dark') document.documentElement.dataset.theme = theme
} catch {
  // storage refused: the device's setting decides
}
