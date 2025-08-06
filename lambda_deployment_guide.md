# Lambda Deployment Guide

## Prerequisites
- AWS CLI configured with appropriate permissions
- Access to Amazon Bedrock and your Knowledge Base

## Step 1: Create IAM Role for Lambda

Create an IAM role with these policies:
- `AWSLambdaBasicExecutionRole` (AWS managed)
- Custom policy for Bedrock access:

```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": [
                "bedrock:InvokeModel",
                "bedrock-agent-runtime:Retrieve",
                "bedrock-agent-runtime:RetrieveAndGenerate"
            ],
            "Resource": "*"
        }
    ]
}
```

## Step 2: Deploy Lambda Function

1. **Create deployment package:**
   ```bash
   pip install boto3 -t .
   zip -r lambda-deployment.zip lambda_function.py boto3/
   ```

2. **Create Lambda function:**
   ```bash
   aws lambda create-function \
     --function-name chatbot-backend \
     --runtime python3.9 \
     --role arn:aws:iam::YOUR-ACCOUNT:role/lambda-bedrock-role \
     --handler lambda_function.lambda_handler \
     --zip-file fileb://lambda-deployment.zip \
     --timeout 30
   ```

## Step 3: Create API Gateway

1. **Create REST API:**
   ```bash
   aws apigateway create-rest-api --name chatbot-api
   ```

2. **Create resource and method:**
   - Create `/chat` resource
   - Add POST method
   - Enable CORS
   - Deploy to stage (e.g., `prod`)

## Step 4: Update Frontend

Update `chatbot_widget.js` to use your API Gateway endpoint:

```javascript
const response = await fetch('https://YOUR-API-ID.execute-api.us-west-2.amazonaws.com/prod/chat', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
    },
    body: JSON.stringify({ message: message })
});
```

## Environment Variables (Optional)

Set these in Lambda for configuration:
- `KNOWLEDGE_BASE_ID`: Your knowledge base ID
- `MODEL_ARN`: Your Bedrock model ARN
- `AWS_REGION`: Your AWS region