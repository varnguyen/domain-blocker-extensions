const domainInput = document.getElementById("domainInput");
const blockBtn = document.getElementById("blockBtn");
const blockedList = document.getElementById("blockedList");

let ruleIdCounter = 1000;
let domainToRuleId = {};

function formatUrlFilter(domain) {
  return `||${domain}^`;
}

async function syncRulesWithStorage() {
  chrome.storage.local.get(["blockedDomains"], async (res) => {
    const blockedDomains = res.blockedDomains || [];
    domainToRuleId = {};
    blockedList.innerHTML = "";

    // Xóa toàn bộ quy tắc cũ
    const ruleIdsToRemove = blockedDomains.map((d) => d.ruleId);
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: ruleIdsToRemove,
    });

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

    // Thêm quy tắc mới nếu có
    if (newRules.length) {
      await chrome.declarativeNetRequest.updateDynamicRules({
        addRules: newRules,
      });
    }
  });
}

async function clearAllRules() {
  const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
  const ruleIds = existingRules.map((rule) => rule.id);

  if (ruleIds.length > 0) {
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: ruleIds,
    });
  }
}

// Khi thêm domain vào danh sách chặn
blockBtn.addEventListener("click", async () => {
  await clearAllRules();
  const domain = domainInput.value.trim().toLowerCase();
  if (!domain || domainToRuleId[domain]) return;

  const ruleId = ruleIdCounter++; // Tăng ID mỗi lần thêm
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
    // Thêm quy tắc chặn mới
    await chrome.declarativeNetRequest.updateDynamicRules({ addRules: [rule] });
  } catch (error) {
    console.error("Error adding rule:", error);
    return; // Ngừng nếu có lỗi
  }

  // Cập nhật danh sách trong storage
  chrome.storage.local.get(["blockedDomains"], (res) => {
    const blockedDomains = res.blockedDomains || [];
    const entry = { domain, ruleId };
    blockedDomains.push(entry);
    chrome.storage.local.set({ blockedDomains });
    domainToRuleId[domain] = ruleId;
    addDomainToList(domain);
  });

  domainInput.value = "";
});

function addDomainToList(domain) {
  const li = document.createElement("li");
  li.textContent = domain;

  const btn = document.createElement("button");
  btn.textContent = "Remove";
  btn.className = "remove-btn";
  btn.onclick = () => removeDomain(domain, li);

  li.appendChild(btn);
  blockedList.appendChild(li);
}

async function removeDomain(domain, listItem) {
  const ruleId = domainToRuleId[domain];
  if (!ruleId) return;

  // Gỡ bỏ quy tắc chặn
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: [ruleId],
  });

  // Cập nhật danh sách các domain bị chặn trong storage
  chrome.storage.local.get(["blockedDomains"], (res) => {
    const updated = (res.blockedDomains || []).filter(
      (d) => d.domain !== domain
    );
    chrome.storage.local.set({ blockedDomains: updated });

    // Xóa khỏi domainToRuleId và cập nhật giao diện
    delete domainToRuleId[domain];
    listItem.remove();
  });
}

// Khởi động mỗi lần popup mở
syncRulesWithStorage();
