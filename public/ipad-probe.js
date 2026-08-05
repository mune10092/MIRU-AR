(function () {
  function update(message) {
    var el = document.getElementById("miru-js-probe");
    if (el) {
      el.textContent = message;
    }
    var test = document.getElementById("ipad-test-result");
    if (test) {
      test.textContent = message;
    }
  }

  function run() {
    update("JS診断: 静的スクリプトOK / GLB確認中…");
    fetch("/models/demo.glb")
      .then(function (res) {
        update(
          res.ok
            ? "JS診断: 静的スクリプトOK / GLB到達OK (" + res.status + ")"
            : "JS診断: 静的スクリプトOK / GLB失敗 HTTP " + res.status,
        );
      })
      .catch(function (err) {
        update(
          "JS診断: 静的スクリプトOK / GLB失敗 " +
            (err && err.message ? err.message : String(err)),
        );
      });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", run);
  } else {
    run();
  }
})();
