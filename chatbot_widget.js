let isOpen = false;
let currentAttachment = null;

function toggleChat() {
    const popup = document.getElementById('chatPopup');
    isOpen = !isOpen;
    popup.style.display = isOpen ? 'flex' : 'none';
    if (isOpen) {
        document.getElementById('messageInput').focus();
    }
}

function handleKeyPress(event) {
    if (event.key === 'Enter') {
        sendMessage();
    }
}

function handleAttachment(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const maxSize = 16 * 1024 * 1024; // 16MB
    if (file.size > maxSize) {
        alert('File is too large. Maximum size is 16MB.');
        return;
    }
    
    // Store the attachment
    currentAttachment = file;
    
    // Show attachment preview
    const preview = document.getElementById('attachmentPreview');
    const nameSpan = document.getElementById('attachmentName');
    nameSpan.textContent = file.name;
    preview.style.display = 'flex';
    
    // Update placeholder text
    const input = document.getElementById('messageInput');
    input.placeholder = `Ask something about ${file.name}...`;
}

function clearAttachment() {
    currentAttachment = null;
    const preview = document.getElementById('attachmentPreview');
    preview.style.display = 'none';
    
    // Reset placeholder
    const input = document.getElementById('messageInput');
    input.placeholder = 'Ask me anything...';
    
    // Clear file input
    document.getElementById('attachmentInput').value = '';
}

async function sendMessage() {
    const input = document.getElementById('messageInput');
    const message = input.value.trim();
    
    if (!message && !currentAttachment) return;
    
    const sendBtn = document.getElementById('sendBtn');
    sendBtn.disabled = true;
    
    // Display user message
    let displayMessage = message;
    if (currentAttachment) {
        displayMessage = `📎 ${currentAttachment.name}\n${message}`;
    }
    addMessage(displayMessage, 'user');
    
    input.value = '';
    showTyping(true);
    
    try {
        let response;
        
        if (currentAttachment) {
            // Send message with attachment
            const formData = new FormData();
            formData.append('message', message);
            formData.append('file', currentAttachment);
            
            response = await fetch('/chat', {
                method: 'POST',
                body: formData
            });
        } else {
            // Send regular message
            response = await fetch('/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ message: message })
            });
        }
        
        const data = await response.json();
        console.log('Received data:', data);
        
        showTyping(false);
        addMessage(data.response, 'bot', data.sources);
        
        // Clear attachment after sending
        if (currentAttachment) {
            clearAttachment();
        }
        
    } catch (error) {
        showTyping(false);
        addMessage('Sorry, I\'m having trouble connecting right now. Please try again later.', 'bot');
    }
    
    sendBtn.disabled = false;
}

function addMessage(text, sender, sources = []) {
    const messagesContainer = document.getElementById('chatMessages');
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${sender}-message`;
    console.log('Processing message:', text);  // Debug log
    console.log('Sources received:', sources);  // Debug log
    let messageContent = text
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\n/g, '<br>');
    console.log('After markdown conversion:', messageContent);  // Debug log
    if (sources && sources.length > 0) {
        console.log('Processing sources for footnotes');  // Debug log
        sources.forEach(source => {
            console.log('Processing source:', source);  // Debug log
            const footnoteRegex = new RegExp(`\\[${source.number}\\]`, 'g');
            let linkUrl = source.uri;
            if (source.snippet && source.snippet.length > 5) {
                linkUrl = `${source.uri}#:~:text=${encodeURIComponent(source.snippet)}`;
            }
            messageContent = messageContent.replace(footnoteRegex, 
                `<a href="${linkUrl}" class="footnote-link" target="_blank" rel="noopener noreferrer" title="${source.title} - ${source.snippet || ''}">[${source.number}]</a>`);
        });
    }
    console.log('Final message content:', messageContent);  // Debug log
    messageDiv.innerHTML = messageContent;
    messagesContainer.appendChild(messageDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function showTyping(show) {
    const typingIndicator = document.getElementById('typingIndicator');
    const messagesContainer = document.getElementById('chatMessages');
    if (show) {
        typingIndicator.style.display = 'block';
        messagesContainer.appendChild(typingIndicator);
    } else {
        typingIndicator.style.display = 'none';
    }
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}
