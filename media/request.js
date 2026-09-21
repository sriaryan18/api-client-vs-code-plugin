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
const preEl = document.getElementById("pre");
const postEl = document.getElementById("post");
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
    body: { mode: bodyModeEl.value, raw: bodyEl.value },
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
  const escaped = escapeHtml(value || "");
  return escaped.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (full, key) => {
    const known = Object.prototype.hasOwnProperty.call(envValues, key);
    const cls = known ? "var-ok" : "var-miss";
    return `<span class="${cls}">${full}</span>`;
  });
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

function paintHighlights() {
  urlMirror.innerHTML = highlightHtml(urlEl.value) || "&nbsp;";
  bindMirrorTips(urlMirror);
  bodyMirror.innerHTML = highlightHtml(bodyEl.value) || "&nbsp;";
  bindMirrorTips(bodyMirror);
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
  document.querySelectorAll("#req-tabs button").forEach((button) => {
    button.classList.toggle("active", button.dataset.tab === name);
  });
  ["params", "auth", "headers", "body", "scripts"].forEach((tab) => {
    document.getElementById(`tab-${tab}`).classList.toggle("hidden", tab !== name);
  });
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

[urlEl, bodyEl, authTokenEl, authUserEl, authPassEl, authKeyEl, authValueEl].forEach(bindEnvHover);
document.querySelectorAll(".hl-wrap").forEach(bindHighlightWrap);

[methodEl, urlEl, nameEl, descriptionEl, bodyModeEl, bodyEl, preEl, postEl, authTokenEl, authUserEl, authPassEl, authKeyEl, authValueEl, authAddToEl].forEach((el) => {
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
  if (message.type === "load") {
    const request = message.request;
    envValues = message.envValues || {};
    nameEl.value = request.name || "";
    descriptionEl.value = request.description || "";
    methodEl.value = request.method || "GET";
    urlEl.value = request.url || "";
    bodyModeEl.value = request.body?.mode || "none";
    bodyEl.value = request.body?.raw || "";
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
    resBodyEl.textContent = "";
    resHeadersEl.textContent = "";
    resTestsEl.textContent = "";
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
      resBodyEl.textContent = result.error;
      resHeadersEl.textContent = "";
      resTestsEl.textContent = tests.length
        ? tests.map((test) => `${test.passed ? "ok" : "x"}  ${test.name}${test.error ? ` — ${test.error}` : ""}`).join("\n")
        : "No tests";
      setResTab("body");
      return;
    }
    const cls = result.status >= 500 ? "s5" : result.status >= 400 ? "s4" : result.status >= 300 ? "s3" : "s2";
    chipEl.className = `chip ${cls}`;
    chipEl.textContent = `${result.status} ${result.statusText || ""}`.trim();
    metaEl.textContent = `${result.timeMs} ms · ${sizeLabel(result.sizeBytes)}${
      tests.length ? ` · ${tests.filter((test) => test.passed).length}/${tests.length} tests` : ""
    }`;
    resBodyEl.textContent = result.body || "";
    resHeadersEl.textContent = (result.headers || [])
      .map((header) => `${header.key}: ${header.value}`)
      .join("\n");
    resTestsEl.textContent = tests.length
      ? tests
          .map((test) => `${test.passed ? "ok" : "x "}  ${test.name}${test.error ? ` — ${test.error}` : ""}`)
          .join("\n")
      : "No tests. Add them in Scripts.";
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
