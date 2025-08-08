from datetime import datetime
import boto3
import os

def lambda_handler(event, context):
    print(f"Lambda triggered at {datetime.utcnow().isoformat()}")

    knowledge_base_id = os.environ["KNOWLEDGE_BASE_ID"]
    data_source_id = os.environ["DATA_SOURCE_ID"]

    client = boto3.client("bedrock-agent")

    response = client.start_ingestion_job(
        knowledgeBaseId=knowledge_base_id,
        dataSourceId=data_source_id,
        clientToken="sync-" + context.aws_request_id
    )

    job_id = response["ingestionJob"]["ingestionJobId"]
    print(f"Started ingestion job: {job_id}")

    return {
        "statusCode": 200,
        "body": f"Ingestion job started: {job_id}"
    }