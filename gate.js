// 合言葉の入口
// 質問データは合言葉で暗号化されていて、正しい合言葉が入ったときだけ読み込まれます。
(function () {
  const KEY = "naikan-static:pass";
  const main = document.getElementById("main");
  const enc = window.NAIKAN_DATA;
  const b64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  const norm = (s) => String(s || "").normalize("NFKC").trim();

  async function unlock(pass) {
    const subtle = window.crypto && window.crypto.subtle;
    if (!subtle) throw new Error("nocrypto");
    const base = await subtle.importKey("raw", new TextEncoder().encode(pass), "PBKDF2", false, ["deriveKey"]);
    const key = await subtle.deriveKey(
      { name: "PBKDF2", salt: b64(enc.salt), iterations: enc.iter, hash: "SHA-256" },
      base, { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
    const buf = await subtle.decrypt({ name: "AES-GCM", iv: b64(enc.iv) }, key, b64(enc.data));
    return new TextDecoder().decode(buf);
  }

  function start(code) {
    const data = document.createElement("script");
    data.textContent = code;
    document.body.appendChild(data);
    const app = document.createElement("script");
    app.src = "app.js";
    document.body.appendChild(app);
  }

  function show(msg) {
    main.innerHTML =
      '<form class="card" id="gate" autocomplete="off">' +
      '<p class="q">合言葉を入力してください</p>' +
      '<p class="note">なつこさんからお伝えしている合言葉を入れて、「はじめる」を押してください。</p>' +
      '<input id="gate-pass" type="text" inputmode="text" autocapitalize="off" spellcheck="false" aria-label="合言葉">' +
      (msg ? '<p class="err">' + msg + "</p>" : "") +
      '<div class="btns"><button class="btn primary" type="submit">はじめる</button></div>' +
      "</form>";
    const input = document.getElementById("gate-pass");
    input.focus();
    document.getElementById("gate").addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const pass = norm(input.value);
      if (!pass) return;
      main.innerHTML = '<div class="card"><p class="note">確認しています…</p></div>';
      try {
        const code = await unlock(pass);
        try { localStorage.setItem(KEY, pass); } catch (e) { /* 保存できなくても続ける */ }
        start(code);
      } catch (e) {
        show(e.message === "nocrypto"
          ? "このブラウザでは開けませんでした。別のブラウザ（Safari・Chromeなど）で開いてみてください。"
          : "合言葉が違うようです。もう一度入れてみてください。");
      }
    });
  }

  // 一度入った端末では、覚えている合言葉で自動的に開く
  let saved = "";
  try { saved = localStorage.getItem(KEY) || ""; } catch (e) { /* なし */ }
  if (!saved) { show(""); return; }
  main.innerHTML = '<div class="card"><p class="note">読み込んでいます…</p></div>';
  unlock(saved).then(start, () => {
    try { localStorage.removeItem(KEY); } catch (e) { /* なし */ }
    show(""); // 合言葉が変わっていたら、入れ直してもらう
  });
})();
