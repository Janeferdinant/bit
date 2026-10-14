// Render a page's App into #root with the React 18 API, or explain what went
// wrong if React could not be loaded from the CDN (for example, offline).
export function mount(App) {
  const root = document.getElementById('root');
  if (typeof React === 'undefined' || typeof ReactDOM === 'undefined') {
    root.innerHTML =
      '<p style="padding:1rem;font-family:sans-serif">This demo needs React, which is loaded from ' +
      'cdn.jsdelivr.net. Check your internet connection and reload the page.</p>';
    return;
  }
  ReactDOM.createRoot(root).render(<App />);
}
