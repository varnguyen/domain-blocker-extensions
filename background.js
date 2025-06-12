const DEFAULT_BLOCKED_DOMAINS = [];

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

async function initializeBlockingRules() {
  chrome.storage.local.get(["blockedDomains"], async (res) => {
    let blockedDomains = res.blockedDomains || [];
    let ruleIdCounter = 1000;

    // Nếu chưa có, tạo danh sách mặc định
    if (blockedDomains.length === 0) {
      blockedDomains = DEFAULT_BLOCKED_DOMAINS.map((domain, index) => ({
        domain: normalizeDomain(domain),
        ruleId: ruleIdCounter + index,
      }));
      chrome.storage.local.set({ blockedDomains });
      ruleIdCounter += DEFAULT_BLOCKED_DOMAINS.length;
    }

    // Xoá rule cũ
    const existing = await chrome.declarativeNetRequest.getDynamicRules();
    const existingIds = existing.map((r) => r.id);
    if (existingIds.length > 0) {
      await chrome.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: existingIds,
      });
    }

    // Thêm rule mới
    const rules = blockedDomains.map((entry) => ({
      id: entry.ruleId,
      priority: 1,
      action: { type: "block" },
      condition: {
        urlFilter: formatUrlFilter(entry.domain),
        resourceTypes: ["main_frame"],
      },
    }));

    if (rules.length > 0) {
      await chrome.declarativeNetRequest.updateDynamicRules({
        addRules: rules,
      });
    }
  });
}

chrome.runtime.onInstalled.addListener(() => {
  initializeBlockingRules();
});

chrome.runtime.onStartup.addListener(() => {
  initializeBlockingRules();
});
