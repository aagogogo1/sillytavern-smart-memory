# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a SillyTavern extension called "动态提示词" (Dynamic Prompts) that provides AI-enhanced summarization and character stat tracking capabilities. The extension integrates with external AI APIs to automatically summarize conversations and manage character states with tier-based status systems.

## Architecture

The extension is organized into a modular architecture with three main modules:

### Core Modules

- **`index.js`** (726 lines) - Main entry point and orchestrator
  - Handles extension initialization and settings management
  - Manages AI API integration (OpenAI-compatible endpoints)
  - Coordinates message listening and automatic summarization
  - Provides UI settings panel and injection management
  - Imports and coordinates the two specialized modules

- **`stats-manager.js`** (907 lines) - Character state management module
  - Manages configurable stat definitions with tier-based systems
  - Handles stat parsing from AI responses using JSON format in `<数据统计>` tags
  - Provides stat configuration UI (statSetting.html)
  - Manages stat synchronization between configuration and character data
  - Exports functions: `showStatSettingModal()`, `parseAndUpdateAvatarStats()`, `testStatsParsingFeature()`

- **`avatar-manager.js`** (475 lines) - Character data management module
  - Provides CRUD operations for character profiles and their stats
  - Handles character import/export functionality (JSON format)
  - Manages character editing interface (avatarManager.html)
  - Maintains character stat synchronization with stat configurations
  - Exports functions: `showAvatarManagerModal()`, `getAvatarsData()`, `updateAvatarsData()`, `setAvatarManagerDependencies()`

### Module Communication

The modules use a dependency injection pattern to avoid circular dependencies:

```javascript
// stats-manager.js provides dependencies to avatar-manager.js
setAvatarManagerDependencies({
  statsData: statsData,
  updatePromptPreview: updatePromptPreview
});

// Event-based communication for UI updates
$(document).trigger('avatarManagerRefresh');
```

### Data Flow

1. **AI Summarization**: After each AI response, the extension sends recent messages to configured AI API
2. **Stat Parsing**: AI responses containing `<数据统计>\`[...]\`</数据统计>` are automatically parsed
3. **State Updates**: Character stats are updated incrementally based on parsed JSON data
4. **Status Generation**: Updated character states generate `<角色当前状态>` text based on tier configurations
5. **Prompt Injection**: The extension injects summarization content into system prompts during message generation

## Configuration Files

- **`manifest.json`** - Extension metadata for SillyTavern
- **`example.html`** - Main UI settings panel (displayed in extension settings)
- **`statSetting.html`** - Stat configuration interface (modal dialog)
- **`avatarManager.html`** - Character management interface (modal dialog)
- **`style.css`** - Extension styling for UI components

## Development Notes

### Settings Structure
Extension settings are stored under `extension_settings["sillytavern-smart-memory"]` with the following key properties:
- `apiKey`, `apiUrl`, `aiModel` - AI API configuration
- `promptTemplate` - AI prompt template for summarization
- `statsData` - Stat configuration with tier definitions
- `avatarsData` - Character profiles with current stat values
- `characterInjections` - Character-specific injection content

### Event Integration
The extension integrates with SillyTavern's event system:
- `CHARACTER_MESSAGE_RENDERED` - Triggers automatic summarization
- `GENERATION_STARTED` - Injects summarization content into prompts
- `CHAT_CHANGED` - Manages character-specific data loading

### HTML Loading Pattern
Modal dialogs use async HTML loading:
```javascript
const response = await $.get(`${extensionFolderPath}/modalFile.html`);
// Create and append modal HTML
```

### Global Function Exposure
Functions called from HTML onclick handlers are exposed to window object:
```javascript
window['functionName'] = functionName;
```

## Common Tasks

### Testing Stat Parsing
Use the built-in test function:
```javascript
testStatsParsingFeature()
```

### Accessing Character Data
```javascript
import { getAvatarsData } from "./avatar-manager.js";
const characters = getAvatarsData();
```

### Stat Configuration Format
Stats use a tiered system with numeric ranges:
```javascript
{
  statName: "生命值",
  prompt: "角色的生命力",
  tier: [
    { name: "垂死", from: -999, to: -100, prompt: "再接受一次攻击就会死亡" },
    { name: "重伤", from: -100, to: 0, prompt: "无法动弹" }
  ]
}
```

### Response Parsing
The extension expects stat updates in this JSON format within `<数据统计>` tags:
```javascript
[{"角色名": "张大力", "生命值变化": -110, "法力值变化": 5}]
```