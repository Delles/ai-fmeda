# FMEDA MVP

An interactive tool for Functional Safety engineers to perform Failure Modes, Effects, and Diagnostic Analysis (FMEDA) with AI-assisted field suggestions.

## Overview

FMEDA MVP simplifies the process of analyzing hardware components for functional safety. It provides a structured table for documenting failure modes and uses AI to suggest content based on technical documentation you upload.

### Key Features

- **Interactive FMEDA Table**: Manage components, failure modes, and effects in a responsive grid.
- **AI-Powered Suggestions**: Get intelligent suggestions for FMEDA fields using OpenAI's GPT models.
- **Local Document Context**: Upload PDF or TXT technical specifications to provide context for AI suggestions.
- **Data Portability**: Export your analysis to JSON and import it back later.
- **Privacy First**: API keys and data are stored locally in your browser's `LocalStorage`.

## Prerequisites

- [Bun](https://bun.sh/) (v1.0.0 or higher)

## Installation

1. **Clone the repository** (or download the source):
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
To use the AI suggestion features, you must provide an OpenAI API key:
1. Click the **Settings** (gear icon) in the top navigation bar.
2. Enter your **OpenAI API Key**.
3. Select your preferred model (e.g., `gpt-4o` or `gpt-3.5-turbo`).
4. Click **Save**. Your key is stored locally and never sent to our servers.

### 2. Loading Context Documents
The AI provides better suggestions when it has access to your technical documentation:
1. Use the **Document Upload** section to select a PDF or TXT file.
2. The application parses the text locally.
3. Once loaded, the AI will use this text as context for any suggestions you request.

### 3. Managing FMEDA Rows
- **Add Row**: Click the "Add Row" button to create a new entry.
- **Edit Row**: Click on any cell to edit its content directly.
- **AI Suggestions**: Click the "AI" button next to a field (e.g., Failure Mode, Local Effect) to open the suggestion panel. Choose a suggestion to apply it to the row.
- **Delete Row**: Use the delete icon at the end of a row to remove it.

### 4. Export and Import
- **Export**: Click the **Export JSON** button to download your current FMEDA table as a `.json` file.
- **Import**: Click the **Import JSON** button and select a previously exported file to restore your work.

## Technical Stack

- **Frontend**: React 18, Vite
- **Styling**: Tailwind CSS, Lucide Icons
- **State Management**: Zustand
- **Table Engine**: TanStack Table (v8)
- **PDF Parsing**: pdfjs-dist
- **AI Integration**: OpenAI API (Chat Completions)
- **Runtime**: Bun

## License

MIT
