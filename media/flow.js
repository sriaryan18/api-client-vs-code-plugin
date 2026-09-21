const vscode = acquireVsCodeApi();
const nameEl = document.getElementById("name");
const envEl = document.getElementById("env");
const scriptsEl = document.getElementById("scripts");
const stopEl = document.getElementById("stop");
const delayEl = document.getElementById("delay");
const stepsEl = document.getElementById("steps");
const resultEl = document.getElementById("result");

let steps = [];
let saveTimer;

function currentFlow() {
  return {
    name: nameEl.value,
    env: envEl.value || "local",
    runScripts: scriptsEl.checked,
    stopOnError: stopEl.checked,
    delayMs: Math.max(0, Number(delayEl.value) || 0),
    steps: steps.map((step) => ({
      folder: step.folder,
      name: step.name,
      runScripts: step.runScripts !== false,
    })),
  };
}

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    vscode.postMessage({ type: "save", flow: currentFlow() });
  }, 200);
}

function paintSteps() {
  stepsEl.innerHTML = "";
  if (!steps.length) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "No steps yet. Add a login request, then the calls that need that token.";
    stepsEl.appendChild(empty);
    return;
  }
  steps.forEach((step, index) => {
    const row = document.createElement("div");
    const method = String(step.method || "?").toLowerCase();
    row.className = `step-row${step.missing ? " missing" : ""}`;
    row.innerHTML = `
      <span class="step-num">${index + 1}</span>
      <span class="step-method method-badge ${method}">${step.method || "?"}</span>
      <span class="step-name">${step.name}</span>
      <span class="step-folder">${step.folder}${step.hasScripts ? "" : " · no script"}</span>
      <label class="step-scripts"><input type="checkbox" data-act="scripts" ${
        step.runScripts !== false ? "checked" : ""
      } /> scripts</label>
      <span class="step-actions">
        <button type="button" data-act="up" ${index === 0 ? "disabled" : ""}>↑</button>
        <button type="button" data-act="down" ${index === steps.length - 1 ? "disabled" : ""}>↓</button>
        <button type="button" data-act="remove">×</button>
      </span>
    `;
    row.querySelectorAll("button").forEach((button) => {
      button.addEventListener("click", () => {
        const act = button.getAttribute("data-act");
        if (act === "remove") {
          steps.splice(index, 1);
        } else if (act === "up" && index > 0) {
          const [item] = steps.splice(index, 1);
          steps.splice(index - 1, 0, item);
        } else if (act === "down" && index < steps.length - 1) {
          const [item] = steps.splice(index, 1);
          steps.splice(index + 1, 0, item);
        }
        paintSteps();
        scheduleSave();
      });
    });
    row.querySelector("input[data-act=scripts]").addEventListener("change", (event) => {
      steps[index].runScripts = event.target.checked;
      scheduleSave();
    });
    stepsEl.appendChild(row);
  });
}

[nameEl, envEl, scriptsEl, stopEl, delayEl].forEach((el) => {
  el.addEventListener("input", scheduleSave);
  el.addEventListener("change", scheduleSave);
});
document.getElementById("add").addEventListener("click", () => {
  vscode.postMessage({ type: "save", flow: currentFlow() });
  vscode.postMessage({ type: "addStep" });
});
document.getElementById("run").addEventListener("click", () => {
  vscode.postMessage({ type: "run", flow: currentFlow() });
});

window.addEventListener("message", (event) => {
  const message = event.data;
  if (message.type === "load") {
    const flow = message.flow || {};
    nameEl.value = flow.name || "";
    scriptsEl.checked = flow.runScripts !== false;
    stopEl.checked = flow.stopOnError !== false;
    delayEl.value = String(flow.delayMs || 0);
    envEl.innerHTML = "";
    (message.environments || []).forEach((name) => {
      const option = document.createElement("option");
      option.value = name;
      option.textContent = name;
      option.selected = name === flow.env;
      envEl.appendChild(option);
    });
    steps = message.steps || [];
    paintSteps();
    return;
  }
  if (message.type === "result") {
    resultEl.textContent = message.lines || message.summary || "";
  }
});

vscode.postMessage({ type: "ready" });
