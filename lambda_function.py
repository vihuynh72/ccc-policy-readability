import json
import boto3

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
                        title = reference.get('metadata', {}).get('title') or uri.split('/')[-1] if uri else 'Web Document'
                    elif 's3Location' in location:
                        uri = location['s3Location']['uri']
                        title = reference.get('metadata', {}).get('title') or uri.split('/')[-1] if uri else 'Document'
                    
                    if uri:
                        # Extract a snippet of the relevant text for deep linking
                        content_text = reference.get('content', {}).get('text', '')
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

def lambda_handler(event, context):
    # Handle CORS preflight requests
    if event.get('httpMethod') == 'OPTIONS':
        return {
            'statusCode': 200,
            'headers': {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type',
                'Access-Control-Allow-Methods': 'POST, OPTIONS'
            },
            'body': ''
        }
    
    try:
        # Parse the request body
        body = json.loads(event.get('body', '{}'))
        question = body.get('message', '')
        
        if not question:
            return {
                'statusCode': 400,
                'headers': {
                    'Access-Control-Allow-Origin': '*',
                    'Content-Type': 'application/json'
                },
                'body': json.dumps({'error': 'No message provided'})
            }
        
        # Query the knowledge base
        result = query_knowledge_base(question)
        
        # Format response with footnotes
        response_text = result['answer']
        
        # Add footnotes section if sources exist
        if result['sources']:
            response_text += "\n\n**Sources:**\n"
            for source in result['sources']:
                response_text += f"[{source['number']}] {source['title']}\n"
        
        return {
            'statusCode': 200,
            'headers': {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json'
            },
            'body': json.dumps({
                'response': response_text,
                'sources': result['sources']
            })
        }
        
    except Exception as e:
        return {
            'statusCode': 500,
            'headers': {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json'
            },
            'body': json.dumps({'error': f'Internal server error: {str(e)}'})
        }