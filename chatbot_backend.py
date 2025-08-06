from flask import Flask, request, jsonify
from flask_cors import CORS
import boto3
import json

app = Flask(__name__)
CORS(app)

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

@app.route('/test', methods=['GET'])
def test():
    return jsonify({'status': 'Backend is working!'})

@app.route('/chat', methods=['POST'])
def chat():
    data = request.json
    question = data.get('message', '')
    
    if not question:
        return jsonify({'error': 'No message provided'}), 400
    
    print(f"Received question: {question}")  # Debug log
    
    result = query_knowledge_base(question)
    
    print(f"Result: {result}")  # Debug log
    
    # Format response with footnotes
    response_text = result['answer']
    
    # Add footnotes section if sources exist
    if result['sources']:
        response_text += "\n\n**Sources:**\n"
        for source in result['sources']:
            response_text += f"[{source['number']}] {source['title']}\n"
    
    return jsonify({
        'response': response_text,
        'sources': result['sources']
    })

if __name__ == '__main__':
    app.run(debug=True, port=5000)