// Runs before first paint so the page never flashes the wrong theme.
//
// A file of its own rather than an inline script: the Content Security Policy
// allows scripts from this origin only, and an inline block would be refused.
// Duplicated from useTheme deliberately — the hook cannot run this early, and a
// flash of the opposite theme on every load is worse than the repetition.
// Wrapped because storage throws in some private modes.
;(function () {
  try {
    var choice = localStorage.getItem('questly:v1:theme') || 'dark'
    var resolved =
      choice === 'system' ? (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark') : choice
    document.documentElement.setAttribute('data-theme', resolved)
    if (resolved === 'light') {
      var meta = document.querySelector('meta[name="theme-color"]')
      if (meta) meta.setAttribute('content', '#ece4d3')
    }
  } catch (e) {
    document.documentElement.setAttribute('data-theme', 'dark')
  }
})()
