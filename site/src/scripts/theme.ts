// ライト／ダークの切り替え。はじめはライトで表示し、ダークを選んだら localStorage に記憶する（端末の設定には従わない）。
// 最初の反映は Base.astro の <head> のインラインスクリプトで行う（読み込み直後の配色のちらつきを防ぐため）。
// ボタンは Base.astro が最初から出し、記号と文字（☾ ダーク／☀ ライト）は styles/global.css がいまの配色で選ぶ。ここでは読み上げの名前を合わせる
const root = document.documentElement;
const btn = document.getElementById('theme-toggle');
const current = () => (root.dataset.theme === 'dark' ? 'dark' : 'light');

function label(btn: HTMLElement) {
  btn.setAttribute('aria-label', current() === 'dark' ? 'ライトモードに切り替える' : 'ダークモードに切り替える');
}

if (btn) {
  btn.addEventListener('click', () => {
    const next = current() === 'dark' ? 'light' : 'dark';
    root.dataset.theme = next;
    try {
      localStorage.setItem('theme', next);
    } catch {
      // 保存できない環境（プライベートブラウズなど）では、このページを開いている間だけ切り替える
    }
    label(btn);
  });
  label(btn);
}
