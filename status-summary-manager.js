import { extension_settings } from "../../../extensions.js";
import { saveSettingsDebounced } from "../../../../script.js";

const extensionName = "sillytavern-smart-memory";

// 默认状态摘要设置
const defaultStatusSummarySettings = {
  enabled: true,
  statusTypes: [
    {
      name: "衣物状态",
      fields: ["上衣", "裤子", "鞋子", "配饰"]
    },
    {
      name: "疾病状态",
      fields: ["感冒", "发烧", "咳嗽", "其他症状"]
    }
  ],
  summaryData: {}
};

// 加载状态摘要设置
function loadStatusSummarySettings() {
  if (!extension_settings[extensionName].statusSummarySettings) {
    extension_settings[extensionName].statusSummarySettings = JSON.parse(JSON.stringify(defaultStatusSummarySettings));
  }
  return extension_settings[extensionName].statusSummarySettings;
}

// 保存状态摘要设置
function saveStatusSummarySettings() {
  saveSettingsDebounced();
}

// 生成状态摘要提示词
function generateStatusSummaryPrompt() {
  const settings = loadStatusSummarySettings();

  if (!settings.enabled || !settings.statusTypes || settings.statusTypes.length === 0) {
    return "";
  }

  // 构建状态类型列表
  const statusTypeNames = settings.statusTypes.map(type => type.name).join("、");

  // 构建JSON结构描述
  let jsonStructure = `{\n`;

  settings.statusTypes.forEach((type, index) => {
    jsonStructure += `   "${type.name}": [\n`;
    jsonStructure += `      {\n`;
    jsonStructure += `         "姓名": "xxx"`;

    type.fields.forEach(field => {
      jsonStructure += `,\n         "${field}": "xxx"`;
    });

    jsonStructure += `\n      }\n`;
    jsonStructure += `   ]`;

    if (index < settings.statusTypes.length - 1) {
      jsonStructure += `,\n`;
    } else {
      jsonStructure += `\n`;
    }
  });

  jsonStructure += `}`;

  const prompt = `
## 状态摘要
总结<user>及角色的【${statusTypeNames}】摘要，返回以下格式的回复：
<状态摘要>
${jsonStructure}
</状态摘要>
> 注：每行一个角色，不要重复`;

  return prompt;
}

// 解析状态摘要结果
function parseStatusSummary(summaryText) {
  const settings = loadStatusSummarySettings();

  if (!summaryText || !settings.enabled) {
    return null;
  }

  // 提取状态摘要内容
  const statusSummaryMatch = summaryText.match(/<状态摘要>([\s\S]*?)<\/状态摘要>/);
  if (!statusSummaryMatch) {
    return null;
  }

  const statusSummaryContent = statusSummaryMatch[1].trim();

  try {
    // 尝试解析JSON
    const parsedData = JSON.parse(statusSummaryContent);

    // 验证数据结构
    if (typeof parsedData !== 'object') {
      console.error('状态摘要: 解析的数据不是对象格式');
      return null;
    }

    // 保存到设置中
    settings.summaryData = parsedData;
    saveStatusSummarySettings();

    console.log('状态摘要: 成功解析并保存状态摘要数据', parsedData);
    return parsedData;

  } catch (error) {
    console.error('状态摘要: JSON解析失败', error);

    // 尝试手动解析格式
    return parseManualFormat(statusSummaryContent, settings);
  }
}

// 手动解析格式（备用方法）
function parseManualFormat(content, settings) {
  try {
    const result = {};

    settings.statusTypes.forEach(type => {
      const typeMatch = content.match(new RegExp(`"${type.name}"\s*:\s*\[([\s\S]*?)\]`, 'i'));
      if (typeMatch) {
        const typeContent = typeMatch[1];
        const entries = [];

        // 简单的对象解析
        const objectMatches = typeContent.match(/\{[^}]+\}/g);
        if (objectMatches) {
          objectMatches.forEach(objStr => {
            try {
              const obj = JSON.parse(objStr);
              entries.push(obj);
            } catch (e) {
              // 忽略解析错误的对象
            }
          });
        }

        if (entries.length > 0) {
          result[type.name] = entries;
        }
      }
    });

    if (Object.keys(result).length > 0) {
      settings.summaryData = result;
      saveStatusSummarySettings();
      console.log('状态摘要: 手动解析成功', result);
      return result;
    }

  } catch (error) {
    console.error('状态摘要: 手动解析失败', error);
  }

  return null;
}

// 获取状态摘要数据
function getStatusSummaryData() {
  const settings = loadStatusSummarySettings();
  return settings.summaryData || {};
}

// 更新状态摘要设置
function updateStatusSummarySettings(newSettings) {
  const settings = loadStatusSummarySettings();
  Object.assign(settings, newSettings);
  saveStatusSummarySettings();
}

// 添加新的状态类型
function addStatusType(typeName, fields) {
  const settings = loadStatusSummarySettings();

  if (!settings.statusTypes) {
    settings.statusTypes = [];
  }

  settings.statusTypes.push({
    name: typeName,
    fields: fields || []
  });

  saveStatusSummarySettings();
}

// 删除状态类型
function removeStatusType(typeName) {
  const settings = loadStatusSummarySettings();

  if (settings.statusTypes) {
    settings.statusTypes = settings.statusTypes.filter(type => type.name !== typeName);
    saveStatusSummarySettings();
  }
}

// 更新状态类型字段
function updateStatusTypeFields(typeName, newFields) {
  const settings = loadStatusSummarySettings();

  if (settings.statusTypes) {
    const type = settings.statusTypes.find(t => t.name === typeName);
    if (type) {
      type.fields = newFields;
      saveStatusSummarySettings();
    }
  }
}

export {
  loadStatusSummarySettings,
  saveStatusSummarySettings,
  generateStatusSummaryPrompt,
  parseStatusSummary,
  getStatusSummaryData,
  updateStatusSummarySettings,
  addStatusType,
  removeStatusType,
  updateStatusTypeFields,
  defaultStatusSummarySettings
};