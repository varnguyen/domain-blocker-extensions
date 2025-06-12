const domainInput = document.getElementById("domainInput");
const blockBtn = document.getElementById("blockBtn");
const blockedList = document.getElementById("blockedList");

const DEFAULT_BLOCKED_DOMAINS = [];

let ruleIdCounter = 1000;
let domainToRuleId = {};

function formatUrlFilter(domain) {
  return `||${domain}^`;
}

function normalizeDomain(input) {
  try {
    if (!input.includes("://")) input = "http://" + input;
    const url = new URL(input);
    return url.hostname.replace(/^www\./, "");
  } catch {
    return input.toLowerCase().trim();
  }
}

function showEmptyMessage() {
  const li = document.createElement("li");
  li.textContent = "No data";
  li.className = "no-data";
  li.style.color = "#777";
  li.style.fontStyle = "italic";
  li.style.justifyContent = "center";
  li.style.textAlign = "center";
  blockedList.appendChild(li);
}

function clearEmptyMessage() {
  const existing = blockedList.querySelector(".no-data");
  if (existing) existing.remove();
}

async function syncRulesWithStorage() {
  chrome.storage.local.get(["blockedDomains"], async (res) => {
    let blockedDomains = res.blockedDomains;

    if (!blockedDomains || blockedDomains.length === 0) {
      blockedDomains = DEFAULT_BLOCKED_DOMAINS.map((domain, index) => ({
        domain,
        ruleId: ruleIdCounter + index,
      }));
      chrome.storage.local.set({ blockedDomains });
      ruleIdCounter += DEFAULT_BLOCKED_DOMAINS.length;
    } else {
      const maxRuleId = Math.max(...blockedDomains.map((d) => d.ruleId), 999);
      ruleIdCounter = maxRuleId + 1;
    }

    domainToRuleId = {};
    blockedList.innerHTML = "";

    const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
    const existingRuleIds = existingRules.map((r) => r.id);
    if (existingRuleIds.length > 0) {
      await chrome.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: existingRuleIds,
      });
    }

    if (blockedDomains.length === 0) {
      showEmptyMessage();
    }

    const newRules = blockedDomains.map((entry) => {
      domainToRuleId[entry.domain] = entry.ruleId;
      addDomainToList(entry.domain);
      return {
        id: entry.ruleId,
        priority: 1,
        action: { type: "block" },
        condition: {
          urlFilter: formatUrlFilter(entry.domain),
          resourceTypes: ["main_frame"],
        },
      };
    });

    if (newRules.length > 0) {
      await chrome.declarativeNetRequest.updateDynamicRules({
        addRules: newRules,
      });
    }
  });
}

blockBtn.addEventListener("click", async () => {
  const rawInput = domainInput.value;
  const domain = normalizeDomain(rawInput);
  if (!domain || domainToRuleId[domain]) return;

  const ruleId = ruleIdCounter++;
  const rule = {
    id: ruleId,
    priority: 1,
    action: { type: "block" },
    condition: {
      urlFilter: formatUrlFilter(domain),
      resourceTypes: ["main_frame"],
    },
  };

  try {
    await chrome.declarativeNetRequest.updateDynamicRules({
      addRules: [rule],
    });
  } catch (error) {
    console.error("Error adding rule:", error);
    return;
  }

  chrome.storage.local.get(["blockedDomains"], (res) => {
    const blockedDomains = res.blockedDomains || [];
    const entry = { domain, ruleId };
    blockedDomains.push(entry);
    chrome.storage.local.set({ blockedDomains });
    domainToRuleId[domain] = ruleId;
    clearEmptyMessage(); // xoá "No data" nếu có
    addDomainToList(domain);
  });

  domainInput.value = "";
});

function addDomainToList(domain) {
  const li = document.createElement("li");
  li.textContent = domain;

  const btn = document.createElement("button");
  btn.innerHTML = "&times;";
  btn.className = "remove-btn";
  btn.title = "Remove";
  btn.onclick = () => removeDomain(domain, li);

  li.appendChild(btn);
  blockedList.appendChild(li);
}

async function removeDomain(domain, listItem) {
  const ruleId = domainToRuleId[domain];
  if (!ruleId) return;

  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: [ruleId],
  });

  chrome.storage.local.get(["blockedDomains"], (res) => {
    const updated = (res.blockedDomains || []).filter(
      (d) => d.domain !== domain
    );
    chrome.storage.local.set({ blockedDomains: updated });

    delete domainToRuleId[domain];
    listItem.remove();

    // nếu danh sách rỗng -> hiển thị No data
    if (blockedList.children.length === 0) {
      showEmptyMessage();
    }
  });
}

syncRulesWithStorage();
