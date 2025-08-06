# ccc-policy-readability
A smart assistant for CCCApply built with Amazon Bedrock

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

## Features

- Floating chat widget with smooth animations
- Real-time responses from Amazon Bedrock
- Source citations with clickable footnotes
- Responsive design for various screen sizes
- Easy integration into existing websites

## Integration

To add the chatbot to your website, include the CSS, JS, and HTML widget code from the provided files.
