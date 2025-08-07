let isOpen = false;

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

async function sendMessage() {
    const input = document.getElementById('messageInput');
    const message = input.value.trim();
    if (!message) return;
    addMessage(message, 'user');
    input.value = '';
    showTyping(true);
    document.getElementById('sendBtn').disabled = true;
    try {
        const response = await fetch('/chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ message: message })
        });
        const data = await response.json();
        console.log('Received data:', data);  // Debug log
        console.log('Sources:', data.sources);  // Debug log
        showTyping(false);
        addMessage(data.response, 'bot', data.sources);
    } catch (error) {
        showTyping(false);
        addMessage('Sorry, I\'m having trouble connecting right now. Please try again later.', 'bot');
    }
    document.getElementById('sendBtn').disabled = false;
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
