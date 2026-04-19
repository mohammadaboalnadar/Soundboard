# Soundboard

A lightweight Electron-based desktop soundboard for playing and previewing audio clips with trim controls, fades, keybinds, and dual-output routing.

## Table of Contents

- [Introduction](#introduction)
- [Features](#features)
- [Installation](#installation)
- [Running the App](#running-the-app)
- [Project Structure](#project-structure)
- [Contributing](#contributing)
- [License](#license)

## Introduction

Soundboard is a desktop tool built with Electron for quickly managing and triggering sound clips. It includes both playback controls and editing/preview controls so you can adjust trims, fades, and levels before playback.

## Features

- Add and manage multiple sound files
- Per-sound trim start/end controls
- Per-sound volume and fade in/out
- Global local and soundboard output volume controls
- Stop-all and per-sound stop behavior
- Timeline cursor scrubbing and preview playback
- Keyboard keybind support, including numpad mappings
- Settings persistence between app launches

## Installation

### Prerequisites

- [Node.js](https://nodejs.org/) 18+ (LTS recommended)
- npm (bundled with Node.js)

### Steps

1. Clone the repository.
2. Install dependencies:

```bash
npm install
```

## Running the App

Start the Electron app:

```bash
npm start
```

## Project Structure

- [main.js](main.js): Electron main process, IPC handlers, and settings persistence
- [preload.js](preload.js): Secure API bridge from main process to renderer
- [renderer/index.html](renderer/index.html): Renderer UI markup
- [renderer/styles.css](renderer/styles.css): Application styles
- [renderer/renderer.js](renderer/renderer.js): Renderer logic (audio controls, preview, timeline, UI events)

## Contributing

Contributions are welcome.

- Read the full contribution guide: [CONTRIBUTING.md](CONTRIBUTING.md)
- Jump directly to setup and workflow: [Contributing Workflow](CONTRIBUTING.md#contributing-workflow)
- Review reporting guidelines: [Issue Reports](CONTRIBUTING.md#issue-reports)

## License

This project is licensed under the MIT License.
