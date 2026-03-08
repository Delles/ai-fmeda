# FMEDA AI Analysis

An interactive tool for Functional Safety engineers to perform Failure Modes, Effects, and Diagnostic Analysis (FMEDA) with hierarchical structure and AI-assisted content generation. Built according to ISO 26262 and IEC 61508 principles.

## Overview

FMEDA AI Analysis streamlines the safety analysis process. Unlike traditional flat tables, it uses a hierarchical model (System → Subsystem → Component → Function → Failure Mode) to provide better context for both engineers and AI models. It leverages Google Gemini to suggest failure modes, effects, and diagnostic metrics based on your technical documentation.

### Key Features

- **Hierarchical Safety Architecture**: Organize your analysis from high-level systems down to individual failure modes.
- **AI Project Wizard**: Automatically build a project skeleton from technical specifications or plain text concepts.
- **Context-Aware AI Suggestions**: Get intelligent suggestions for failure modes, local effects, safety mechanisms, and metrics (FIT, DC) that understand the component's function.
- **Interactive Data Table**: High-performance grid with inline cell editing, auto-save, and keyboard accessibility.
- **Local Document Support**: Parse PDF or TXT technical specifications locally using PDF.js to provide context for AI.
- **Data Portability**: Export/Import JSON files with automatic migration from legacy flat formats.
- **Privacy Centric**: API keys and project data are stored locally in your browser's Secure Storage/LocalStorage.

## Prerequisites

- [Bun](https://bun.sh/) (v1.0.0 or higher)
- Google AI (Gemini) API Key

## Installation

1. **Clone the repository**:

   ```bash
   git clone <repository-url>
   cd fmeda
   ```

2. **Install dependencies**:

   ```bash
   bun install
   ```

3. **Start the development server**:

   ```bash
   bun dev
   ```

4. **Open the app**:
   Navigate to `http://localhost:5173` in your browser.

## User Guide

### 1. AI Configuration

To unlock AI features, you need a Google Gemini API Key:

1. Click the **Settings** (gear icon) in the header.
2. Enter your **Google Gemini API Key**.
3. Select your preferred model (e.g., `gemini-1.5-flash`).
4. Click **Save**. Your key is remains local to your browser.

### 2. Creating a Project

- **AI Wizard**: Click "Start New Project" on the Home page. Enter your project details or upload a datasheet. The AI will guide you through generating systems, subsystems, components, and functions.
- **Manual Setup**: You can also build your hierarchy manually within the table by adding child rows to components or functions.

### 3. Analyzing Failure Modes

- **Inline Editing**: Click any cell to edit. Changes are saved automatically on blur or Enter.
- **AI Refinement**: Use the "AI" icon in a Failure Mode row to have Gemini refine the entire row's technical details (Local Effect, Safety Mechanism, DC, etc.) based on the parent component's function.
- **Contextual Suggestions**: Open the suggestion popover on specific fields to choose from multiple AI-generated options.

### 4. Export and Import

- Use the **Export** button to save your work as a `.json` file.
- The **Import** feature supports both the current hierarchical format and "Legacy Flat JSON" from older versions, automatically nesting data into the new structure.

## Technical Stack

- **Runtime**: [Bun](https://bun.sh/)
- **Frontend**: [React 18](https://reactjs.org/), [Vite](https://vitejs.dev/)
- **UI & Styling**: [Tailwind CSS](https://tailwindcss.com/), [Shadcn UI](https://ui.shadcn.com/), [Lucide Icons](https://lucide.dev/)
- **State Management**: [Zustand](https://github.com/pmndrs/zustand)
- **Table Engine**: [TanStack Table v8](https://tanstack.com/table/v8)
- **AI Integration**: [Google Generative AI (Gemini)](https://ai.google.dev/)
- **PDF Parsing**: [PDF.js](https://mozilla.github.io/pdf.js/)

## License

MIT
