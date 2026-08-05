(function () {
  var videoEl = document.getElementById("camera-video");
  var statusEl = document.getElementById("status-text");
  var debugEl = document.getElementById("debug-text");
  var startBtn = document.getElementById("start-btn");
  var stopBtn = document.getElementById("stop-btn");
  var overlayEl = document.getElementById("message-overlay");

  var currentStream = null;
  var starting = false;

  function setStatus(message, isError) {
    if (!statusEl) return;
    statusEl.textContent = message;
    statusEl.className = isError ? "status status-error" : "status";
  }

  function setOverlayVisible(visible) {
    if (!overlayEl) return;
    overlayEl.style.display = visible ? "flex" : "none";
  }

  function updateDebug(extra) {
    if (!debugEl) return;
    var width = videoEl ? videoEl.videoWidth : 0;
    var height = videoEl ? videoEl.videoHeight : 0;
    var lines = [
      "isSecureContext: " + String(window.isSecureContext),
      "mediaDevices: " + String(!!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)),
      "videoWidth: " + String(width || "-"),
      "videoHeight: " + String(height || "-"),
    ];
    if (extra) {
      if (extra.name) lines.push("errorName: " + extra.name);
      if (extra.message) lines.push("errorMessage: " + extra.message);
    }
    debugEl.textContent = lines.join("\n");
  }

  function stopCamera() {
    starting = false;
    if (currentStream) {
      var tracks = currentStream.getTracks();
      for (var i = 0; i < tracks.length; i++) {
        tracks[i].stop();
      }
      currentStream = null;
    }
    if (videoEl) {
      videoEl.srcObject = null;
    }
    if (startBtn) startBtn.disabled = false;
    if (stopBtn) stopBtn.disabled = true;
    setOverlayVisible(true);
    setStatus("カメラ停止済み", false);
    updateDebug(null);
  }

  function mapError(error) {
    var name = error && error.name ? error.name : "";
    var message = error && error.message ? error.message : String(error || "不明なエラー");

    if (name === "NotAllowedError" || name === "PermissionDeniedError") {
      return {
        status: "カメラ権限が拒否されました。設定アプリで Safari のカメラ許可を確認してください。",
        debug: { name: name, message: message },
      };
    }
    if (name === "NotFoundError" || name === "DevicesNotFoundError") {
      return {
        status: "カメラが見つかりません。",
        debug: { name: name, message: message },
      };
    }
    if (name === "NotReadableError" || name === "TrackStartError") {
      return {
        status: "カメラを起動できませんでした。他のアプリが使用中の可能性があります。",
        debug: { name: name, message: message },
      };
    }
    return {
      status: "カメラ起動エラー: " + message,
      debug: { name: name || "Error", message: message },
    };
  }

  function getUserMedia(constraints) {
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      return navigator.mediaDevices.getUserMedia(constraints);
    }

    var legacy =
      navigator.getUserMedia ||
      navigator.webkitGetUserMedia ||
      navigator.mozGetUserMedia;
    if (!legacy) {
      return Promise.reject(new Error("getUserMedia 非対応"));
    }

    return new Promise(function (resolve, reject) {
      legacy.call(navigator, constraints, resolve, reject);
    });
  }

  function attachStream(stream) {
    currentStream = stream;
    if (!videoEl) return Promise.resolve();

    videoEl.setAttribute("autoplay", "");
    videoEl.setAttribute("muted", "");
    videoEl.setAttribute("playsinline", "");
    videoEl.autoplay = true;
    videoEl.muted = true;
    videoEl.playsInline = true;
    videoEl.srcObject = stream;

    var playPromise = videoEl.play();
    if (playPromise && typeof playPromise.then === "function") {
      return playPromise.catch(function () {
        // iOS では再生失敗時でも映像が流れることがあるため、致命扱いしない
        return null;
      });
    }
    return Promise.resolve();
  }

  function startCamera() {
    if (starting || currentStream) {
      return;
    }

    if (!window.isSecureContext) {
      setOverlayVisible(true);
      setStatus(
        "HTTPSが必要です。カメラはセキュアな接続（https または localhost）でのみ利用できます。Netlify の https URL で開いてください。",
        true,
      );
      updateDebug({
        name: "InsecureContext",
        message: "window.isSecureContext === false",
      });
      return;
    }

    if (!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia) &&
        !(navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia)) {
      setOverlayVisible(true);
      setStatus("このブラウザはカメラAPIに対応していません。", true);
      updateDebug({
        name: "Unsupported",
        message: "mediaDevices.getUserMedia がありません",
      });
      return;
    }

    starting = true;
    if (startBtn) startBtn.disabled = true;
    if (stopBtn) stopBtn.disabled = true;
    setOverlayVisible(true);
    setStatus("カメラ開始処理中…", false);
    updateDebug(null);

    var preferred = {
      audio: false,
      video: {
        facingMode: { ideal: "environment" },
      },
    };
    var fallback = {
      audio: false,
      video: true,
    };

    getUserMedia(preferred)
      .catch(function () {
        return getUserMedia(fallback);
      })
      .then(function (stream) {
        if (!starting) {
          // 開始中に停止された場合
          var tracks = stream.getTracks();
          for (var i = 0; i < tracks.length; i++) {
            tracks[i].stop();
          }
          return null;
        }
        return attachStream(stream).then(function () {
          return stream;
        });
      })
      .then(function (stream) {
        starting = false;
        if (!stream) {
          if (startBtn) startBtn.disabled = false;
          if (stopBtn) stopBtn.disabled = true;
          return;
        }
        if (startBtn) startBtn.disabled = true;
        if (stopBtn) stopBtn.disabled = false;
        setOverlayVisible(false);
        setStatus("カメラ表示中", false);
        updateDebug(null);

        // メタデータ取得後に解像度を更新
        if (videoEl) {
          videoEl.onloadedmetadata = function () {
            updateDebug(null);
          };
        }
      })
      .catch(function (error) {
        starting = false;
        if (startBtn) startBtn.disabled = false;
        if (stopBtn) stopBtn.disabled = true;
        setOverlayVisible(true);
        var mapped = mapError(error);
        setStatus(mapped.status, true);
        updateDebug(mapped.debug);
      });
  }

  function onVisibilityChange() {
    if (document.visibilityState === "hidden") {
      stopCamera();
    }
  }

  if (startBtn) {
    startBtn.addEventListener("click", function () {
      startCamera();
    });
  }
  if (stopBtn) {
    stopBtn.addEventListener("click", function () {
      stopCamera();
    });
  }

  window.addEventListener("pagehide", stopCamera);
  window.addEventListener("beforeunload", stopCamera);
  document.addEventListener("visibilitychange", onVisibilityChange);

  // 初期表示
  if (stopBtn) stopBtn.disabled = true;
  if (!window.isSecureContext) {
    setStatus(
      "HTTPSが必要です。現在の接続はセキュアではありません。Netlify の https URL で開いてください。",
      true,
    );
  } else {
    setStatus("初期状態：カメラ開始ボタンをタップしてください。", false);
  }
  updateDebug(null);
  setOverlayVisible(true);
})();
