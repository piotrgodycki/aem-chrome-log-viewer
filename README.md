# AEM Error Log Viewer 🔍

![Chrome Web Store](https://img.shields.io/badge/Chrome%20Web%20Store-v1.0-brightgreen?style=for-the-badge&logo=googlechrome&logoColor=white)
![Manifest Version](https://img.shields.io/badge/Manifest%20V3-Compatible-blue?style=for-the-badge&logo=chrome&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-yellow?style=for-the-badge)
![Made with](https://img.shields.io/badge/Made%20with-JavaScript-f7df1e?style=for-the-badge&logo=javascript&logoColor=black)
![AEM Compatible](https://img.shields.io/badge/AEM-Compatible-ff6b35?style=for-the-badge&logo=adobe&logoColor=white)

[![GitHub issues](https://img.shields.io/github/issues/piotrgodycki/aem-logger?style=flat-square)](https://github.com/piotrgodycki/aem-logger/issues)
[![GitHub forks](https://img.shields.io/github/forks/piotrgodycki/aem-logger?style=flat-square)](https://github.com/piotrgodycki/aem-logger/network)
[![GitHub stars](https://img.shields.io/github/stars/piotrgodycki/aem-logger?style=flat-square)](https://github.com/piotrgodycki/aem-logger/stargazers)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg?style=flat-square)](http://makeapullrequest.com)

> 🚀 **A powerful Chrome extension for viewing and comparing AEM Author and Publish error logs directly in your browser**

## ✨ Features

- 🔄 **Real-time Log Monitoring** - Auto-refresh logs every 5 seconds
- 📊 **Dual View Support** - View Author and Publish logs side by side
- 🔍 **Advanced Search** - Search through logs with instant filtering
- 🎯 **Log Level Filtering** - Filter by ERROR, WARN, and INFO levels
- ⚡ **Compare Mode** - Compare Author vs Publish logs easily
- 🎨 **Clean UI** - Modern, responsive design for better readability
- 🔒 **Secure** - Works with localhost AEM instances only

## 🎯 Target Audience

Perfect for:
- **AEM Developers** debugging applications
- **QA Teams** investigating issues

## 🛠️ Installation

### From Chrome Web Store (Recommended)
1. Visit the [Chrome Web Store](https://chrome.google.com/webstore)
2. Search for "AEM Error Log Viewer"
3. Click "Add to Chrome"

### Manual Installation
1. Download or clone this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" in the top right
4. Click "Load unpacked" and select the extension folder
5. The extension will appear in your Chrome toolbar

## 🚀 Usage

### Prerequisites
- AEM Author instance running on `http://localhost:4502`
- AEM Publish instance running on `http://localhost:4503`
- Proper AEM permissions to access log files

### Getting Started

1. **Launch the Extension**
   - Click the AEM Logger icon in your Chrome toolbar
   - The popup will open with the log viewer interface

2. **View Logs**
   - Click **"Author Logs"** to view Author instance logs
   - Click **"Publish Logs"** to view Publish instance logs
   - Click **"Compare Logs"** to view both side by side

3. **Filter and Search**
   - Use checkboxes to filter by log levels (ERROR, WARN, INFO)
   - Use the search box to find specific log entries
   - Click **"Refresh Logs"** to manually update

4. **Auto-Refresh**
   - Logs automatically refresh every 5 seconds
   - Real-time monitoring of your AEM instances

## 🔧 Configuration

The extension is configured to work with standard AEM local development setup:

- **Author Instance**: `http://localhost:4502`
- **Publish Instance**: `http://localhost:4503`

### Log Endpoints
- Author: `/system/console/slinglog/tailer.txt?tail=10000&grep=*&name=%2Flogs%2Ferror.log`
- Publish: `/system/console/slinglog/tailer.txt?tail=10000&grep=*&name=%2Flogs%2Ferror.log`

## 📁 Project Structure

```
AEM Logger/
├── manifest.json       # Extension manifest (V3)
├── popup.html         # Main popup interface
├── popup.js           # Popup functionality
├── background.js      # Background service worker
├── content.js         # Content script
├── styles.css         # UI styling
├── logo.png          # Extension icon
└── README.md         # This file
```

## 🔒 Permissions

The extension requires the following permissions:
- **storage** - To save user preferences and settings
- **activeTab** - To interact with AEM console pages
- **host_permissions** - Access to localhost:4502 and localhost:4503

## 🤝 Contributing

We welcome contributions! Here's how you can help:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Development Setup

```bash
# Clone the repository
git clone https://github.com/piotrgodycki/aem-chrome-log-viewer.git
cd aem-chrome-log-viewer

# Load the extension in Chrome
# 1. Open chrome://extensions/
# 2. Enable Developer mode
# 3. Click "Load unpacked" and select this folder
```

## 📝 Changelog

### v1.0.0
- Initial release
- Author and Publish log viewing
- Real-time auto-refresh
- Search and filtering capabilities
- Compare mode

## 🐛 Known Issues

- Works only with localhost AEM instances
- Requires proper AEM console access permissions
- Large log files may impact performance

## 🆘 Support

If you encounter any issues:

1. Check the [Issues](https://github.com/username/aem-logger/issues) page
2. Create a new issue with detailed description
3. Include Chrome version and AEM version information

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Adobe Experience Manager team for the platform
- Chrome Extensions API documentation
- Open source community for inspiration

---

<div align="center">
  <strong>Made with ❤️ for the AEM Developer Community</strong>
</div>

<div align="center">
  <sub>Give it a ⭐ if you like this project!</sub>
</div>