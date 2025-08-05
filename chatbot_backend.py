from flask import Flask, request, jsonify
from flask_cors import CORS
import boto3
import json

app = Flask(__name__)
CORS(app)

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
        
        # Extract citations with proper footnote formatting
        if 'citations' in response:
            source_counter = 1
            for citation in response['citations']:
                for reference in citation.get('retrievedReferences', []):
                    location = reference.get('location', {})
                    uri = None
                    title = None
                    
                    # Handle different location types
                    if 'webLocation' in location:
                        uri = location['webLocation']['url']
                        title = uri.split('/')[-1] if uri else 'Web Document'
                    elif 's3Location' in location:
                        uri = location['s3Location']['uri']
                        title = uri.split('/')[-1] if uri else 'Document'
                    
                    if uri:
                        # Extract a snippet of the relevant text for deep linking
                        content_text = reference.get('content', {}).get('text', '')
                        # Get first meaningful sentence or heading
                        snippet = extract_key_phrase(content_text)
                        
                        sources.append({
                            'number': source_counter,
                            'title': title,
                            'uri': uri,
                            'snippet': snippet
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