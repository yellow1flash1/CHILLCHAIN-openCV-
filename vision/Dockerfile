# ChillChain Vision on AWS Lambda (arm64 = AWS Graviton). Built by `sam build` from template.yaml.
FROM public.ecr.aws/lambda/python:3.12-arm64
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY chillvision/ ${LAMBDA_TASK_ROOT}/chillvision/
CMD ["chillvision.handler.lambda_handler"]
