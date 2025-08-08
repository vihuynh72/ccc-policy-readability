let isOpen = false;
let currentAttachment = null;
let currentSources = [];
let messageId = 0;
let conversationHistory = []; // Store conversation context for current session
let allConversationSources = []; // Accumulate all sources from the conversation without duplicates

// Language support variables
let currentLanguage = 'en';
let supportedLanguages = {};
let isLanguageDropdownOpen = false;

// Initialize drag and drop and scroll handling
document.addEventListener('DOMContentLoaded', function() {
    initializeDragAndDrop();
    initializeScrollHandling();
    initializeKeyboardShortcuts();
    initializeLanguageSupport();
    
    // Initialize textarea height
    const messageInput = document.getElementById('messageInput');
    if (messageInput) {
        autoResizeTextarea(messageInput);
    }

    // Expose debug helpers for quick end-to-end testing
    try {
        window.chatDebug = {
            async runTest() {
                const payload = { message: 'Please return test sources [TEST_SOURCES]', conversation_history: [], test_sources: true };
                const res = await fetch('/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
                const data = await res.json();
                console.log('[chatDebug] /chat data ->', data);
                let responseText = data.response || data.answer || '';
                let sourcesFromJson = data.sources || data.citations || [];
                if ((!Array.isArray(sourcesFromJson) || sourcesFromJson.length === 0) && Array.isArray(data.citations)) {
                    sourcesFromJson = flattenCitations(data.citations);
                }
                const normalized = normalizeSources(sourcesFromJson);
                console.log('[chatDebug] normalized sources ->', normalized);
                if (normalized.length === 0) {
                    const derived = deriveSourcesFromResponseText(responseText);
                    console.log('[chatDebug] derived from text ->', derived);
                    updateSourcesPanel(derived);
                    addMessage(responseText, 'bot', derived, ++messageId);
                } else {
                    updateSourcesPanel(normalized);
                    addMessage(responseText, 'bot', normalized, ++messageId);
                }
            },
            logState() {
                const panel = document.getElementById('sourcesPanel');
                const list = document.getElementById('sourcesList');
                const header = document.getElementById('sourcesHeaderTitle');
                console.log('[chatDebug] state ->', {
                    allConversationSources,
                    currentSources,
                    isPanelOpen: panel ? panel.classList.contains('open') : null,
                    listExists: !!list,
                    headerExists: !!header,
                    listHTMLLength: list ? list.innerHTML.length : -1
                });
            },
            panelDom() {
                const panel = document.getElementById('sourcesPanel');
                console.log('[chatDebug] panel DOM ->', panel);
            }
        };
        console.log('[chatDebug] available. Try: chatDebug.runTest() or chatDebug.logState()');
    } catch (e) {}
});

// Language Support Functions
async function initializeLanguageSupport() {
    try {
        // Load supported languages from backend
        const response = await fetch('/languages');
        const data = await response.json();
        supportedLanguages = data.languages;
        
        // Set initial language from browser or saved preference (without showing message)
        const savedLang = localStorage.getItem('chatbot_language') || getBrowserLanguage();
        if (savedLang && supportedLanguages[savedLang]) {
            setLanguageQuiet(savedLang);
        }
        
        // Close dropdown when clicking outside
        document.addEventListener('click', function(event) {
            const dropdown = document.getElementById('languageDropdown');
            const button = document.getElementById('languageBtn');
            
            if (dropdown && button && !button.contains(event.target) && !dropdown.contains(event.target)) {
                closeLanguageDropdown();
            }
        });
        
        console.log('Language support initialized:', supportedLanguages);
    } catch (error) {
        console.error('Failed to initialize language support:', error);
    }
}

function getBrowserLanguage() {
    const lang = navigator.language || navigator.userLanguage;
    if (!lang) return 'en';
    
    // Extract main language code (e.g., 'en' from 'en-US')
    const mainLang = lang.split('-')[0].toLowerCase();
    return mainLang;
}

function toggleLanguageDropdown() {
    const dropdown = document.getElementById('languageDropdown');
    if (!dropdown) return;
    
    if (isLanguageDropdownOpen) {
        closeLanguageDropdown();
    } else {
        openLanguageDropdown();
    }
}

function openLanguageDropdown() {
    const dropdown = document.getElementById('languageDropdown');
    if (!dropdown) return;
    
    dropdown.classList.add('show');
    isLanguageDropdownOpen = true;
    
    // Update active state
    updateLanguageDropdownSelection();
}

function closeLanguageDropdown() {
    const dropdown = document.getElementById('languageDropdown');
    if (!dropdown) return;
    
    dropdown.classList.remove('show');
    isLanguageDropdownOpen = false;
}

function updateLanguageDropdownSelection() {
    const options = document.querySelectorAll('.language-option');
    options.forEach(option => {
        const lang = option.getAttribute('data-lang');
        if (lang === currentLanguage) {
            option.classList.add('active');
        } else {
            option.classList.remove('active');
        }
    });
}

function selectLanguage(languageCode) {
    if (!languageCode || !supportedLanguages[languageCode]) {
        console.warn('Invalid language code:', languageCode);
        return;
    }
    
    currentLanguage = languageCode;
    
    // Update UI
    updateLanguageDisplay();
    updateLanguageDropdownSelection();
    
    // Save preference
    localStorage.setItem('chatbot_language', languageCode);
    
    // Close dropdown
    closeLanguageDropdown();
    
    // Add a language change message to the chat
    addLanguageChangeMessage(languageCode);
    
    console.log('Language changed to:', languageCode, supportedLanguages[languageCode]);
}

function setLanguageQuiet(languageCode) {
    if (!languageCode || !supportedLanguages[languageCode]) {
        console.warn('Invalid language code:', languageCode);
        return;
    }
    
    currentLanguage = languageCode;
    
    // Update UI
    updateLanguageDisplay();
    updateLanguageDropdownSelection();
    
    // Save preference
    localStorage.setItem('chatbot_language', languageCode);
    
    // Close dropdown
    closeLanguageDropdown();
    
    // Don't add a language change message - this is for quiet initialization
    console.log('Language set to:', languageCode, supportedLanguages[languageCode]);
}

function updateLanguageDisplay() {
    const currentLangElement = document.getElementById('currentLanguage');
    if (currentLangElement) {
        currentLangElement.textContent = currentLanguage.toUpperCase();
    }
}

function addLanguageChangeMessage(languageCode) {
    const languageName = supportedLanguages[languageCode] || languageCode;
    const message = `Language changed to ${languageName}. I'll respond in ${languageName} from now on.`;
    
    // Add a small system message
    const chatMessages = document.getElementById('chatMessages');
    if (chatMessages) {
        const systemMessage = document.createElement('div');
        systemMessage.className = 'message system-message';
        systemMessage.style.fontSize = '12px';
        systemMessage.style.color = '#666';
        systemMessage.style.fontStyle = 'italic';
        systemMessage.style.textAlign = 'center';
        systemMessage.style.margin = '8px 0';
        systemMessage.textContent = message;
        
        chatMessages.appendChild(systemMessage);
        scrollToBottom();
    }
}

// --- Helpers to robustly consume backend JSON and sources ---
function safeParseJson(text) {
    try { return JSON.parse(text); } catch { return null; }
}

function normalizeSources(sourcesMaybe) {
    if (!sourcesMaybe) return [];
    let arr = Array.isArray(sourcesMaybe) ? sourcesMaybe : [];
    const norm = [];
    arr.forEach((s, idx) => {
        if (!s) return;
        const uri = s.uri || s.url || s.href || s.link || '';
        const titleBase = s.title || s.name || s.document || s.filename || '';
        const title = titleBase || (uri ? uri.split('/').pop().replace(/[#?].*/, '') : `Source ${idx + 1}`);
        const snippet = s.snippet || s.text || s.quote || s.content || s.excerpt || '';
        const number = typeof s.number === 'number' ? s.number : (norm.length + 1);
        norm.push({ number, title, uri, snippet });
    });
    return norm;
}

function markdownToHtml(md) {
    if (!md || typeof md !== 'string') return '';
    return md
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
        .replace(/\n/g, '<br>');
}

function deriveSourcesFromResponseText(responseText) {
    const html = markdownToHtml(responseText || '');
    try {
        return extractSourcesFromMessageHtml(html);
    } catch {
        return [];
    }
}

// Flatten Bedrock-style citations into normalized sources
function flattenCitations(citations) {
    if (!Array.isArray(citations)) return [];
    const byUri = new Map();
    citations.forEach(c => {
        const refs = (c && c.retrievedReferences) || [];
        refs.forEach(ref => {
            const loc = (ref && ref.location) || {};
            const contentText = (ref && ref.content && ref.content.text) || '';
            const snippet = (contentText || '').trim().slice(0, 200);
            let uri = '';
            let title = '';
            if (loc.webLocation && loc.webLocation.url) {
                uri = loc.webLocation.url;
            } else if (loc.s3Location && loc.s3Location.uri) {
                uri = loc.s3Location.uri;
            }
            if (ref.metadata && ref.metadata.title) {
                title = ref.metadata.title;
            }
            if (!title) {
                title = uri ? uri.split('/').pop().replace(/[#?].*/, '') : '';
            }
            if (!uri && !snippet) return;
            const key = uri || `${title}|${snippet}`;
            if (!byUri.has(key)) {
                byUri.set(key, { title: title || 'Document', uri, snippet });
            }
        });
    });
    let n = 1;
    return Array.from(byUri.values()).map(s => ({ number: n++, ...s }));
}

function initializeKeyboardShortcuts() {
    document.addEventListener('keydown', function(event) {
        // Only handle shortcuts when chat is open
        if (!isOpen) return;
        
        // F key to toggle fullscreen
        if (event.key === 'f' || event.key === 'F') {
            // Don't trigger if user is typing in an input field
            if (event.target.tagName.toLowerCase() === 'input' || 
                event.target.tagName.toLowerCase() === 'textarea') {
                return;
            }
            event.preventDefault();
            toggleFullscreen();
        }
        
        // ESC key to exit fullscreen (or close chat if not in fullscreen)
        if (event.key === 'Escape') {
            const popup = document.getElementById('chatPopup');
            if (popup.classList.contains('fullscreen')) {
                event.preventDefault();
                // Exit fullscreen
                popup.classList.remove('fullscreen');
                updateFullscreenButton();
                announceToScreenReader('Exited fullscreen mode');
            }
        }
    });
}

function toggleChat() {
    const popup = document.getElementById('chatPopup');
    const toggle = document.getElementById('chatToggle');
    isOpen = !isOpen;
    popup.style.display = isOpen ? 'flex' : 'none';
    popup.setAttribute('aria-hidden', !isOpen);
    toggle.setAttribute('aria-expanded', isOpen);
    toggle.setAttribute('aria-label', isOpen ? 'Close chat assistant' : 'Open chat assistant');
    
    if (isOpen) {
        const messageInput = document.getElementById('messageInput');
        messageInput.focus();
        // Ensure textarea is properly sized on open
        autoResizeTextarea(messageInput);
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
let sourcesBorderTimeout = null; // delay adding unified border until panel is open

function toggleSourcesPanel() {
    const panel = document.getElementById('sourcesPanel');
    const popup = document.getElementById('chatPopup');
    const btn = document.getElementById('sourcesBtn');
    const sourcesList = document.getElementById('sourcesList');
    const sourcesHeader = panel.querySelector('.sources-header');
    // Keep CSS variable in sync for unified border ::before width
    const SOURCES_WIDTH = 320; // keep in sync with CSS default
    
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
        
        // Begin closing: square corners right away
        popup.classList.add('sources-closing');

        // After a brief pause, close the empty panel
        sourcesToggleTimeout = setTimeout(() => {
            panel.classList.remove('open');
            popup.classList.remove('sources-open');
            popup.style.setProperty('--sources-width', '0px');
            if (sourcesBorderTimeout) {
                clearTimeout(sourcesBorderTimeout);
                sourcesBorderTimeout = null;
            }
            // Remove the temporary closing class after the panel fully collapses
            const removeClosingAfter = () => {
                popup.classList.remove('sources-closing');
                panel.removeEventListener('transitionend', removeClosingAfter);
            };
            panel.addEventListener('transitionend', removeClosingAfter);
        }, 150);
    } else {
        // Opening: expand panel first
        panel.classList.add('open');
        // Square corners immediately during opening
        popup.classList.add('sources-opening');
        // Set expected width for unified border (CSS fallback)
        popup.style.setProperty('--sources-width', SOURCES_WIDTH + 'px');

        // Delay adding the unified border until width transition finishes
        const onTransitionEnd = (e) => {
            if (e.propertyName === 'width') {
                popup.classList.add('sources-open');
                popup.classList.remove('sources-opening');
                panel.removeEventListener('transitionend', onTransitionEnd);
                if (sourcesBorderTimeout) {
                    clearTimeout(sourcesBorderTimeout);
                    sourcesBorderTimeout = null;
                }
            }
        };
        panel.addEventListener('transitionend', onTransitionEnd);

        // Fallback in case transitionend doesn't fire (reduced motion, zoom, etc.)
        sourcesBorderTimeout = setTimeout(() => {
            popup.classList.add('sources-open');
            popup.classList.remove('sources-opening');
            panel.removeEventListener('transitionend', onTransitionEnd);
            sourcesBorderTimeout = null;
        }, 420);
        
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

function handleKeyDown(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        sendMessage();
    }
    // Allow Shift+Enter for new lines
}

function autoResizeTextarea(textarea) {
    // First, let it size naturally to get the single-line height
    textarea.style.height = 'auto';
    
    // Calculate what the single line height should be
    // This is font-size * line-height + padding
    const computedStyle = window.getComputedStyle(textarea);
    const fontSize = parseFloat(computedStyle.fontSize); // 15px
    const lineHeight = parseFloat(computedStyle.lineHeight) || fontSize * 1.4; // 1.4 is our line-height
    const paddingTop = parseFloat(computedStyle.paddingTop); // 14px
    const paddingBottom = parseFloat(computedStyle.paddingBottom); // 14px
    const borderWidth = parseFloat(computedStyle.borderTopWidth) + parseFloat(computedStyle.borderBottomWidth); // 4px total
    
    const singleLineHeight = lineHeight + paddingTop + paddingBottom + borderWidth;
    
    // Get the actual content height
    const scrollHeight = textarea.scrollHeight;
    const maxHeight = 120; // Maximum allowed height
    
    // Use the larger of single line height or scroll height, but cap at max
    const newHeight = Math.min(Math.max(singleLineHeight, scrollHeight), maxHeight);
    
    textarea.style.height = newHeight + 'px';
    
    // Update the border radius and padding based on whether it's multi-line
    if (scrollHeight > singleLineHeight + 5) { // Add small buffer
        // Multi-line: reduce border radius for better appearance
        textarea.style.borderRadius = '16px';
    } else {
        // Single line: keep original rounded appearance
        textarea.style.borderRadius = '28px';
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

function clearConversationHistory() {
    conversationHistory = [];
    allConversationSources = [];
    currentSources = [];
    console.log('Conversation history and sources cleared');
    
    // Clear the sources panel
    updateSourcesPanel([]);
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
    // Reset textarea height after clearing
    autoResizeTextarea(input);
    
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
            formData.append('conversation_history', JSON.stringify(conversationHistory));
            formData.append('user_language', currentLanguage);
            formData.append('output_language', currentLanguage);
            
            response = await fetch('/chat', {
                method: 'POST',
                body: formData
            });
        } else {
            // Send regular message with conversation history
            response = await fetch('/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ 
                    message: message,
                    conversation_history: conversationHistory,
                    user_language: currentLanguage,
                    output_language: currentLanguage
                })
            });
        }
        
        if (!response.ok) {
            throw new Error(`Server error: ${response.status}`);
        }
        
        let data;
        try {
            data = await response.json();
        } catch (e) {
            // Fallback: try text and coerce to shape
            const raw = await response.text();
            console.warn('Response is not valid JSON; using text fallback');
            data = safeParseJson(raw) || { response: raw };
        }
        console.log('Received data:', data);
        
        // Normalize backend payload: support {response, sources} or {answer, citations}
        let responseText = (
            data.response ||
            data.answer ||
            (data.output && (data.output.text || data.output.answer)) ||
            (typeof data === 'string' ? data : '')
        );
        let sourcesFromJson = (
            data.sources ||
            data.citations ||
            (data.output && (data.output.sources || data.output.citations)) ||
            []
        );
        console.log('Extracted sourcesFromJson:', sourcesFromJson);
        // If sourcesFromJson is an object, try common wrappers
        if (!Array.isArray(sourcesFromJson) && sourcesFromJson && typeof sourcesFromJson === 'object') {
            if (Array.isArray(sourcesFromJson.references)) {
                sourcesFromJson = sourcesFromJson.references;
            } else if (Array.isArray(sourcesFromJson.items)) {
                sourcesFromJson = sourcesFromJson.items;
            }
        }
        // If citations is a Bedrock structure, flatten it
        if ((!Array.isArray(sourcesFromJson) || (sourcesFromJson.length === 0)) && Array.isArray(data.citations)) {
            const flattened = flattenCitations(data.citations);
            if (flattened.length) sourcesFromJson = flattened;
        }
        let normalizedSources = normalizeSources(sourcesFromJson);
        console.log('Sources from JSON:', sourcesFromJson, 'Normalized:', normalizedSources);
        
        // If backend embedded sources into the text but not JSON, attempt extraction
        if ((!normalizedSources || normalizedSources.length === 0) && responseText) {
            console.log('Attempting to derive sources from response text');
            normalizedSources = deriveSourcesFromResponseText(responseText);
            console.log('Derived sources:', normalizedSources);
        }
        
    // Update panel ASAP so user sees sources even if message rendering fails
    try { updateSourcesPanel(normalizedSources); } catch (e) { console.warn('Early sources panel update failed:', e); }
        
    showTyping(false);
        
        // Add detailed logging to catch any errors
        try {
            console.log('About to call addMessage with:', responseText);
            console.log('normalizedSources:', normalizedSources);
            addMessage(responseText, 'bot', normalizedSources, msgId + 1);
            console.log('addMessage completed successfully');
            
            // Store this exchange in conversation history
            conversationHistory.push({
                role: 'user',
                content: message,
                has_attachment: !!currentAttachment,
                attachment_name: currentAttachment ? currentAttachment.name : null
            });
            conversationHistory.push({
                role: 'assistant', 
                content: responseText
            });
            
            // Keep only last 10 exchanges (20 messages) to prevent context from getting too long
            if (conversationHistory.length > 20) {
                conversationHistory = conversationHistory.slice(-20);
            }
            
            console.log('Conversation history updated:', conversationHistory);
            
            // Update sources panel
            console.log('About to update sources panel');
            updateSourcesPanel(normalizedSources);
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
    autoResizeTextarea(input); // Resize textarea to fit the restored message
    
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

function updateSourcesPanel(newSources) {
    // Add new sources to the accumulated list, avoiding duplicates
    const wasEmpty = allConversationSources.length === 0;
    if (newSources && newSources.length > 0) {
        newSources.forEach(newSource => {
            // Check if this source already exists. Prefer URI when available; otherwise match by snippet+title.
            let existingSource = null;
            if (newSource.uri) {
                existingSource = allConversationSources.find(source => source.uri === newSource.uri);
            } else {
                existingSource = allConversationSources.find(source =>
                    (!source.uri) &&
                    (source.snippet || '').trim() === (newSource.snippet || '').trim() &&
                    (source.title || '').trim() === (newSource.title || '').trim()
                );
            }
            if (!existingSource) {
                // Assign a new number based on total count
                const sourceWithNumber = {
                    ...newSource,
                    number: allConversationSources.length + 1
                };
                allConversationSources.push(sourceWithNumber);
            }
        });
    }
    
    // Update current sources to be all accumulated sources
    currentSources = allConversationSources;
    const sourcesList = document.getElementById('sourcesList');
    const notificationDot = document.getElementById('sourcesNotificationDot');
    const sourcesPanel = document.getElementById('sourcesPanel');
    const sourcesHeaderTitle = document.getElementById('sourcesHeaderTitle');
    const sourcesBtn = document.getElementById('sourcesBtn');
    
    if (!allConversationSources || allConversationSources.length === 0) {
        sourcesList.innerHTML = '<p class="no-sources">No sources for this conversation.</p>';
        hideSourcesNotification();
        return;
    }
    
    // Show notification dot and accent button if panel is closed and there are new sources
    if (!sourcesPanel.classList.contains('open') && newSources && newSources.length > 0) {
        showSourcesNotification();
        if (sourcesBtn) sourcesBtn.style.background = 'rgba(255,255,255,0.35)';
    }
    
    let sourcesHTML = '';
    allConversationSources.forEach((source, index) => {
        let linkUrl = source.uri || '';
        if (source.uri && source.snippet && source.snippet.length > 5) {
            // Clean and encode the snippet for the text fragment
            const cleanSnippet = source.snippet.trim().replace(/[\r\n]+/g, ' ').substring(0, 150);
            linkUrl = `${source.uri}#:~:text=${encodeURIComponent(cleanSnippet)}`;
        }

        // Build URL section depending on availability
        const urlSection = source.uri
            ? `<div class="source-url"><a href="${linkUrl}" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation();">${source.uri}</a></div>`
            : `<div class="source-url no-link">No link available</div>`;

        // For context menu, when no URL, pass empty string and only enable highlight
        const safeLinkForMenu = (linkUrl || '').replace(/'/g, "\\'");
    const hasUrl = !!source.uri;
        const onClick = hasUrl
            ? `showSourceContextMenu(event, ${index}, '${safeLinkForMenu}')`
            : `highlightSource(${index});`;

        sourcesHTML += `
            <div class="source-item" id="source-${source.number}" data-source-index="${index}" data-source-url="${linkUrl}" role="button" tabindex="0" aria-label="Source: ${source.title || 'Citation'}" onclick="${onClick}" oncontextmenu="${hasUrl ? `showSourceContextMenu(event, ${index}, '${safeLinkForMenu}')` : 'event.preventDefault(); highlightSource(' + index + ');'}" style="position: relative;">
                <div class="source-title">[${source.number}] ${source.title || 'Citation'}</div>
                <div class="source-snippet">${source.snippet || ''}</div>
                ${urlSection}
            </div>
        `;
    });
    
    sourcesList.innerHTML = sourcesHTML;
    // Update header count if available
    if (sourcesHeaderTitle) {
        sourcesHeaderTitle.textContent = `Sources (${allConversationSources.length})`;
    }
    
    // On first arrival of sources, automatically open the panel for visibility
    if (wasEmpty && allConversationSources.length > 0 && !sourcesPanel.classList.contains('open')) {
        toggleSourcesPanel();
    }
    
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
    
    // Find and highlight corresponding link(s) in messages by URI or number
    document.querySelectorAll('.footnote-link').forEach(link => {
        link.style.backgroundColor = 'transparent';
        link.style.fontWeight = '500';
    });

    const src = currentSources[sourceIndex] || {};
    const targetLinks = [];
    document.querySelectorAll('.footnote-link').forEach(link => {
        const byIndex = link.getAttribute('data-source-index') === String(sourceIndex);
        const byUri = src.uri && link.getAttribute('data-source-uri') === src.uri;
        const byNumber = link.textContent && link.textContent.trim() === `[${src.number}]`;
        if (byIndex || byUri || byNumber) targetLinks.push(link);
    });
    
    targetLinks.forEach(link => {
        link.style.backgroundColor = '#fff3cd';
        link.style.fontWeight = '700';
    });
    if (targetLinks.length === 1) {
        targetLinks[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    
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

function scrollToSource(number) {
    // Convert footnote number (1,2,3...) to sourceIndex (0,1,2...)
    const sourceIndex = number - 1;
    
    // First, make sure sources panel is open
    const panel = document.getElementById('sourcesPanel');
    if (!panel.classList.contains('open')) {
        toggleSourcesPanel();
        // Wait for panel to open, then highlight source
        setTimeout(() => {
            highlightSource(sourceIndex);
        }, 300);
    } else {
        // Panel is already open, highlight immediately
        highlightSource(sourceIndex);
    }
}

function showMessageSources(messageId, sourceNumber) {
    console.log(`Looking for source ${sourceNumber} from message ${messageId}`);
    
    // Find the message element
    const messageElement = document.querySelector(`[data-message-id="${messageId}"]`);
    if (!messageElement) {
        console.log('Message not found:', messageId);
        return;
    }
    
    // First try to get sources from the message's data attribute
    let sources = [];
    try {
        const sourcesData = messageElement.getAttribute('data-sources');
        if (sourcesData) {
            sources = JSON.parse(sourcesData);
        }
    } catch (e) {
        console.warn('Failed to parse stored sources:', e);
    }
    
    // If no stored sources, extract from HTML
    if (!sources || sources.length === 0) {
        const messageHtml = messageElement.innerHTML;
        sources = extractSourcesFromMessageHtml(messageHtml);
    }
    
    console.log('Sources for message:', sources);
    
    if (sources.length > 0) {
        // Find the specific source by number
        const match = sources.find(s => s.number === sourceNumber);
        if (match && match.uri) {
            // Construct the link URL with proper text fragment if available
            let linkUrl = match.uri;
            if (match.snippet && match.snippet.length > 5) {
                const cleanSnippet = match.snippet.trim().replace(/[\r\n]+/g, ' ').substring(0, 150);
                linkUrl = `${match.uri}#:~:text=${encodeURIComponent(cleanSnippet)}`;
            }
            try { 
                window.open(linkUrl, '_blank'); 
            } catch (e) { 
                console.debug('Failed to open source link', e); 
            }
        }
        
        // Update sources panel with all sources from this message
        updateSourcesPanel(sources);
        
        // Open sources panel if needed and highlight the source
        const panel = document.getElementById('sourcesPanel');
        if (!panel.classList.contains('open')) {
            toggleSourcesPanel();
            setTimeout(() => {
                highlightSpecificSource(sourceNumber, sources);
            }, 300);
        } else {
            highlightSpecificSource(sourceNumber, sources);
        }
    }
}

function highlightSourceByNumber(sourceNumber) {
    // Find source by its number (not index)
    const sourceElements = document.querySelectorAll('.source-item');
    sourceElements.forEach((element, index) => {
        element.classList.remove('highlighted');
        element.setAttribute('aria-selected', 'false');
        
        // Check if this source has the matching number
        const sourceId = element.getAttribute('id');
        if (sourceId === `source-${sourceNumber}`) {
            element.classList.add('highlighted');
            element.setAttribute('aria-selected', 'true');
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    });
}

function highlightSpecificSource(sourceNumber, sources) {
    console.log(`Highlighting source ${sourceNumber} from:`, sources);
    
    // Find the source in the provided sources array first
    const sourceObj = sources.find(source => source.number === sourceNumber);
    if (!sourceObj) {
        console.log(`Source ${sourceNumber} not found in provided sources list`);
        return;
    }

    // Primary mapping: find the panel item by URI (ignore text-fragment differences)
    const baseUri = (sourceObj.uri || '').split('#')[0];
    let targetIndex = -1;
    const items = Array.from(document.querySelectorAll('.source-item'));
    for (const el of items) {
        const url = (el.getAttribute('data-source-url') || '').split('#')[0];
        if (baseUri && url && url === baseUri) {
            const idxAttr = el.getAttribute('data-source-index');
            if (idxAttr != null) {
                targetIndex = parseInt(idxAttr, 10);
                break;
            }
        }
    }

    // Fallbacks: try matching in currentSources by uri, then by number
    if (targetIndex === -1 && baseUri) {
        targetIndex = currentSources.findIndex(s => (s.uri || '').split('#')[0] === baseUri);
    }
    if (targetIndex === -1) {
        targetIndex = currentSources.findIndex(s => s.number === sourceNumber);
    }

    console.log(`Source ${sourceNumber} mapped to index:`, targetIndex, 'baseUri:', baseUri);
    if (targetIndex !== -1) {
        highlightSource(targetIndex);
        return;
    }

    // Last resort: try to scroll by number-based id (may not exist if numbers differ)
    console.log('Falling back to number-based highlight');
    highlightSourceByNumber(sourceNumber);
}

function updateSourcesPanelWithSources(sources) {
    const sourcesList = document.getElementById('sourcesList');
    const sourcesHeader = document.getElementById('sourcesHeader');
    
    if (!sources || sources.length === 0) {
        sourcesList.innerHTML = '<div class="no-sources">No sources available</div>';
        sourcesHeader.innerHTML = 'Sources';
        return;
    }
    
    sourcesHeader.innerHTML = `Sources (${sources.length})`;
    
    const sourcesHTML = sources.map((source, index) => {
        let linkUrl = source.uri;
        if (source.snippet && source.snippet.length > 5) {
            linkUrl = `${source.uri}#:~:text=${encodeURIComponent(source.snippet)}`;
        }
        
        return `
            <div class="source-item" id="source-${source.number}" data-source-index="${index}" data-source-url="${linkUrl}" role="button" tabindex="0" aria-label="Source: ${source.title}" onclick="showSourceContextMenu(event, ${index}, '${linkUrl.replace(/'/g, "\\'")}')" oncontextmenu="showSourceContextMenu(event, ${index}, '${linkUrl.replace(/'/g, "\\'")}')" style="position: relative;">
                <div class="source-header">
                    <span class="source-number">[${source.number}]</span>
                    <span class="source-title">${source.title || 'Document'}</span>
                </div>
                ${source.snippet ? `<div class="source-snippet">"${source.snippet}"</div>` : ''}
                <div class="source-url">${source.uri}</div>
            </div>
        `;
    }).join('');
    
    sourcesList.innerHTML = sourcesHTML;
}

function addMessage(text, sender, sources = [], msgId = null) {
    const messagesContainer = document.getElementById('chatMessages');
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${sender}-message`;
    if (msgId) {
        messageDiv.setAttribute('data-message-id', msgId);
    }
    
    // Process and validate sources (allow entries without uri to still show in panel)
    let perMessageSources = Array.isArray(sources) ? sources.filter(s => s) : [];
    
    // Store sources on the message element for later retrieval
    try {
        if (perMessageSources.length > 0) {
            messageDiv.setAttribute('data-sources', JSON.stringify(perMessageSources));
        }
    } catch (e) {
        console.warn('Failed to store sources on message:', e);
    }
    
    console.log('Processing message:', text);
    console.log('Sources received:', sources);
    
    let messageContent = text
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
        .replace(/\n/g, '<br>');
    
    console.log('After markdown conversion:', messageContent);
    
    // Create footnote links with proper source references
    messageContent = messageContent.replace(/\[(\d+)\]/g, function(match, number) {
        const messageId = msgId || Date.now();
        const sourceNum = parseInt(number);
        // Find corresponding source
        const source = perMessageSources.find(s => s.number === sourceNum);
        let title = source ? `View source ${number}: ${source.title || source.uri}` : `Source ${number}`;
        const dataUriAttr = source && source.uri ? ` data-source-uri="${source.uri.replace(/"/g, '&quot;')}"` : '';
        return `<a href="#source-${number}" 
            class="footnote-link" 
            data-source-index="${sourceNum - 1}"
            ${dataUriAttr}
            onclick="showMessageSources('${messageId}', ${number}); return false;" 
            title="${title}">${match}</a>`;
    });
    
    console.log('Final message content:', messageContent);
    messageDiv.innerHTML = messageContent;
    messagesContainer.appendChild(messageDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
    
    // Update scroll button visibility
    updateScrollButton();
    
    // If this is a bot message with sources, ensure the sources panel is up to date
    if (sender === 'bot' && perMessageSources.length > 0) {
        updateSourcesPanel(perMessageSources);
    }

    // Persist or compute sources for this bot message and update panel if needed
    if (sender === 'bot') {
        try {
            if (!perMessageSources || perMessageSources.length === 0) {
                perMessageSources = extractSourcesFromMessageHtml(messageDiv.innerHTML);
            }
            if (perMessageSources && perMessageSources.length > 0) {
                try { messageDiv.setAttribute('data-sources', JSON.stringify(perMessageSources)); } catch {}
                // If backend didn't already update the panel, update with extracted ones
                updateSourcesPanel(perMessageSources);
            }
        } catch (e) {
            console.warn('Auto-extraction of sources failed:', e);
        }
    }
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

// Helper: extract sources array from a bot message's HTML content
function extractSourcesFromMessageHtml(messageHtml) {
    try {
        // Build a DOM we can query for anchors (to keep href)
        const container = document.createElement('div');
        container.innerHTML = messageHtml;

        // Try to locate the Sources section by finding a <strong>Sources:</strong> marker
        let sourcesStartNode = null;
        const strongs = container.querySelectorAll('strong');
        strongs.forEach(s => {
            const text = (s.textContent || '').trim().toLowerCase();
            if (!sourcesStartNode && text.startsWith('sources')) {
                sourcesStartNode = s;
            }
        });

        // Take the HTML after the marker; otherwise use entire container
        let htmlAfterMarker = '';
        if (sourcesStartNode) {
            // Collect following siblings as HTML
            let node = sourcesStartNode.nextSibling;
            while (node) {
                htmlAfterMarker += node.outerHTML || node.textContent || '';
                node = node.nextSibling;
            }
        } else {
            htmlAfterMarker = container.innerHTML;
        }

        // Split by <br> boundaries to approximate original lines
        const lineHtmls = htmlAfterMarker
            .split(/<br\s*\/?\s*>/i)
            .map(s => s.trim())
            .filter(Boolean);

        const extractedSources = [];
        lineHtmls.forEach(lineHtml => {
            // Create a per-line DOM to extract text and the first anchor href
            const lineDiv = document.createElement('div');
            lineDiv.innerHTML = lineHtml;
            const lineText = (lineDiv.textContent || '').trim();

            // Must start with [n]
            const numMatch = lineText.match(/^\[(\d+)\]/);
            if (!numMatch) return;
            const sourceNum = parseInt(numMatch[1]);

            // Parse both formats:
            // New format: [1] The title of the page — URL
            // Old format: [1] "quote text" — URL
            const afterNumber = lineText.replace(/^\[\d+\]\s*/, '');
            
            // Check for the new title format first
            const titleUrlMatch = afterNumber.match(/^(.+?)\s*—\s*(.+)$/);
            let snippet = '';
            let url = '';
            let title = '';
            
            if (titleUrlMatch) {
                // New format: [1] Title — URL
                title = titleUrlMatch[1].trim();
                url = titleUrlMatch[2].trim();
                
                // Clean up URLs - remove line number fragments like #L23-L27
                if (url.includes('#L')) {
                    url = url.split('#L')[0];
                }
                
                // Remove quotes if present (for old format compatibility)
                if (title.startsWith('"') && title.endsWith('"')) {
                    snippet = title.slice(1, -1); // Use quoted text as snippet
                    title = ''; // Will be generated below
                } else {
                    snippet = title; // Use title as snippet for now
                }
            } else {
                // Fallback: entire text after [n] is the snippet
                snippet = afterNumber.trim();
                
                // Look for any anchor with href (not just http)
                const anchor = lineDiv.querySelector('a[href]');
                url = anchor ? anchor.getAttribute('href') : '';
                
                // If it's an internal anchor, look for markdown links in the text
                if (!url || url.startsWith('#')) {
                    // Look for markdown link pattern [text](url)
                    const markdownMatch = lineText.match(/\[([^\]]+)\]\(([^)]+)\)/);
                    if (markdownMatch) {
                        url = markdownMatch[2];
                    }
                }
            }
            
            // Create a meaningful title based on the snippet content (only if we don't have one)
            if (!title && snippet) {
                const lowerSnippet = snippet.toLowerCase();
                if (lowerSnippet.includes('openccc')) {
                    title = 'OpenCCC Documentation';
                } else if (lowerSnippet.includes('cccapply')) {
                    title = 'CCCApply Information';
                } else if (lowerSnippet.includes('mypath')) {
                    title = 'CCC MyPath Documentation';
                } else if (lowerSnippet.includes('cccid')) {
                    title = 'CCCID System Documentation';
                } else if (lowerSnippet.includes('career coach')) {
                    title = 'Career Coach Information';
                } else {
                    // Use first few words of snippet as title
                    const words = snippet.split(' ').slice(0, 4).join(' ');
                    title = words.length > 20 ? words + '...' : words;
                }
            }
            
            // Final fallback for title
            if (!title) {
                title = `Source ${sourceNum}`;
            }

            // Only create fallback URLs if we have no URL at all
            if (!url && snippet) {
                console.warn('No URL found for source, using fallback:', snippet.substring(0, 50));
                // Try to detect the system and create a reasonable fallback
                const baseUrl = 'https://docs.cccnext.net';
                const lowerSnippet = snippet.toLowerCase();
                if (lowerSnippet.includes('openccc')) {
                    url = `${baseUrl}/openccc`;
                } else if (lowerSnippet.includes('cccapply')) {
                    url = `${baseUrl}/cccapply`;
                } else if (lowerSnippet.includes('mypath')) {
                    url = `${baseUrl}/mypath`;
                } else if (lowerSnippet.includes('cccid')) {
                    url = `${baseUrl}/identity`;
                } else {
                    url = `${baseUrl}/documentation`;
                }
            }

            extractedSources.push({
                number: sourceNum,
                snippet,
                uri: url,
                title: title
            });
        });

        return extractedSources;
    } catch (e) {
        console.warn('Failed to parse sources from message HTML:', e);
        return [];
    }
}
