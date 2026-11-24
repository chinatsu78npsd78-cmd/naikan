// 内観深掘り（AIなし版）
// 答えはこの端末（ブラウザ）にだけ保存されます。

const STORE = "naikan-static:v1";
const $main = document.getElementById("main");
const $overlay = document.getElementById("overlay");
const $toast = document.getElementById("toast");

const fresh = () => ({
  v: 1, stage: "intro", intro: 0, date: new Date().toISOString().slice(0, 10),
  entry: null, theme: null, chain: [], cur: null, dk: 0, ack: "", loop: false,
  core: "", fearSel: [], e: 1, feelings: [], body: [], before: 5, selfWord: "", hurry: false,
  wishQi: 0, wish: "", preps: ["", "", ""], after: 5, note: "", early: false,
});

let S = load();
function load() {
  try {
    const v = JSON.parse(localStorage.getItem(STORE) || "null");
    if (v && v.v === 1) return v;
  } catch (e) { /* 読めなければ新しく始める */ }
  return fresh();
}
function save() {
  try { localStorage.setItem(STORE, JSON.stringify(S)); } catch (e) { /* 保存できない環境でも続ける */ }
}

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const br = (s) => esc(s).replace(/\n/g, "<br>");
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const norm = (s) => String(s || "").normalize("NFKC").replace(/[\s。、．，.,!！?？「」『』…]/g, "").toLowerCase();

function toast(msg) {
  $toast.textContent = msg;
  $toast.hidden = false;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => ($toast.hidden = true), 2000);
}

// ---------- 答えの扱い ----------

/** 問いに差し込める短さなら、その言葉を返す */
function shortA(text) {
  let t = String(text || "").split(/\n/)[0].trim().replace(/[。．.！!？?]+$/, "");
  t = t.replace(/^「|」$/g, "");
  return t && t.length <= 22 ? t : null;
}
const clip = (t, n = 26) => { t = String(t || "").replace(/\s+/g, " ").trim(); return t.length > n ? t.slice(0, n) + "…" : t; };
function fill(tpls, noA, a) {
  const s = shortA(a);
  return s ? pick(tpls).replace(/\{a\}/g, s) : pick(noA);
}

const digs = () => S.chain.filter((c) => c.layer > 0);
const lastAnswer = () => (S.chain.length ? S.chain[S.chain.length - 1].a : "");
const answerOf = (n) => { const c = [...S.chain].reverse().find((x) => x.layer === n); return c ? c.a : ""; };

function isDanger(text) { return DANGER_WORDS.some((w) => String(text).includes(w)); }
function isHurry(text) { return HURRY_WORDS.some((w) => String(text).includes(w)); }

/** 答えと選んだ言葉から、共感の言葉に使う恐れの型を選ぶ（本人には見せない） */
function fearTypes() {
  const text = S.chain.map((c) => c.a).join(" ") + " " + S.core;
  const scored = FEARS.map((f) => {
    let n = S.fearSel.includes(f.id) ? 5 : 0;
    f.keys.forEach((k) => { if (text.includes(k)) n += 1; });
    return { f, n };
  }).filter((x) => x.n > 0).sort((a, b) => b.n - a.n);
  return scored.map((x) => x.f);
}
const mainFear = () => fearTypes()[0] || null;

// ---------- 次の問いを決める ----------

function entryQuestion() {
  if (S.entry === "theme") return (THEMES.find((t) => t.id === S.theme) || THEMES[THEMES.length - 1]).q;
  return ENTRIES.find((e) => e.id === S.entry).q;
}

function nextDig() {
  const d = digs().length + 1;
  const a = lastAnswer();
  S.dk = 0;
  S.loop = false;
  const last = S.chain[S.chain.length - 1];
  if (S.went6 && last && last.layer === 6) {
    // 最初の記憶をたどったあとは、正体の確認へ
    S.went6 = false;
    S.stage = "core";
    return;
  }
  if (d <= 5) {
    const L = LAYERS[d - 1];
    S.cur = { layer: d, q: fill(L.qs, L.noA, a) };
    S.stage = "dig";
  } else if (d === 6 && !S.passed5) {
    S.passed5 = true;
    S.stage = "fork";
  } else {
    S.cur = { layer: d, q: fill(REPHRASE, REPHRASE_NOA, a) };
    S.stage = "dig";
  }
}

// ---------- 画面 ----------

function setNav(show) { document.getElementById("nav").hidden = !show; }

function meter() {
  const d = S.cur ? S.cur.layer : digs().length;
  const L = LAYERS[d - 1];
  return `<div class="meter">${LAYERS.map((x) => `<i class="${x.n <= d ? "on" : ""}"></i>`).join("")}</div>
    <div class="meter-label">${d > 6 ? "さらに奥へ" : `今の深さ：${d}層目${L ? "（" + esc(L.name) + "）" : ""}`}</div>`;
}

function pathHtml(title = "ここまでたどってきた道") {
  if (!S.chain.length) return "";
  return `<p class="path-title">${esc(title)}</p><ul class="path">${S.chain.map((c) => `<li>${esc(clip(c.a))}</li>`).join("")}</ul>`;
}

function chipsHtml(list, act, selected = []) {
  return `<div class="chips">${list.map((w) => `<button class="chip ${selected.includes(w) ? "on" : ""}" data-act="${act}" data-v="${esc(w)}">${esc(w)}</button>`).join("")}</div>`;
}

// ---------- 使える期間（初めて開いた日から SETTINGS.days 日） ----------

const FIRST = "naikan-static:first";
const DAY = 86400000;
const hashText = (t) => { let h = 5381; for (const ch of String(t)) h = ((h * 33) ^ ch.charCodeAt(0)) >>> 0; return h.toString(36); };

/** 使える期限（ミリ秒）。合言葉が変わったら、その日から数え直す */
function periodEnd() {
  const cfg = typeof SETTINGS === "object" ? SETTINGS : { days: 30, endDate: "" };
  let pass = "";
  try { pass = localStorage.getItem("naikan-static:pass") || ""; } catch (e) { /* なし */ }
  const tag = hashText(pass);
  let rec = null;
  try { rec = JSON.parse(localStorage.getItem(FIRST) || "null"); } catch (e) { /* なし */ }
  if (!rec || rec.tag !== tag || typeof rec.t !== "number") {
    rec = { tag, t: Date.now() };
    try { localStorage.setItem(FIRST, JSON.stringify(rec)); } catch (e) { /* 保存できなくても使える */ }
  }
  let end = rec.t + Number(cfg.days || 30) * DAY;
  if (cfg.endDate) {
    const e = new Date(cfg.endDate + "T23:59:59").getTime();
    if (!isNaN(e)) end = Math.min(end, e);
  }
  return end;
}
const END = periodEnd();
const isExpired = () => Date.now() > END;

function showPeriod() {
  const foot = document.querySelector(".foot");
  if (!foot) return;
  const d = new Date(END);
  const date = `${d.getMonth() + 1}月${d.getDate()}日`;
  const left = Math.ceil((END - Date.now()) / DAY);
  foot.innerHTML = isExpired()
    ? "使える期間は終わっています。"
    : `${left <= 7 ? `<b>あと${left}日</b>・` : ""}${date}まで使えます。<br>答えはこの端末にだけ保存されます。閉じても、同じ端末で開けば続きから再開できます。`;
}

function render() {
  setNav(!["intro"].includes(S.stage));
  showPeriod();
  const fn = isExpired() && S.stage !== "result" ? VIEWS.expired : VIEWS[S.stage] || VIEWS.intro;
  $main.innerHTML = fn();
  const ta = $main.querySelector("textarea[data-autofocus]");
  if (ta) { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }
  window.scrollTo({ top: 0 });
  save();
}

const VIEWS = {
  intro() {
    const pages = [
      `<p class="soft">今日は、あなたの中にある<br>不安や怖さを、<br>一緒にゆっくりたどっていきます。</p>
       <p class="note">「それで何が困る？」と少しずつ奥へ下りていき、怖さの正体に気づいたら、その気持ちにじっくり寄り添います。そのあとで、本当の願いと、これからの備えを見つけます。</p>
       <div class="btns"><button class="btn primary" data-act="intro-next">次へ</button></div>`,
      `<p class="q">はじめる前に</p>
       <div class="hint"><ul>
         <li>うまく答えなくて大丈夫。ひとことでも大丈夫です。</li>
         <li>「わからない」「もうこれ以上出てこない」も、大切な答えです。</li>
         <li>しんどくなったら、右上の「しんどい・休みたい」から、いつでも止められます。</li>
         <li>答えはこの端末にだけ保存され、なつこさんにも自動では届きません。最後のまとめを、ご自身で送ってください。</li>
       </ul></div>
       <p class="note">18歳以上の方向けです。今とてもつらい時は、無理に始めず、<button class="link" data-act="safety">相談先</button>を頼ってくださいね。</p>
       <div class="btns"><button class="btn primary" data-act="intro-next">次へ</button></div>`,
      `<p class="q">今、少し自分の内側を見つめても<br>大丈夫そうですか？</p>
       <div class="btns col"><button class="btn primary" data-act="start">はい、はじめます</button><button class="btn" data-act="not-now">今日はやめておく</button></div>`,
    ];
    return `<div class="card">${pages[Math.min(S.intro, 2)]}</div>`;
  },

  expired() {
    return `<div class="card"><p class="q">使える期間が終わりました</p>
      <p class="note">ここまで使ってくださって、ありがとうございました。<br>続けて使いたい時は、なつこさんにご連絡ください。</p>
      ${S.chain.length ? `<div class="btns"><button class="btn primary" data-act="expired-summary">ここまでのまとめを見る</button></div>` : ""}</div>`;
  },

  notnow() {
    return `<div class="card"><p class="soft">わかりました。<br>やめておこうと思えたことも、<br>自分を大切にする選択です。</p>
      <p class="note">見つめてみたくなった時に、また開いてくださいね。</p>
      <div class="btns"><button class="btn" data-act="restart-intro">最初の画面に戻る</button></div></div>`;
  },

  entry() {
    return `<div class="card"><p class="q">今日はどんなところから<br>見つめてみたいですか？</p>
      <div class="btns col">${ENTRIES.map((e) => `<button class="btn" data-act="entry" data-v="${e.id}">${esc(e.label)}${e.sub ? `<br><span class="note">${esc(e.sub)}</span>` : ""}</button>`).join("")}</div></div>`;
  },

  theme() {
    return `<div class="card"><p class="q">どのテーマが気になっていますか？</p>
      <div class="chips">${THEMES.map((t) => `<button class="chip" data-act="theme" data-v="${t.id}">${esc(t.label)}</button>`).join("")}</div>
      <button class="link" data-act="back-entry">← 入口を選び直す</button></div>`;
  },

  first() {
    const e = ENTRIES.find((x) => x.id === S.entry);
    return `<div class="card"><p class="q">${esc(entryQuestion())}</p>
      ${e && e.note ? `<p class="note">${esc(e.note)}</p>` : ""}
      <textarea id="ans" rows="3" placeholder="ひとことでも大丈夫です" data-autofocus>${esc(S.draft || "")}</textarea>
      <div class="btns"><button class="btn primary" data-act="answer-first">次へ</button></div>
      <button class="link" data-act="back-entry">← 入口を選び直す</button></div>`;
  },

  dig() {
    const L = LAYERS[S.cur.layer - 1];
    let chips = "";
    if (L && L.chips === "fear") chips = `<p class="note">言葉が出にくい時は、近いものを押してください（どれも違えば、自分の言葉で）</p>${chipsHtml(FEARS.map((f) => f.chip), "add")}`;
    if (L && L.chips === "feel") {
      const t = fearTypes();
      const words = [...new Set([...(t[0] ? t[0].feel : []), ...FEELINGS])].slice(0, 12);
      chips = `<p class="note">近い言葉があれば押してください（どれも違えば、自分の言葉で）</p>${chipsHtml(words, "add")}`;
    }
    return `${S.ack ? `<p class="ack">${esc(S.ack)}</p>` : ""}
      <div class="card">${meter()}${pathHtml()}
      ${S.loop ? `<div class="hint"><p>何度か同じ言葉が出てきていますね。もしかしたら、そこが一番大事なところなのかもしれません。</p><div class="btns"><button class="btn primary" data-act="to-core">ここで確かめてみる</button></div></div>` : ""}
      ${S.cur.angle ? `<p class="note">少し違う角度から聞いてみますね。</p>` : ""}
      <p class="q">${esc(S.cur.q)}</p>
      ${L && L.note ? `<p class="note">${esc(L.note)}</p>` : ""}
      ${chips}
      <textarea id="ans" rows="3" placeholder="ひとことでも大丈夫です" data-autofocus>${esc(S.draft || "")}</textarea>
      <div class="btns"><button class="btn primary" data-act="answer">次へ</button><button class="btn" data-act="dunno">わからない</button></div>
      <div class="btns"><button class="btn" data-act="to-core">もうこれ以上出てこない</button></div>
      ${S.chain.length > 1 ? `<button class="link" data-act="undo">← ひとつ前に戻る</button>` : ""}</div>`;
  },

  fork() {
    return `<p class="ack">ここまで、よくたどってきましたね。</p>
      <div class="card">${pathHtml()}
      <p class="q">ここから、どうしますか？</p>
      <div class="btns col">
        <button class="btn primary" data-act="to-core">怖さの正体を確かめる</button>
        <button class="btn" data-act="go6">この気分を初めて感じた頃を、たどってみる</button>
        <button class="btn" data-act="go-deeper">もう少し奥へ下りる</button>
      </div>
      <p class="note">「初めて感じた頃」は、飛ばしても大丈夫です。</p></div>`;
  },

  core() {
    if (!S.core) {
      const l4 = shortA(answerOf(4)), l5 = shortA(answerOf(5));
      const last = shortA(lastAnswer());
      S.core = l4 && l5 ? `「${l4}」――そして「${l5}」。それが一番怖い` : last ? `「${last}」――それが一番怖い` : "";
    }
    return `<p class="ack">ここまでたどってきてくれて、ありがとうございます。</p>
      <div class="card">${pathHtml()}
      <p class="q">ここまでの言葉をつなぐと、<br>あなたが怖かったのは、どんなことでしょう？</p>
      <p class="note">あなたの感覚に合うように、自由に書き直してください。</p>
      <textarea id="core" rows="3" data-autofocus>${esc(S.core)}</textarea>
      <p class="note">近いものがあれば、押してください（なくても大丈夫です）</p>
      ${chipsHtml(FEARS.map((f) => f.chip), "fear-sel", FEARS.filter((f) => S.fearSel.includes(f.id)).map((f) => f.chip))}
      <div class="btns"><button class="btn primary" data-act="core-ok">これが、私の怖さです</button></div>
      <button class="link" data-act="core-back">← もう少したどる</button></div>`;
  },

  empathy() {
    const f = mainFear();
    const core = S.core || "その怖さ";
    const steps = {
      1: () => {
        const lines = [...(f ? f.empathy.slice(0, 2) : []), ...EMPATHY_BASE.slice(0, f ? 2 : 3)];
        return `<p class="big">${br(core)}</p>
          ${lines.map((l, i) => `<p class="soft fade" style="animation-delay:${0.6 + i * 1.4}s">${esc(l)}</p>`).join("")}
          <div class="btns fade" style="animation-delay:${0.6 + lines.length * 1.4}s"><button class="btn primary" data-act="e-next">うん</button></div>`;
      },
      2: () => `<p class="soft">${esc(f ? f.natural : "その怖さには、ちゃんと理由があります。")}</p>
          <p class="soft">そう感じるのは、<br>とても自然なことです。<br>怖いと思って、いいんです。</p>
          <div class="btns"><button class="btn primary" data-act="e-next">次へ</button></div>`,
      3: () => {
        const words = [...new Set([...(f ? f.feel : []), ...FEELINGS])];
        return `<p class="q">今、その気持ちに名前をつけるとしたら？</p>
          <p class="note">いくつ選んでも大丈夫です。わからなければ、選ばずに次へ。</p>
          ${chipsHtml(words, "feel", S.feelings)}
          <p class="q">その気持ちは、体のどのあたりで感じますか？</p>
          ${chipsHtml(BODY, "body", S.body)}
          <div class="btns"><button class="btn primary" data-act="e-next">次へ</button></div>`;
      },
      4: () => `<p class="q">その気持ち、今どれくらいの強さですか？</p>
          <p class="num" id="num">${S.before}</p>
          <input class="slider" type="range" min="0" max="10" value="${S.before}" data-act="slide" data-k="before">
          <div class="scale"><span>0 ほとんどない</span><span>10 とても強い</span></div>
          <div class="btns"><button class="btn primary" data-act="e-next">次へ</button></div>`,
      5: () => `<p class="q">少しだけ、その気持ちを<br>そのままにしてみましょう。</p>
          <p class="note">消そうとしなくて大丈夫です。円に合わせて、ゆっくり息をしながら、ただ感じてみてください。つらくなったら、いつでもやめて大丈夫です。</p>
          <div class="breath ${TIMER.left ? "" : "still"}" id="breath">${TIMER.left ? fmt(TIMER.left) : "準備ができたら"}</div>
          <div class="btns" id="timer-btns">${timerButtons()}</div>`,
      6: () => `<p class="q">その怖さを抱えてきた自分に、<br>言葉をかけるとしたら、<br>何と言いたいですか？</p>
          ${answerOf(6) ? `<p class="note">「${esc(clip(answerOf(6), 30))}」の頃の自分に向けてでも大丈夫です。</p>` : ""}
          ${S.hurry ? `<div class="hint"><p>今はまだ、そのままで大丈夫ですよ。前を向くのは、あとからでも間に合います。</p><p>もう少しだけ、怖さのそばにいてあげてもいいかもしれません。</p><div class="btns"><button class="btn" data-act="stay">もう少しとどまる</button><button class="btn primary" data-act="hurry-ok">このまま進む</button></div></div>` : ""}
          <textarea id="self" rows="3" placeholder="自分への言葉" data-autofocus>${esc(S.selfWord)}</textarea>
          <p class="note">出てこない時は、近いものを押してください</p>
          ${chipsHtml(SELF_WORDS, "self-add")}
          <div class="btns"><button class="btn primary" data-act="self-ok">次へ</button></div>`,
      7: () => `${S.selfWord ? `<p class="big">${br(S.selfWord)}</p>` : ""}
          <p class="soft">その怖さは、<br>大切なものがあるからこそ生まれる、<br>人として自然な気持ちです。</p>
          <p class="soft">あなただけじゃない。<br>そしてもう、ひとりで抱えなくていい。</p>
          <div class="btns"><button class="btn primary" data-act="e-next">次へ</button></div>`,
    };
    return `<div class="card">${(steps[S.e] || steps[1])()}</div>
      ${S.e > 1 ? `<button class="link no-print" data-act="e-back">← ひとつ前に戻る</button>` : ""}`;
  },

  wish() {
    const t = fearTypes();
    const qs = [...(t[0] ? [t[0].wishQ] : []), ...WISH_QS];
    const q = qs[S.wishQi % qs.length];
    const wishes = [...new Set([...(t[0] ? t[0].wishes : []), ...(t[1] ? t[1].wishes : [])])].slice(0, 6);
    return `<p class="ack">怖さの奥にある、心の声を聞いてみましょう。</p>
      <div class="card"><p class="q">${esc(q)}</p>
      <textarea id="wish" rows="3" placeholder="本当の願い" data-autofocus>${esc(S.wish)}</textarea>
      ${wishes.length ? `<p class="note">ヒントになりそうなら押してください（決めつけではありません）</p>${chipsHtml(wishes, "wish-add")}` : ""}
      <div class="btns"><button class="btn primary" data-act="wish-ok">次へ</button><button class="btn" data-act="wish-other">別の聞き方で</button></div>
      <button class="link" data-act="wish-back">← 共感に戻る</button></div>`;
  },

  prep() {
    const t = fearTypes();
    const ex = [...new Set([...(t[0] ? t[0].preps : []), ...(t[1] ? t[1].preps : [])])].slice(0, 5);
    return `${S.wish ? `<p class="ack">「${esc(clip(S.wish, 30))}」<br>それが、あなたの本当の願いなんですね。</p>` : ""}
      <div class="card"><p class="q">その願いを大切にしながら、<br>現実のことには、どう備えておきたいですか？</p>
      <p class="note">怖さからではなく、願いから動く、小さな一歩を1〜3つ。小さくて大丈夫です。</p>
      <div class="inputs">${S.preps.map((p, i) => `<input type="text" data-prep="${i}" value="${esc(p)}" placeholder="${i + 1}つめ">`).join("")}</div>
      ${ex.length ? `<p class="note">例（押すと空いている欄に入ります）</p>${chipsHtml(ex, "prep-add")}` : ""}
      <p class="note">お金・保険・投資・病気の治療・法律のことは、専門家に相談するのも大切な備えです。</p>
      <div class="btns"><button class="btn primary" data-act="prep-ok">次へ</button></div>
      <button class="link" data-act="prep-back">← 心の声に戻る</button></div>`;
  },

  after() {
    return `<div class="card"><p class="q">最初に感じていた気持ちは、<br>今どれくらいですか？</p>
      <p class="note">変わっていても、変わっていなくても、どちらも大切な答えです。</p>
      <p class="num" id="num">${S.after}</p>
      <input class="slider" type="range" min="0" max="10" value="${S.after}" data-act="slide" data-k="after">
      <div class="scale"><span>0 ほとんどない</span><span>10 とても強い</span></div>
      <p class="q" style="margin-top:18px">今日ここまで見つめてみて、<br>心に残っていることはありますか？</p>
      <textarea id="note" rows="3" placeholder="なければ空欄で大丈夫です">${esc(S.note)}</textarea>
      <div class="btns"><button class="btn primary" data-act="finish">振り返りカードを見る</button></div></div>`;
  },

  result() {
    const R = buildResult();
    return `<div class="card result-card">
      <h2>あなたへの振り返りカード</h2>
      ${R.rows.map(([h, v]) => `<h3>${esc(h)}</h3><p class="val">${esc(v)}</p>`).join("")}
      <h3>今日のあなたへ</h3><p class="val">${esc(R.message)}</p></div>
      <div class="btns no-print">
        <button class="btn primary" data-act="copy-data">②をコピー（なつこさんへ送る用）</button>
        <button class="btn" data-act="copy-card">カードの文章をコピー</button>
        <button class="btn" data-act="download">テキストで保存</button>
        <button class="btn" data-act="print">印刷する</button>
      </div>
      <div class="card no-print" style="margin-top:16px"><p class="q">②なつこさん確認用・内観深掘りデータ</p>
      <p class="note">内容を確認して、直したいところがあれば「ひとつ前に戻る」で書き直せます。問題なければ、上のボタンでコピーして、なつこさんへ送ってください😊</p>
      <pre class="data">${esc(R.data)}</pre>
      ${S.early || isExpired() ? "" : `<button class="link" data-act="result-back">← ひとつ前に戻る</button>`}</div>
      <p class="note no-print" style="text-align:center;margin-top:16px">今日は、ご自身の内側を見つめてくださって、ありがとうございました。<br>怖さを見つめるのは、とてもエネルギーを使うことです。どうか、あたたかくして休んでくださいね。</p>`;
  },
};

// ---------- まとめ ----------

/** 共感で測った強さ（測っていなければ空） */
function strength() {
  const measured = S.e > 4 || ["wish", "prep", "after", "result"].includes(S.stage) && !S.early;
  if (!measured) return "";
  return S.early ? `はじめ ${S.before}／10` : `はじめ ${S.before}／10 → おわり ${S.after}／10`;
}

function buildResult() {
  const entry = ENTRIES.find((e) => e.id === S.entry);
  const theme = THEMES.find((t) => t.id === S.theme);
  const first = S.chain.find((c) => c.layer === 0);
  const path = S.chain.map((c) => clip(c.a, 30)).join(" → ");
  const preps = S.preps.filter((p) => p.trim());
  const none = S.early ? "今回は扱っていない" : "なし";
  const rows = [
    ["今日見つめたこと", first ? first.a : none],
    ["たどった道", path || none],
    ["怖かったことの正体", S.core || none],
    ["味わいたくなかった気分", answerOf(5) || (S.feelings.length ? S.feelings.join("、") : none)],
    ["自分にかけた言葉", S.selfWord || none],
    ["心の声（本当の願い）", S.wish || none],
    ["これからの備え", preps.length ? preps.map((p) => "・" + p).join("\n") : none],
    ["気持ちの強さ", strength() || none],
  ];
  const wish = shortA(S.wish);
  const message = S.early
    ? "ここまで見つめてきたこと、それだけで十分です。続きは、また見つめたくなった時で大丈夫です。今日はゆっくり休んでくださいね。"
    : `${S.core ? "怖かった自分に、ちゃんと気づいてあげられましたね。" : "今日、自分の内側を見つめた時間は、とても大切な時間です。"}${wish ? `その奥にあった「${wish}」という願いを、大切にしてあげてください。` : ""}今日はゆっくり休んでくださいね。`;

  const L = (n) => answerOf(n) || (S.early ? "今回は扱っていない" : "（未回答）");
  const angles = S.chain.filter((c) => c.angle).map((c) => `・${c.q} → ${c.a}`);
  const data = [
    "②なつこさん確認用・内観深掘りデータ",
    "※本人が書いた内容と、本人が確かめた内容のみ（AIなし版）",
    "",
    "【実施日】", "・" + S.date,
    "",
    "【入口】",
    "・入り方：" + (entry ? entry.label : "未選択"),
    "・テーマ：" + (theme ? theme.label : "—"),
    "・きっかけ：" + (first ? first.a : "—"),
    "",
    "【深掘りの記録（層ごと）】",
    "1層 出来事：" + L(1),
    "2層 現実の結果：" + L(2),
    "3層 自分への評価：" + L(3),
    "4層 根っこの恐れ：" + L(4),
    "5層 味わいたくない気分：" + L(5),
    "6層 最初の記憶：" + (answerOf(6) || "今回は扱っていない"),
    ...(digs().filter((c) => c.layer > 6).length ? ["さらに奥：" + digs().filter((c) => c.layer > 6).map((c) => c.a).join(" → ")] : []),
    ...(angles.length ? ["", "【角度を変えた問いと答え】", ...angles] : []),
    "",
    "【たどった道】", "・" + (path || "—"),
    "",
    "【本人が確かめた正体】", "・" + (S.core || "—"),
    "・近いと選んだ言葉：" + (S.fearSel.length ? FEARS.filter((f) => S.fearSel.includes(f.id)).map((f) => f.chip).join("、") : "なし"),
    "",
    "【感情と体】",
    "・気持ちの言葉：" + (S.feelings.join("、") || "—"),
    "・体で感じた場所：" + (S.body.join("、") || "—"),
    "・強さ：" + (strength() || "—"),
    "",
    "【自分にかけた言葉】", "・" + (S.selfWord || "—"),
    "",
    "【心の声】", "・" + (S.wish || "—"),
    "",
    "【備え（本人が決めたこと）】", ...(preps.length ? preps.map((p) => "・" + p) : ["・—"]),
    "",
    "【本人が心に残ったこと】", "・" + (S.note || "—"),
    "",
    "【「わからない」と答えた回数】", "・" + (S.dunnoTotal || 0) + "回",
    ...(S.early ? ["", "【途中で終了】", "・本人の希望で、途中で終えています"] : []),
  ].join("\n");

  const card = ["①あなたへの振り返りカード", "", ...rows.flatMap(([h, v]) => [`【${h}】`, v, ""]), "【今日のあなたへ】", message].join("\n");
  return { rows, message, data, card };
}

// ---------- 休む・安全 ----------

function overlay(html) {
  $overlay.innerHTML = `<div class="panel">${html}</div>`;
  $overlay.hidden = false;
}
function closeOverlay() { $overlay.hidden = true; $overlay.innerHTML = ""; }

const SAFETY_HTML = `<div class="safety">
  <p><b>ひとりで抱えないでください</b></p>
  <p>・今すぐ危険がある時：119（救急）／110（警察）</p>
  <p>・よりそいホットライン：0120-279-338（24時間・無料）</p>
  <p>・いのちの電話：0570-783-556</p>
  <p>身近な信頼できる人に「今つらい」と伝えるのも、大切な一歩です。</p></div>`;

function showSafety(fromAnswer) {
  overlay(`${fromAnswer ? `<p class="q">教えてくれて、ありがとうございます。</p>
    <p>ひとつだけ確かめさせてください。<br>今この瞬間、自分を傷つけたい気持ちや、死にたい気持ち、または誰かから傷つけられている状況はありますか？</p>` : `<p class="q">相談できるところ</p>`}
    ${SAFETY_HTML}
    <div class="btns col">
      ${fromAnswer ? `<button class="btn" data-act="safe-end">今はつらい。今日はここまでにする</button><button class="btn primary" data-act="close">今は大丈夫。続ける</button>` : `<button class="btn primary" data-act="close">閉じる</button>`}
    </div>`);
}

function showBreak() {
  overlay(`<p class="q">無理に続けなくて大丈夫です。</p>
    <p class="note">思い出したり感じたりするのは、エネルギーを使いますよね。どうしたいですか？</p>
    <div class="btns col">
      <button class="btn primary" data-act="close">少し休んでから、続ける</button>
      <button class="btn" data-act="end-early">今日はここまでにする（ここまでのまとめを見る）</button>
      <button class="btn" data-act="safety">相談先を見る</button>
    </div>`);
}

// ---------- 共感の時間（タイマー） ----------

const TIMER = { left: 0, id: null, started: 0 };
const fmt = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
function timerButtons() {
  if (!TIMER.left && !TIMER.done) return [60, 120, 180].map((s) => `<button class="btn ${s === 60 ? "primary" : ""}" data-act="timer" data-v="${s}">${s / 60}分</button>`).join("") + `<button class="btn" data-act="e-next">今日は飛ばす</button>`;
  if (TIMER.done) return `<button class="btn primary" data-act="e-next">次へ</button>`;
  return Date.now() - TIMER.started > 20000 ? `<button class="btn" data-act="timer-stop">もう十分</button>` : "";
}
function startTimer(sec) {
  clearInterval(TIMER.id);
  TIMER.left = sec; TIMER.done = false; TIMER.started = Date.now();
  render();
  TIMER.id = setInterval(() => {
    TIMER.left -= 1;
    if (TIMER.left <= 0) { stopTimer(); return; }
    const b = document.getElementById("breath");
    const btns = document.getElementById("timer-btns");
    if (!b || S.stage !== "empathy" || S.e !== 5) { clearInterval(TIMER.id); TIMER.left = 0; return; }
    b.textContent = fmt(TIMER.left);
    btns.innerHTML = timerButtons();
  }, 1000);
}
function stopTimer() {
  clearInterval(TIMER.id);
  TIMER.left = 0; TIMER.done = true;
  if (S.stage === "empathy" && S.e === 5) {
    render();
    const b = document.getElementById("breath");
    if (b) b.textContent = "ありがとう";
  }
}

// ---------- 操作 ----------

function val(id) { const el = document.getElementById(id); return el ? el.value.trim() : ""; }

function submitAnswer(q, layer, text, angle) {
  if (isDanger(text)) showSafety(true);
  const prev = S.chain.map((c) => norm(c.a));
  S.chain.push({ layer, q, a: text, angle: !!angle });
  S.draft = "";
  const s = shortA(text);
  S.ack = s ? pick(ACKS).replace(/\{a\}/g, s) : pick(ACKS.filter((x) => !x.includes("{a}")));
  const looped = prev.includes(norm(text));
  nextDig();
  if (looped && S.stage === "dig") S.loop = true;
}

const ACTIONS = {
  "intro-next": () => { S.intro += 1; },
  start: () => { S.stage = "entry"; },
  "not-now": () => { S.stage = "notnow"; },
  "restart-intro": () => { S = fresh(); },
  entry: (v) => { S.entry = v; S.stage = v === "theme" ? "theme" : "first"; },
  theme: (v) => { S.theme = v; S.stage = "first"; },
  "back-entry": () => { S.entry = null; S.theme = null; S.stage = "entry"; },
  "answer-first": () => {
    const t = val("ans");
    if (!t) return toast("ひとことでも大丈夫ですよ");
    if (isDanger(t)) showSafety(true);
    S.chain = [{ layer: 0, q: entryQuestion(), a: t }];
    S.draft = "";
    const s = shortA(t);
    S.ack = s ? `「${s}」。そこが気になっているんですね。` : "教えてくれてありがとうございます。";
    nextDig();
  },
  answer: () => {
    const t = val("ans");
    if (!t) return toast("ひとことでも大丈夫です。出てこなければ「わからない」を押してください");
    submitAnswer(S.cur.q, S.cur.layer, t, S.cur.angle);
  },
  dunno: () => {
    S.dunnoTotal = (S.dunnoTotal || 0) + 1;
    S.draft = val("ans");
    if (S.dk >= 2) {
      // 角度を変えても出てこない時は、無理に下りずに、今わかっている言葉で確かめる
      S.dk = 0;
      if (digs().length >= 2) { S.ack = "無理に探さなくて大丈夫です。今見えているところを、一緒に確かめてみましょう。"; S.stage = "core"; }
      else toast("無理に探さなくて大丈夫。思いつく言葉だけで十分です");
      return;
    }
    S.dk += 1;
    const used = S.chain.filter((c) => c.angle).map((c) => c.q);
    const pool = ANGLES.flatMap((a) => a.qs).filter((q) => !used.includes(q) && q !== S.cur.q);
    S.ack = "わからないのも、大切な答えです。";
    S.cur = { layer: S.cur.layer, q: pick(pool.length ? pool : ANGLES.flatMap((a) => a.qs)), angle: true };
  },
  undo: () => {
    const last = S.chain.pop();
    if (!last) return;
    S.draft = last.a;
    S.ack = "";
    S.loop = false;
    if (last.layer === 0) { S.stage = "first"; S.cur = null; }
    else { S.cur = { layer: last.layer, q: last.q, angle: last.angle }; S.stage = "dig"; }
    if (last.layer <= 5) S.passed5 = false;
  },
  "to-core": () => { S.draft = ""; S.stage = "core"; },
  go6: () => {
    S.cur = { layer: 6, q: fill(LAYERS[5].qs, LAYERS[5].noA, answerOf(5) || lastAnswer()) };
    S.went6 = true;
    S.ack = "";
    S.stage = "dig";
  },
  "go-deeper": () => { S.cur = { layer: 7, q: fill(REPHRASE, REPHRASE_NOA, lastAnswer()) }; S.ack = ""; S.stage = "dig"; },
  "core-back": () => { S.core = val("core") || S.core; S.passed5 = digs().length >= 5; nextDig(); },
  "core-ok": () => {
    const t = val("core");
    if (!t) return toast("ひとことでも大丈夫です");
    if (isDanger(t)) showSafety(true);
    S.core = t; S.stage = "empathy"; S.e = 1;
  },
  "fear-sel": (v) => {
    S.core = val("core");
    const f = FEARS.find((x) => x.chip === v);
    S.fearSel = S.fearSel.includes(f.id) ? S.fearSel.filter((x) => x !== f.id) : [...S.fearSel, f.id];
  },
  add: (v) => {
    const el = document.getElementById("ans");
    S.draft = el && el.value.trim() ? el.value.trim() + "、" + v : v;
  },
  "e-next": () => { if (S.e >= 7) { S.stage = "wish"; return; } S.e += 1; TIMER.done = false; },
  "e-back": () => { clearInterval(TIMER.id); TIMER.left = 0; TIMER.done = false; if (S.e <= 1) return; S.e -= 1; S.hurry = false; },
  feel: (v) => { S.feelings = S.feelings.includes(v) ? S.feelings.filter((x) => x !== v) : [...S.feelings, v]; },
  body: (v) => { S.body = S.body.includes(v) ? S.body.filter((x) => x !== v) : [...S.body, v]; },
  timer: (v) => { startTimer(Number(v)); return "skip"; },
  "timer-stop": () => { stopTimer(); return "skip"; },
  "self-add": (v) => { const t = val("self"); S.selfWord = t ? t + "\n" + v : v; },
  "self-ok": () => {
    const t = val("self");
    S.selfWord = t;
    if (isDanger(t)) showSafety(true);
    if (t && isHurry(t) && !S.hurryShown) { S.hurry = true; S.hurryShown = true; return; }
    S.hurry = false; S.e = 7;
  },
  stay: () => { S.selfWord = val("self"); S.hurry = false; S.e = 5; TIMER.done = false; },
  "hurry-ok": () => { S.selfWord = val("self"); S.hurry = false; S.e = 7; },
  "wish-add": (v) => { const t = val("wish"); S.wish = t ? t + "、" + v : v; },
  "wish-other": () => { S.wish = val("wish"); S.wishQi += 1; },
  "wish-back": () => { S.wish = val("wish"); S.stage = "empathy"; S.e = 7; },
  "wish-ok": () => {
    const t = val("wish");
    if (isDanger(t)) showSafety(true);
    S.wish = t; S.stage = "prep";
  },
  "prep-add": (v) => {
    readPreps();
    const i = S.preps.findIndex((p) => !p.trim());
    if (i < 0) return toast("3つまでです。どれかを消してから押してください");
    S.preps[i] = v;
  },
  "prep-back": () => { readPreps(); S.stage = "wish"; },
  "prep-ok": () => { readPreps(); S.stage = "after"; },
  finish: () => { S.note = val("note"); S.after = Number(document.querySelector('[data-k="after"]').value); S.early = false; S.stage = "result"; },
  "result-back": () => { S.stage = "after"; },
  "expired-summary": () => { S.early = true; S.stage = "result"; },
  "copy-data": () => { copy(buildResult().data); return "skip"; },
  "copy-card": () => { copy(buildResult().card); return "skip"; },
  download: () => {
    const R = buildResult();
    const blob = new Blob([`内観深掘り（${S.date}）\n\n${R.card}\n\n━━━━━━━━━━━━\n\n${R.data}\n`], { type: "text/plain;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `内観深掘り_${S.date}.txt`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    return "skip";
  },
  print: () => { window.print(); return "skip"; },
  "nav-break": () => { showBreak(); return "skip"; },
  "nav-reset": () => {
    if (!confirm("この端末に保存されている答えをすべて消して、最初からやり直します。よろしいですか？\n（消す前に、まとめの画面で「テキストで保存」しておくこともできます）")) return "skip";
    clearInterval(TIMER.id); TIMER.left = 0; TIMER.done = false;
    S = fresh();
  },
  close: () => { closeOverlay(); return "skip"; },
  safety: () => { showSafety(false); return "skip"; },
  "safe-end": () => { closeOverlay(); S.early = true; S.stage = "result"; },
  "end-early": () => { closeOverlay(); clearInterval(TIMER.id); TIMER.left = 0; S.early = true; S.stage = "result"; },
};

function readPreps() {
  document.querySelectorAll("[data-prep]").forEach((el) => { S.preps[Number(el.dataset.prep)] = el.value.trim(); });
}

async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast("コピーしました");
  } catch (e) {
    overlay(`<p class="q">コピーできませんでした</p><p class="note">下の文字を長押しして選んでください。</p><pre class="data">${esc(text)}</pre><div class="btns"><button class="btn primary" data-act="close">閉じる</button></div>`);
  }
}

document.addEventListener("click", (ev) => {
  const el = ev.target.closest("[data-act]");
  if (!el || el.tagName === "INPUT") return;
  const fn = ACTIONS[el.dataset.act];
  if (!fn) return;
  ev.preventDefault();
  // 入力中の文字を失わないように、操作の前に下書きを残す
  const ans = document.getElementById("ans");
  if (ans && !["answer", "answer-first", "add", "dunno", "undo"].includes(el.dataset.act)) S.draft = ans.value;
  if (fn(el.dataset.v) !== "skip") render();
});

document.addEventListener("input", (ev) => {
  const el = ev.target;
  if (el.dataset && el.dataset.act === "slide") {
    S[el.dataset.k] = Number(el.value);
    const n = document.getElementById("num");
    if (n) n.textContent = el.value;
    save();
  } else if (el.id === "ans") {
    S.draft = el.value; save();
  }
});

$overlay.addEventListener("click", (ev) => { if (ev.target === $overlay) closeOverlay(); });

render();
