# ccc-policy-readability
A smart assistant for CCCApply built with Amazon Bedrock

## Quick Setup & Launch

### 1. Create virtual environment
```bash
python -m venv venv # or use Python: Select Intepreter
source .venv/bin/activate  # On Windows: venv\Scripts\activate
```

### 2. Install dependencies
```bash
pip install -r requirements_chatbot.txt
```

### 3. Set AWS credentials
```bash
export AWS_ACCESS_KEY_ID="your_access_key"
export AWS_SECRET_ACCESS_KEY="your_secret_key" 
export AWS_SESSION_TOKEN="your_session_token"
```

### 4. Start the server
```bash
python chatbot_backend.py
```

### 5. Open in browser
Go to: `http://localhost:5000`

### 6. Test the chatbot
Click the blue chat button in the bottom-right corner.

### 7. Upload files (optional)
Click the green upload button to upload images for AI analysis.

---

## Files Overview

This project includes a complete chatbot widget implementation:

### Frontend Files
- **chatbot_widget.html** - Demo page with embedded chat widget
- **chatbot_widget.css** - Styling for the chat interface
- **chatbot_widget.js** - Client-side chat functionality

### Backend File
- **chatbot_backend.py** - Flask server that connects to Amazon Bedrock Knowledge Base

## Setup

**Before running the application, you need to:**

1. **Configure AWS credentials:**
   ```bash
   aws configure
   ```
   Enter your AWS Access Key ID, Secret Access Key, and region.

2. **Update configuration in the code:**
   - Replace `knowledgeBaseId` with your Bedrock Knowledge Base ID
   - Update `region_name` to match your AWS region
   - Modify `modelArn` if using a different Bedrock model

3. **Ensure AWS permissions:**
   Your AWS user/role needs permissions for:
   - `bedrock:InvokeModel`
   - `bedrock-agent-runtime:Retrieve`
   - `bedrock-agent-runtime:RetrieveAndGenerate`

## Quick Start

1. **Start the backend server:**
   ```bash
   python chatbot_backend.py
   ```
   Server runs on http://localhost:5000

2. **Open the demo:**
   Open `chatbot_widget.html` in your browser

3. **Test the chatbot:**
   Click the blue chat button in the bottom-right corner

4. **Upload images (optional):**
   Click the green upload button to analyze images with AI

## Features

- Floating chat widget with smooth animations
- Real-time responses from Amazon Bedrock
- File upload support for images (automatic AI analysis)
- Source citations with clickable footnotes
- Responsive design for various screen sizes
- Easy integration into existing websites

## Integration

To add the chatbot to your website, include the CSS, JS, and HTML widget code from the provided files.
