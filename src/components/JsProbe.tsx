/**
 * 診断表示のみ。スクリプト本体は layout の /ipad-probe.js と
 * public/ipad-test.html 側で読み込む。
 */
export function JsProbe() {
  return (
    <div className="space-y-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
      <p id="miru-js-probe">JS診断: 未実行（このままならスクリプト未動作）</p>
      <p className="text-[11px] text-amber-800">
        先に切り分けページを開いてください:{" "}
        <a className="underline" href="/ipad-test.html">
          /ipad-test.html
        </a>
      </p>
    </div>
  );
}
