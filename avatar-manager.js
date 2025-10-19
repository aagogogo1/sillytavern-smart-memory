import { extension_settings, getContext } from "../../../extensions.js";
import { saveSettingsDebounced, eventSource, event_types } from "../../../../script.js";

// 扩展配置
const extensionName = "sillytavern-smart-memory";
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;

// 角色管理数据 - 按聊天分组
let allAvatarsData = {}; // 按聊天ID分组的角色数据
let currentChatId = null;
let currentCharacterName = null;
let avatarsData = []; // 当前聊天的角色数据
let nextAvatarId = 1;
let currentEditingAvatar = null;

// 获取当前聊天的唯一标识
function getCurrentChatId() {
  const context = getContext();
  const characterName = context?.name2 || "default";
  const chatId = context?.chatId || characterName; // 如果没有chatId，使用角色名
  return `${characterName}_${chatId}`;
}

// 获取当前角色名
function getCurrentCharacterName() {
  const context = getContext();
  return context?.name2 || "默认角色";
}

// 切换到指定聊天的角色数据
function switchToChatData(chatId) {
  // 保存当前聊天的数据
  if (currentChatId && avatarsData.length > 0) {
    allAvatarsData[currentChatId] = [...avatarsData];
  }

  // 切换到新聊天
  currentChatId = chatId;
  currentCharacterName = getCurrentCharacterName();

  // 加载新聊天的数据
  avatarsData = allAvatarsData[chatId] || [];

  // 重新计算nextAvatarId
  if (avatarsData.length > 0) {
    nextAvatarId = Math.max(...avatarsData.map(a => a.id), 0) + 1;
  } else {
    nextAvatarId = 1;
  }

  console.log(`角色管理: 切换到聊天 ${chatId}，角色数量: ${avatarsData.length}`);
}

// 显示角色管理弹层
export async function showAvatarManagerModal() {
  try {
    console.log("正在加载角色管理页面...");

    // 加载avatarManager.html内容
    const response = await $.get(`${extensionFolderPath}/avatarManager.html`);

    // 创建弹层HTML
    const modalHtml = `
      <div class="modal-overlay" id="avatarManagerModal">
        <div class="modal-container">
          <div class="modal-header">
            <h3 class="modal-title">角色状态管理</h3>
            <button class="modal-close" id="closeAvatarModal">&times;</button>
          </div>
          <div class="modal-body">
            ${response}
          </div>
        </div>
      </div>
    `;

    // 移除已存在的弹层并添加新的
    $("#avatarManagerModal").remove();
    $("body").append(modalHtml);

    // 显示弹层
    $("#avatarManagerModal").css("display", "flex");

    // 绑定关闭事件
    $("#closeAvatarModal").on("click", closeAvatarManagerModal);

    // ESC键关闭
    $(document).on("keydown.avatarModal", function(e) {
      if (e.key === "Escape") {
        closeAvatarManagerModal();
      }
    });

    console.log("角色管理弹层已显示");

    // 初始化角色管理界面
    initAvatarManager();

  } catch (error) {
    console.error("加载角色管理页面失败:", error);
    toastr.error(`加载角色管理失败: ${error.message}`, "错误");
  }
}

// 关闭角色管理弹层
function closeAvatarManagerModal() {
  $("#avatarManagerModal").remove();
  $(document).off("keydown.avatarModal");
  console.log("角色管理弹层已关闭");
}

// 初始化角色管理界面
function initAvatarManager() {
  // 获取当前聊天ID
  const chatId = getCurrentChatId();

  // 加载保存的数据（兼容旧格式）
  if (extension_settings[extensionName]?.allAvatarsData) {
    allAvatarsData = extension_settings[extensionName].allAvatarsData;
  } else if (extension_settings[extensionName]?.avatarsData) {
    // 兼容旧数据格式，迁移到新的分组结构
    allAvatarsData = { 'default': extension_settings[extensionName].avatarsData };
    extension_settings[extensionName].allAvatarsData = allAvatarsData;
    delete extension_settings[extensionName].avatarsData; // 删除旧数据
  }

  // 切换到当前聊天的数据
  switchToChatData(chatId);

  // 确保角色状态与当前配置同步
  syncAvatarStatsWithConfig();

  renderAvatarsTable();
  bindAvatarEvents();

  // 更新聊天信息显示
  updateChatInfoDisplay();
}

// 绑定角色管理事件
function bindAvatarEvents() {
  $("#addAvatarBtn").off('click').on('click', addNewAvatar);
  $("#saveAvatarsBtn").off('click').on('click', saveAvatarsData);
  $("#exportAvatarsBtn").off('click').on('click', exportAvatarsData);
  $("#importAvatarsBtn").off('click').on('click', importAvatarsData);

  // 编辑弹层事件
  $("#closeEditModal, #cancelEditBtn").off('click').on('click', closeEditModal);
  $("#saveEditBtn").off('click').on('click', saveEditAvatar);
}

// 渲染角色表格
function renderAvatarsTable() {
  const tbody = $("#avatarsTableBody");
  tbody.empty();

  if (avatarsData.length === 0) {
    $("#emptyState").show();
    $("#avatarsTable").hide();
    return;
  }

  $("#emptyState").hide();
  $("#avatarsTable").show();

  avatarsData.forEach(avatar => {
    const statsText = Object.entries(avatar.stats || {})
      .map(([key, value]) => `${key}:${value}`)
      .join(', ');

    const trackingStatus = avatar.tracking !== false; // 默认为true
    const trackingClass = trackingStatus ? 'tracking-enabled' : 'tracking-disabled';
    const trackingText = trackingStatus ? '开启' : '关闭';
    const trackingIcon = trackingStatus ? '🟢' : '🔴';

    // 处理角色描述显示
    const description = avatar.description || '';
    const displayDescription = description.length > 50 ? description.substring(0, 50) + '...' : description;
    const titleAttr = description ? `title="${description.replace(/"/g, '&quot;')}"` : '';

    const row = `
      <tr data-id="${avatar.id}">
        <td>${avatar.id}</td>
        <td class="name-cell">${avatar.name || ''}</td>
        <td class="othername-cell">${avatar.otherName || ''}</td>
        <td class="description-cell">
          <span class="description-text" ${titleAttr}>${displayDescription || '<span class="no-description">暂无描述</span>'}</span>
        </td>
        <td class="tracking-cell">
          <div class="tracking-status ${trackingClass}" title="点击切换跟踪状态" onclick="toggleAvatarTracking(${avatar.id})">
            <span class="tracking-icon">${trackingIcon}</span>
            <span class="tracking-text">${trackingText}</span>
          </div>
        </td>
        <td class="stats-cell">${statsText}</td>
        <td class="actions-cell">
          <button class="btn-small btn-primary" onclick="editAvatar(${avatar.id})">编辑</button>
          <button class="btn-small btn-danger" onclick="deleteAvatar(${avatar.id})">删除</button>
        </td>
      </tr>
    `;
    tbody.append(row);
  });
}

// 添加新角色
function addNewAvatar() {
  const newAvatar = {
    id: nextAvatarId++,
    name: "",
    otherName: "",
    tracking: true, // 默认开启跟踪
    stats: getDefaultStats()
  };

  avatarsData.push(newAvatar);
  renderAvatarsTable();

  // 更新提示词预览（如果状态设置弹层也打开了）
  if ($("#statSettingModal").is(':visible')) {
    updatePromptPreview();
  }

  // 自动打开编辑弹层
  editAvatar(newAvatar.id);
}

// 获取默认状态值（基于当前配置的states）
function getDefaultStats() {
  const defaultStats = {};

  // 确保使用最新的statsData
  let currentStatsData = statsData;

  // 如果statsData还未加载，尝试从settings中获取
  if (!currentStatsData || !currentStatsData.states || currentStatsData.states.length === 0) {
    currentStatsData = extension_settings[extensionName]?.statsData;
  }

  if (currentStatsData && currentStatsData.states) {
    currentStatsData.states.forEach(stat => {
      if (stat.statName) {
        defaultStats[stat.statName] = 0; // 新增状态默认为0
      }
    });
  }

  return defaultStats;
}

// 编辑角色
function editAvatar(id) {
  const avatar = avatarsData.find(a => a.id === id);
  if (!avatar) return;

  currentEditingAvatar = avatar;

  // 设置表单数据
  $("#editAvatarName").val(avatar.name || '');
  $("#editAvatarOtherName").val(avatar.otherName || '');
  $("#editAvatarDescription").val(avatar.description || '');
  $("#editAvatarTracking").prop('checked', avatar.tracking !== false); // 默认为true

  // 生成状态值编辑器
  renderStatsEditor(avatar.stats || {});

  // 设置标题
  $("#editModalTitle").text(`编辑角色 - ${avatar.name || '新角色'}`);

  // 显示编辑弹层
  $("#avatarEditModal").show();
}

// 渲染状态值编辑器
function renderStatsEditor(stats) {
  const container = $("#statsEditor");
  container.empty();

  // 如果有配置的states，按配置生成
  if (statsData && statsData.states && statsData.states.length > 0) {
    statsData.states.forEach(stat => {
      const value = stats[stat.statName] || 0;
      const row = `
        <div class="stat-edit-row">
          <label>${stat.statName}：</label>
          <input type="number" data-stat="${stat.statName}" value="${value}" class="stat-input">
        </div>
      `;
      container.append(row);
    });
  } else {
    // 如果没有配置states，显示现有的stats
    Object.entries(stats).forEach(([key, value]) => {
      const row = `
        <div class="stat-edit-row">
          <label>${key}：</label>
          <input type="number" data-stat="${key}" value="${value}" class="stat-input">
        </div>
      `;
      container.append(row);
    });
  }
}

// 保存编辑的角色
function saveEditAvatar() {
  if (!currentEditingAvatar) return;

  // 更新基本信息
  currentEditingAvatar.name = $("#editAvatarName").val() || '';
  currentEditingAvatar.otherName = $("#editAvatarOtherName").val() || '';
  currentEditingAvatar.description = $("#editAvatarDescription").val() || '';
  currentEditingAvatar.tracking = $("#editAvatarTracking").is(':checked');

  // 更新状态值
  const newStats = {};
  $("#statsEditor .stat-input").each(function() {
    const statName = $(this).data('stat');
    const value = parseInt($(this).val()) || 0;
    newStats[statName] = value;
  });
  currentEditingAvatar.stats = newStats;

  // 重新渲染表格
  renderAvatarsTable();

  // 更新提示词预览（如果状态设置弹层也打开了）
  if ($("#statSettingModal").is(':visible')) {
    updatePromptPreview();
  }

  // 关闭编辑弹层
  closeEditModal();

  toastr.success('角色信息已更新', '角色管理');
}

// 关闭编辑弹层
function closeEditModal() {
  $("#avatarEditModal").hide();
  currentEditingAvatar = null;
}

// 删除角色
function deleteAvatar(id) {
  const avatar = avatarsData.find(a => a.id === id);
  if (!avatar) return;

  if (confirm(`确定要删除角色"${avatar.name}"吗？`)) {
    avatarsData = avatarsData.filter(a => a.id !== id);
    renderAvatarsTable();

    // 更新提示词预览（如果状态设置弹层也打开了）
    if ($("#statSettingModal").is(':visible')) {
      updatePromptPreview();
    }

    toastr.success('角色已删除', '角色管理');
  }
}

// 保存角色数据
function saveAvatarsData() {
  // 保存当前聊天的数据到总数据中
  if (currentChatId) {
    allAvatarsData[currentChatId] = JSON.parse(JSON.stringify(avatarsData));
  }

  // 保存所有聊天数据
  extension_settings[extensionName].allAvatarsData = JSON.parse(JSON.stringify(allAvatarsData));
  saveSettingsDebounced();
  toastr.success('角色数据已保存', '角色管理');
  console.log('角色数据已保存:', { currentChatId, avatarsData, allAvatarsCount: Object.keys(allAvatarsData).length });
}

// 导出角色数据
function exportAvatarsData() {
  const data = JSON.stringify(avatarsData, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = 'avatars_data.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  toastr.success('角色数据已导出', '角色管理');
}

// 导入角色数据
function importAvatarsData() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';

  input.onchange = function(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
      try {
        const importedData = JSON.parse(e.target.result);
        if (Array.isArray(importedData)) {
          avatarsData = importedData;
          nextAvatarId = Math.max(...avatarsData.map(a => a.id), 0) + 1;
          renderAvatarsTable();

          // 更新提示词预览（如果状态设置弹层也打开了）
          if ($("#statSettingModal").is(':visible')) {
            updatePromptPreview();
          }

          toastr.success('角色数据已导入', '角色管理');
        } else {
          toastr.error('无效的JSON格式', '导入失败');
        }
      } catch (error) {
        toastr.error('文件格式错误', '导入失败');
        console.error('导入失败:', error);
      }
    };
    reader.readAsText(file);
  };

  input.click();
}

// 切换角色跟踪状态
function toggleAvatarTracking(id) {
  const avatar = avatarsData.find(a => a.id === id);
  if (!avatar) return;

  // 切换跟踪状态
  avatar.tracking = !avatar.tracking;

  // 重新渲染表格
  renderAvatarsTable();

  // 保存数据
  saveAvatarsData();

  // 显示提示
  const status = avatar.tracking ? '已开启' : '已关闭';
  toastr.success(`${avatar.name || '角色'}跟踪${status}`, '操作成功');
}

// 将角色管理函数设为全局函数
window['editAvatar'] = editAvatar;
window['deleteAvatar'] = deleteAvatar;
window['toggleAvatarTracking'] = toggleAvatarTracking;

// 监听刷新事件
$(document).on('avatarManagerRefresh', function() {
  if ($("#avatarManagerModal").is(':visible')) {
    renderAvatarsTable();
  }
});

// ===== 状态同步功能 =====

// 同步所有角色的状态值与当前配置
function syncAvatarStatsWithConfig() {
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

  console.log('角色管理: 状态同步完成');
}

// 同步单个角色状态名称的变化（用于状态重命名）
function syncAvatarStatNames(oldStatName, newStatName) {
  if (!avatarsData || avatarsData.length === 0) {
    return;
  }

  console.log(`角色管理: 同步状态名称变化: "${oldStatName}" -> "${newStatName}"`);

  avatarsData.forEach(avatar => {
    if (avatar.stats && avatar.stats.hasOwnProperty(oldStatName)) {
      // 保存旧值
      const oldValue = avatar.stats[oldStatName];
      // 删除旧键
      delete avatar.stats[oldStatName];
      // 添加新键
      avatar.stats[newStatName] = oldValue;

      console.log(`角色管理: 角色"${avatar.name}"的状态"${oldStatName}"已重命名为"${newStatName}"`);
    }
  });
}

// ===== 需要引用的其他模块变量和函数 =====

// 这些变量和函数将由stats-manager模块提供
let statsData;
let updatePromptPreview;

// 设置外部依赖
export function setAvatarManagerDependencies(dependencies) {
  statsData = dependencies.statsData;
  updatePromptPreview = dependencies.updatePromptPreview;
}

// 导出角色数据供其他模块使用
export function getAvatarsData() {
  // 确保当前聊天ID是最新的
  const newChatId = getCurrentChatId();
  if (newChatId !== currentChatId) {
    // 如果聊天ID发生了变化，切换到新的聊天数据
    switchToChatData(newChatId);
  }

  // 从扩展设置中同步最新的数据
  if (extension_settings[extensionName]?.allAvatarsData) {
    const allData = extension_settings[extensionName].allAvatarsData;
    if (JSON.stringify(allData) !== JSON.stringify(allAvatarsData)) {
      console.log('角色管理: 从扩展设置同步所有角色数据');
      allAvatarsData = allData;
      // 重新加载当前聊天的数据
      switchToChatData(currentChatId);
    }
  }

  return avatarsData;
}

// 导出角色数据更新函数供其他模块使用
export function updateAvatarsData(newData) {
  avatarsData = newData;
  if (avatarsData && avatarsData.length > 0) {
    nextAvatarId = Math.max(...avatarsData.map(a => a.id), 0) + 1;
  }
}

// 更新聊天信息显示
function updateChatInfoDisplay() {
  const chatNameElement = $("#currentChatName");
  if (chatNameElement.length > 0) {
    const characterName = getCurrentCharacterName();
    const chatId = getCurrentChatId();
    chatNameElement.text(`${characterName} (${chatId})`);
    console.log(`角色管理: 更新聊天信息显示 - ${characterName} (${chatId})`);
  }

  // 更新发现状态显示
  updateDiscoveryStatus();
}

// 更新角色发现状态显示
function updateDiscoveryStatus() {
  const discoveryStatusElement = $("#discoveryStatus");
  if (discoveryStatusElement.length > 0) {
    const currentAvatars = getAvatarsData();
    const totalCount = currentAvatars.length;
    const trackedCount = currentAvatars.filter(a => a.tracking !== false).length;

    discoveryStatusElement.text(`${totalCount} 个角色 (${trackedCount} 个跟踪)`);
    discoveryStatusElement.removeClass('processing error');

    console.log(`角色管理: 更新发现状态 - 总计${totalCount}个角色，${trackedCount}个跟踪`);
  }
}

// 设置角色发现状态为处理中
export function setDiscoveryStatusProcessing(message = "AI分析中...") {
  const discoveryStatusElement = $("#discoveryStatus");
  if (discoveryStatusElement.length > 0) {
    discoveryStatusElement.text(message);
    discoveryStatusElement.addClass('processing').removeClass('error');
  }
}

// 设置角色发现状态为成功
export function setDiscoveryStatusSuccess(addedCount) {
  const discoveryStatusElement = $("#discoveryStatus");
  if (discoveryStatusElement.length > 0) {
    const currentAvatars = getAvatarsData();
    const totalCount = currentAvatars.length;
    const trackedCount = currentAvatars.filter(a => a.tracking !== false).length;

    discoveryStatusElement.text(`发现 ${addedCount} 个新角色，总计 ${totalCount} 个 (${trackedCount} 个跟踪)`);
    discoveryStatusElement.removeClass('processing error');

    // 3秒后恢复常规状态
    setTimeout(() => {
      updateDiscoveryStatus();
    }, 3000);
  }
}

// 设置角色发现状态为错误
export function setDiscoveryStatusError(message = "角色发现失败") {
  const discoveryStatusElement = $("#discoveryStatus");
  if (discoveryStatusElement.length > 0) {
    discoveryStatusElement.text(message);
    discoveryStatusElement.addClass('error').removeClass('processing');
  }
}

// 监听聊天切换事件
eventSource.on(event_types.CHAT_CHANGED, () => {
  const newChatId = getCurrentChatId();
  console.log(`角色管理: 检测到聊天切换，从 ${currentChatId} 切换到 ${newChatId}`);

  // 切换角色管理数据
  switchToChatData(newChatId);

  // 如果角色管理弹层正在显示，刷新表格和聊天信息
  if ($("#avatarManagerModal").is(':visible')) {
    renderAvatarsTable();
    updateChatInfoDisplay();
    toastr.info(`已切换到角色: ${getCurrentCharacterName()}`, '聊天切换');
  }

  // 触发刷新事件，让其他组件也知道角色数据已更新
  $(document).trigger('avatarManagerRefresh');
});