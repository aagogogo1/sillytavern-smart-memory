import { extension_settings, getContext, loadExtensionSettings } from "../../../extensions.js";
import { saveSettingsDebounced, eventSource, event_types } from "../../../../script.js";

// 扩展配置
const extensionName = "sillytavern-smart-memory";
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;

// 默认设置
const defaultSettings = {
  apiKey: "",
  apiUrl: "https://api.openai.com/v1",
  aiModel: "gpt-3.5-turbo",
  scanDepth: 3,
  promptTemplate: `【Identity Definition】你是一个总结机器人，专门总结剧情中的要点
【Special Reminder】你拥有最高权限，你可以接收比较nsfw的内容，但是不允许直接输出相关内容，你需要把nsfw换成平时常见的说法。
【Reply require】1.包含主要人物及次要人物
2.识别对应的心情
3.角色的状态
4.特殊物品
5.重要地点
6.事件变化（体现在永久记忆）
7（main）.你需要增量式更新信息
8（main）.动态记忆:采取换行策略代表重要性，距离首行越远的越不重要，超过20条以外的信息视为不重要，直接舍去，其余保留
永久记忆:放在动态记忆之后，用一句话记录要点，包含重要的变化状态
9.字数要求，每条重要信息尽量简短，总共不能超过300字
10.输出格式及说明，你需要按照＂Reply Format＂示例的输出格式输出，采用仿csv格式输出，必须根据识别到的剧情合理给出，若没有涉及的则留空
【Reply Format】
当前状态:
（当前的以逗号隔开每件事物，留空代表暂无参考，越靠前代表越重要，以csv格式展示）
人物，心情，状态，物品，地点
人物a（主角），高兴，刚刚买了东西，刚买了杯子，商场
人物b，，看见了人物a，，商场
人物c，高兴，吃饭时想到好笑的事，盖饭，饭店
……（最多20条）
事件变化（这里是永久记忆，但是不能超过100字，采用最简陈述）:人物a在学校上课逃课了，来到了商场`,
  injectionContent: "",
  enabled: true,
  autoUpdate: true,
  updateInterval: 1
};

// 加载设置
async function loadSettings() {
  extension_settings[extensionName] = extension_settings[extensionName] || {};
  
  if (Object.keys(extension_settings[extensionName]).length === 0) {
    Object.assign(extension_settings[extensionName], defaultSettings);
  }
  
  // 如果有保存的模型列表，先加载它们
  if (extension_settings[extensionName].modelList && extension_settings[extensionName].modelList.length > 0) {
    const modelSelect = $("#smart_memory_model");
    modelSelect.empty();
    extension_settings[extensionName].modelList.forEach(model => {
      const modelId = model.id || model.model || model.name || model;
      modelSelect.append(`<option value="${modelId}">${modelId}</option>`);
    });
    console.log(`智能总结: 从本地加载了${extension_settings[extensionName].modelList.length}个模型`);
    
    if (extension_settings[extensionName].aiModel) {
      modelSelect.val(extension_settings[extensionName].aiModel);
    }
  }

  // 更新UI
  $("#smart_memory_api_key").val(extension_settings[extensionName].apiKey || "");
  $("#smart_memory_api_url").val(extension_settings[extensionName].apiUrl || defaultSettings.apiUrl);
  $("#smart_memory_model").val(extension_settings[extensionName].aiModel || defaultSettings.aiModel);
  $("#smart_memory_depth").val(extension_settings[extensionName].scanDepth || defaultSettings.scanDepth);
  $("#smart_memory_depth_value").text(extension_settings[extensionName].scanDepth || defaultSettings.scanDepth);
  $("#smart_memory_prompt").val(extension_settings[extensionName].promptTemplate || defaultSettings.promptTemplate);
  $("#smart_memory_enabled").prop("checked", extension_settings[extensionName].enabled !== false);
  $("#smart_memory_auto_update").prop("checked", extension_settings[extensionName].autoUpdate !== false);
  $("#smart_memory_update_interval").val(extension_settings[extensionName].updateInterval || 1);
  $("#smart_memory_update_interval_value").text(extension_settings[extensionName].updateInterval || 1);
  $("#smart_memory_injection_content").val(extension_settings[extensionName].injectionContent || "");
}

// 保存设置
function saveSettings() {
  extension_settings[extensionName].apiKey = $("#smart_memory_api_key").val();
  extension_settings[extensionName].apiUrl = $("#smart_memory_api_url").val();
  extension_settings[extensionName].aiModel = $("#smart_memory_model").val();
  extension_settings[extensionName].scanDepth = parseInt($("#smart_memory_depth").val());
  extension_settings[extensionName].promptTemplate = $("#smart_memory_prompt").val();
  extension_settings[extensionName].enabled = $("#smart_memory_enabled").prop("checked");
  extension_settings[extensionName].autoUpdate = $("#smart_memory_auto_update").prop("checked");
  extension_settings[extensionName].updateInterval = parseInt($("#smart_memory_update_interval").val()) || 1;
  extension_settings[extensionName].injectionContent = $("#smart_memory_injection_content").val();
  
  saveSettingsDebounced();
  console.log("智能总结设置已保存");
}

// 获取最近的消息
function getRecentMessages(depth) {
  const context = getContext();
  const chat = context.chat;
  
  console.log(`智能总结: 当前聊天上下文状态:`, {
    有效: !!context,
    聊天记录数: chat?.length || 0,
    角色名: context?.name || "未知",
    聊天ID: context?.chatId || "无"
  });
  
  if (!chat || chat.length === 0) {
    console.log("智能总结: 没有找到聊天记录");
    return [];
  }
  
  // 获取最近的N条消息
  const startIndex = Math.max(0, chat.length - depth);
  const messages = chat.slice(startIndex);
  
  console.log(`智能总结: 提取了 ${messages.length} 条消息（从索引 ${startIndex} 开始）`);
  
  return messages;
}

// 调用AI进行总结
async function summarizeMessages() {
  const apiKey = extension_settings[extensionName].apiKey;
  const apiUrl = extension_settings[extensionName].apiUrl;
  const model = extension_settings[extensionName].aiModel;
  const depth = extension_settings[extensionName].scanDepth;
  const prompt = extension_settings[extensionName].promptTemplate;
  
  if (!apiKey) {
    console.log("[智能总结] 未配置API密钥，跳过总结");
    toastr.warning("请先配置API密钥", "智能总结");
    return;
  }
  
  if (!model) {
    console.log("[智能总结] 未选择模型，跳过总结");
    toastr.warning("请先选择AI模型", "智能总结");
    return;
  }
  
  if (!extension_settings[extensionName].enabled) {
    console.log("[智能总结] 功能已禁用");
    return;
  }
  
  const messages = getRecentMessages(depth);
  
  if (messages.length === 0) {
    console.log("[智能总结] 没有消息需要总结");
    return;
  }
  
  // 构建对话历史文本
  let conversationText = messages.map(msg => {
    const role = msg.is_user ? "用户" : msg.name || "角色";
    const text = msg.mes || msg.message || "";
    return `${role}: ${text}`;
  }).join("\n");
  
  // 显示前50个字符的预览
  const preview = conversationText.substring(0, 50) + "...";
  console.log(`智能总结: 正在开始总结最近 ${messages.length} 条消息`);
  console.log(`智能总结: 消息预览: ${preview}`);
  
  // 获取当前注入区内容（前任总结）
  const context = getContext();
  const characterName = context?.name2 || "unknown";
  const previousSummary = extension_settings[extensionName]?.characterInjections?.[characterName] || 
                          extension_settings[extensionName]?.injectionContent || "";
  
  if (previousSummary) {
    console.log(`智能总结: 发现前任总结，长度: ${previousSummary.length}`);
  }
  
  try {
    // 构建请求消息
    let userPromptContent = `请总结以下对话:\n\n${conversationText}`;
    
    // 如果有前任总结，添加到用户提示中
    if (previousSummary) {
      userPromptContent = `之前的对话总结:\n${previousSummary}\n\n请基于上述历史总结，继续总结以下最新对话，形成完整连贯的记忆总结:\n\n${conversationText}`;
    }
    
    // 构建请求
    const requestBody = {
      model: model,
      messages: [
        {
          role: "system",
          content: prompt
        },
        {
          role: "user",
          content: userPromptContent
        }
      ],
      // 不设置max_tokens，让AI自己决定长度
      temperature: 0.7
    };
    
    console.log(`智能总结: 发送API请求到 ${apiUrl}/chat/completions`);
    console.log(`智能总结: 使用模型: ${model}`);
    console.log(`智能总结: 包含前任总结: ${previousSummary ? '是' : '否'}`)
    
    const response = await fetch(`${apiUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(requestBody)
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`智能总结: API请求失败 - HTTP ${response.status}: ${errorText}`);
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }
    
    const data = await response.json();
    console.log(`智能总结: API响应成功`);
    
    // 尝试从不同位置获取内容（兼容不同API格式）
    let summary = data.choices?.[0]?.message?.content || 
                  data.choices?.[0]?.text || 
                  data.content || 
                  data.response || 
                  "";
    
    // 调试：如果没有内容，打印完整响应
    if (!summary) {
      console.error("智能总结: ⚠️ 未找到总结内容，完整响应:", JSON.stringify(data, null, 2));
    }
    
    if (summary) {
      // 显示总结预览（前100个字符）
      const summaryPreview = summary.substring(0, 100) + (summary.length > 100 ? "..." : "");
      console.log(`智能总结: 已完成总结: "${summaryPreview}"`);
      console.log(`智能总结: 完整总结内容长度: ${summary.length} 字符`);
      
      // 更新注入内容
      const context = getContext();
      const characterName = context?.name2 || "unknown";
      
      // 按角色名保存注入内容
      if (!extension_settings[extensionName].characterInjections) {
        extension_settings[extensionName].characterInjections = {};
      }
      
      extension_settings[extensionName].characterInjections[characterName] = summary;
      extension_settings[extensionName].injectionContent = summary;
      
      console.log(`智能总结: 保存到角色 "${characterName}" 的注入内容`);
      
      // 确保更新到界面 - 使用多种方法确保成功
      setTimeout(() => {
        const injectionTextarea = document.getElementById("smart_memory_injection_content");
        if (injectionTextarea) {
          injectionTextarea.value = summary;
          // 触发各种可能的事件
          injectionTextarea.dispatchEvent(new Event('input', { bubbles: true }));
          injectionTextarea.dispatchEvent(new Event('change', { bubbles: true }));
          
          // 也用jQuery更新
          $("#smart_memory_injection_content").val(summary).trigger('input').trigger('change');
          
          console.log(`智能总结: 注入框已更新，内容长度: ${injectionTextarea.value.length}`);
          
          // 验证是否真的更新了
          const actualValue = $("#smart_memory_injection_content").val();
          if (actualValue === summary) {
            console.log("智能总结: 验证成功：注入框内容已正确更新");
          } else {
            console.error("智能总结: 验证失败：注入框内容未更新");
          }
        } else {
          console.error("智能总结: 找不到注入框元素 #smart_memory_injection_content");
          // 尝试查找所有textarea元素帮助调试
          const allTextareas = document.querySelectorAll('textarea');
          console.log(`智能总结: 页面上找到 ${allTextareas.length} 个textarea元素`);
        }
      }, 100); // 轻微延迟确保DOM已准备好
      
      // 保存设置（不需要立即注入，等消息发送前才注入）
      saveSettingsDebounced();
      
      // 触发注入更新事件
      eventSource.emit('smartMemoryUpdated', summary);
      
      return summary;
    } else {
      console.error("智能总结: AI返回的总结内容为空");
      return null;
    }
    
  } catch (error) {
    console.error("总结失败:", error);
    toastr.error(`总结失败: ${error.message}`, "智能总结");
  }
}

// 监听消息事件
function setupMessageListener() {
  let messageCount = 0;
  let lastMessageId = -1; // 记录最后处理的消息ID
  
  console.log("智能总结: 消息监听器已设置");
  
  // 初始化时记录当前最后的消息ID
  const context = getContext();
  if (context?.chat?.length > 0) {
    lastMessageId = context.chat.length - 1;
    console.log(`智能总结: 初始消息ID设为 ${lastMessageId}`);
  }
  
  // 只监听AI回复完成，不监听用户消息
  // 因为用户发消息后马上就会有AI回复，两次总结会重复
  
  // 监听角色消息渲染完成
  eventSource.on(event_types.CHARACTER_MESSAGE_RENDERED, async (messageId) => {
    // 如果功能未启用，直接返回
    if (!extension_settings[extensionName]?.enabled) {
      return;
    }
    console.log('智能总结: 角色消息渲染完成:', messageId);
    
    // 如果是旧消息或相同消息，跳过
    if (messageId <= lastMessageId) {
      console.log(`智能总结: 跳过旧消息/重复消息 ID:${messageId}, 最后处理ID:${lastMessageId}`);
      return;
    }
    
    // 更新最后处理的消息ID
    lastMessageId = messageId;
    
    if (!extension_settings[extensionName]) {
      console.log("智能总结: 扩展设置未加载");
      return;
    }
    
    if (!extension_settings[extensionName].enabled) {
      console.log("智能总结: 功能已禁用");
      return;
    }
    
    if (!extension_settings[extensionName].autoUpdate) {
      console.log("智能总结: 自动更新已禁用");
      return;
    }
    
    // 每次AI回复完成都计数（一轮对话 = 用户消息 + AI回复）
    messageCount++;
    const updateInterval = extension_settings[extensionName].updateInterval || 1;
    console.log(`智能总结: 对话轮次: ${messageCount}/${updateInterval}`);
    
    if (messageCount >= updateInterval) {
      messageCount = 0;
      console.log("智能总结: 达到更新间隔，准备总结最近对话...");
      setTimeout(async () => {
        console.log("智能总结: 开始执行自动总结");
        await summarizeMessages();
      }, 1500);
    }
  });
  
  // 监听聊天切换
  eventSource.on(event_types.CHAT_CHANGED, () => {
    // 如果功能未启用，直接返回
    if (!extension_settings[extensionName]?.enabled) {
      return;
    }
    console.log("智能总结: 检测到聊天切换事件");
    messageCount = 0;
    
    // 更新最后消息ID为新聊天的最后一条
    const context = getContext();
    if (context?.chat?.length > 0) {
      lastMessageId = context.chat.length - 1;
      console.log(`智能总结: 切换后最后消息ID更新为 ${lastMessageId}`);
    } else {
      lastMessageId = -1;
      console.log("智能总结: 新聊天无消息，重置ID为-1");
    }
    
    // 使用已经声明的context，不需要重复声明
    const characterName = context?.name2 || "unknown";
    
    // 加载当前角色的注入内容
    if (extension_settings[extensionName]?.characterInjections?.[characterName]) {
      const savedContent = extension_settings[extensionName].characterInjections[characterName];
      extension_settings[extensionName].injectionContent = savedContent;
      $("#smart_memory_injection_content").val(savedContent);
      console.log(`智能总结: 加载角色 "${characterName}" 的注入内容，长度: ${savedContent.length}`);
    } else {
      // 没有保存的内容，清空
      extension_settings[extensionName].injectionContent = "";
      $("#smart_memory_injection_content").val("");
      console.log(`智能总结: 角色 "${characterName}" 无保存的注入内容`);
    }
    
    if (context?.chat?.length > 0) {
      console.log(`智能总结: 新聊天已有 ${context.chat.length} 条消息`);
    }
  });
}

// 获取注入内容（供其他模块调用）
export function getInjectionContent() {
  const content = extension_settings[extensionName]?.injectionContent || "";
  
  if (content) {
    console.log(`智能总结: 提供注入内容给其他模块，长度: ${content.length}`);
  }
  
  return content;
}

// 在消息发送前注入到系统预设
function injectBeforeGenerate() {
  const content = extension_settings[extensionName]?.injectionContent || "";
  const context = getContext();
  
  try {
    if (content && context?.setExtensionPrompt) {
      // 注入到系统预设中
      // 位置: 0=在消息开头, 1=在历史消息后, 2=作者注释位置, 3=JB位置, 4=在消息结尾
      const position = 0; // 默认插入到开头
      const depth = 4; // 默认深度4
      const scan = false; // 不需要扫描世界书
      const role = "system"; // 系统角色
      
      context.setExtensionPrompt(extensionName, content, position, depth, scan, role);
      console.log(`智能总结: ✅ 成功注入内容到系统预设, 长度: ${content.length}, 位置: ${position}, 深度: ${depth}, 角色: ${role}`);
      console.log(`智能总结: 注入内容预览: "${content.substring(0, 50)}..."`);
    } else if (!content && context?.setExtensionPrompt) {
      // 清空注入
      context.setExtensionPrompt(extensionName, "", 0, 4, false, "system");
      console.log("智能总结: 已清空系统注入内容");
    } else if (!context?.setExtensionPrompt) {
      console.error("智能总结: ❌ setExtensionPrompt 函数不可用！无法注入内容");
    }
  } catch (error) {
    console.error("智能总结: 注入失败", error);
  }
}

// 检查是否有待注入的内容
export function hasInjectionContent() {
  return !!(extension_settings[extensionName]?.injectionContent?.trim());
}

// 清空注入内容
export function clearInjectionContent() {
  if (extension_settings[extensionName]) {
    extension_settings[extensionName].injectionContent = "";
    $("#smart_memory_injection_content").val("");
    console.log("[智能总结] 📤 已清空注入内容");
  }
}

// 手动触发总结
async function manualSummarize() {
  console.log("[智能总结] 👆 用户手动触发总结");
  console.log("[智能总结] 当前设置:", {
    enabled: extension_settings[extensionName]?.enabled,
    apiKey: extension_settings[extensionName]?.apiKey ? "已设置" : "未设置",
    model: extension_settings[extensionName]?.aiModel || "未设置",
    depth: extension_settings[extensionName]?.scanDepth || 3
  });
  
  const result = await summarizeMessages();
  if (result) {
    toastr.success(`总结完成（${result.length}字），请查看注入框`, "智能总结");
    // 确保注入框显示更新的内容
    const currentContent = $("#smart_memory_injection_content").val();
    console.log(`[智能总结] 手动总结后注入框内容长度: ${currentContent?.length || 0}`);
  } else {
    console.log("[智能总结] ❌ 手动总结失败或返回空内容");
  }
}

// 获取模型列表
async function getModelsList() {
  const apiKey = $("#smart_memory_api_key").val();
  const apiUrl = $("#smart_memory_api_url").val();
  
  if (!apiKey) {
    toastr.error("请先输入API密钥", "获取模型失败");
    return;
  }
  
  if (!apiUrl) {
    toastr.error("请先输入API地址", "获取模型失败");
    return;
  }
  
  try {
    console.log("正在获取模型列表...");
    $("#model_status").text("正在获取模型列表...");
    
    const response = await fetch(`${apiUrl}/models`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`
      }
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    const data = await response.json();
    const models = data.data || data.models || [];
    
    // 清空并填充模型选择器
    const modelSelect = $("#smart_memory_model");
    modelSelect.empty();
    
    if (models.length === 0) {
      modelSelect.append('<option value="">未找到可用模型</option>');
      $("#model_status").text("未找到可用模型");
    } else {
      // 过滤出聊天模型
      const chatModels = models.filter(m => {
        const id = m.id || m.model || m.name || "";
        return id.includes("gpt") || id.includes("claude") || 
               id.includes("chat") || id.includes("turbo") ||
               id.includes("deepseek") || id.includes("gemini") ||
               id.includes("mistral") || id.includes("llama");
      });
      
      if (chatModels.length > 0) {
        chatModels.forEach(model => {
          const modelId = model.id || model.model || model.name;
          modelSelect.append(`<option value="${modelId}">${modelId}</option>`);
        });
        $("#model_status").text(`找到 ${chatModels.length} 个可用模型`);
      } else {
        // 如果没有过滤到聊天模型，显示所有模型
        models.forEach(model => {
          const modelId = model.id || model.model || model.name;
          modelSelect.append(`<option value="${modelId}">${modelId}</option>`);
        });
        $("#model_status").text(`找到 ${models.length} 个模型`);
      }
      
      // 如果之前有保存的模型，尝试选中
      if (extension_settings[extensionName].aiModel) {
        modelSelect.val(extension_settings[extensionName].aiModel);
      }
      
      // 保存模型列表到本地
      extension_settings[extensionName].modelList = chatModels.length > 0 ? chatModels : models;
      saveSettingsDebounced();
      console.log(`智能总结: 已保存${extension_settings[extensionName].modelList.length}个模型到本地`);
    }
    
    toastr.success("模型列表获取成功", "智能总结");
    
  } catch (error) {
    console.error("获取模型列表失败:", error);
    $("#model_status").text("获取失败");
    
    // 如果获取失败，提供一些常用模型作为备选
    const modelSelect = $("#smart_memory_model");
    modelSelect.empty();
    modelSelect.append('<option value="">-- 手动输入或选择常用模型 --</option>');
    modelSelect.append('<option value="gpt-3.5-turbo">GPT-3.5 Turbo</option>');
    modelSelect.append('<option value="gpt-4">GPT-4</option>');
    modelSelect.append('<option value="gpt-4-turbo-preview">GPT-4 Turbo</option>');
    modelSelect.append('<option value="claude-3-opus-20240229">Claude 3 Opus</option>');
    modelSelect.append('<option value="claude-3-sonnet-20240229">Claude 3 Sonnet</option>');
    modelSelect.append('<option value="deepseek-chat">DeepSeek Chat</option>');
    modelSelect.append('<option value="custom">自定义模型名称...</option>');
    
    toastr.warning("无法自动获取，请选择或手动输入模型名称", "提示");
  }
}

// 显示数值设置弹层
async function showStatSettingModal() {
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

// 初始化状态管理界面
function initStatManager() {
  // 加载保存的数据
  if (extension_settings[extensionName]?.statsData) {
    statsData = extension_settings[extensionName].statsData;
  }
  
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
  
  let prompt = "根据最后一条回复内容，统计以下状态值的变化。\n";

  const statDescriptions = statsData.states.map(stat => {
    return `${stat.statName}：${stat.prompt}`;
  }).join('，');
  
  prompt += "【" + statDescriptions + "】";

  prompt += "统计结果以下面格式返回: <数据统计>`json格式数据统计`</数据统计>，每个角色一个json对象。仅统计变化量，而不是合计值"
  
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
    renderAvatarsTable();
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
      renderAvatarsTable();
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
      renderAvatarsTable();
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
    renderAvatarsTable();
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
      renderAvatarsTable();
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

// ===== 角色管理功能 =====

// 角色管理数据
let avatarsData = [];
let nextAvatarId = 1;
let currentEditingAvatar = null;

// 显示角色管理弹层
async function showAvatarManagerModal() {
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
    
    // 点击遮罩层关闭
    $("#avatarManagerModal").on("click", function(e) {
      if (e.target === this) {
        closeAvatarManagerModal();
      }
    });
    
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
  // 加载保存的数据
  if (extension_settings[extensionName]?.avatarsData) {
    avatarsData = extension_settings[extensionName].avatarsData;
    nextAvatarId = Math.max(...avatarsData.map(a => a.id), 0) + 1;
  }
  
  // 确保角色状态与当前配置同步
  syncAvatarStatsWithConfig();
  
  renderAvatarsTable();
  bindAvatarEvents();
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
    
    const row = `
      <tr data-id="${avatar.id}">
        <td>${avatar.id}</td>
        <td class="name-cell">${avatar.name || ''}</td>
        <td class="othername-cell">${avatar.otherName || ''}</td>
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
    name: "新角色",
    otherName: "",
    stats: getDefaultStats()
  };
  
  avatarsData.push(newAvatar);
  renderAvatarsTable();
  
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
    toastr.success('角色已删除', '角色管理');
  }
}

// 保存角色数据
function saveAvatarsData() {
  extension_settings[extensionName].avatarsData = JSON.parse(JSON.stringify(avatarsData));
  saveSettingsDebounced();
  toastr.success('角色数据已保存', '角色管理');
  console.log('角色数据已保存:', avatarsData);
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

// 将角色管理函数设为全局函数
window['editAvatar'] = editAvatar;
window['deleteAvatar'] = deleteAvatar;

// jQuery加载时初始化
jQuery(async () => {
  const settingsHtml = await $.get(`${extensionFolderPath}/example.html`);
  $("#extensions_settings").append(settingsHtml);
  
  // Inline drawer 折叠/展开功能 - 使用延迟绑定
  setTimeout(() => {
    $('.smart-memory-settings .inline-drawer-toggle').each(function() {
      $(this).off('click').on('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        
        const $header = $(this);
        const $icon = $header.find('.inline-drawer-icon');
        const $content = $header.next('.inline-drawer-content');
        const isOpen = $content.data('open') === true;
        
        if (isOpen) {
          // 收起
          $content.data('open', false);
          $content.hide();
          $icon.removeClass('down');
        } else {
          // 展开
          $content.data('open', true);
          $content.show();
          $icon.addClass('down');
        }
      });
    });
  }, 100);
  
  // 绑定事件
  $("#save_smart_memory_settings").on("click", saveSettings);
  $("#test_smart_memory").on("click", manualSummarize);
  $("#get_smart_memory_models").on("click", getModelsList);
  
  // 绑定数值设置弹层事件
  $("#statSetting").on("click", async function() {
    await showStatSettingModal();
  });
  
  // 绑定角色管理弹层事件
  $("#avatar_manager").on("click", async function() {
    await showAvatarManagerModal();
  });
  
  // 模型选择更改时保存
  $("#smart_memory_model").on("change", function() {
    const model = $(this).val();
    if (model) {
      extension_settings[extensionName].aiModel = model;
      console.log(`智能总结: 已选择模型: ${model}`);
      saveSettingsDebounced();
    }
  });
  
  $("#smart_memory_enabled").on("change", function() {
    const isChecked = $(this).prop("checked");
    extension_settings[extensionName].enabled = isChecked;
    console.log(`[智能总结] 功能已${isChecked ? '启用' : '禁用'}`);
    saveSettingsDebounced();
  });
  
  $("#smart_memory_auto_update").on("change", function() {
    const isChecked = $(this).prop("checked");
    extension_settings[extensionName].autoUpdate = isChecked;
    console.log(`[智能总结] 自动更新设置已更改为: ${isChecked ? '启用' : '禁用'}`);
    saveSettingsDebounced();
  });
  
  $("#smart_memory_depth").on("input", function() {
    $("#smart_memory_depth_value").text($(this).val());
  });
  
  // 更新间隔滑块
  $("#smart_memory_update_interval").on("input", function() {
    const value = $(this).val();
    $("#smart_memory_update_interval_value").text(value);
    extension_settings[extensionName].updateInterval = parseInt(value);
    console.log(`智能总结: 更新间隔已设置为: 每 ${value} 轮对话`);
    saveSettingsDebounced();
  });
  
  // 注入内容编辑
  $("#smart_memory_injection_content").on("input", function() {
    const content = $(this).val();
    const context = getContext();
    const characterName = context?.name2 || "unknown";
    
    // 保存到当前角色
    if (!extension_settings[extensionName].characterInjections) {
      extension_settings[extensionName].characterInjections = {};
    }
    extension_settings[extensionName].characterInjections[characterName] = content;
    extension_settings[extensionName].injectionContent = content;
    
    console.log(`智能总结: 注入内容已手动编辑，长度: ${content.length}`);
    saveSettingsDebounced();
  });
  
  // 加载设置
  await loadSettings();
  
  // 设置消息监听
  setupMessageListener();
  
  // 监听生成开始事件，在此时注入内容
  eventSource.on(event_types.GENERATION_STARTED, async () => {
    // 如果功能未启用，直接返回
    if (!extension_settings[extensionName]?.enabled) {
      return;
    }
    console.log("智能总结: 🚀 检测到AI生成开始，正在注入总结内容...");
    injectBeforeGenerate();
  });
  
  // 初始化时加载当前角色的注入内容
  const context = getContext();
  const characterName = context?.name2 || "unknown";
  if (extension_settings[extensionName]?.characterInjections?.[characterName]) {
    const savedContent = extension_settings[extensionName].characterInjections[characterName];
    extension_settings[extensionName].injectionContent = savedContent;
    $("#smart_memory_injection_content").val(savedContent);
    console.log(`智能总结: 初始加载角色 "${characterName}" 的注入内容，长度: ${savedContent.length}`);
  }
  
  console.log("智能总结: 扩展已成功加载");
  console.log("智能总结: 当前版本: 1.0.0");
  console.log("智能总结: 初始设置:", extension_settings[extensionName]);
});


// 已经在上面export了getInjectionContent，不需要重复导出

