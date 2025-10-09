import { extension_settings } from "../../../extensions.js";
import { saveSettingsDebounced } from "../../../../script.js";
import {
  showAvatarManagerModal,
  getAvatarsData,
  updateAvatarsData,
  setAvatarManagerDependencies
} from "./avatar-manager.js";

// 扩展配置
const extensionName = "sillytavern-smart-memory";
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;

// 状态管理数据
let statsData = {
  states: [
    {
      statName: "生命值",
      prompt: "角色的生命力",
      tier: [
        {
          name: "垂死",
          from: -999,
          to: -100,
          prompt: "再接受一次攻击就会死亡"
        },
        {
          name: "重伤",
          from: -100,
          to: 0,
          prompt: "无法动弹"
        }
      ]
    },
    {
      statName: "法力值",
      prompt: "角色的发力",
      tier: [
        {
          name: "枯竭",
          from: -999,
          to: 0,
          prompt: "没有任何发力"
        },
        {
          name: "正常",
          from: 0,
          to: 100,
          prompt: "正常"
        }
      ]
    }
  ]
};

// 显示数值设置弹层
export async function showStatSettingModal() {
  try {
    console.log("正在加载数值设置页面...");

    // 加载statSetting.html内容
    const response = await $.get(`${extensionFolderPath}/statSetting.html`);

    // 创建弹层HTML
    const modalHtml = `
      <div class="modal-overlay" id="statSettingModal">
        <div class="modal-container">
          <div class="modal-header">
            <h3 class="modal-title">数值设置</h3>
            <button class="modal-close" id="closeStatModal">&times;</button>
          </div>
          <div class="modal-body">
            ${response}
          </div>
        </div>
      </div>
    `;

    // 移除已存在的弹层并添加新的
    $("#statSettingModal").remove();
    $("body").append(modalHtml);

    // 显示弹层
    $("#statSettingModal").css("display", "flex");

    // 绑定关闭事件
    $("#closeStatModal").on("click", closeStatSettingModal);

    // 点击遮罩层关闭
    $("#statSettingModal").on("click", function(e) {
      if (e.target === this) {
        closeStatSettingModal();
      }
    });

    // ESC键关闭
    $(document).on("keydown.statModal", function(e) {
      if (e.key === "Escape") {
        closeStatSettingModal();
      }
    });

    console.log("数值设置弹层已显示");

    // 初始化状态管理界面
    initStatManager();

  } catch (error) {
    console.error("加载数值设置页面失败:", error);
    toastr.error(`加载数值设置失败: ${error.message}`, "错误");
  }
}

// 关闭数值设置弹层
function closeStatSettingModal() {
  $("#statSettingModal").remove();
  $(document).off("keydown.statModal");
  console.log("数值设置弹层已关闭");
}

// 初始化状态管理界面
function initStatManager() {
  // 加载保存的数据
  if (extension_settings[extensionName]?.statsData) {
    statsData = extension_settings[extensionName].statsData;
  }

  // 设置角色管理模块的依赖
  setAvatarManagerDependencies({
    statsData: statsData,
    updatePromptPreview: updatePromptPreview
  });

  renderStatsContainer();
  bindStatEvents();
  updatePromptPreview();

  // 如果已有数据，自动同步到主页面提示词（静默更新，不显示通知）
  setTimeout(() => {
    if (statsData && statsData.states && statsData.states.length > 0) {
      updateMainPromptWithStats();
      console.log('已自动同步状态监控提示词到主页面');
    }
  }, 100);
}

// 渲染状态容器
function renderStatsContainer() {
  const container = $("#statsContainer");
  container.empty();

  statsData.states.forEach((stat, index) => {
    const statPanel = createStatPanel(stat, index);
    container.append(statPanel);
  });
}

// 创建状态面板
function createStatPanel(stat, index) {
  const panelHtml = `
    <div class="stat-panel" data-index="${index}">
      <div class="stat-panel-header" onclick="toggleStatPanel(${index})">
        <h4 class="stat-panel-title">${stat.statName || '未命名状态'}</h4>
        <div class="stat-panel-controls">
          <span class="stat-panel-toggle">▼</span>
          <button class="stat-delete-btn" onclick="deleteStat(${index}); event.stopPropagation();">删除</button>
        </div>
      </div>
      <div class="stat-panel-content" id="statPanel_${index}">
        <div class="stat-basic-settings">
          <div class="stat-form-row">
            <label>状态名称:</label>
            <input type="text" value="${stat.statName}"
                   onchange="updateStatName(${index}, this.value)">
          </div>
          <div class="stat-form-row">
            <label>状态描述:</label>
            <textarea onchange="updateStatPrompt(${index}, this.value)">${stat.prompt}</textarea>
          </div>
        </div>
        <div class="tiers-section">
          <div class="tiers-header">
            <h4>等级设置</h4>
            <button class="add-tier-btn" onclick="addTier(${index})">添加等级</button>
          </div>
          <div class="tier-list" id="tierList_${index}">
            ${renderTierList(stat.tier, index)}
          </div>
        </div>
      </div>
    </div>
  `;
  return $(panelHtml);
}

// 渲染tier列表
function renderTierList(tiers, statIndex) {
  return tiers.map((tier, tierIndex) => `
    <div class="tier-item" data-tier-index="${tierIndex}">
      <div class="tier-item-header">
        <h5 class="tier-item-title">${tier.name || '未命名等级'}</h5>
        <button class="tier-delete-btn" onclick="deleteTier(${statIndex}, ${tierIndex})">删除</button>
      </div>
      <div class="tier-form-grid">
        <div>
          <label>等级名称:</label>
          <input type="text" value="${tier.name}"
                 onchange="updateTierName(${statIndex}, ${tierIndex}, this.value)">
        </div>
      </div>
      <div class="tier-prompt-row">
        <div>
          <label>最小值:</label>
          <input type="number" value="${tier.from}"
                 onchange="updateTierFrom(${statIndex}, ${tierIndex}, this.value)">
        </div>
        <div>
          <label>最大值:</label>
          <input type="number" value="${tier.to}"
                 onchange="updateTierTo(${statIndex}, ${tierIndex}, this.value)">
        </div>
      </div>
      <div class="tier-prompt-row">
        <label>等级描述:</label>
        <textarea onchange="updateTierPrompt(${statIndex}, ${tierIndex}, this.value)">${tier.prompt}</textarea>
      </div>
    </div>
  `).join('');
}

// 绑定状态管理事件
function bindStatEvents() {
  $("#addStatBtn").off('click').on('click', addStat);
  $("#saveStatsBtn").off('click').on('click', saveStatsData);
  $("#loadDefaultStatsBtn").off('click').on('click', loadDefaultStats);
}

// 生成提示词预览
function generatePromptPreview() {
  if (!statsData || !statsData.states || statsData.states.length === 0) {
    $("#promptPreview").empty();
    return;
  }

  // 生成角色列表字符串
  let characterList = "";
  const avatarsData = getAvatarsData();
  if (avatarsData && avatarsData.length > 0) {
    characterList = avatarsData.map(avatar => {
      const name = avatar.name || "未命名";
      const otherName = avatar.otherName || "";
      return otherName ? `${name}(${otherName})` : name;
    }).join(',');
  }

  let prompt = characterList
    ? `根据最后一条回复内容，统计角色[${characterList}]状态值的变化。\n`
    : "根据最后一条回复内容，统计以下状态值的变化。\n";

  const statDescriptions = statsData.states.map(stat => {
    return `${stat.statName}：${stat.prompt}`;
  }).join('，');

  prompt += "【" + statDescriptions + "】";

  prompt += "统计结果以下面格式返回: <数据统计>`json格式数据统计`</数据统计>，每个角色一个json对象，使用中括号包含。仅统计变化量，而不是合计值。返回的属性为：" + statDescriptions

  $("#promptPreview").text(prompt);
}

// 更新提示词预览（在数据变化时调用）
function updatePromptPreview() {
  generatePromptPreview();
}

// 更新主页面总结提示词中的状态监控部分
function updateMainPromptWithStats() {
  // 生成提示词内容
  const generatedPrompt = $("#promptPreview").text();

  // 如果有生成的提示词，添加到主页面总结提示词的最下方
  if (generatedPrompt && generatedPrompt.trim()) {
    const currentPrompt = $("#smart_memory_prompt").val();

    // 检查是否已经包含了状态提示词（避免重复添加）
    const statusPromptMarker = "\n\n=== 状态监控提示词 ===\n";

    let newPrompt = currentPrompt;

    // 如果已经存在状态监控提示词，先移除旧的
    const markerIndex = newPrompt.indexOf(statusPromptMarker);
    if (markerIndex !== -1) {
      newPrompt = newPrompt.substring(0, markerIndex);
    }

    // 添加新的状态监控提示词
    newPrompt += statusPromptMarker + generatedPrompt;

    // 更新主页面的总结提示词
    $("#smart_memory_prompt").val(newPrompt);

    // 保存到设置中
    extension_settings[extensionName].promptTemplate = newPrompt;

    console.log('已将状态监控提示词添加到总结提示词中:', generatedPrompt);
    return true;
  }
  return false;
}

// 切换状态面板展开/收起
function toggleStatPanel(index) {
  const content = $(`#statPanel_${index}`);
  const toggle = $(`.stat-panel[data-index="${index}"] .stat-panel-toggle`);

  if (content.hasClass('expanded')) {
    content.removeClass('expanded').slideUp(200);
    toggle.removeClass('expanded');
  } else {
    content.addClass('expanded').slideDown(200);
    toggle.addClass('expanded');
  }
}

// 添加新状态
function addStat() {
  const newStat = {
    statName: "新状态",
    prompt: "状态描述",
    tier: [
      {
        name: "默认等级",
        from: 0,
        to: 100,
        prompt: "默认等级描述"
      }
    ]
  };

  statsData.states.push(newStat);

  // 同步角色状态（新增状态会在syncAvatarStatsWithConfig中自动处理）
  syncAvatarStatsWithConfig();

  // 如果角色管理弹层已打开，更新角色表格显示
  if ($("#avatarManagerModal").is(':visible')) {
    // 这里需要调用角色管理模块的函数，但由于循环依赖问题，我们通过事件通知
    $(document).trigger('avatarManagerRefresh');
  }

  renderStatsContainer();
  bindStatEvents();
  updatePromptPreview();

  // 自动展开新添加的状态
  const newIndex = statsData.states.length - 1;
  setTimeout(() => toggleStatPanel(newIndex), 100);
}

// 删除状态
function deleteStat(index) {
  if (confirm('确定要删除这个状态吗？')) {
    statsData.states.splice(index, 1);

    // 同步角色状态（删除状态会在syncAvatarStatsWithConfig中自动处理）
    syncAvatarStatsWithConfig();

    // 如果角色管理弹层已打开，更新角色表格显示
    if ($("#avatarManagerModal").is(':visible')) {
      // 这里需要调用角色管理模块的函数，但由于循环依赖问题，我们通过事件通知
      $(document).trigger('avatarManagerRefresh');
    }

    renderStatsContainer();
    bindStatEvents();
    updatePromptPreview();
  }
}

// 添加tier
function addTier(statIndex) {
  const newTier = {
    name: "新等级",
    from: 0,
    to: 100,
    prompt: "等级描述"
  };

  statsData.states[statIndex].tier.push(newTier);

  // 重新渲染该状态的tier列表
  const tierList = $(`#tierList_${statIndex}`);
  tierList.html(renderTierList(statsData.states[statIndex].tier, statIndex));
}

// 删除tier
function deleteTier(statIndex, tierIndex) {
  if (confirm('确定要删除这个等级吗？')) {
    statsData.states[statIndex].tier.splice(tierIndex, 1);

    // 重新渲染该状态的tier列表
    const tierList = $(`#tierList_${statIndex}`);
    tierList.html(renderTierList(statsData.states[statIndex].tier, statIndex));
  }
}

// 更新状态名称
function updateStatName(index, value) {
  const oldStatName = statsData.states[index].statName;
  const newStatName = value;

  // 如果名称有变化，同步角色数据中的状态键名
  if (oldStatName && newStatName && oldStatName !== newStatName) {
    syncAvatarStatNames(oldStatName, newStatName);

    // 如果角色管理弹层已打开，更新角色表格显示
    if ($("#avatarManagerModal").is(':visible')) {
      $(document).trigger('avatarManagerRefresh');
    }
  }

  statsData.states[index].statName = value;
  // 更新面板标题
  $(`.stat-panel[data-index="${index}"] .stat-panel-title`).text(value || '未命名状态');
  updatePromptPreview();
}

// 更新状态描述
function updateStatPrompt(index, value) {
  statsData.states[index].prompt = value;
  updatePromptPreview();
}

// 更新tier名称
function updateTierName(statIndex, tierIndex, value) {
  statsData.states[statIndex].tier[tierIndex].name = value;
  // 更新tier标题
  $(`.stat-panel[data-index="${statIndex}"] .tier-item[data-tier-index="${tierIndex}"] .tier-item-title`)
    .text(value || '未命名等级');
}

// 更新tier最小值
function updateTierFrom(statIndex, tierIndex, value) {
  statsData.states[statIndex].tier[tierIndex].from = parseInt(value) || 0;
}

// 更新tier最大值
function updateTierTo(statIndex, tierIndex, value) {
  statsData.states[statIndex].tier[tierIndex].to = parseInt(value) || 0;
}

// 更新tier描述
function updateTierPrompt(statIndex, tierIndex, value) {
  statsData.states[statIndex].tier[tierIndex].prompt = value;
}

// 保存状态数据
function saveStatsData() {
  extension_settings[extensionName].statsData = JSON.parse(JSON.stringify(statsData));

  // 同步所有角色的状态值与当前配置
  syncAvatarStatsWithConfig();

  // 如果角色管理弹层已打开，更新角色表格显示
  if ($("#avatarManagerModal").is(':visible')) {
    $(document).trigger('avatarManagerRefresh');
  }

  // 更新主页面总结提示词中的状态监控部分
  const promptUpdated = updateMainPromptWithStats();

  saveSettingsDebounced();

  const message = promptUpdated ? '状态配置已保存，提示词已更新，角色状态已同步' : '状态配置已保存，角色状态已同步';
  toastr.success(message, '状态管理');
  console.log('状态数据已保存:', statsData);
}

// 恢复默认数据
function loadDefaultStats() {
  if (confirm('确定要恢复默认配置吗？这将覆盖当前所有设置。')) {
    statsData = {
      states: [
        {
          statName: "生命值",
          prompt: "角色的生命力",
          tier: [
            {
              name: "垂死",
              from: -999,
              to: -100,
              prompt: "再接受一次攻击就会死亡"
            },
            {
              name: "重伤",
              from: -100,
              to: 0,
              prompt: "无法动弹"
            }
          ]
        },
        {
          statName: "法力值",
          prompt: "角色的发力",
          tier: [
            {
              name: "枯竭",
              from: -999,
              to: 0,
              prompt: "没有任何发力"
            },
            {
              name: "正常",
              from: 0,
              to: 100,
              prompt: "正常"
            }
          ]
        }
      ]
    };

    // 同步角色状态
    syncAvatarStatsWithConfig();

    // 如果角色管理弹层已打开，更新角色表格显示
    if ($("#avatarManagerModal").is(':visible')) {
      $(document).trigger('avatarManagerRefresh');
    }

    renderStatsContainer();
    bindStatEvents();
    updatePromptPreview();

    // 更新主页面总结提示词中的状态监控部分
    updateMainPromptWithStats();

    toastr.success('已恢复默认配置，角色状态已同步', '状态管理');
  }
}

// 将这些函数设为全局函数，以便HTML中的onclick能访问到
window['toggleStatPanel'] = toggleStatPanel;
window['deleteStat'] = deleteStat;
window['addTier'] = addTier;
window['deleteTier'] = deleteTier;
window['updateStatName'] = updateStatName;
window['updateStatPrompt'] = updateStatPrompt;
window['updateTierName'] = updateTierName;
window['updateTierFrom'] = updateTierFrom;
window['updateTierTo'] = updateTierTo;
window['updateTierPrompt'] = updateTierPrompt;

// ===== 状态解析和更新功能 =====

// 解析总结内容中的状态数据并更新角色状态
export function parseAndUpdateAvatarStats(summaryContent) {
  try {
    console.log('状态解析: 开始解析总结内容中的状态数据');

    // 使用正则表达式提取<数据统计>标签中的内容
    const regex = /<数据统计>`(.+?)`<\/数据统计>/s;
    const match = summaryContent.match(regex);

    if (!match || !match[1]) {
      console.log('状态解析: 未找到数据统计标签或内容为空');
      return summaryContent; // 返回原始内容
    }

    const jsonString = match[1].trim();
    console.log('状态解析: 提取的JSON字符串:', jsonString);

    // 解析JSON数据
    let statsUpdates;
    try {
      statsUpdates = JSON.parse(jsonString);
    } catch (jsonError) {
      console.error('状态解析: JSON解析失败:', jsonError);
      console.error('状态解析: 原始JSON字符串:', jsonString);
      return summaryContent; // 返回原始内容
    }

    if (!Array.isArray(statsUpdates)) {
      console.error('状态解析: 解析的数据不是数组格式');
      return summaryContent; // 返回原始内容
    }

    console.log('状态解析: 成功解析状态更新数据:', statsUpdates);

    // 更新角色状态
    let updatedCount = 0;
    const updatedAvatars = []; // 记录更新的角色信息

    statsUpdates.forEach(update => {
      const characterName = update.角色名 || update.角色 || update.name;
      if (!characterName) {
        console.warn('状态解析: 跳过无角色名的更新项:', update);
        return;
      }

      // 查找对应的角色
      const avatarsData = getAvatarsData();
      const avatar = avatarsData.find(a =>
        a.name === characterName ||
        a.otherName === characterName ||
        (a.otherName && a.otherName.includes(characterName)) ||
        (a.name && a.name.includes(characterName))
      );

      if (!avatar) {
        console.warn(`状态解析: 未找到角色 "${characterName}"`);
        return;
      }

      console.log(`状态解析: 正在更新角色 "${avatar.name}" 的状态`);

      // 更新状态值（累加变化量）
      let hasUpdates = false;
      Object.entries(update).forEach(([key, value]) => {
        // 跳过角色名字段
        if (key === '角色名' || key === '角色' || key === 'name') {
          return;
        }

        // 提取状态名称（去掉"变化"后缀）
        const statName = key.replace(/变化$/, '');

        // 检查这个状态是否在配置中
        const isConfiguredStat = statsData && statsData.states &&
          statsData.states.some(stat => stat.statName === statName);

        if (!isConfiguredStat) {
          console.warn(`状态解析: 状态 "${statName}" 不在当前配置中，跳过`);
          return;
        }

        const changeValue = parseInt(value) || 0;
        if (changeValue === 0) {
          return; // 跳过无变化的状态
        }

        // 确保角色有stats对象
        if (!avatar.stats) {
          avatar.stats = {};
        }

        // 累加状态变化
        const currentValue = avatar.stats[statName] || 0;
        const newValue = currentValue + changeValue;
        avatar.stats[statName] = newValue;

        console.log(`状态解析: 角色 "${avatar.name}" 的 "${statName}" 从 ${currentValue} 变化 ${changeValue} 到 ${newValue}`);
        hasUpdates = true;
      });

      if (hasUpdates) {
        updatedCount++;
        updatedAvatars.push(avatar);
      }
    });

    if (updatedCount > 0) {
      console.log(`状态解析: 成功更新了 ${updatedCount} 个角色的状态`);

      // 保存更新后的角色数据
      updateAvatarsData(avatarsData);
      extension_settings[extensionName].avatarsData = JSON.parse(JSON.stringify(avatarsData));
      saveSettingsDebounced();

      // 如果角色管理弹层打开，更新显示
      if ($("#avatarManagerModal").is(':visible')) {
        $(document).trigger('avatarManagerRefresh');
      }

      // 显示详细的状态更新信息
      showStatsUpdateNotification(statsUpdates, updatedCount);

    } else {
      console.log('状态解析: 没有角色状态需要更新');
    }

    // 生成角色当前状态标签内容并替换<数据统计>标签
    // 如果没有更新的角色，尝试从JSON中获取所有相关角色
    let allRelevantAvatars = updatedAvatars;
    if (allRelevantAvatars.length === 0) {
      // 从JSON更新数据中获取角色名，尝试匹配现有角色
      allRelevantAvatars = statsUpdates.map(update => {
        const characterName = update.角色名 || update.角色 || update.name;
        const avatarsData = getAvatarsData();
        return avatarsData.find(a =>
          a.name === characterName ||
          a.otherName === characterName ||
          (a.otherName && a.otherName.includes(characterName)) ||
          (a.name && a.name.includes(characterName))
        );
      }).filter(Boolean);
    }

    const currentStatusContent = generateCurrentStatusContent(allRelevantAvatars);
    const newSummaryContent = summaryContent.replace(regex, `<角色当前状态>${currentStatusContent}</角色当前状态>`);

    console.log('状态解析: 已将<数据统计>标签替换为<角色当前状态>标签');
    return newSummaryContent;

  } catch (error) {
    console.error('状态解析: 解析过程发生错误:', error);
    return summaryContent; // 返回原始内容
  }
}

// 生成角色当前状态内容
function generateCurrentStatusContent(updatedAvatars) {
  if (!updatedAvatars || updatedAvatars.length === 0) {
    return '';
  }

  const statusDescriptions = updatedAvatars.map(avatar => {
    const statusTexts = [];

    // 遍历角色的所有状态
    if (avatar.stats) {
      Object.entries(avatar.stats).forEach(([statName, statValue]) => {
        // 查找对应的状态配置
        const statConfig = statsData?.states?.find(s => s.statName === statName);

        if (!statConfig || !statConfig.tier || statConfig.tier.length === 0) {
          return; // 没有配置，跳过
        }

        // 根据数值查找对应的tier
        const matchingTier = statConfig.tier.find(tier => {
          const fromValue = parseInt(tier.from) || -999;
          const toValue = parseInt(tier.to) || 999;
          return statValue >= fromValue && statValue <= toValue;
        });

        if (matchingTier && matchingTier.prompt) {
          statusTexts.push(matchingTier.prompt);
        }
      });
    }

    // 如果有状态描述，返回角色名:状态描述列表
    if (statusTexts.length > 0) {
      return `${avatar.name}:${statusTexts.join(',')}`;
    } else {
      return null;
    }
  }).filter(Boolean); // 过滤掉空值

  // 用换行符连接多个角色
  return statusDescriptions.join('\n');
}

// 显示状态更新通知
function showStatsUpdateNotification(statsUpdates, updatedCount) {
  // 构建更新详情消息
  const updateDetails = statsUpdates.map(update => {
    const characterName = update.角色名 || update.角色 || update.name;
    if (!characterName) return null;

    // 查找对应的角色
    const avatarsData = getAvatarsData();
    const avatar = avatarsData.find(a =>
      a.name === characterName ||
      a.otherName === characterName ||
      (a.otherName && a.otherName.includes(characterName)) ||
      (a.name && a.name.includes(characterName))
    );

    if (!avatar) return null;

    // 收集有变化的状态
    const changes = [];
    Object.entries(update).forEach(([key, value]) => {
      if (key === '角色名' || key === '角色' || key === 'name') return;

      const changeValue = parseInt(value) || 0;
      if (changeValue !== 0) {
        const statName = key.replace(/变化$/, '');
        changes.push(`${statName}${changeValue > 0 ? '+' : ''}${changeValue}`);
      }
    });

    return changes.length > 0 ? `${avatar.name}: ${changes.join(', ')}` : null;
  }).filter(Boolean);

  if (updateDetails.length > 0) {
    const message = `已更新 ${updatedCount} 个角色状态:\n${updateDetails.join('\n')}`;
    toastr.success(message, '状态统计', {
      timeOut: 5000,
      extendedTimeOut: 2000
    });
  }
}

// ===== 状态同步功能 =====

// 同步所有角色的状态值与当前配置
function syncAvatarStatsWithConfig() {
  const avatarsData = getAvatarsData();
  if (!avatarsData || avatarsData.length === 0) {
    console.log('角色管理: 没有角色数据需要同步');
    return;
  }

  // 获取当前状态配置
  let currentStatsData = statsData;
  if (!currentStatsData || !currentStatsData.states) {
    currentStatsData = extension_settings[extensionName]?.statsData;
  }

  if (!currentStatsData || !currentStatsData.states) {
    console.log('角色管理: 没有状态配置，清空所有角色状态');
    avatarsData.forEach(avatar => {
      avatar.stats = {};
    });
    updateAvatarsData(avatarsData);
    return;
  }

  // 获取当前配置的所有状态名称
  const configuredStatNames = currentStatsData.states.map(stat => stat.statName);

  console.log('角色管理: 开始同步角色状态，配置的状态:', configuredStatNames);

  // 遍历每个角色，同步其状态
  avatarsData.forEach(avatar => {
    if (!avatar.stats) {
      avatar.stats = {};
    }

    const oldStats = { ...avatar.stats };
    const newStats = {};

    // 添加配置中存在的状态（保持原有值或设为默认值）
    configuredStatNames.forEach(statName => {
      if (oldStats.hasOwnProperty(statName)) {
        // 保持原有值
        newStats[statName] = oldStats[statName];
      } else {
        // 新增状态，默认为0
        newStats[statName] = 0;
      }
    });

    // 记录变化
    const removedStats = Object.keys(oldStats).filter(key => !configuredStatNames.includes(key));
    const addedStats = configuredStatNames.filter(key => !oldStats.hasOwnProperty(key));

    if (removedStats.length > 0 || addedStats.length > 0) {
      console.log(`角色管理: 角色"${avatar.name}"状态同步:`, {
        删除: removedStats,
        新增: addedStats
      });
    }

    avatar.stats = newStats;
  });

  updateAvatarsData(avatarsData);
  console.log('角色管理: 状态同步完成');
}

// 同步单个角色状态名称的变化（用于状态重命名）
function syncAvatarStatNames(oldStatName, newStatName) {
  const avatarsData = getAvatarsData();
  if (!avatarsData || avatarsData.length === 0) {
    return;
  }

  console.log(`角色管理: 同步状态名称变化: "${oldStatName}" -> "${newStatName}"`);

  let hasChanges = false;
  avatarsData.forEach(avatar => {
    if (avatar.stats && avatar.stats.hasOwnProperty(oldStatName)) {
      // 保存旧值
      const oldValue = avatar.stats[oldStatName];
      // 删除旧键
      delete avatar.stats[oldStatName];
      // 添加新键
      avatar.stats[newStatName] = oldValue;

      console.log(`角色管理: 角色"${avatar.name}"的状态"${oldStatName}"已重命名为"${newStatName}"`);
      hasChanges = true;
    }
  });

  if (hasChanges) {
    updateAvatarsData(avatarsData);
  }
}

// 测试状态解析功能（开发调试用）
export function testStatsParsingFeature() {
  const testSummary = `查线路无果，邀"你"今晚一起去变电站查看，称异常时附近有穿白色工装的人出现。
<数据统计>\`[{"角色名": "张大力","生命值变化": -110,"法力值变化": 5},{"角色名": "李佳","生命值变化": 0,"法力值变化": -30}]\`</数据统计>`;

  console.log('=== 开始测试状态解析功能 ===');
  const result = parseAndUpdateAvatarStats(testSummary);
  console.log('=== 状态解析功能测试完成 ===');
  console.log('处理后的总结内容:', result);

  return result;
}

// 将测试函数暴露到全局作用域，方便调试
window['testStatsParsingFeature'] = testStatsParsingFeature;