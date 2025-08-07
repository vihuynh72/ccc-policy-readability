from flask import Flask, request, jsonify, render_template, send_from_directory
from flask_cors import CORS
import boto3
import json
import os
import base64
import fitz  # PyMuPDF for PDF processing
import io
from werkzeug.utils import secure_filename

app = Flask(__name__, template_folder='.', static_folder='.')
CORS(app)

# Configure upload settings
ALLOWED_EXTENSIONS = {'pdf', 'png', 'jpg', 'jpeg', 'gif', 'bmp', 'tiff'}
MAX_FILE_SIZE = 16 * 1024 * 1024  # 16MB
TEST_MODE = os.getenv('TEST_MODE', 'false').lower() == 'true'

def allowed_file(filename):
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def is_image_file(filename):
    image_extensions = {'png', 'jpg', 'jpeg', 'gif', 'bmp', 'tiff'}
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in image_extensions

def is_better_title(new_title, existing_title):
    """Determine if new title is better than existing (prefer plain language over numbers)"""
    if not existing_title:
        return True
    if not new_title:
        return False
    
    # Prefer titles with letters over pure numbers
    new_has_letters = any(c.isalpha() for c in new_title)
    existing_has_letters = any(c.isalpha() for c in existing_title)
    
    if new_has_letters and not existing_has_letters:
        return True
    if existing_has_letters and not new_has_letters:
        return False
    
    # If both have letters or both are numeric, prefer longer title
    return len(new_title) > len(existing_title)

def normalize_url(url):
    """Normalize URL to catch duplicates with different formats"""
    if not url:
        return url
    
    # Remove trailing slashes and fragments
    url = url.rstrip('/').split('#')[0].split('?')[0]
    
    # Extract the core page identifier (usually the page ID)
    # For Jira/Confluence URLs, extract the page ID
    if '/pages/' in url:
        parts = url.split('/pages/')
        if len(parts) > 1:
            page_part = parts[1].split('/')[0]  # Get just the page ID
            return f"{parts[0]}/pages/{page_part}"
    
    return url

def describe_image_with_claude(image_data, filename):
    """Use Claude Vision to describe an image from memory data"""
    
    # Test mode fallback
    if TEST_MODE:
        return f"[TEST MODE] This appears to be an uploaded image file: {filename}. Image analysis would normally be performed by Claude Vision here."
    
    try:
        # Validate image data
        if len(image_data) == 0:
            return "Error: Image file is empty."
        
        image_base64 = base64.b64encode(image_data).decode('utf-8')
        
        # Get file extension for media type
        file_ext = filename.lower().split('.')[-1]
        if file_ext == 'jpg':
            file_ext = 'jpeg'
        media_type = f"image/{file_ext}"
        
        print(f"Processing image: {filename}, type: {media_type}, size: {len(image_data)} bytes")
        
        client = boto3.client("bedrock-runtime", region_name="us-west-2")
        
        # Prepare the message for Claude
        message = {
            "role": "user",
            "content": [
                {
                    "type": "image",
                    "source": {
                        "type": "base64",
                        "media_type": media_type,
                        "data": image_base64
                    }
                },
                {
                    "type": "text",
                    "text": "Please describe this image in detail. Include any text you can see, objects, people, and the overall context."
                }
            ]
        }
        
        # Call Claude Vision
        print("Calling Claude Vision API...")
        response = client.invoke_model(
            modelId="anthropic.claude-3-haiku-20240307-v1:0",
            body=json.dumps({
                "anthropic_version": "bedrock-2023-05-31",
                "max_tokens": 1000,
                "messages": [message]
            })
        )
        
        response_body = json.loads(response.get('body').read())
        print(f"Claude Vision response received: {len(response_body.get('content', []))} content items")
        
        if 'content' in response_body and len(response_body['content']) > 0:
            return response_body['content'][0]['text']
        else:
            return "Claude Vision returned an unexpected response format."
        
    except Exception as e:
        print(f"Error describing image: {str(e)}")
        import traceback
        traceback.print_exc()
        return f"Sorry, I couldn't analyze this image. Error: {str(e)}"

def extract_key_phrase(text):
    """Extract a key phrase from the content for deep linking"""
    if not text:
        return ""
    
    # Look for headings (lines starting with #)
    lines = text.split('\n')
    for line in lines:
        line = line.strip()
        if line.startswith('#') and len(line) > 3:
            return line.replace('#', '').strip()[:50]
    
    # Look for sentences with key terms
    sentences = text.split('. ')
    for sentence in sentences[:3]:  # Check first 3 sentences
        if len(sentence.strip()) > 20 and len(sentence.strip()) < 100:
            return sentence.strip()[:50]
    
    # Fallback to first 50 characters
    return text.strip()[:50]

def query_knowledge_base(question):
    client = boto3.client("bedrock-agent-runtime", region_name="us-west-2")
    
    try:
        response = client.retrieve_and_generate(
            input={
                'text': question
            },
            retrieveAndGenerateConfiguration={
                'type': 'KNOWLEDGE_BASE',
                'knowledgeBaseConfiguration': {
                    'knowledgeBaseId': 'GWVQU3YPXK',
                    'modelArn': 'arn:aws:bedrock:us-west-2::foundation-model/anthropic.claude-3-5-sonnet-20241022-v2:0'
                }
            }
        )
        
        print(f"Full response keys: {response.keys()}")  # Debug
        if 'citations' in response:
            print(f"Citations found: {response['citations']}")  # Debug
        else:
            print("No citations in response")  # Debug
        
        answer = response['output']['text']
        sources = []
        unique_sources = {}  # Track unique documents by URI
        
        # Extract citations with proper footnote formatting
        if 'citations' in response:
            for citation in response['citations']:
                for reference in citation.get('retrievedReferences', []):
                    print(f"Full reference: {json.dumps(reference, indent=2)}")  # Debug
                    location = reference.get('location', {})
                    uri = None
                    title = None
                    
                    # Handle different location types
                    if 'webLocation' in location:
                        uri = location['webLocation']['url']
                        # Extract title from URL - replace + with spaces and decode
                        url_title = uri.split('/')[-1].replace('+', ' ') if uri else 'Web Document'
                        title = reference.get('metadata', {}).get('title') or url_title
                    elif 's3Location' in location:
                        uri = location['s3Location']['uri']
                        # Extract title from URI path
                        url_title = uri.split('/')[-1] if uri else 'Document'
                        title = reference.get('metadata', {}).get('title') or url_title
                    
                    if uri:
                        # Extract a snippet of the relevant text for deep linking
                        content_text = reference.get('content', {}).get('text', '')
                        snippet = extract_key_phrase(content_text)
                        
                        # Normalize URI for deduplication
                        normalized_uri = normalize_url(uri)
                        
                        # Deduplicate by normalized URI - keep the best title and snippet
                        if normalized_uri not in unique_sources:
                            unique_sources[normalized_uri] = {
                                'title': title,
                                'uri': uri,  # Keep original URI for linking
                                'snippet': snippet,
                                'content': content_text
                            }
                        else:
                            existing = unique_sources[normalized_uri]
                            # Update if we have a better title or more content
                            if is_better_title(title, existing['title']) or len(content_text) > len(existing['content']):
                                # Keep the better title, but prefer more content for snippet
                                best_title = title if is_better_title(title, existing['title']) else existing['title']
                                best_snippet = snippet if len(content_text) > len(existing['content']) else existing['snippet']
                                best_uri = uri if len(content_text) > len(existing['content']) else existing['uri']
                                
                                unique_sources[normalized_uri] = {
                                    'title': best_title,
                                    'uri': best_uri,
                                    'snippet': best_snippet,
                                    'content': content_text if len(content_text) > len(existing['content']) else existing['content']
                                }
            
            # Convert to final sources list with numbering
            source_counter = 1
            for source_data in unique_sources.values():
                sources.append({
                    'number': source_counter,
                    'title': source_data['title'],
                    'uri': source_data['uri'],
                    'snippet': source_data['snippet']
                })
                source_counter += 1
        
        return {
            'answer': answer,
            'sources': sources
        }
        
    except Exception as e:
        return {
            'answer': f"I'm having trouble accessing the knowledge base right now. Error: {str(e)}",
            'sources': []
        }

def query_knowledge_base_with_history(question, conversation_history=[]):
    """Query knowledge base with conversation context"""
    client = boto3.client("bedrock-agent-runtime", region_name="us-west-2")
    
    try:
        # Build context from conversation history
        enhanced_question = question
        if conversation_history:
            context_summary = "Previous conversation context:\n"
            for msg in conversation_history[-4:]:  # Last 4 messages for context
                role = "User" if msg.get('role') == 'user' else "Assistant"
                content = msg.get('content', '')[:300]  # Limit length
                context_summary += f"{role}: {content}\n"
            enhanced_question = f"{context_summary}\nCurrent question: {question}"
        
        response = client.retrieve_and_generate(
            input={
                'text': enhanced_question
            },
            retrieveAndGenerateConfiguration={
                'type': 'KNOWLEDGE_BASE',
                'knowledgeBaseConfiguration': {
                    'knowledgeBaseId': 'GWVQU3YPXK',
                    'modelArn': 'arn:aws:bedrock:us-west-2::foundation-model/anthropic.claude-3-5-sonnet-20241022-v2:0'
                }
            }
        )
        
        answer = response['output']['text']
        sources = []
        unique_sources = {}
        
        # Extract citations (same logic as original function)
        if 'citations' in response:
            for citation in response['citations']:
                for reference in citation.get('retrievedReferences', []):
                    location = reference.get('location', {})
                    uri = None
                    title = None
                    
                    if 'webLocation' in location:
                        uri = location['webLocation']['url']
                        url_title = uri.split('/')[-1].replace('+', ' ') if uri else 'Web Document'
                        title = url_title[:100] + '...' if len(url_title) > 100 else url_title
                    elif 's3Location' in location:
                        s3_uri = location['s3Location']['uri']
                        title = s3_uri.split('/')[-1] if '/' in s3_uri else s3_uri
                        uri = s3_uri
                    
                    if uri and uri not in unique_sources:
                        content = reference.get('content', {})
                        snippet = content.get('text', '')[:200] if content else ''
                        
                        unique_sources[uri] = {
                            'title': title or 'Document',
                            'uri': uri,
                            'snippet': snippet
                        }
        
        source_counter = 1
        for source_data in unique_sources.values():
            sources.append({
                'number': source_counter,
                'title': source_data['title'],
                'uri': source_data['uri'],
                'snippet': source_data['snippet']
            })
            source_counter += 1
        
        return {
            'answer': answer,
            'sources': sources
        }
        
    except Exception as e:
        return {
            'answer': f"I'm having trouble accessing the knowledge base right now. Error: {str(e)}",
            'sources': []
        }

@app.route('/')
def index():
    return send_from_directory('.', 'chatbot_widget.html')

@app.route('/<path:filename>')
def static_files(filename):
    return send_from_directory('.', filename)

@app.route('/test', methods=['GET'])
def test():
    return jsonify({'status': 'Backend is working!'})

@app.route('/upload', methods=['POST'])
def upload_file():
    if 'file' not in request.files:
        return jsonify({'error': 'No file provided'}), 400
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No file selected'}), 400
    
    if not allowed_file(file.filename):
        return jsonify({'error': 'File type not allowed'}), 400
    
    try:
        # Read file data into memory (don't save to disk)
        file_data = file.read()
        filename = secure_filename(file.filename)
        
        if len(file_data) > MAX_FILE_SIZE:
            return jsonify({'error': 'File too large'}), 400
        
        response = {
            'message': 'File processed successfully',
            'filename': filename,
            'is_image': is_image_file(filename),
            'size_bytes': len(file_data)
        }
        
        # If it's an image, automatically describe it using in-memory data
        if is_image_file(filename):
            description = describe_image_with_claude_memory(file_data, filename)
            response['description'] = description
        else:
            # For PDFs, just acknowledge receipt (no storage)
            response['message'] = f"PDF '{filename}' processed. Content analysis coming soon!"
        
        return jsonify(response)
        
    except Exception as e:
        return jsonify({'error': f'Upload failed: {str(e)}'}), 500

def describe_image_with_claude_memory(image_data, filename):
    """Use Claude Vision to describe an image from memory data"""
    
    # Test mode fallback
    if TEST_MODE:
        return f"[TEST MODE] This appears to be an uploaded image file: {filename}. Image analysis would normally be performed by Claude Vision here."
    
    try:
        # Validate image data
        if len(image_data) == 0:
            return "Error: Image file is empty."
        
        image_base64 = base64.b64encode(image_data).decode('utf-8')
        
        # Get file extension for media type
        file_ext = filename.lower().split('.')[-1]
        if file_ext == 'jpg':
            file_ext = 'jpeg'
        media_type = f"image/{file_ext}"
        
        print(f"Processing image: {filename}, type: {media_type}, size: {len(image_data)} bytes")
        
        client = boto3.client("bedrock-runtime", region_name="us-west-2")
        
        # Prepare the message for Claude
        message = {
            "role": "user",
            "content": [
                {
                    "type": "image",
                    "source": {
                        "type": "base64",
                        "media_type": media_type,
                        "data": image_base64
                    }
                },
                {
                    "type": "text",
                    "text": "Please describe this image in detail. Include any text you can see, objects, people, and the overall context."
                }
            ]
        }
        
        # Call Claude Vision
        print("Calling Claude Vision API...")
        response = client.invoke_model(
            modelId="anthropic.claude-3-haiku-20240307-v1:0",
            body=json.dumps({
                "anthropic_version": "bedrock-2023-05-31",
                "max_tokens": 1000,
                "messages": [message]
            })
        )
        
        response_body = json.loads(response.get('body').read())
        print(f"Claude Vision response received: {len(response_body.get('content', []))} content items")
        
        if 'content' in response_body and len(response_body['content']) > 0:
            return response_body['content'][0]['text']
        else:
            return "Claude Vision returned an unexpected response format."
        
    except Exception as e:
        print(f"Error describing image: {str(e)}")
        import traceback
        traceback.print_exc()
        return f"Sorry, I couldn't analyze this image. Error: {str(e)}"

@app.route('/chat', methods=['POST'])
def chat():
    # Handle both regular messages and messages with file attachments
    if request.content_type.startswith('multipart/form-data'):
        # Message with file attachment
        message = request.form.get('message', '')
        file = request.files.get('file')
        conversation_history_str = request.form.get('conversation_history', '[]')
        
        try:
            conversation_history = json.loads(conversation_history_str)
        except:
            conversation_history = []
        
        print(f"Received message with attachment: {message}")
        print(f"Conversation history: {len(conversation_history)} messages")
        
        # If there's a file, process it and include in the response
        if file and file.filename and allowed_file(file.filename):
            try:
                file_data = file.read()
                filename = secure_filename(file.filename)
                
                if len(file_data) > MAX_FILE_SIZE:
                    return jsonify({'error': 'File too large'}), 400
                
                # Simple and fast approach: analyze file directly with Claude
                if is_image_file(filename):
                    # For images, use Claude Vision directly with the question
                    response_text = analyze_image_simple(file_data, filename, message, conversation_history)
                else:
                    # For PDFs, convert and analyze with Claude
                    response_text = analyze_pdf_simple(file_data, filename, message, conversation_history)
                
                return jsonify({
                    'response': response_text,
                    'sources': [],
                    'has_attachment': True,
                    'filename': filename
                })
                
            except Exception as e:
                return jsonify({'error': f'Failed to process attachment: {str(e)}'}), 500
        else:
            # No valid file but multipart request - this shouldn't happen normally
            if not message:
                return jsonify({'error': 'No message or valid file provided'}), 400
            
            # Treat as regular message
            result = query_knowledge_base(message)
            response_text = result['answer']
            
            if result['sources']:
                response_text += "\n\n**Sources:**\n"
                for source in result['sources']:
                    response_text += f"[{source['number']}] {source['title']}\n"
            
            return jsonify({
                'response': response_text,
                'sources': result['sources']
            })
    else:
        # Regular JSON message (backward compatibility)
        data = request.json
        question = data.get('message', '')
        conversation_history = data.get('conversation_history', [])
        
        if not question:
            return jsonify({'error': 'No message provided'}), 400
        
        print(f"Received question: {question}")
        print(f"Conversation history: {len(conversation_history)} messages")
        
        result = query_knowledge_base_with_history(question, conversation_history)
        response_text = result['answer']
        
        if result['sources']:
            response_text += "\n\n**Sources:**\n"
            for source in result['sources']:
                response_text += f"[{source['number']}] {source['title']}\n"
        
        return jsonify({
            'response': response_text,
            'sources': result['sources']
        })

def convert_pdf_to_images(pdf_data, max_pages=5):
    """Convert PDF pages to images using PyMuPDF"""
    try:
        # Open PDF from bytes
        pdf_document = fitz.open("pdf", pdf_data)
        images = []
        
        # Process up to max_pages to avoid overwhelming the system
        page_count = min(len(pdf_document), max_pages)
        
        for page_num in range(page_count):
            page = pdf_document[page_num]
            
            # Convert page to image (PNG format)
            pix = page.get_pixmap(matrix=fitz.Matrix(2.0, 2.0))  # 2x zoom for better quality
            img_data = pix.tobytes("png")
            
            images.append({
                'data': img_data,
                'page_num': page_num + 1,
                'filename': f"page_{page_num + 1}.png"
            })
        
        pdf_document.close()
        return images, None
        
    except Exception as e:
        return [], f"Error converting PDF to images: {str(e)}"

def analyze_pdf_with_question(pdf_data, filename, user_question):
    """Convert PDF to images and analyze them with Claude Vision"""
    
    if TEST_MODE:
        return f"[TEST MODE] Analyzing PDF '{filename}' with question: '{user_question}'. This would normally convert PDF to images and use Claude Vision."
    
    try:
        # Convert PDF to images
        images, error = convert_pdf_to_images(pdf_data)
        
        if error:
            return f"Error processing PDF: {error}"
        
        if not images:
            return "Error: Could not extract any pages from the PDF."
        
        # Analyze each page with Claude Vision
        results = []
        question_context = f"Question: {user_question}\n\n" if user_question.strip() else ""
        
        for img_info in images:
            try:
                page_analysis = analyze_image_with_question(
                    img_info['data'], 
                    f"{filename} - Page {img_info['page_num']}", 
                    user_question
                )
                results.append(f"**Page {img_info['page_num']}:**\n{page_analysis}")
            except Exception as e:
                results.append(f"**Page {img_info['page_num']}:** Error analyzing page - {str(e)}")
        
        # Combine results
        if len(results) == 1:
            if user_question.strip():
                return f"Based on your question: \"{user_question}\"\n\n{results[0]}"
            else:
                return results[0]
        else:
            header = f"**Analysis of PDF '{filename}' ({len(results)} pages)**"
            if user_question.strip():
                header += f"\n*Regarding your question: \"{user_question}\"*"
            return header + "\n\n" + "\n\n".join(results)
            
    except Exception as e:
        return f"Error processing PDF '{filename}': {str(e)}"

def analyze_image_simple(image_data, filename, user_question, conversation_history=[]):
    """Simple and fast image analysis using Claude Vision"""
    
    if TEST_MODE:
        return f"[TEST MODE] Analyzing image '{filename}' with question: '{user_question}'"
    
    try:
        if len(image_data) == 0:
            return "Error: Image file is empty."
        
        # Convert image to base64
        image_base64 = base64.b64encode(image_data).decode('utf-8')
        
        client = boto3.client("bedrock-runtime", region_name="us-west-2")
        
        # Build conversation context if available
        context_text = ""
        if conversation_history:
            context_text = "\n\nPrevious conversation context:\n"
            for msg in conversation_history[-4:]:  # Include last 4 messages for context
                role = "User" if msg.get('role') == 'user' else "Assistant"
                content = msg.get('content', '')[:200]  # Limit length
                context_text += f"{role}: {content}\n"
            context_text += "\nBased on this context, analyze the image to answer the current question.\n"
        
        # Create a focused prompt that combines file analysis with the question
        if user_question.strip():
            prompt = f"I have a question: {user_question}{context_text}\n\nPlease look at this image and answer my question based on what you can see. If the answer isn't in the image, please say so and describe what you do see instead. If this question relates to our previous conversation, acknowledge that context."
        else:
            prompt = f"Please describe what you see in this image in detail.{context_text}"
        
        # Build messages array with conversation history for Claude
        messages = []
        
        # Add previous conversation if available (last few exchanges)
        if conversation_history:
            for msg in conversation_history[-4:]:  # Last 4 messages
                role = "user" if msg.get('role') == 'user' else "assistant"
                # For previous messages, only include text content
                messages.append({
                    "role": role,
                    "content": msg.get('content', '')[:300]  # Limit content length
                })
        
        # Add current message with image
        messages.append({
            "role": "user",
            "content": [
                {
                    "type": "image",
                    "source": {
                        "type": "base64",
                        "media_type": "image/png",
                        "data": image_base64
                    }
                },
                {
                    "type": "text",
                    "text": prompt
                }
            ]
        })
        
        body = json.dumps({
            "anthropic_version": "bedrock-2023-05-31",
            "max_tokens": 1000,
            "messages": messages
        })
        
        response = client.invoke_model(body=body, modelId="anthropic.claude-3-haiku-20240307-v1:0")
        response_body = json.loads(response.get('body').read())
        
        if 'content' in response_body and len(response_body['content']) > 0:
            return response_body['content'][0]['text']
        else:
            return "Could not analyze the image."
        
    except Exception as e:
        print(f"Error analyzing image: {str(e)}")
        return f"Sorry, I couldn't analyze this image. Error: {str(e)}"

def analyze_pdf_simple(pdf_data, filename, user_question, conversation_history=[]):
    """Simple PDF analysis - convert multiple pages to images and analyze comprehensively"""
    
    if TEST_MODE:
        return f"[TEST MODE] Analyzing PDF '{filename}' with question: '{user_question}'"

    try:
        # Convert ALL pages to images for comprehensive analysis
        pdf_document = fitz.open("pdf", pdf_data)
        if len(pdf_document) == 0:
            return "Error: PDF has no pages."

        # Get all pages (but limit to reasonable number for performance)
        max_pages = min(len(pdf_document), 10)  # Analyze up to 10 pages max
        
        # Collect all page images for comprehensive analysis
        all_page_images = []
        
        for page_num in range(max_pages):
            page = pdf_document[page_num]
            pix = page.get_pixmap(matrix=fitz.Matrix(2, 2))  # Higher quality for better text recognition
            img_data = pix.tobytes("png")
            
            # Encode image
            img_base64 = base64.b64encode(img_data).decode('utf-8')
            all_page_images.append({
                "type": "image",
                "source": {
                    "type": "base64",
                    "media_type": "image/png",
                    "data": img_base64
                }
            })

        pdf_document.close()

        # Create comprehensive message for Claude Vision to analyze all pages together
        # Build conversation context if available
        context_text = ""
        if conversation_history:
            context_text = "\n\nPrevious conversation context:\n"
            for msg in conversation_history[-6:]:  # Include last 6 messages for context
                role = "User" if msg.get('role') == 'user' else "Assistant"
                content = msg.get('content', '')[:200]  # Limit length
                context_text += f"{role}: {content}\n"
            context_text += "\nBased on this context and the current question, analyze the document.\n"
        
        content = [
            {
                "type": "text",
                "text": f"""You are analyzing a document to answer this specific question: "{user_question}"{context_text}

Please review all the pages of this document and provide a direct, concise answer to the user's question. 

IMPORTANT INSTRUCTIONS:
- Give only ONE answer, do not repeat your response
- Focus only on the relevant information that answers their question
- Do not provide page-by-page analysis
- If you find the answer, state it clearly and cite the specific information from the document
- If the information is not in the document, say so directly
- Keep your response clear and organized
- If this question relates to previous conversation, acknowledge that context"""
            }
        ]
        
        # Add all page images
        content.extend(all_page_images)
        
        # Build messages array with conversation history for Claude
        messages = []
        
        # Add previous conversation if available (last few exchanges)
        if conversation_history:
            for msg in conversation_history[-6:]:  # Last 6 messages
                role = "user" if msg.get('role') == 'user' else "assistant"
                messages.append({
                    "role": role,
                    "content": msg.get('content', '')[:500]  # Limit content length
                })
        
        # Add current message
        messages.append({
            "role": "user",
            "content": content
        })
        
        # Call Claude Vision
        client = boto3.client("bedrock-runtime", region_name="us-west-2")
        
        body = {
            "anthropic_version": "bedrock-2023-05-31",
            "max_tokens": 1000,
            "messages": messages
        }
        
        response = client.invoke_model(
            modelId="anthropic.claude-3-haiku-20240307-v1:0",
            body=json.dumps(body)
        )
        
        response_data = json.loads(response['body'].read())
        analysis = response_data['content'][0]['text']
        
        return analysis
        
    except Exception as e:
        return f"Error processing PDF '{filename}': {str(e)}"

def extract_image_content(image_data, filename):
    """Extract content description from an image using Claude Vision"""
    
    if TEST_MODE:
        return f"[TEST MODE] Image content extraction for '{filename}' would be performed here."
    
    try:
        if len(image_data) == 0:
            return "Error: Image file is empty."
        
        image_base64 = base64.b64encode(image_data).decode('utf-8')
        
        file_ext = filename.lower().split('.')[-1]
        if file_ext == 'jpg':
            file_ext = 'jpeg'
        
        # For PDF-generated images, always use PNG
        if filename.endswith('.png') or 'Page' in filename:
            media_type = "image/png"
        else:
            media_type = f"image/{file_ext}"
        
        print(f"Extracting content from image: {filename}")
        
        client = boto3.client("bedrock-runtime", region_name="us-west-2")
        
        # Prompt focused on extracting content for later analysis
        prompt = """Please analyze this image and provide a comprehensive description of its content. Include:
1. Any text visible in the image (transcribe it exactly)
2. Objects, people, or scenes shown
3. Any charts, graphs, or data presented
4. The overall context and purpose of the image
5. Any relevant details that might be important for answering questions about this image

Please be detailed and accurate as this description will be used to answer questions about the image."""
        
        message = {
            "role": "user",
            "content": [
                {
                    "type": "image",
                    "source": {
                        "type": "base64",
                        "media_type": media_type,
                        "data": image_base64
                    }
                },
                {
                    "type": "text",
                    "text": prompt
                }
            ]
        }
        
        response = client.invoke_model(
            modelId="anthropic.claude-3-haiku-20240307-v1:0",
            body=json.dumps({
                "anthropic_version": "bedrock-2023-05-31",
                "max_tokens": 1500,
                "messages": [message]
            })
        )
        
        response_body = json.loads(response.get('body').read())
        
        if 'content' in response_body and len(response_body['content']) > 0:
            return response_body['content'][0]['text']
        else:
            return "Could not extract content from image."
        
    except Exception as e:
        print(f"Error extracting image content: {str(e)}")
        return f"Error processing image: {str(e)}"

def extract_pdf_content(pdf_data, filename):
    """Extract content from PDF by converting to images and analyzing with Claude Vision"""
    
    if TEST_MODE:
        return f"[TEST MODE] PDF content extraction for '{filename}' would be performed here."
    
    try:
        # Convert PDF to images
        images, error = convert_pdf_to_images(pdf_data)
        
        if error:
            return f"Error processing PDF: {error}"
        
        if not images:
            return "Error: Could not extract any pages from the PDF."
        
        # Extract content from each page
        page_contents = []
        for img_info in images:
            try:
                page_content = extract_image_content(img_info['data'], f"{filename} - Page {img_info['page_num']}")
                page_contents.append(f"Page {img_info['page_num']}: {page_content}")
            except Exception as e:
                page_contents.append(f"Page {img_info['page_num']}: Error extracting content - {str(e)}")
        
        # Combine all page contents
        if len(page_contents) == 1:
            return page_contents[0]
        else:
            return "\n\n".join(page_contents)
            
    except Exception as e:
        return f"Error processing PDF '{filename}': {str(e)}"

def analyze_image_with_question(image_data, filename, user_question):
    """Use Claude Vision to analyze an image and answer a specific question about it"""
    
    if TEST_MODE:
        return f"[TEST MODE] Analyzing image '{filename}' with question: '{user_question}'. This would normally use Claude Vision."
    
    try:
        if len(image_data) == 0:
            return "Error: Image file is empty."
        
        image_base64 = base64.b64encode(image_data).decode('utf-8')
        
        file_ext = filename.lower().split('.')[-1]
        if file_ext == 'jpg':
            file_ext = 'jpeg'
        
        # For PDF-generated images, always use PNG
        if filename.endswith('.png') or 'Page' in filename:
            media_type = "image/png"
        else:
            media_type = f"image/{file_ext}"
        
        print(f"Analyzing image: {filename} with question: {user_question}")
        
        client = boto3.client("bedrock-runtime", region_name="us-west-2")
        
        # Create a more specific prompt that includes the user's question
        if user_question.strip():
            prompt = f"I have a question: {user_question}\n\nPlease analyze this image and answer my question if possible. If you can see relevant information in the image, focus on that. If the question requires broader context beyond what's visible in the image, please note that as well."
        else:
            prompt = "Please describe this image in detail. Include any text you can see, objects, people, and the overall context."
        
        message = {
            "role": "user",
            "content": [
                {
                    "type": "image",
                    "source": {
                        "type": "base64",
                        "media_type": media_type,
                        "data": image_base64
                    }
                },
                {
                    "type": "text",
                    "text": prompt
                }
            ]
        }
        
        response = client.invoke_model(
            modelId="anthropic.claude-3-haiku-20240307-v1:0",
            body=json.dumps({
                "anthropic_version": "bedrock-2023-05-31",
                "max_tokens": 1000,
                "messages": [message]
            })
        )
        
        response_body = json.loads(response.get('body').read())
        
        if 'content' in response_body and len(response_body['content']) > 0:
            return response_body['content'][0]['text']
        else:
            return "Claude Vision returned an unexpected response format."
        
    except Exception as e:
        print(f"Error analyzing image: {str(e)}")
        return f"Sorry, I couldn't analyze this image. Error: {str(e)}"

if __name__ == '__main__':
    app.run(debug=True, port=5000)