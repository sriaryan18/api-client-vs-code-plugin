const vscode = acquireVsCodeApi();
const methods = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];
const methodEl = document.getElementById("method");
const urlEl = document.getElementById("url");
const urlMirror = document.getElementById("url-mirror");
const nameEl = document.getElementById("name");
const descriptionEl = document.getElementById("description");
const envEl = document.getElementById("env");
const queryEl = document.getElementById("query");
const headersEl = document.getElementById("headers");
const defaultHeadersEl = document.getElementById("default-headers");
const collectionHeadersEl = document.getElementById("collection-headers");
const bodyModeEl = document.getElementById("body-mode");
const bodyEl = document.getElementById("body");
const bodyMirror = document.getElementById("body-mirror");
const gqlQueryEl = document.getElementById("gql-query");
const gqlQueryMirror = document.getElementById("gql-query-mirror");
const gqlVarsEl = document.getElementById("gql-vars");
const gqlVarsMirror = document.getElementById("gql-vars-mirror");
const partsEl = document.getElementById("parts");
const preEl = document.getElementById("pre");
const preMirror = document.getElementById("pre-mirror");
const postEl = document.getElementById("post");
const postMirror = document.getElementById("post-mirror");
const sendEl = document.getElementById("send");
const metaEl = document.getElementById("meta");
const crumbEl = document.getElementById("crumb");
const chipEl = document.getElementById("status-chip");
const resBodyEl = document.getElementById("res-body");
const resHeadersEl = document.getElementById("res-headers");
const resTestsEl = document.getElementById("res-tests");
const suggestEl = document.getElementById("suggest");
const envTipEl = document.getElementById("env-tip");
const authTypeEl = document.getElementById("auth-type");
const authTokenEl = document.getElementById("auth-token");
const authUserEl = document.getElementById("auth-user");
const authPassEl = document.getElementById("auth-pass");
const authKeyEl = document.getElementById("auth-key");
const authValueEl = document.getElementById("auth-value");
const authAddToEl = document.getElementById("auth-addto");

methods.forEach((method) => {
  const option = document.createElement("option");
  option.value = method;
  option.textContent = method;
  methodEl.appendChild(option);
});

let saveTimer;
let envValues = {};
let suggestIndex = 0;
let suggestItems = [];
let suggestTarget = null;

function pairsFrom(root) {
  return [...root.querySelectorAll(".pair-row")].map((row) => ({
    enabled: row.querySelector("input[type=checkbox]").checked,
    key: row.querySelector(".k").value,
    value: row.querySelector(".v").value,
  }));
}

function currentRequest() {
  return {
    name: nameEl.value,
    description: descriptionEl.value,
    method: methodEl.value,
    url: urlEl.value,
    query: pairsFrom(queryEl),
    headers: pairsFrom(headersEl),
    body: {
      mode: bodyModeEl.value,
      raw: bodyEl.value,
      graphqlQuery: gqlQueryEl.value,
      graphqlVariables: gqlVarsEl.value,
      parts: partsFrom(partsEl),
    },
    scripts: { pre: preEl.value, post: postEl.value },
    auth: {
      type: authTypeEl.value,
      token: authTokenEl.value,
      username: authUserEl.value,
      password: authPassEl.value,
      key: authKeyEl.value,
      value: authValueEl.value,
      addTo: authAddToEl.value,
    },
  };
}

let paintRaf = 0;

function schedulePaint() {
  if (paintRaf) {
    return;
  }
  paintRaf = requestAnimationFrame(() => {
    paintRaf = 0;
    paintMethod();
    paintHighlights();
  });
}

function scheduleSave() {
  schedulePaint();
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    vscode.postMessage({ type: "save", request: currentRequest() });
    vscode.postMessage({
      type: "saveDefaults",
      defaultHeaders: pairsFrom(defaultHeadersEl),
      collectionHeaders: pairsFrom(collectionHeadersEl),
    });
  }, 400);
}

function paintMethod() {
  methodEl.className = `method ${methodEl.value.toLowerCase()}`;
}

function escapeHtml(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/ /g, "&nbsp;");
}

function highlightHtml(value) {
  return withVars(escapeHtml(value || ""));
}

function withVars(escaped) {
  return escaped.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (full, key) => {
    const known = Object.prototype.hasOwnProperty.call(envValues, key);
    return `<span class="${known ? "var-ok" : "var-miss"}">${full}</span>`;
  });
}

function tok(cls, text) {
  return `<span class="tok ${cls}">${escapeHtml(text)}</span>`;
}

function highlightByRules(text, rules) {
  let out = "";
  let index = 0;
  const source = text || "";
  while (index < source.length) {
    let hit = null;
    for (let i = 0; i < rules.length; i += 1) {
      const rule = rules[i];
      rule.re.lastIndex = index;
      const match = rule.re.exec(source);
      if (match && match.index === index) {
        hit = { rule, match };
        break;
      }
    }
    if (!hit) {
      out += escapeHtml(source[index]);
      index += 1;
      continue;
    }
    out += hit.rule.cls ? tok(hit.rule.cls, hit.match[0]) : escapeHtml(hit.match[0]);
    index += hit.match[0].length;
  }
  return withVars(out);
}

function highlightJson(text) {
  return highlightByRules(text, [
    { re: /"(?:\\.|[^"\\])*"(?=\s*:)/y, cls: "tok-key" },
    { re: /"(?:\\.|[^"\\])*"/y, cls: "tok-str" },
    { re: /-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/y, cls: "tok-num" },
    { re: /\b(?:true|false)\b/y, cls: "tok-bool" },
    { re: /\bnull\b/y, cls: "tok-null" },
    { re: /[{}\[\],:]/y, cls: "tok-punc" },
    { re: /\s+/y, cls: "" },
  ]);
}

function highlightJs(text) {
  return highlightByRules(text, [
    { re: /\/\/[^\n]*/y, cls: "tok-cm" },
    { re: /\/\*[\s\S]*?\*\//y, cls: "tok-cm" },
    { re: /`(?:\\.|[^`\\])*`/y, cls: "tok-str" },
    { re: /'(?:\\.|[^'\\])*'/y, cls: "tok-str" },
    { re: /"(?:\\.|[^"\\])*"/y, cls: "tok-str" },
    { re: /\b(?:setEnv|pm|test|expect|response)\b/y, cls: "tok-fn" },
    { re: /\b(?:const|let|var|function|return|if|else|for|while|of|in|new|typeof|await|async|try|catch|throw|true|false|null|undefined)\b/y, cls: "tok-kw" },
    { re: /-?\d+(?:\.\d+)?/y, cls: "tok-num" },
    { re: /[{}\[\]().,;=+\-*/<>!&|?:]/y, cls: "tok-punc" },
    { re: /\s+/y, cls: "" },
  ]);
}

function highlightGraphql(text) {
  return highlightByRules(text, [
    { re: /#[^\n]*/y, cls: "tok-cm" },
    { re: /"(?:\\.|[^"\\])*"/y, cls: "tok-str" },
    { re: /\b(?:query|mutation|subscription|fragment|on|true|false|null)\b/y, cls: "tok-kw" },
    { re: /\$[A-Za-z_]\w*/y, cls: "tok-var" },
    { re: /-?\d+(?:\.\d+)?/y, cls: "tok-num" },
    { re: /[{}()\[\]!:]/y, cls: "tok-punc" },
    { re: /\s+/y, cls: "" },
  ]);
}

function highlightHeaders(text) {
  return (text || "")
    .split("\n")
    .map((line) => {
      const split = line.indexOf(":");
      if (split === -1) {
        return withVars(escapeHtml(line));
      }
      return `${tok("tok-key", line.slice(0, split))}${tok("tok-punc", ":")}${withVars(escapeHtml(line.slice(split + 1)))}`;
    })
    .join("\n");
}

function highlightForm(text) {
  return highlightByRules(text, [
    { re: /[^=&\s]+(?==)/y, cls: "tok-key" },
    { re: /=(?:[^&]*)/y, cls: "tok-str" },
    { re: /&/y, cls: "tok-punc" },
    { re: /\s+/y, cls: "" },
  ]);
}

function looksJson(text) {
  const trimmed = (text || "").trim();
  return trimmed.startsWith("{") || trimmed.startsWith("[");
}

function highlightCode(text, lang) {
  switch (lang) {
    case "json":
      return highlightJson(text);
    case "js":
      return highlightJs(text);
    case "graphql":
      return highlightGraphql(text);
    case "headers":
      return highlightHeaders(text);
    case "form":
      return highlightForm(text);
    default:
      return highlightHtml(text);
  }
}

function renderTests(tests) {
  if (!tests.length) {
    return `<div class="test-empty">No tests. Add them in Scripts.</div>`;
  }
  return tests
    .map((test) => {
      const cls = test.passed ? "ok" : "bad";
      const mark = test.passed ? "pass" : "fail";
      const error = test.error ? `<div class="test-err">${escapeHtml(test.error)}</div>` : "";
      return `<div class="test-row ${cls}"><span class="test-mark">${mark}</span><div><div class="test-name">${escapeHtml(test.name)}</div>${error}</div></div>`;
    })
    .join("");
}

function showEnvTip(event, key) {
  const known = Object.prototype.hasOwnProperty.call(envValues, key);
  const value = known ? shortEnvValue(envValues[key]) : "";
  envTipEl.innerHTML = known
    ? `<div class="k">{{${key}}}</div><div class="v">${escapeHtml(value)}</div>`
    : `<div class="k">{{${key}}}</div><div class="miss">not set in this env</div>`;
  envTipEl.style.left = `${Math.min(event.clientX + 12, window.innerWidth - 200)}px`;
  envTipEl.style.top = `${event.clientY + 14}px`;
  envTipEl.classList.remove("hidden");
}

function hideEnvTip() {
  envTipEl.classList.add("hidden");
}

function shortEnvValue(value) {
  const text = String(value ?? "");
  if (!text) {
    return "(empty)";
  }
  if (/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(text)) {
    return `${text.slice(0, 10)}…${text.slice(-6)}`;
  }
  if (/^https?:\/\//.test(text) && text.length > 48) {
    return `${text.slice(0, 36)}…`;
  }
  if (text.length > 48) {
    return `${text.slice(0, 36)}… (${text.length})`;
  }
  return text;
}

function bindMirrorTips(mirror) {
  mirror.querySelectorAll(".var-ok, .var-miss").forEach((span) => {
    const key = (span.textContent || "").replace(/^\{\{\s*|\s*\}\}$/g, "");
    span.addEventListener("mouseenter", (event) => showEnvTip(event, key));
    span.addEventListener("mouseleave", hideEnvTip);
  });
}

function bindEnvHover(input) {
  input.addEventListener("mouseenter", (event) => {
    const match = String(input.value || "").match(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/);
    if (match) {
      showEnvTip(event, match[1]);
    }
  });
  input.addEventListener("mouseleave", hideEnvTip);
}

function bindHighlightWrap(wrap) {
  const field = wrap.querySelector("input, textarea");
  if (!field) {
    return;
  }
  wrap.addEventListener("mousedown", (event) => {
    if (event.target.closest(".var-ok, .var-miss")) {
      return;
    }
    field.style.pointerEvents = "auto";
    field.focus();
  });
  field.addEventListener("focus", () => {
    field.style.pointerEvents = "auto";
  });
  field.addEventListener("blur", () => {
    field.style.pointerEvents = "";
    hideEnvTip();
  });
}

function bodyLang() {
  switch (bodyModeEl.value) {
    case "json":
      return "json";
    case "form":
      return "form";
    case "graphql":
      return "graphql";
    default:
      return "text";
  }
}

function paintHighlights() {
  urlMirror.innerHTML = highlightHtml(urlEl.value) || "&nbsp;";
  bindMirrorTips(urlMirror);
  bodyMirror.innerHTML = highlightCode(bodyEl.value, bodyLang()) || "&nbsp;";
  bindMirrorTips(bodyMirror);
  gqlQueryMirror.innerHTML = highlightCode(gqlQueryEl.value, "graphql") || "&nbsp;";
  gqlVarsMirror.innerHTML = highlightCode(gqlVarsEl.value, "json") || "&nbsp;";
  preMirror.innerHTML = highlightCode(preEl.value, "js") || "&nbsp;";
  postMirror.innerHTML = highlightCode(postEl.value, "js") || "&nbsp;";
  bindMirrorTips(gqlQueryMirror);
  bindMirrorTips(gqlVarsMirror);
  bindMirrorTips(preMirror);
  bindMirrorTips(postMirror);
  document.querySelectorAll(".pair-row .hl-mirror").forEach((mirror) => {
    const input = mirror.parentElement.querySelector(".v");
    if (input) {
      mirror.innerHTML = highlightHtml(input.value) || "&nbsp;";
      bindMirrorTips(mirror);
    }
  });
}

function addPair(root, pair) {
  const row = document.createElement("div");
  row.className = "pair-row";
  row.innerHTML = `
    <input type="checkbox" ${pair.enabled ? "checked" : ""} />
    <input class="k" spellcheck="false" placeholder="Key" />
    <div class="hl-wrap">
      <div class="hl-mirror"></div>
      <input class="v" spellcheck="false" placeholder="Value" />
    </div>
    <button type="button" class="icon-btn" title="Remove">×</button>
  `;
  row.querySelector(".k").value = pair.key || "";
  const valueInput = row.querySelector(".v");
  valueInput.value = pair.value || "";
  row.querySelector("button").addEventListener("click", () => {
    row.remove();
    scheduleSave();
  });
  row.querySelectorAll("input").forEach((input) => {
    if (input.classList.contains("v")) {
      bindEnvHover(input);
    }
    input.addEventListener("input", () => {
      scheduleSave();
      if (input.classList.contains("v") || input.classList.contains("k")) {
        maybeSuggest(input);
      }
    });
    input.addEventListener("change", scheduleSave);
    input.addEventListener("keydown", (event) => suggestKey(event, input));
  });
  root.appendChild(row);
  bindHighlightWrap(row.querySelector(".hl-wrap"));
  paintHighlights();
}

function renderPairs(root, pairs) {
  root.innerHTML = "";
  (pairs && pairs.length ? pairs : [{ key: "", value: "", enabled: true }]).forEach((pair) =>
    addPair(root, pair)
  );
}

function setReqTab(name) {
  if (name === "graphql") {
    bodyModeEl.value = "graphql";
    name = "body";
  }
  ["params", "auth", "headers", "body", "scripts"].forEach((tab) => {
    document.getElementById(`tab-${tab}`).classList.toggle("hidden", tab !== name);
  });
  markEditorTabs(name);
  syncBodyUi();
}

function markEditorTabs(page) {
  document.querySelectorAll("#req-tabs button").forEach((button) => {
    const tab = button.dataset.tab;
    if (tab === "graphql") {
      button.classList.toggle("active", page === "body" && bodyModeEl.value === "graphql");
      return;
    }
    if (tab === "body") {
      button.classList.toggle("active", page === "body" && bodyModeEl.value !== "graphql");
      return;
    }
    button.classList.toggle("active", tab === page);
  });
}

function syncBodyUi() {
  const mode = bodyModeEl.value;
  document.getElementById("body-raw").classList.toggle(
    "hidden",
    mode === "none" || mode === "graphql" || mode === "multipart"
  );
  document.getElementById("body-graphql").classList.toggle("hidden", mode !== "graphql");
  document.getElementById("body-multipart").classList.toggle("hidden", mode !== "multipart");
  document.getElementById("format-json").classList.toggle("hidden", mode !== "json");
  if (!document.getElementById("tab-body").classList.contains("hidden")) {
    markEditorTabs("body");
  }
}

function partsFrom(root) {
  return [...root.querySelectorAll(".part-row")].map((row) => ({
    enabled: row.querySelector("input[type=checkbox]").checked,
    key: row.querySelector(".k").value,
    kind: row.querySelector(".kind").value,
    value: row.querySelector(".v").value,
  }));
}

function addPart(root, part) {
  const row = document.createElement("div");
  row.className = "pair-row part-row";
  row.innerHTML = `
    <input type="checkbox" ${part.enabled !== false ? "checked" : ""} />
    <input class="k" spellcheck="false" placeholder="Key" />
    <select class="kind">
      <option value="text">Text</option>
      <option value="file">File</option>
    </select>
    <input class="v" spellcheck="false" placeholder="Value or file path" />
    <button type="button" class="link browse">Browse</button>
    <button type="button" class="icon-btn" title="Remove">×</button>
  `;
  row.querySelector(".k").value = part.key || "";
  row.querySelector(".kind").value = part.kind === "file" ? "file" : "text";
  row.querySelector(".v").value = part.value || "";
  row.querySelector(".icon-btn").addEventListener("click", () => {
    row.remove();
    scheduleSave();
  });
  row.querySelector(".browse").addEventListener("click", () => {
    vscode.postMessage({
      type: "pickFile",
      partIndex: [...root.querySelectorAll(".part-row")].indexOf(row),
    });
  });
  row.querySelectorAll("input, select").forEach((input) => {
    input.addEventListener("input", scheduleSave);
    input.addEventListener("change", scheduleSave);
  });
  root.appendChild(row);
}

function renderParts(root, parts) {
  root.innerHTML = "";
  (parts && parts.length ? parts : [{ key: "", kind: "text", value: "", enabled: true }]).forEach(
    (part) => addPart(root, part)
  );
}

function setResTab(name) {
  document.querySelectorAll("#res-tabs button").forEach((button) => {
    button.classList.toggle("active", button.dataset.restab === name);
  });
  document.getElementById("res-body").classList.toggle("hidden", name !== "body");
  document.getElementById("res-headers").classList.toggle("hidden", name !== "headers");
  document.getElementById("res-tests").classList.toggle("hidden", name !== "tests");
}

function showAuthFields() {
  const type = authTypeEl.value;
  document.getElementById("auth-bearer").classList.toggle("hidden", type !== "bearer");
  document.getElementById("auth-basic").classList.toggle("hidden", type !== "basic");
  document.getElementById("auth-apikey").classList.toggle("hidden", type !== "apikey");
}

function envTokenAt(value, caret) {
  const left = value.slice(0, caret);
  const start = left.lastIndexOf("{{");
  if (start === -1) {
    return null;
  }
  const afterOpen = value.slice(start + 2, caret);
  if (afterOpen.includes("}")) {
    return null;
  }
  return { start, prefix: afterOpen.trim() };
}

function maybeSuggest(input) {
  const caret = input.selectionStart || 0;
  const token = envTokenAt(input.value, caret);
  const keys = Object.keys(envValues);
  if (!token || !keys.length) {
    hideSuggest();
    return;
  }
  suggestItems = keys.filter((key) => key.toLowerCase().includes(token.prefix.toLowerCase()));
  if (!suggestItems.length) {
    hideSuggest();
    return;
  }
  suggestTarget = input;
  suggestIndex = 0;
  const rect = input.getBoundingClientRect();
  suggestEl.style.left = `${rect.left}px`;
  suggestEl.style.top = `${rect.bottom + 4}px`;
  renderSuggest();
  suggestEl.classList.remove("hidden");
}

function renderSuggest() {
  suggestEl.innerHTML = "";
  suggestItems.forEach((key, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = index === suggestIndex ? "active" : "";
    button.innerHTML = `${key}<span class="hint">${escapeHtml(shortEnvValue(envValues[key]))}</span>`;
    button.addEventListener("mousedown", (event) => {
      event.preventDefault();
      applySuggest(key);
    });
    suggestEl.appendChild(button);
  });
}

function applySuggest(key) {
  const input = suggestTarget;
  if (!input) {
    return;
  }
  const caret = input.selectionStart || 0;
  const token = envTokenAt(input.value, caret);
  if (!token) {
    hideSuggest();
    return;
  }
  const before = input.value.slice(0, token.start);
  const after = input.value.slice(caret).replace(/^[^}]*}?\}?/, "");
  input.value = `${before}{{${key}}}${after}`;
  const next = before.length + key.length + 4;
  input.setSelectionRange(next, next);
  hideSuggest();
  scheduleSave();
  paintHighlights();
}

function hideSuggest() {
  suggestEl.classList.add("hidden");
  suggestTarget = null;
  suggestItems = [];
}

function suggestKey(event, input) {
  if (suggestEl.classList.contains("hidden")) {
    return;
  }
  if (event.key === "ArrowDown") {
    event.preventDefault();
    suggestIndex = (suggestIndex + 1) % suggestItems.length;
    renderSuggest();
    return;
  }
  if (event.key === "ArrowUp") {
    event.preventDefault();
    suggestIndex = (suggestIndex - 1 + suggestItems.length) % suggestItems.length;
    renderSuggest();
    return;
  }
  if (event.key === "Enter" || event.key === "Tab") {
    if (suggestItems[suggestIndex]) {
      event.preventDefault();
      applySuggest(suggestItems[suggestIndex]);
    }
    return;
  }
  if (event.key === "Escape") {
    hideSuggest();
  }
  void input;
}

function send() {
  sendEl.disabled = true;
  chipEl.className = "chip idle";
  chipEl.textContent = "…";
  metaEl.textContent = "Sending";
  vscode.postMessage({ type: "save", request: currentRequest() });
  vscode.postMessage({ type: "send", request: currentRequest() });
}

function fillAuth(auth) {
  authTypeEl.value = auth?.type || "inherit";
  authTokenEl.value = auth?.token || "";
  authUserEl.value = auth?.username || "";
  authPassEl.value = auth?.password || "";
  authKeyEl.value = auth?.key || "";
  authValueEl.value = auth?.value || "";
  authAddToEl.value = auth?.addTo || "header";
  showAuthFields();
}

document.querySelectorAll("#req-tabs button").forEach((button) => {
  button.addEventListener("click", () => setReqTab(button.dataset.tab));
});
document.querySelectorAll("#res-tabs button").forEach((button) => {
  button.addEventListener("click", () => setResTab(button.dataset.restab));
});
document.getElementById("add-query").addEventListener("click", () => {
  addPair(queryEl, { key: "", value: "", enabled: true });
  scheduleSave();
});
document.getElementById("add-header").addEventListener("click", () => {
  addPair(headersEl, { key: "", value: "", enabled: true });
  scheduleSave();
});
document.getElementById("add-part").addEventListener("click", () => {
  addPart(partsEl, { key: "", kind: "text", value: "", enabled: true });
  scheduleSave();
});
document.getElementById("add-default-header").addEventListener("click", () => {
  addPair(defaultHeadersEl, { key: "", value: "", enabled: true });
  scheduleSave();
});
document.getElementById("add-collection-header").addEventListener("click", () => {
  addPair(collectionHeadersEl, { key: "", value: "", enabled: true });
  scheduleSave();
});
document.getElementById("format-json").addEventListener("click", formatJson);
document.getElementById("copy-curl").addEventListener("click", () => {
  vscode.postMessage({ type: "copyCurl", request: currentRequest() });
});
document.getElementById("edit-env").addEventListener("click", () => {
  vscode.postMessage({ type: "editEnv" });
});
authTypeEl.addEventListener("change", () => {
  showAuthFields();
  scheduleSave();
});

[urlEl, bodyEl, gqlQueryEl, gqlVarsEl, preEl, postEl, authTokenEl, authUserEl, authPassEl, authKeyEl, authValueEl].forEach(bindEnvHover);
document.querySelectorAll(".hl-wrap").forEach(bindHighlightWrap);

bodyModeEl.addEventListener("change", syncBodyUi);
[methodEl, urlEl, nameEl, descriptionEl, bodyModeEl, bodyEl, gqlQueryEl, gqlVarsEl, preEl, postEl, authTokenEl, authUserEl, authPassEl, authKeyEl, authValueEl, authAddToEl].forEach((el) => {
  el.addEventListener("input", () => {
    scheduleSave();
    if (el === urlEl || el === bodyEl || el.classList.contains("suggest-field")) {
      maybeSuggest(el);
    }
  });
  el.addEventListener("change", scheduleSave);
  el.addEventListener("keydown", (event) => suggestKey(event, el));
});
urlEl.addEventListener("scroll", () => {
  urlMirror.scrollLeft = urlEl.scrollLeft;
});
bodyEl.addEventListener("scroll", () => {
  bodyMirror.scrollTop = bodyEl.scrollTop;
});
[
  [gqlQueryEl, gqlQueryMirror],
  [gqlVarsEl, gqlVarsMirror],
  [preEl, preMirror],
  [postEl, postMirror],
].forEach(([field, mirror]) => {
  field.addEventListener("scroll", () => {
    mirror.scrollTop = field.scrollTop;
    mirror.scrollLeft = field.scrollLeft;
  });
});
envEl.addEventListener("change", () => {
  vscode.postMessage({ type: "setEnv", envName: envEl.value });
});
sendEl.addEventListener("click", send);
document.addEventListener("click", (event) => {
  if (!suggestEl.contains(event.target)) {
    hideSuggest();
  }
});

function formatJson() {
  try {
    bodyEl.value = JSON.stringify(JSON.parse(bodyEl.value), null, 2);
    bodyModeEl.value = "json";
    scheduleSave();
    paintHighlights();
  } catch {
    metaEl.textContent = "Body is not valid JSON";
  }
}

function sizeLabel(bytes) {
  return bytes > 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${bytes} B`;
}

window.addEventListener("message", (event) => {
  const message = event.data;
  if (message.type === "pleaseSend") {
    send();
    return;
  }
  if (message.type === "pleaseCopyCurl") {
    vscode.postMessage({ type: "copyCurl", request: currentRequest() });
    return;
  }
  if (message.type === "env") {
    envValues = message.envValues || {};
    paintHighlights();
    return;
  }
  if (message.type === "pickedFile") {
    const row = partsEl.querySelectorAll(".part-row")[message.partIndex];
    if (row) {
      row.querySelector(".kind").value = "file";
      row.querySelector(".v").value = message.path || "";
      scheduleSave();
    }
    return;
  }
  if (message.type === "load") {
    const request = message.request;
    envValues = message.envValues || {};
    nameEl.value = request.name || "";
    descriptionEl.value = request.description || "";
    methodEl.value = request.method || "GET";
    urlEl.value = request.url || "";
    bodyModeEl.value = request.body?.mode || "none";
    bodyEl.value = request.body?.raw || "";
    gqlQueryEl.value = request.body?.graphqlQuery || "";
    gqlVarsEl.value = request.body?.graphqlVariables || "{}";
    renderParts(partsEl, request.body?.parts);
    syncBodyUi();
    preEl.value = request.scripts?.pre || "";
    postEl.value = request.scripts?.post || "";
    fillAuth(request.auth);
    renderPairs(queryEl, request.query);
    renderPairs(headersEl, request.headers);
    renderPairs(defaultHeadersEl, message.defaultHeaders);
    renderPairs(collectionHeadersEl, message.collectionHeaders);
    envEl.innerHTML = "";
    (message.environments || []).forEach((name) => {
      const option = document.createElement("option");
      option.value = name;
      option.textContent = name;
      option.selected = name === message.activeEnv;
      envEl.appendChild(option);
    });
    crumbEl.textContent = (message.folder || message.collection || "").replaceAll("/", " / ");
    resBodyEl.innerHTML = "";
    resHeadersEl.innerHTML = "";
    resTestsEl.innerHTML = "";
    chipEl.className = "chip idle";
    chipEl.textContent = "Idle";
    metaEl.textContent = "";
    paintMethod();
    paintHighlights();
    urlEl.focus();
    return;
  }
  if (message.type === "result") {
    sendEl.disabled = false;
    const result = message.result;
    const tests = message.tests || [];
    if (result.error) {
      chipEl.className = "chip err";
      chipEl.textContent = "ERR";
      metaEl.textContent = `${result.timeMs} ms`;
      resBodyEl.innerHTML = `<span class="tok tok-err">${escapeHtml(result.error)}</span>`;
      resHeadersEl.innerHTML = "";
      resTestsEl.innerHTML = renderTests(tests);
      setResTab("body");
      return;
    }
    const cls = result.status >= 500 ? "s5" : result.status >= 400 ? "s4" : result.status >= 300 ? "s3" : "s2";
    chipEl.className = `chip ${cls}`;
    chipEl.textContent = `${result.status} ${result.statusText || ""}`.trim();
    metaEl.textContent = `${result.timeMs} ms · ${sizeLabel(result.sizeBytes)}${
      tests.length ? ` · ${tests.filter((test) => test.passed).length}/${tests.length} tests` : ""
    }`;
    resBodyEl.innerHTML = highlightCode(
      result.body || "",
      looksJson(result.body) ? "json" : "text"
    );
    resHeadersEl.innerHTML = highlightHeaders(
      (result.headers || [])
        .map((header) => `${header.key}: ${header.value}`)
        .join("\n")
    );
    resTestsEl.innerHTML = renderTests(tests);
    if (tests.some((test) => !test.passed)) {
      setResTab("tests");
    } else {
      setResTab("body");
    }
  }
});

window.addEventListener("keydown", (event) => {
  const cmd = event.metaKey || event.ctrlKey;
  if (cmd && event.key === "Enter") {
    event.preventDefault();
    send();
    return;
  }
  if (cmd && event.altKey && event.key.toLowerCase() === "c") {
    event.preventDefault();
    vscode.postMessage({ type: "copyCurl", request: currentRequest() });
    return;
  }
  if (cmd && event.shiftKey && event.key.toLowerCase() === "f") {
    event.preventDefault();
    formatJson();
    return;
  }
  if (cmd && !event.altKey && !event.shiftKey && ["1", "2", "3", "4", "5"].includes(event.key)) {
    const map = { 1: "params", 2: "auth", 3: "headers", 4: "body", 5: "scripts" };
    event.preventDefault();
    setReqTab(map[event.key]);
  }
});

vscode.postMessage({ type: "ready" });
