let isOpen = false;
let currentAttachment = null;
let currentSources = [];
let messageId = 0;

// Initialize drag and drop and scroll handling
document.addEventListener('DOMContentLoaded', function() {
    initializeDragAndDrop();
    initializeScrollHandling();
});

function toggleChat() {
    const popup = document.getElementById('chatPopup');
    const toggle = document.getElementById('chatToggle');
    isOpen = !isOpen;
    popup.style.display = isOpen ? 'flex' : 'none';
    popup.setAttribute('aria-hidden', !isOpen);
    toggle.setAttribute('aria-expanded', isOpen);
    toggle.setAttribute('aria-label', isOpen ? 'Close chat assistant' : 'Open chat assistant');
    
    if (isOpen) {
        document.getElementById('messageInput').focus();
        updateScrollButton();
        announceToScreenReader('Chat opened');
    } else {
        // Exit fullscreen when closing chat
        if (popup.classList.contains('fullscreen')) {
            popup.classList.remove('fullscreen');
            updateFullscreenButton();
        }
        announceToScreenReader('Chat closed');
    }
}

function toggleFullscreen() {
    const popup = document.getElementById('chatPopup');
    const fullscreenBtn = document.getElementById('fullscreenBtn');
    
    popup.classList.toggle('fullscreen');
    updateFullscreenButton();
    
    if (popup.classList.contains('fullscreen')) {
        announceToScreenReader('Chat expanded to fullscreen');
    } else {
        announceToScreenReader('Chat restored to normal size');
    }
}

function updateFullscreenButton() {
    const popup = document.getElementById('chatPopup');
    const fullscreenBtn = document.getElementById('fullscreenBtn');
    
    if (popup.classList.contains('fullscreen')) {
        fullscreenBtn.innerHTML = '⛶';
        fullscreenBtn.title = 'Exit fullscreen';
        fullscreenBtn.setAttribute('aria-label', 'Exit fullscreen');
    } else {
        fullscreenBtn.innerHTML = '⛶';
        fullscreenBtn.title = 'Enter fullscreen';
        fullscreenBtn.setAttribute('aria-label', 'Enter fullscreen');
    }
}

let sourcesToggleTimeout = null;
let originalSourcesContent = null;

function toggleSourcesPanel() {
    const panel = document.getElementById('sourcesPanel');
    const popup = document.getElementById('chatPopup');
    const btn = document.getElementById('sourcesBtn');
    const sourcesList = document.getElementById('sourcesList');
    const sourcesHeader = panel.querySelector('.sources-header');
    
    const isOpen = panel.classList.contains('open');
    
    // Clear any pending toggle to prevent rapid firing
    if (sourcesToggleTimeout) {
        clearTimeout(sourcesToggleTimeout);
    }
    
    if (isOpen) {
        // Closing: save content, replace with empty, then close panel
        originalSourcesContent = {
            list: sourcesList.innerHTML,
            header: sourcesHeader.innerHTML
        };
        
        // Clear content immediately
        sourcesList.innerHTML = '';
        sourcesHeader.innerHTML = '';
        
        // After a brief pause, close the empty panel
        sourcesToggleTimeout = setTimeout(() => {
            panel.classList.remove('open');
            popup.classList.remove('sources-open');
        }, 150);
    } else {
        // Opening: expand panel first
        panel.classList.add('open');
        popup.classList.add('sources-open');
        
        // Hide notification dot when opening panel
        hideSourcesNotification();
        
        // Restore content if it was saved
        if (originalSourcesContent) {
            sourcesList.innerHTML = originalSourcesContent.list;
            sourcesHeader.innerHTML = originalSourcesContent.header;
            originalSourcesContent = null;
        }
    }
    
    // Update button appearance and accessibility
    btn.setAttribute('aria-pressed', !isOpen);
    if (!isOpen) {
        btn.style.background = 'rgba(255,255,255,0.3)';
        announceToScreenReader('Sources panel opened');
    } else {
        btn.style.background = 'rgba(255,255,255,0.2)';
        announceToScreenReader('Sources panel closed');
    }
}

function scrollToBottom() {
    const messagesContainer = document.getElementById('chatMessages');
    messagesContainer.scrollTo({ top: messagesContainer.scrollHeight, behavior: 'smooth' });
}

function initializeScrollHandling() {
    const messagesContainer = document.getElementById('chatMessages');
    const scrollBtn = document.getElementById('scrollToTop');
    
    messagesContainer.addEventListener('scroll', function() {
        updateScrollButton();
    });
}

function updateScrollButton() {
    const messagesContainer = document.getElementById('chatMessages');
    const scrollBtn = document.getElementById('scrollToTop');
    
    // Show button when user is not at the bottom
    const isAtBottom = messagesContainer.scrollTop + messagesContainer.clientHeight >= messagesContainer.scrollHeight - 20;
    
    if (!isAtBottom && messagesContainer.scrollHeight > messagesContainer.clientHeight) {
        scrollBtn.classList.add('visible');
    } else {
        scrollBtn.classList.remove('visible');
    }
}

function initializeDragAndDrop() {
    const chatPopup = document.getElementById('chatPopup');
    const dragOverlay = document.getElementById('dragOverlay');
    let dragCounter = 0;

    chatPopup.addEventListener('dragenter', function(e) {
        e.preventDefault();
        dragCounter++;
        if (dragCounter === 1) {
            dragOverlay.classList.add('active');
        }
    });

    chatPopup.addEventListener('dragleave', function(e) {
        e.preventDefault();
        dragCounter--;
        if (dragCounter === 0) {
            dragOverlay.classList.remove('active');
        }
    });

    chatPopup.addEventListener('dragover', function(e) {
        e.preventDefault();
    });

    chatPopup.addEventListener('drop', function(e) {
        e.preventDefault();
        dragCounter = 0;
        dragOverlay.classList.remove('active');
        
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            const file = files[0];
            handleFileSelection(file);
        }
    });
}

function handleKeyPress(event) {
    if (event.key === 'Enter') {
        sendMessage();
    }
}

function handleAttachment(event) {
    const file = event.target.files[0];
    if (file) {
        handleFileSelection(file);
    }
}

function handleFileSelection(file) {
    const maxSize = 16 * 1024 * 1024; // 16MB
    if (file.size > maxSize) {
        showFileError('File is too large. Maximum size is 16MB.');
        return;
    }
    
    const allowedTypes = ['pdf', 'png', 'jpg', 'jpeg', 'gif', 'bmp', 'tiff'];
    const fileExt = file.name.split('.').pop().toLowerCase();
    if (!allowedTypes.includes(fileExt)) {
        showFileError('File type not supported. Please use PDF, PNG, JPG, or other image formats.');
        return;
    }
    
    // Store the attachment
    currentAttachment = file;
    
    // Show attachment preview
    const preview = document.getElementById('attachmentPreview');
    const nameSpan = document.getElementById('attachmentName');
    const statusDiv = document.getElementById('fileStatus');
    
    nameSpan.textContent = file.name;
    statusDiv.textContent = 'Ready to send';
    statusDiv.className = 'file-status';
    preview.style.display = 'flex';
    
    // Update placeholder text
    const input = document.getElementById('messageInput');
    input.placeholder = `Ask something about ${file.name}...`;
    
    // Emit metrics event
    emitMetric('file_attached', { filename: file.name, size: file.size });
}

function showFileError(message) {
    const statusDiv = document.getElementById('fileStatus');
    if (statusDiv) {
        statusDiv.textContent = message;
        statusDiv.className = 'file-status error';
        setTimeout(() => {
            clearAttachment();
        }, 3000);
    } else {
        alert(message);
    }
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
    
    // Prevent duplicate calls - check if already processing
    if (sendBtn.disabled) return;
    
    sendBtn.disabled = true;
    
    // Create unique message ID
    const msgId = ++messageId;
    
    // Display user message
    let displayMessage = message;
    if (currentAttachment) {
        displayMessage = `📎 ${currentAttachment.name}\n${message}`;
    }
    addMessage(displayMessage, 'user', [], msgId);
    
    input.value = '';
    
    // Show typing indicator
    showTyping(true);
    
    // Update file status if attachment exists
    if (currentAttachment) {
        const statusDiv = document.getElementById('fileStatus');
        if (statusDiv) {
            statusDiv.textContent = 'Processing...';
            statusDiv.className = 'file-status processing';
        }
    }
    
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
        
        if (!response.ok) {
            throw new Error(`Server error: ${response.status}`);
        }
        
        const data = await response.json();
        console.log('Received data:', data);
        
        showTyping(false);
        
        // Add detailed logging to catch any errors
        try {
            console.log('About to call addMessage with:', data.response);
            addMessage(data.response, 'bot', data.sources || [], msgId + 1);
            console.log('addMessage completed successfully');
            
            // Update sources panel
            console.log('About to update sources panel');
            updateSourcesPanel(data.sources || []);
            console.log('Sources panel updated');
            
        } catch (messageError) {
            console.error('Error in message processing:', messageError);
            console.error('Error stack:', messageError.stack);
            // Don't show the error to user, just log it
            throw messageError; // Re-throw to trigger main error handler
        }
        
        // Clear attachment after successful sending
        if (currentAttachment) {
            clearAttachment();
            // Temporarily disable this to see if it's causing issues
            // emitMetric('file_processed', { filename: currentAttachment.name });
        }
        
        // Temporarily disable this to see if it's causing issues
        // emitMetric('message_sent', { hasAttachment: !!currentAttachment });
        
    } catch (error) {
        console.error('Error sending message:', error);
        showTyping(false);
        
        // Show error message with retry option
        const errorMsg = 'Sorry, I\'m having trouble connecting right now.';
        addErrorMessage(errorMsg, message, currentAttachment, msgId + 1);
        
        // Update file status if attachment exists
        if (currentAttachment) {
            const statusDiv = document.getElementById('fileStatus');
            if (statusDiv) {
                statusDiv.textContent = 'Failed to process';
                statusDiv.className = 'file-status error';
            }
        }
        
        emitMetric('message_error', { error: error.message });
    }
    
    sendBtn.disabled = false;
    updateScrollButton();
}

function addErrorMessage(errorText, originalMessage, originalAttachment, msgId) {
    const messagesContainer = document.getElementById('chatMessages');
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message bot-message error';
    messageDiv.setAttribute('data-message-id', msgId);
    
    const retryBtn = document.createElement('button');
    retryBtn.className = 'retry-btn';
    retryBtn.textContent = '↻ Try again';
    retryBtn.onclick = () => retryMessage(originalMessage, originalAttachment, messageDiv);
    
    messageDiv.innerHTML = errorText;
    messageDiv.appendChild(retryBtn);
    
    messagesContainer.appendChild(messageDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function retryMessage(message, attachment, errorElement) {
    // Remove error message
    errorElement.remove();
    
    // Restore original state
    const input = document.getElementById('messageInput');
    input.value = message;
    
    if (attachment) {
        currentAttachment = attachment;
        const preview = document.getElementById('attachmentPreview');
        const nameSpan = document.getElementById('attachmentName');
        const statusDiv = document.getElementById('fileStatus');
        
        nameSpan.textContent = attachment.name;
        statusDiv.textContent = 'Ready to send';
        statusDiv.className = 'file-status';
        preview.style.display = 'flex';
        
        input.placeholder = `Ask something about ${attachment.name}...`;
    }
    
    // Retry sending
    sendMessage();
}

function updateSourcesPanel(sources) {
    currentSources = sources;
    const sourcesList = document.getElementById('sourcesList');
    const notificationDot = document.getElementById('sourcesNotificationDot');
    const sourcesPanel = document.getElementById('sourcesPanel');
    
    if (!sources || sources.length === 0) {
        sourcesList.innerHTML = '<p class="no-sources">No sources for this response.</p>';
        hideSourcesNotification();
        return;
    }
    
    // Show notification dot if sources panel is closed and there are new sources
    if (!sourcesPanel.classList.contains('open') && sources.length > 0) {
        showSourcesNotification();
    }
    
    let sourcesHTML = '';
    sources.forEach((source, index) => {
        let linkUrl = source.uri;
        if (source.snippet && source.snippet.length > 5) {
            linkUrl = `${source.uri}#:~:text=${encodeURIComponent(source.snippet)}`;
        }
        
        sourcesHTML += `
            <div class="source-item" data-source-index="${index}" data-source-url="${linkUrl}" role="button" tabindex="0" aria-label="Source: ${source.title}" onclick="showSourceContextMenu(event, ${index}, '${linkUrl.replace(/'/g, "\\'")}')" oncontextmenu="showSourceContextMenu(event, ${index}, '${linkUrl.replace(/'/g, "\\'")}')" style="position: relative;">
                <div class="source-title">${source.title}</div>
                <div class="source-snippet">${source.snippet || ''}</div>
            </div>
        `;
    });
    
    sourcesList.innerHTML = sourcesHTML;
    
    // Add keyboard support for source items
    document.querySelectorAll('.source-item').forEach(item => {
        item.addEventListener('keypress', function(e) {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                const index = parseInt(this.getAttribute('data-source-index'));
                const url = this.getAttribute('data-source-url');
                showSourceContextMenu(e, index, url);
            }
        });
    });
}

function showSourcesNotification() {
    const notificationDot = document.getElementById('sourcesNotificationDot');
    notificationDot.classList.add('show', 'pulse');
}

function hideSourcesNotification() {
    const notificationDot = document.getElementById('sourcesNotificationDot');
    notificationDot.classList.remove('show', 'pulse');
}

function highlightSource(sourceIndex) {
    // Highlight source in panel
    document.querySelectorAll('.source-item').forEach(item => {
        item.classList.remove('highlighted');
        item.setAttribute('aria-selected', 'false');
    });
    
    const sourceItem = document.querySelector(`[data-source-index="${sourceIndex}"]`);
    if (sourceItem) {
        sourceItem.classList.add('highlighted');
        sourceItem.setAttribute('aria-selected', 'true');
        sourceItem.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    
    // Find and highlight corresponding link in messages
    document.querySelectorAll('.footnote-link').forEach(link => {
        link.style.backgroundColor = 'transparent';
        link.style.fontWeight = '500';
    });
    
    const targetLinks = document.querySelectorAll(`.footnote-link[data-source-index="${sourceIndex}"]`);
    targetLinks.forEach(link => {
        link.style.backgroundColor = '#fff3cd';
        link.style.fontWeight = '700';
        if (targetLinks.length === 1) {
            link.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    });
    
    // Reset highlighting after a moment
    setTimeout(() => {
        targetLinks.forEach(link => {
            link.style.backgroundColor = 'transparent';
            link.style.fontWeight = '500';
        });
    }, 2000);
    
    // Announce to screen readers
    const source = currentSources[sourceIndex];
    if (source) {
        const announcement = `Highlighted source: ${source.title}`;
        announceToScreenReader(announcement);
    }
}

function emitMetric(eventType, data) {
    try {
        window.dispatchEvent(new CustomEvent('chat_metric', {
            detail: { type: eventType, ...data }
        }));
    } catch (e) {
        // Metrics are optional, don't break functionality
        console.debug('Metrics not available:', e);
    }
}

// Accessibility helper function
function announceToScreenReader(message) {
    const announcement = document.createElement('div');
    announcement.setAttribute('aria-live', 'polite');
    announcement.setAttribute('aria-atomic', 'true');
    announcement.setAttribute('class', 'sr-only');
    announcement.style.position = 'absolute';
    announcement.style.left = '-10000px';
    announcement.style.width = '1px';
    announcement.style.height = '1px';
    announcement.style.overflow = 'hidden';
    announcement.textContent = message;
    
    document.body.appendChild(announcement);
    
    // Remove after announcement
    setTimeout(() => {
        document.body.removeChild(announcement);
    }, 1000);
}

function showSourceContextMenu(event, sourceIndex, sourceUrl) {
    event.preventDefault();
    event.stopPropagation();
    
    // Remove any existing context menu
    const existingMenu = document.querySelector('.source-context-menu');
    if (existingMenu) {
        existingMenu.remove();
    }
    
    // Create context menu
    const menu = document.createElement('div');
    menu.className = 'source-context-menu';
    menu.innerHTML = `
        <div class="context-menu-item" onclick="highlightSource(${sourceIndex}); closeContextMenu();">
            📍 Highlight in Chat
        </div>
        <div class="context-menu-item" onclick="window.open('${sourceUrl}', '_blank'); closeContextMenu();">
            🔗 Open Source
        </div>
    `;
    
    // Position the menu
    const rect = event.target.closest('.source-item').getBoundingClientRect();
    menu.style.position = 'fixed';
    menu.style.top = (rect.top + 10) + 'px';
    menu.style.left = (rect.right - 120) + 'px';
    menu.style.zIndex = '10000';
    
    document.body.appendChild(menu);
    
    // Close menu when clicking outside
    setTimeout(() => {
        document.addEventListener('click', closeContextMenu);
    }, 10);
}

function closeContextMenu() {
    const menu = document.querySelector('.source-context-menu');
    if (menu) {
        menu.remove();
    }
    document.removeEventListener('click', closeContextMenu);
}

function addMessage(text, sender, sources = [], msgId = null) {
    const messagesContainer = document.getElementById('chatMessages');
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${sender}-message`;
    if (msgId) {
        messageDiv.setAttribute('data-message-id', msgId);
    }
    
    console.log('Processing message:', text);
    console.log('Sources received:', sources);
    
    let messageContent = text
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\n/g, '<br>');
    
    console.log('After markdown conversion:', messageContent);
    
    if (sources && sources.length > 0) {
        console.log('Processing sources for footnotes');
        sources.forEach((source, index) => {
            console.log('Processing source:', source);
            // Keep the [number] pattern but make it clickable
            const footnoteRegex = new RegExp(`\\[${source.number}\\]`, 'g');
            let linkUrl = source.uri;
            if (source.snippet && source.snippet.length > 5) {
                linkUrl = `${source.uri}#:~:text=${encodeURIComponent(source.snippet)}`;
            }
            messageContent = messageContent.replace(footnoteRegex, 
                `<a href="${linkUrl}" class="footnote-link" target="_blank" rel="noopener noreferrer" title="${source.title} - ${source.snippet || ''}" data-source-index="${index}" onclick="event.preventDefault(); highlightSource(${index}); window.open('${linkUrl}', '_blank');" aria-label="Source ${source.number}: ${source.title}">[${source.number}]</a>`);
        });
    }
    
    console.log('Final message content:', messageContent);
    messageDiv.innerHTML = messageContent;
    messagesContainer.appendChild(messageDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
    
    // Update scroll button visibility
    updateScrollButton();
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
