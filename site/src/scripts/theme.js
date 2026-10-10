// ライト／ダークの切り替え。選んだ配色は localStorage に記憶し、選んでいなければ端末の設定に従う。
// 最初の反映は Base.astro の <head> のインラインスクリプトで行う（読み込み直後の配色のちらつきを防ぐため）
const root = document.documentElement;
const btn = document.getElementById('theme-toggle');
const prefersDark = window.matchMedia('(prefers-color-scheme: dark)');
const current = () => root.dataset.theme || (prefersDark.matches ? 'dark' : 'light');

function render() {
  const dark = current() === 'dark';
  // 記号と文字を分けて、狭い画面では記号だけ見せる（読み上げは aria-label）
  const icon = document.createElement('span');
  icon.textContent = dark ? '☀' : '☾';
  icon.setAttribute('aria-hidden', 'true');
  const label = document.createElement('span');
  label.className = 'theme-label';
  label.textContent = dark ? 'ライト' : 'ダーク';
  btn.replaceChildren(icon, label);
  btn.setAttribute('aria-label', dark ? 'ライトモードに切り替える' : 'ダークモードに切り替える');
}

if (btn) {
  btn.hidden = false;
  btn.addEventListener('click', () => {
    const next = current() === 'dark' ? 'light' : 'dark';
    root.dataset.theme = next;
    try {
      localStorage.setItem('theme', next);
    } catch {
      // 保存できない環境（プライベートブラウズなど）では、このページを開いている間だけ切り替える
    }
    render();
  });
  prefersDark.addEventListener('change', render);
  render();
}
